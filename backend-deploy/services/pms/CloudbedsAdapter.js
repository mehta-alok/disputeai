/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Cloudbeds PMS Adapter
 *
 * Integrates with the Cloudbeds REST API (v1.1).
 *
 * Authentication: OAuth 2.0 (authorization_code flow).
 *   - Access tokens auto-refresh when within 5 minutes of expiry.
 *
 * API style: Standard REST with GET for reads and POST for writes.
 *   - All GET endpoints return flat JSON with a "success" boolean.
 *
 * Reference: https://hotels.cloudbeds.com/api/docs/
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

const DEFAULT_BASE_URL = 'https://api.cloudbeds.com/api/v1.1';
const TOKEN_URL = 'https://hotels.cloudbeds.com/api/v1.1/access_token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

class CloudbedsAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId
   * @param {string} config.credentials.clientSecret
   * @param {string} [config.credentials.accessToken]
   * @param {string} [config.credentials.refreshToken]
   * @param {number} [config.credentials.expiresAt]       - Epoch ms.
   * @param {string} [config.credentials.propertyId]      - Cloudbeds property ID.
   * @param {string} [config.credentials.baseUrl]
   * @param {string} [config.credentials.tokenUrl]
   */
  constructor(config) {
    super({
      ...config,
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
    this.cloudbedsPropertyId = this.credentials.propertyId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  async authenticate() {
    if (this.credentials.accessToken && !this._isTokenExpiringSoon()) {
      this._buildAuthenticatedClient();
      return;
    }

    if (this.credentials.refreshToken) {
      await this.refreshAuth();
      return;
    }

    throw new Error(
      `${this.pmsType}: No valid access token or refresh token. ` +
      'Complete the OAuth 2.0 authorization flow first.'
    );
  }

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
      throw new Error(`Cloudbeds token refresh failed: ${error.message}`);
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
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 60, refillRate: 60, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
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

  /**
   * Cloudbeds wraps every response in { success: true|false, data: ... }.
   * This helper unwraps it and throws on failure.
   * @private
   */
  _unwrap(responseData) {
    if (responseData?.success === false) {
      const msg = responseData.message || responseData.error || 'Unknown Cloudbeds API error';
      const err = new Error(msg);
      err.cloudbedsError = responseData;
      throw err;
    }
    return responseData?.data || responseData;
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/getReservation', {
        params: {
          reservationID: confirmationNumber,
          propertyID: this.cloudbedsPropertyId,
        },
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('GET', '/getReservation', 200, durationMs);

    if (!result || Object.keys(result).length === 0) return null;
    return this.normalizeReservation(result);
  }

  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = { propertyID: this.cloudbedsPropertyId };
    if (params.confirmationNumber) queryParams.reservationID = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.checkInFrom = params.checkInDate;
    if (params.checkOutDate) queryParams.checkOutTo = params.checkOutDate;
    if (params.status) queryParams.status = this._mapStatusToCloudbeds(params.status);
    queryParams.resultsFrom = 0;
    queryParams.resultsTo = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/getReservations', { params: queryParams });
      return this._unwrap(response.data);
    });

    this._logApiCall('GET', '/getReservations', 200, durationMs);

    const reservations = Array.isArray(result) ? result : (result?.reservations || []);

    let normalized = reservations.map(r => this.normalizeReservation(r));

    // Client-side card filtering (not supported by Cloudbeds API)
    if (params.cardLastFour) {
      normalized = normalized.filter(r =>
        r.paymentMethod?.cardLastFour === params.cardLastFour
      );
    }

    return normalized;
  }

  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/getTransactions', {
        params: {
          reservationID: reservationId,
          propertyID: this.cloudbedsPropertyId,
        },
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('GET', '/getTransactions', 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/getGuest', {
        params: {
          guestID: guestId,
          propertyID: this.cloudbedsPropertyId,
        },
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('GET', '/getGuest', 200, durationMs);

    if (!result) return null;
    return this.normalizeGuestProfile(result);
  }

  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/getRates', {
        params: {
          propertyID: this.cloudbedsPropertyId,
          ...params,
        },
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('GET', '/getRates', 200, durationMs);

    return this.normalizeRates(result);
  }

  async getReservationDocuments(reservationId) {
    // Cloudbeds doesn't have a dedicated documents/attachments API.
    // Return an empty array; evidence must be fetched through other means.
    logger.info(
      `[PMS:${this.pmsType}] getReservationDocuments: Cloudbeds does not support ` +
      'document retrieval. Returning empty array.'
    );
    return [];
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/postNote', {
        propertyID: this.cloudbedsPropertyId,
        reservationID: guestId, // Cloudbeds notes are reservation-scoped
        note: `[${note.category || 'AccuDefend'}] ${note.title}\n${note.content}`,
        noteType: note.priority === 'high' ? 'important' : 'general',
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('POST', '/postNote', 200, durationMs);

    return {
      success: true,
      noteId: result?.noteID || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    // Cloudbeds doesn't have a native flag system. We use a high-priority note.
    const flagNote = [
      '*** ACCUDEFEND GUEST FLAG ***',
      `Severity: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
      `Reason: ${flagData.reason}`,
      flagData.amount ? `Amount: $${flagData.amount}` : null,
      flagData.chargebackId ? `Case: ${flagData.chargebackId}` : null,
    ].filter(Boolean).join('\n');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/postNote', {
        propertyID: this.cloudbedsPropertyId,
        reservationID: guestId,
        note: flagNote,
        noteType: 'important',
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('POST', '/postNote (flag)', 200, durationMs);

    return {
      success: true,
      flagId: result?.noteID || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const alertNote = [
      '=== CHARGEBACK ALERT ===',
      `Case #: ${alertData.caseNumber}`,
      `Amount: $${alertData.amount}`,
      `Reason Code: ${alertData.reasonCode}`,
      `Dispute Date: ${alertData.disputeDate}`,
      `Status: ${alertData.status}`,
      '--- Generated by AccuDefend ---',
    ].join('\n');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/postNote', {
        propertyID: this.cloudbedsPropertyId,
        reservationID: reservationId,
        note: alertNote,
        noteType: 'important',
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('POST', '/postNote (chargeback)', 200, durationMs);

    return {
      success: true,
      noteId: result?.noteID || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const outcomeNote = [
      `=== DISPUTE ${outcomeData.outcome} ===`,
      `Case #: ${outcomeData.caseNumber}`,
      `Outcome: ${outcomeData.outcome}`,
      `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
      `Resolved: ${outcomeData.resolvedDate}`,
      '--- Generated by AccuDefend ---',
    ].join('\n');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/postNote', {
        propertyID: this.cloudbedsPropertyId,
        reservationID: reservationId,
        note: outcomeNote,
        noteType: won ? 'general' : 'important',
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('POST', '/postNote (outcome)', 200, durationMs);

    return {
      success: true,
      noteId: result?.noteID || result?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  async registerWebhook(callbackUrl, events) {
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/postWebhook', {
        propertyID: this.cloudbedsPropertyId,
        callbackUrl,
        events: events.map(e => this._mapEventToCloudbeds(e)),
        secret,
        isActive: true,
      });
      return this._unwrap(response.data);
    });

    this._logApiCall('POST', '/postWebhook', 200, durationMs);

    return {
      webhookId: result?.webhookID || result?.id,
      callbackUrl,
      events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  async deregisterWebhook(webhookId) {
    await this._ensureToken();

    const { durationMs } = await this._timed(async () => {
      await this.httpClient.post('/deleteWebhook', {
        propertyID: this.cloudbedsPropertyId,
        webhookID: webhookId,
      });
    });

    this._logApiCall('POST', '/deleteWebhook', 200, durationMs);
  }

  parseWebhookPayload(rawPayload, headers) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    return {
      eventType: this._mapCloudbedsEventToCanonical(payload.event || payload.type),
      timestamp: payload.timestamp || payload.created_at || new Date().toISOString(),
      data: {
        reservationId: payload.reservationID || payload.reservation_id,
        guestId: payload.guestID || payload.guest_id,
        propertyId: payload.propertyID || payload.property_id,
        ...payload.data,
      },
      raw: payload,
    };
  }

  verifyWebhookSignature(rawPayload, signature, secret) {
    const body = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      return false;
    }
  }

  // =========================================================================
  //  Normalization
  // =========================================================================

  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    // Cloudbeds uses flat JSON: reservationID, guestName, checkIn, checkOut, etc.
    const guest = pmsData.guestList?.[0] || pmsData.guest || {};

    return {
      confirmationNumber: String(pmsData.reservationID || pmsData.reservation_id || ''),
      pmsReservationId: String(pmsData.reservationID || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.reservationStatus),
      guestProfileId: String(guest.guestID || guest.guest_id || pmsData.guestID || ''),
      guestName: normalizeGuestName(
        guest.guestName || pmsData.guestName || {
          firstName: guest.guestFirstName || pmsData.guestFirstName || '',
          lastName: guest.guestLastName || pmsData.guestLastName || '',
        }
      ),
      email: guest.guestEmail || pmsData.guestEmail || '',
      phone: normalizePhone(guest.guestPhone || pmsData.guestPhone),
      address: normalizeAddress({
        line1: guest.guestAddress || pmsData.guestAddress || '',
        city: guest.guestCity || pmsData.guestCity || '',
        state: guest.guestState || pmsData.guestState || '',
        postalCode: guest.guestZip || pmsData.guestZip || '',
        country: guest.guestCountry || pmsData.guestCountry || '',
      }),
      checkInDate: normalizeDate(pmsData.checkIn || pmsData.startDate),
      checkOutDate: normalizeDate(pmsData.checkOut || pmsData.endDate),
      roomNumber: pmsData.roomName || pmsData.roomNumber || pmsData.rooms?.[0]?.roomName || '',
      roomType: pmsData.roomTypeName || pmsData.roomType || pmsData.rooms?.[0]?.roomTypeName || '',
      rateCode: pmsData.ratePlanName || pmsData.ratePlan || '',
      ratePlanDescription: pmsData.ratePlanDescription || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.grandTotal || pmsData.balanceDetailed?.grandTotal),
      currency: normalizeCurrency(pmsData.currency || pmsData.currencyCode),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || 1,
      numberOfNights: this._calculateNights(pmsData.checkIn, pmsData.checkOut),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.cardType || pmsData.creditCardType || ''),
        cardLastFour: pmsData.cardNumber?.slice(-4) || pmsData.creditCardLast4 || '',
        authCode: pmsData.authorizationCode || '',
      },
      bookingSource: pmsData.source || pmsData.sourceName || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.dateCreated || pmsData.created_at),
      updatedAt: normalizeDate(pmsData.dateModified || pmsData.updated_at),
      specialRequests: pmsData.specialRequests || pmsData.notes || '',
      loyaltyNumber: pmsData.loyaltyMemberNumber || '',
      balance: normalizeAmount(pmsData.balance || pmsData.balanceDetailed?.balance),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    // Cloudbeds returns transactions as a flat array
    const transactions = Array.isArray(pmsData)
      ? pmsData
      : (pmsData?.transactions || pmsData?.items || []);

    return transactions.map(txn => ({
      folioId: txn.reservationID || txn.reservation_id || '',
      transactionId: String(txn.transactionID || txn.transaction_id || txn.id || ''),
      transactionCode: txn.transactionCode || txn.category || '',
      category: normalizeFolioCategory(txn.transactionType || txn.category || txn.description),
      description: txn.description || txn.transactionDescription || txn.itemName || '',
      amount: normalizeAmount(txn.amount || txn.transactionAmount),
      currency: normalizeCurrency(txn.currency || txn.currencyCode),
      postDate: normalizeDate(txn.transactionDate || txn.date || txn.dateTransaction),
      cardLastFour: txn.cardNumber?.slice(-4) || txn.creditCardLast4 || '',
      authCode: txn.authorizationCode || '',
      reference: txn.referenceNumber || txn.reference || '',
      reversalFlag: txn.isVoid === true || txn.transactionType === 'void',
      quantity: txn.quantity || 1,
      userName: txn.userName || txn.postedBy || '',
    }));
  }

  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.guestID || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.guestFirstName || pmsData.firstName || '',
        lastName: pmsData.guestLastName || pmsData.lastName || '',
      }),
      email: pmsData.guestEmail || pmsData.email || '',
      phone: normalizePhone(pmsData.guestPhone || pmsData.phone || pmsData.cellPhone),
      address: normalizeAddress({
        line1: pmsData.guestAddress || pmsData.address || '',
        line2: pmsData.guestAddress2 || '',
        city: pmsData.guestCity || pmsData.city || '',
        state: pmsData.guestState || pmsData.state || '',
        postalCode: pmsData.guestZip || pmsData.zip || '',
        country: pmsData.guestCountry || pmsData.country || '',
      }),
      vipCode: pmsData.guestVIP || '',
      loyaltyNumber: pmsData.loyaltyMemberNumber || '',
      loyaltyLevel: pmsData.loyaltyLevel || '',
      nationality: pmsData.guestCountry || '',
      language: pmsData.guestLanguage || '',
      dateOfBirth: normalizeDate(pmsData.guestBirthdate || pmsData.dateOfBirth),
      companyName: pmsData.guestCompany || pmsData.companyName || '',
      totalStays: pmsData.totalStays || 0,
      totalRevenue: normalizeAmount(pmsData.totalRevenue || 0),
      lastStayDate: normalizeDate(pmsData.lastStayDate),
      guestType: pmsData.guestType || '',
      createdAt: normalizeDate(pmsData.dateCreated),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeRates(pmsData) {
    const rates = Array.isArray(pmsData) ? pmsData : (pmsData?.rates || pmsData?.ratePlans || []);

    return rates.map(rate => ({
      rateCode: String(rate.ratePlanID || rate.rateID || rate.id || ''),
      name: rate.ratePlanName || rate.name || '',
      description: rate.ratePlanDescription || rate.description || '',
      category: rate.ratePlanType || rate.type || '',
      baseAmount: normalizeAmount(rate.baseRate || rate.amount || rate.defaultRate),
      currency: normalizeCurrency(rate.currency || rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.validFrom),
      endDate: normalizeDate(rate.endDate || rate.validTo),
      isActive: rate.isActive !== false && rate.status !== 'inactive',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || [],
      cancellationPolicy: rate.cancellationPolicy || rate.cancelPolicy || '',
      minNights: rate.minimumStay || rate.minNights || 0,
      maxNights: rate.maximumStay || rate.maxNights || 0,
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get('/getHotelDetails', {
        params: { propertyID: this.cloudbedsPropertyId },
      });
      const data = this._unwrap(response.data);

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyId: this.cloudbedsPropertyId,
          propertyName: data?.propertyName || data?.name || '',
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
          propertyId: this.cloudbedsPropertyId,
          error: error.message,
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    }
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  _calculateNights(checkIn, checkOut) {
    const s = normalizeDate(checkIn);
    const e = normalizeDate(checkOut);
    if (!s || !e) return 0;
    const diff = new Date(e) - new Date(s);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  _mapStatusToCloudbeds(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checked_in',
      checked_out: 'checked_out',
      cancelled: 'canceled',
      no_show: 'no_show',
      pending: 'not_confirmed',
    };
    return map[status] || status;
  }

  _mapEventToCloudbeds(event) {
    const map = {
      'reservation.created': 'reservation/created',
      'reservation.updated': 'reservation/modified',
      'reservation.cancelled': 'reservation/canceled',
      'guest.checked_in': 'reservation/checkedIn',
      'guest.checked_out': 'reservation/checkedOut',
      'payment.received': 'payment/created',
      'folio.updated': 'transaction/created',
    };
    return map[event] || event;
  }

  _mapCloudbedsEventToCanonical(cbEvent) {
    const map = {
      'reservation/created': 'reservation.created',
      'reservation/modified': 'reservation.updated',
      'reservation/canceled': 'reservation.cancelled',
      'reservation/checkedIn': 'guest.checked_in',
      'reservation/checkedOut': 'guest.checked_out',
      'payment/created': 'payment.received',
      'transaction/created': 'folio.updated',
    };
    return map[cbEvent] || cbEvent;
  }
}

module.exports = CloudbedsAdapter;
