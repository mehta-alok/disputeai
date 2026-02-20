/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Hotelogix PMS Adapter
 *
 * Integrates with the Hotelogix Cloud PMS REST API. Hotelogix provides
 * cloud-based property management for mid-scale hotels, including
 * front desk, reservations, housekeeping, and revenue management.
 *
 * Authentication: API Key (sent via X-Api-Key header with hotel code).
 *
 * Key API modules used:
 *   Bookings   - Reservation management
 *   Guests     - Guest profile management
 *   Folios     - Financial postings and billing
 *   Rates      - Rate plan configuration
 *   Webhooks   - Event notification subscriptions
 *
 * Reference: https://developer.hotelogix.com/
 */

'use strict';

const crypto = require('crypto');
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

const DEFAULT_BASE_URL = 'https://api.hotelogix.com/v2';

class HotelogixAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Hotelogix API key.
   * @param {string} [config.credentials.hotelCode]  - Hotelogix hotel/property code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'HOTELOGIX',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Hotelogix using the API key.
   * Validates by making a test request.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v2/hotel/info', {
        params: { hotelCode: this.hotelCode },
      });
      this._logApiCall('GET', '/api/v2/hotel/info', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v2/hotel/info', error);
      throw new Error(`Hotelogix authentication failed: ${error.message}`);
    }
  }

  /**
   * API Key auth does not require refresh. Rebuilds client.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Rebuilding HTTP client with current API key`);
    this._buildAuthenticatedClient();
  }

  /** @private */
  _buildAuthenticatedClient() {
    const headers = this._getAuthHeaders();
    this._buildHttpClient(headers, {
      rateLimit: { maxTokens: 90, refillRate: 90, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      'X-Api-Key': this.credentials.apiKey,
      'X-Hotel-Code': this.hotelCode,
    };
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
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/bookings', {
        params: {
          confirmationNo: confirmationNumber,
          hotelCode: this.hotelCode,
          limit: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/bookings', 200, durationMs);

    const bookings = result?.bookings || result?.data || [];
    if (bookings.length === 0) return null;

    return this.normalizeReservation(bookings[0]);
  }

  /**
   * Search reservations.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { hotelCode: this.hotelCode };
    if (params.confirmationNumber) queryParams.confirmationNo = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.checkInFrom = params.checkInDate;
    if (params.checkOutDate) queryParams.checkOutTo = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.bookingStatus = this._mapStatusToHotelogix(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/bookings', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/bookings', 200, durationMs);

    const bookings = result?.bookings || result?.data || [];
    return bookings.map(b => this.normalizeReservation(b));
  }

  /**
   * Fetch the guest folio.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/bookings/${reservationId}/folio`,
        { params: { hotelCode: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/bookings/${reservationId}/folio`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile.
   * @param {string} guestId
   * @returns {Promise<Object>}
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(`/api/v2/guests/${guestId}`, {
        params: { hotelCode: this.hotelCode },
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
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/rates', {
        params: { ...params, hotelCode: this.hotelCode },
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
    this._ensureAuthenticated();

    const hlxNote = {
      guestId,
      hotelCode: this.hotelCode,
      noteType: note.category || 'general',
      subject: note.title,
      content: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: note.priority || 'medium',
      isInternal: true,
      source: 'AccuDefend',
      createdOn: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        hlxNote
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
    this._ensureAuthenticated();

    const hlxAlert = {
      guestId,
      hotelCode: this.hotelCode,
      alertType: 'chargeback_risk',
      severity: (flagData.severity || 'high').toLowerCase(),
      subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      isActive: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        hlxAlert
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
    this._ensureAuthenticated();

    const hlxComment = {
      bookingId: reservationId,
      hotelCode: this.hotelCode,
      noteType: 'alert',
      subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
      content: [
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
        `/api/v2/bookings/${reservationId}/notes`,
        hlxComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/bookings/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const hlxComment = {
      bookingId: reservationId,
      hotelCode: this.hotelCode,
      noteType: won ? 'info' : 'alert',
      subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      content: [
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
        `/api/v2/bookings/${reservationId}/notes`,
        hlxComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/bookings/${reservationId}/notes`, 201, durationMs);

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
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callbackUrl: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToHotelogix(e)),
      signingSecret: secret,
      active: true,
      hotelCode: this.hotelCode,
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
      eventType: this._mapHotelogixEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.triggeredAt || new Date().toISOString(),
      hotelId: payload.hotelCode || this.hotelCode,
      data: {
        reservationId: data.bookingId || data.reservationId || data.confirmationNo,
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
    const payment = pmsData.payment || pmsData.paymentInfo || {};

    return {
      confirmationNumber: String(pmsData.confirmationNo || pmsData.bookingNo || ''),
      pmsReservationId: pmsData.bookingId || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.bookingStatus || pmsData.status),
      guestProfileId: String(guest.guestId || guest.id || ''),
      guestName: normalizeGuestName({
        firstName: guest.firstName || guest.givenName || '',
        lastName: guest.lastName || guest.surName || '',
      }),
      email: guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone || guest.mobile),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.checkInDate || pmsData.arrivalDate),
      checkOutDate: normalizeDate(pmsData.checkOutDate || pmsData.departureDate),
      roomNumber: room.roomNo || room.roomNumber || '',
      roomType: room.roomType || room.roomTypeName || '',
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      ratePlanDescription: rate.ratePlanName || rate.description || '',
      totalAmount: normalizeAmount(pmsData.totalAmount || pmsData.totalCharges),
      currency: normalizeCurrency(pmsData.currencyCode || pmsData.currency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.pax || 1,
      numberOfNights: this._calculateNights(
        pmsData.checkInDate || pmsData.arrivalDate,
        pmsData.checkOutDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.brand),
        cardLastFour: payment.cardLast4 || payment.last4 || '',
        authCode: payment.authCode || payment.authorizationCode || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.bookingSource || '',
      createdAt: normalizeDate(pmsData.createdOn || pmsData.createDate),
      updatedAt: normalizeDate(pmsData.modifiedOn || pmsData.updateDate),
      specialRequests: pmsData.specialRequests || pmsData.guestRemarks || '',
      loyaltyNumber: pmsData.loyaltyNo || pmsData.membershipId || '',
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
          folioWindowNumber: folio.windowNo || folio.windowNumber || 1,
          transactionId: charge.transactionId || charge.id || '',
          transactionCode: charge.chargeCode || charge.transactionCode || '',
          category: normalizeFolioCategory(
            charge.category || charge.chargeCategory || charge.chargeCode
          ),
          description: charge.description || charge.chargeName || '',
          amount: normalizeAmount(charge.amount || charge.netAmount),
          currency: normalizeCurrency(charge.currencyCode),
          postDate: normalizeDate(charge.postDate || charge.chargeDate),
          cardLastFour: charge.cardLast4 || '',
          authCode: charge.authCode || '',
          reference: charge.reference || charge.receiptNo || '',
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
      phone: normalizePhone(profile.phone || profile.mobile),
      address: normalizeAddress(profile.address),
      vipCode: profile.vipCode || profile.vipStatus || '',
      loyaltyNumber: profile.loyaltyNo || profile.membershipId || '',
      loyaltyLevel: profile.loyaltyLevel || profile.membershipTier || '',
      nationality: profile.nationality || profile.country || '',
      language: profile.language || profile.preferredLanguage || '',
      dateOfBirth: normalizeDate(profile.dateOfBirth || profile.dob),
      companyName: profile.companyName || profile.company || '',
      totalStays: profile.totalStays || profile.stayCount || 0,
      totalRevenue: normalizeAmount(profile.totalRevenue || profile.lifetimeValue),
      lastStayDate: normalizeDate(profile.lastStayDate || profile.lastVisit),
      createdAt: normalizeDate(profile.createdOn || profile.createDate),
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
      baseAmount: normalizeAmount(rate.baseRate || rate.amount),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.validFrom),
      endDate: normalizeDate(rate.endDate || rate.validTo),
      isActive: rate.isActive !== false && rate.status !== 'inactive',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.addOns || [],
      cancellationPolicy: rate.cancellationPolicy || rate.cancelPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v2/hotel/info', {
        params: { hotelCode: this.hotelCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
          apiVersion: response.headers?.['x-api-version'] || 'v2',
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

  _mapStatusToHotelogix(status) {
    const map = {
      confirmed: 'CONFIRMED',
      checked_in: 'CHECKEDIN',
      checked_out: 'CHECKEDOUT',
      cancelled: 'CANCELLED',
      no_show: 'NOSHOW',
      pending: 'TENTATIVE',
    };
    return map[status] || status;
  }

  _mapEventToHotelogix(event) {
    const map = {
      'reservation.created': 'booking_created',
      'reservation.updated': 'booking_modified',
      'reservation.cancelled': 'booking_cancelled',
      'guest.checked_in': 'guest_checkin',
      'guest.checked_out': 'guest_checkout',
      'payment.received': 'payment_posted',
      'folio.updated': 'folio_updated',
    };
    return map[event] || event;
  }

  _mapHotelogixEventToCanonical(hlxEvent) {
    const map = {
      booking_created: 'reservation.created',
      booking_modified: 'reservation.updated',
      booking_cancelled: 'reservation.cancelled',
      guest_checkin: 'guest.checked_in',
      guest_checkout: 'guest.checked_out',
      payment_posted: 'payment.received',
      folio_updated: 'folio.updated',
    };
    return map[hlxEvent] || hlxEvent;
  }
}

module.exports = HotelogixAdapter;
