/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Infor Hospitality HMS PMS Adapter
 *
 * Integrates with the Infor Hospitality Management Solution (HMS) REST API.
 * Infor HMS is an enterprise-grade hotel PMS used by large chains and
 * management groups worldwide.
 *
 * Authentication: OAuth 2.0 (client_credentials flow via Infor ION API).
 *   - Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key API modules used:
 *   Properties     - Property/hotel configuration
 *   Reservations   - Booking lifecycle management
 *   Guests         - Guest profile management
 *   Folios         - Financial postings and folios
 *   Rates          - Rate plan configuration
 *   Webhooks       - Event subscription via Infor ION messaging
 *
 * Reference: https://developer.infor.com/hospitality/
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

// Default base URL for Infor HMS API
const DEFAULT_BASE_URL = 'https://mingle-ionapi.inforcloudsuite.com/TENANT_ID/HMS/v1';
const TOKEN_URL = 'https://mingle-sso.inforcloudsuite.com/TENANT_ID/as/token.oauth2';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

class InforAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId      - Infor ION API client ID.
   * @param {string} config.credentials.clientSecret  - Infor ION API client secret.
   * @param {string} [config.credentials.accessToken] - Pre-existing access token.
   * @param {string} [config.credentials.refreshToken]- Pre-existing refresh token.
   * @param {number} [config.credentials.expiresAt]   - Epoch ms of token expiry.
   * @param {string} [config.credentials.tenantId]    - Infor cloud tenant ID.
   * @param {string} [config.credentials.hotelCode]   - Infor property/hotel code.
   * @param {string} [config.credentials.tokenUrl]    - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]     - Override API base URL.
   */
  constructor(config) {
    const tenantId = config.credentials?.tenantId || 'default';
    super({
      ...config,
      pmsType: 'INFOR_HMS',
      baseUrl: config.credentials?.baseUrl || config.baseUrl ||
        DEFAULT_BASE_URL.replace('TENANT_ID', tenantId),
    });
    this.tenantId = tenantId;
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
    this.tokenUrl = this.credentials.tokenUrl ||
      TOKEN_URL.replace('TENANT_ID', this.tenantId);
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Infor ION API using OAuth2 client_credentials.
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
      logger.warn(`[PMS:${this.pmsType}] Refresh token failed, falling back to client_credentials`);
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
      throw new Error(`Infor HMS authentication failed: ${error.message}`);
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
      'X-Infor-TenantId': this.tenantId,
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
   * @returns {Promise<Object|null>} Normalized reservation.
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}/reservations`,
        { params: { confirmationNumber, limit: 1 } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.hotelCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    if (reservations.length === 0) return null;

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by criteria.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalFrom = params.checkInDate;
    if (params.checkOutDate) queryParams.departureTo = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToInfor(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.hotelCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch guest folio for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}/reservations/${reservationId}/folios`
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/.../reservations/${reservationId}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by ID.
   * @param {string} guestId
   * @returns {Promise<Object>}
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}/guests/${guestId}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/.../guests/${guestId}`, 200, durationMs);

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
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}/rates`,
        { params }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/.../rates`, 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a note to a guest profile.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    await this._ensureToken();

    const inforNote = {
      noteType: note.category || 'GENERAL',
      subject: note.title,
      text: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: (note.priority || 'medium').toUpperCase(),
      isInternal: true,
      source: 'AccuDefend',
      createdDateTime: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.hotelCode}/guests/${guestId}/notes`,
        inforNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag/alert.
   * @param {string} guestId
   * @param {Object} flagData
   * @returns {Promise<Object>}
   */
  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const inforAlert = {
      alertType: 'CHARGEBACK_RISK',
      severity: (flagData.severity || 'HIGH').toUpperCase(),
      subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      isActive: true,
      source: 'AccuDefend',
      createdDateTime: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.hotelCode}/guests/${guestId}/alerts`,
        inforAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation.
   * @param {string} reservationId
   * @param {Object} alertData
   * @returns {Promise<Object>}
   */
  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const inforNote = {
      noteType: 'ALERT',
      subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
      text: [
        '=== CHARGEBACK ALERT ===',
        `Case #: ${alertData.caseNumber}`,
        `Amount: $${alertData.amount}`,
        `Reason Code: ${alertData.reasonCode}`,
        `Dispute Date: ${alertData.disputeDate}`,
        `Status: ${alertData.status}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: 'HIGH',
      isInternal: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.hotelCode}/reservations/${reservationId}/notes`,
        inforNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome to a reservation.
   * @param {string} reservationId
   * @param {Object} outcomeData
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const inforNote = {
      noteType: won ? 'INFO' : 'ALERT',
      subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      text: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: won ? 'MEDIUM' : 'HIGH',
      isInternal: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.hotelCode}/reservations/${reservationId}/notes`,
        inforNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../reservations/${reservationId}/notes`, 201, durationMs);

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

  /**
   * Register a webhook via Infor ION messaging.
   * @param {Object} config
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callbackUrl: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToInfor(e)),
      secret,
      active: true,
      propertyCode: this.hotelCode,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.hotelCode}/webhooks`,
        webhookPayload
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../webhooks`, 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming webhook payload.
   * @param {Object} headers
   * @param {Object|string} body
   * @returns {Object}
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.payload || payload;

    return {
      eventType: this._mapInforEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.eventDateTime || new Date().toISOString(),
      hotelId: payload.propertyCode || this.hotelCode,
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
    const room = pmsData.roomAssignment || pmsData.room || {};
    const rate = pmsData.ratePlan || pmsData.rate || {};
    const payment = pmsData.payment || pmsData.paymentInfo || {};

    return {
      confirmationNumber: String(pmsData.confirmationNumber || pmsData.bookingReference || ''),
      pmsReservationId: pmsData.reservationId || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.reservationStatus),
      guestProfileId: String(guest.guestId || guest.profileId || ''),
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
      ratePlanDescription: rate.description || rate.ratePlanName || '',
      totalAmount: normalizeAmount(pmsData.totalAmount || pmsData.totalCharges),
      currency: normalizeCurrency(pmsData.currencyCode || pmsData.currency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.adults || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrivalDate || pmsData.checkInDate,
        pmsData.departureDate || pmsData.checkOutDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.cardBrand),
        cardLastFour: payment.cardLast4 || payment.maskedCard?.slice(-4) || '',
        authCode: payment.authorizationCode || payment.authCode || '',
      },
      bookingSource: pmsData.source || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.createdDateTime || pmsData.createDate),
      updatedAt: normalizeDate(pmsData.modifiedDateTime || pmsData.updateDate),
      specialRequests: pmsData.specialRequests || pmsData.guestComments || '',
      loyaltyNumber: pmsData.loyaltyNumber || pmsData.membershipId || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioList || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.postings || folio.transactions || folio.charges || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || folio.folioWindowNo || 1,
          transactionId: posting.transactionId || posting.id || '',
          transactionCode: posting.transactionCode || posting.chargeCode || '',
          category: normalizeFolioCategory(
            posting.revenueCategory || posting.category || posting.transactionCode
          ),
          description: posting.description || posting.narrative || '',
          amount: normalizeAmount(posting.amount || posting.netAmount),
          currency: normalizeCurrency(posting.currencyCode),
          postDate: normalizeDate(posting.postingDate || posting.transactionDate),
          cardLastFour: posting.cardLast4 || '',
          authCode: posting.authorizationCode || '',
          reference: posting.reference || posting.receiptNumber || '',
          reversalFlag: posting.isReversal === true || posting.reversed === true,
          quantity: posting.quantity || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guest || pmsData?.profile || pmsData || {};
    const addresses = profile.addresses || [];
    const primaryAddress = Array.isArray(addresses) ? addresses[0] : addresses;

    return {
      guestId: profile.guestId || profile.id || '',
      name: normalizeGuestName({
        firstName: profile.firstName || profile.givenName || '',
        lastName: profile.lastName || profile.surname || '',
      }),
      email: profile.email || profile.emailAddress || '',
      phone: normalizePhone(profile.phone || profile.phoneNumber),
      address: normalizeAddress(primaryAddress),
      vipCode: profile.vipCode || profile.vipStatus || '',
      loyaltyNumber: profile.loyaltyNumber || profile.membershipId || '',
      loyaltyLevel: profile.loyaltyLevel || profile.membershipTier || '',
      nationality: profile.nationality || profile.countryCode || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.dateOfBirth || profile.birthDate),
      companyName: profile.companyName || profile.company || '',
      totalStays: profile.totalStays || profile.visitCount || 0,
      totalRevenue: normalizeAmount(profile.totalRevenue || profile.lifetimeRevenue),
      lastStayDate: normalizeDate(profile.lastStayDate || profile.lastVisitDate),
      createdAt: normalizeDate(profile.createdDateTime || profile.createDate),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlans || pmsData?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      name: rate.name || rate.ratePlanName || '',
      description: rate.description || rate.longDescription || '',
      category: rate.category || rate.rateCategory || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.validFrom),
      endDate: normalizeDate(rate.endDate || rate.validTo),
      isActive: rate.active !== false && rate.status !== 'INACTIVE',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancellationPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get(
        `/api/v1/properties/${this.hotelCode}`,
      );

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
          tenantId: this.tenantId,
          apiVersion: response.headers?.['x-api-version'] || 'v1',
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
          hotelCode: this.hotelCode,
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

  _mapStatusToInfor(status) {
    const map = {
      confirmed: 'CONFIRMED',
      checked_in: 'IN_HOUSE',
      checked_out: 'DEPARTED',
      cancelled: 'CANCELLED',
      no_show: 'NO_SHOW',
      pending: 'TENTATIVE',
    };
    return map[status] || status;
  }

  _mapEventToInfor(event) {
    const map = {
      'reservation.created': 'ReservationCreated',
      'reservation.updated': 'ReservationModified',
      'reservation.cancelled': 'ReservationCancelled',
      'guest.checked_in': 'GuestCheckIn',
      'guest.checked_out': 'GuestCheckOut',
      'payment.received': 'PaymentPosted',
      'folio.updated': 'FolioUpdated',
    };
    return map[event] || event;
  }

  _mapInforEventToCanonical(inforEvent) {
    const map = {
      ReservationCreated: 'reservation.created',
      ReservationModified: 'reservation.updated',
      ReservationCancelled: 'reservation.cancelled',
      GuestCheckIn: 'guest.checked_in',
      GuestCheckOut: 'guest.checked_out',
      PaymentPosted: 'payment.received',
      FolioUpdated: 'folio.updated',
    };
    return map[inforEvent] || inforEvent;
  }
}

module.exports = InforAdapter;
