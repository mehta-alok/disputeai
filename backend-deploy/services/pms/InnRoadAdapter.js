/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * innRoad PMS Adapter
 *
 * Integrates with the innRoad cloud-based PMS REST API. innRoad is designed
 * specifically for independent hotels, providing reservation management,
 * revenue management, online distribution, and guest engagement features.
 *
 * Authentication: OAuth 2.0 (client_credentials flow).
 *   - Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key API modules used:
 *   Reservations  - Booking lifecycle management
 *   Guests        - Guest profile management
 *   Folios        - Billing and charge management
 *   Rates         - Rate plan configuration
 *   Webhooks      - Event subscription management
 *
 * Reference: https://developer.innroad.com/
 */

'use strict';

const crypto = require('crypto');
const axios = require('axios');
const BasePMSAdapter = require('./BasePMSAdapter');
const logger = require('../../utils/logger');
const {
  normalizeDate,
  normalizeCurrency,
  normalizeAmount,
  normalizeCardBrand,
  normalizeReservationStatus,
  normalizeGuestName,
  normalizeFolioCategory,
  normalizePhone,
  normalizeAddress,
  sanitizePII,
} = require('./normalizers');

const DEFAULT_BASE_URL = 'https://api.innroad.com/v2';
const TOKEN_URL = 'https://auth.innroad.com/oauth/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

class InnRoadAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId       - innRoad OAuth client ID.
   * @param {string} config.credentials.clientSecret   - innRoad OAuth client secret.
   * @param {string} [config.credentials.accessToken]  - Pre-existing access token.
   * @param {string} [config.credentials.refreshToken] - Pre-existing refresh token.
   * @param {number} [config.credentials.expiresAt]    - Token expiry epoch ms.
   * @param {string} [config.credentials.propertyId]   - innRoad property identifier.
   * @param {string} [config.credentials.tokenUrl]     - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'INNROAD',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.innroadPropertyId = this.credentials.propertyId || this.propertyId;
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with innRoad using OAuth2 client_credentials.
   * @returns {Promise<void>}
   */
  async authenticate() {
    if (this.credentials.accessToken && !this._isTokenExpiringSoon()) {
      this._buildAuthenticatedClient();
      return;
    }

    if (this.credentials.refreshToken) {
      await this.refreshAuth();
      return;
    }

    await this._clientCredentialsGrant();
  }

  /**
   * Refresh the OAuth2 access token.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    const startMs = Date.now();

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.credentials.refreshToken);
      params.append('client_id', this.credentials.clientId);
      params.append('client_secret', this.credentials.clientSecret);

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      logger.warn(`[PMS:${this.pmsType}] Refresh failed, falling back to client_credentials`);
      await this._clientCredentialsGrant();
    }
  }

  /** @private */
  async _clientCredentialsGrant() {
    const startMs = Date.now();

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.credentials.clientId);
    params.append('client_secret', this.credentials.clientSecret);

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`innRoad authentication failed: ${error.message}`);
    }
  }

  /** @private */
  _applyTokenResponse(tokenData) {
    this.credentials.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      this.credentials.refreshToken = tokenData.refresh_token;
    }
    const expiresIn = tokenData.expires_in || 3600;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
    this.credentials.expiresAt = this.tokenExpiresAt;
  }

  /** @private */
  _isTokenExpiringSoon() {
    return Date.now() >= (this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS);
  }

  /** @private */
  _buildAuthenticatedClient() {
    const headers = this._getAuthHeaders();
    this._buildHttpClient(headers, {
      rateLimit: { maxTokens: 80, refillRate: 80, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'X-Property-Id': this.innroadPropertyId,
    };
  }

  /** @private */
  async _ensureToken() {
    this._ensureAuthenticated();
    if (this._isTokenExpiringSoon()) {
      logger.info(`[PMS:${this.pmsType}] Token expiring soon, refreshing...`);
      await this.refreshAuth();
    }
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by confirmation number.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>}
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: {
          confirmationNumber,
          propertyId: this.innroadPropertyId,
          limit: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    if (reservations.length === 0) return null;

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = { propertyId: this.innroadPropertyId };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalFrom = params.checkInDate;
    if (params.checkOutDate) queryParams.departureTo = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToInnRoad(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/reservations/${reservationId}/folios`,
        { params: { propertyId: this.innroadPropertyId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/reservations/${reservationId}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile.
   * @param {string} guestId
   * @returns {Promise<Object>}
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(`/api/v2/guests/${guestId}`, {
        params: { propertyId: this.innroadPropertyId },
      });
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plans.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/rates', {
        params: { ...params, propertyId: this.innroadPropertyId },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    await this._ensureToken();

    const innroadNote = {
      guestId,
      propertyId: this.innroadPropertyId,
      noteType: note.category || 'general',
      title: note.title,
      body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: note.priority || 'medium',
      isInternal: true,
      source: 'AccuDefend',
      createdAt: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        innroadNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const innroadAlert = {
      guestId,
      propertyId: this.innroadPropertyId,
      alertType: 'chargeback_risk',
      severity: (flagData.severity || 'high').toLowerCase(),
      title: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      isActive: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        innroadAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const innroadComment = {
      reservationId,
      propertyId: this.innroadPropertyId,
      noteType: 'alert',
      title: `Chargeback Alert - Case ${alertData.caseNumber}`,
      body: [
        '=== CHARGEBACK ALERT ===',
        `Case #: ${alertData.caseNumber}`,
        `Amount: $${alertData.amount}`,
        `Reason Code: ${alertData.reasonCode}`,
        `Dispute Date: ${alertData.disputeDate}`,
        `Status: ${alertData.status}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: 'high',
      isInternal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/reservations/${reservationId}/notes`,
        innroadComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const innroadComment = {
      reservationId,
      propertyId: this.innroadPropertyId,
      noteType: won ? 'info' : 'alert',
      title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      body: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: won ? 'medium' : 'high',
      isInternal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/reservations/${reservationId}/notes`,
        innroadComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  async registerWebhook(config) {
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callbackUrl: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToInnRoad(e)),
      signingSecret: secret,
      active: true,
      propertyId: this.innroadPropertyId,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v2/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v2/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.payload || payload;

    return {
      eventType: this._mapInnRoadEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.occurredAt || new Date().toISOString(),
      hotelId: payload.propertyId || this.innroadPropertyId,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestId || data.profileId,
        ...data,
      },
      raw: payload,
    };
  }

  // =========================================================================
  //  Normalization
  // =========================================================================

  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const guest = pmsData.guest || pmsData.primaryGuest || {};
    const room = pmsData.room || pmsData.roomAssignment || {};
    const rate = pmsData.ratePlan || pmsData.rate || {};
    const payment = pmsData.payment || pmsData.paymentMethod || {};

    return {
      confirmationNumber: String(pmsData.confirmationNumber || pmsData.bookingNumber || ''),
      pmsReservationId: pmsData.reservationId || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.reservationStatus),
      guestProfileId: String(guest.guestId || guest.id || ''),
      guestName: normalizeGuestName({
        firstName: guest.firstName || guest.givenName || '',
        lastName: guest.lastName || guest.surname || '',
      }),
      email: guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone || guest.phoneNumber),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.arrivalDate || pmsData.checkInDate),
      checkOutDate: normalizeDate(pmsData.departureDate || pmsData.checkOutDate),
      roomNumber: room.roomNumber || room.number || '',
      roomType: room.roomType || room.roomTypeCode || '',
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      ratePlanDescription: rate.ratePlanName || rate.description || '',
      totalAmount: normalizeAmount(pmsData.totalAmount || pmsData.totalCharges),
      currency: normalizeCurrency(pmsData.currencyCode || pmsData.currency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.guestCount || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrivalDate || pmsData.checkInDate,
        pmsData.departureDate || pmsData.checkOutDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.brand),
        cardLastFour: payment.cardLastFour || payment.last4 || '',
        authCode: payment.authCode || payment.authorizationCode || '',
      },
      bookingSource: pmsData.source || pmsData.bookingChannel || '',
      createdAt: normalizeDate(pmsData.createdAt || pmsData.createDate),
      updatedAt: normalizeDate(pmsData.updatedAt || pmsData.modifyDate),
      specialRequests: pmsData.specialRequests || pmsData.guestNotes || '',
      loyaltyNumber: pmsData.loyaltyNumber || pmsData.membershipId || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioList || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const charges = folio.charges || folio.lineItems || folio.transactions || [];

      for (const charge of charges) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || 1,
          transactionId: charge.transactionId || charge.id || '',
          transactionCode: charge.transactionCode || charge.chargeCode || '',
          category: normalizeFolioCategory(
            charge.category || charge.chargeType || charge.transactionCode
          ),
          description: charge.description || charge.itemName || '',
          amount: normalizeAmount(charge.amount || charge.netAmount),
          currency: normalizeCurrency(charge.currencyCode),
          postDate: normalizeDate(charge.postDate || charge.transactionDate),
          cardLastFour: charge.cardLastFour || '',
          authCode: charge.authCode || '',
          reference: charge.reference || charge.receiptNumber || '',
          reversalFlag: charge.isReversal === true || charge.reversed === true,
          quantity: charge.quantity || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guest || pmsData?.profile || pmsData || {};

    return {
      guestId: profile.guestId || profile.id || '',
      name: normalizeGuestName({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
      }),
      email: profile.email || profile.emailAddress || '',
      phone: normalizePhone(profile.phone || profile.phoneNumber),
      address: normalizeAddress(profile.address),
      vipCode: profile.vipCode || profile.vipStatus || '',
      loyaltyNumber: profile.loyaltyNumber || profile.membershipId || '',
      loyaltyLevel: profile.loyaltyLevel || profile.membershipTier || '',
      nationality: profile.nationality || profile.country || '',
      language: profile.language || profile.preferredLanguage || '',
      dateOfBirth: normalizeDate(profile.dateOfBirth || profile.birthDate),
      companyName: profile.companyName || profile.company || '',
      totalStays: profile.totalStays || profile.stayCount || 0,
      totalRevenue: normalizeAmount(profile.totalRevenue || profile.lifetimeValue),
      lastStayDate: normalizeDate(profile.lastStayDate || profile.lastVisit),
      createdAt: normalizeDate(profile.createdAt || profile.createDate),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlans || pmsData?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      name: rate.ratePlanName || rate.name || '',
      description: rate.description || rate.longDescription || '',
      category: rate.category || rate.rateCategory || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.validFrom),
      endDate: normalizeDate(rate.endDate || rate.validTo),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancellationPolicy || rate.cancelPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get('/api/v2/properties/current', {
        params: { propertyId: this.innroadPropertyId },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyId: this.innroadPropertyId,
          apiVersion: response.headers?.['x-api-version'] || 'v2',
          tokenExpiresIn: Math.max(0, Math.floor((this.tokenExpiresAt - Date.now()) / 1000)),
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyId: this.innroadPropertyId,
          error: error.message,
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    }
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  _calculateNights(arrival, departure) {
    const a = normalizeDate(arrival);
    const d = normalizeDate(departure);
    if (!a || !d) return 0;
    const diff = new Date(d) - new Date(a);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  _mapStatusToInnRoad(status) {
    const map = {
      confirmed: 'Confirmed',
      checked_in: 'CheckedIn',
      checked_out: 'CheckedOut',
      cancelled: 'Cancelled',
      no_show: 'NoShow',
      pending: 'Pending',
    };
    return map[status] || status;
  }

  _mapEventToInnRoad(event) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.modified',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'guest.checked_in',
      'guest.checked_out': 'guest.checked_out',
      'payment.received': 'payment.posted',
      'folio.updated': 'folio.updated',
    };
    return map[event] || event;
  }

  _mapInnRoadEventToCanonical(innRoadEvent) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.modified': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'guest.checked_in',
      'guest.checked_out': 'guest.checked_out',
      'payment.posted': 'payment.received',
      'folio.updated': 'folio.updated',
    };
    return map[innRoadEvent] || innRoadEvent;
  }
}

module.exports = InnRoadAdapter;
