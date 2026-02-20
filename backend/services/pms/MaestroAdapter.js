/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Maestro PMS Adapter
 *
 * Integrates with the Maestro PMS REST API. Maestro is a leading PMS for
 * independent hotels, resorts, and multi-property operations, providing
 * comprehensive front desk, reservation, and guest management capabilities.
 *
 * Authentication: HTTP Basic Auth (username:password encoded in Authorization header).
 *
 * Key API modules used:
 *   Reservations    - Booking lifecycle management
 *   Guest Profiles  - Guest information and history
 *   Folios          - Financial postings and billing
 *   Rate Plans      - Rate configuration and availability
 *   Webhooks        - Event notification management
 *
 * Reference: https://developer.maestropms.com/
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

const DEFAULT_BASE_URL = 'https://api.maestropms.com/v1';

class MaestroAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.username     - Maestro API username.
   * @param {string} config.credentials.password     - Maestro API password.
   * @param {string} [config.credentials.hotelCode]  - Maestro property code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'MAESTRO',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Maestro PMS using HTTP Basic Auth.
   * Validates credentials by making a test request.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v1/properties/info', {
        params: { hotelCode: this.hotelCode },
      });
      this._logApiCall('GET', '/api/v1/properties/info', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v1/properties/info', error);
      throw new Error(`Maestro PMS authentication failed: ${error.message}`);
    }
  }

  /**
   * Basic Auth does not require token refresh, but rebuilds the HTTP client.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Rebuilding HTTP client with current credentials`);
    this._buildAuthenticatedClient();
  }

  /** @private */
  _buildAuthenticatedClient() {
    const headers = this._getAuthHeaders();
    this._buildHttpClient(headers, {
      rateLimit: { maxTokens: 60, refillRate: 60, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    const encoded = Buffer.from(
      `${this.credentials.username}:${this.credentials.password}`
    ).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
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
      const response = await this.httpClient.get('/api/v1/reservations', {
        params: {
          confirmationNumber,
          hotelCode: this.hotelCode,
          limit: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/reservations', 200, durationMs);

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
    this._ensureAuthenticated();

    const queryParams = { hotelCode: this.hotelCode };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToMaestro(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/reservations', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/reservations/${reservationId}/folio`,
        { params: { hotelCode: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/reservations/${reservationId}/folio`, 200, durationMs);

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
      const response = await this.httpClient.get(
        `/api/v1/guest-profiles/${guestId}`,
        { params: { hotelCode: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guest-profiles/${guestId}`, 200, durationMs);

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
      const response = await this.httpClient.get('/api/v1/rate-plans', {
        params: { ...params, hotelCode: this.hotelCode },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/rate-plans', 200, durationMs);

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
    this._ensureAuthenticated();

    const maestroNote = {
      profileId: guestId,
      hotelCode: this.hotelCode,
      noteCategory: note.category || 'GENERAL',
      subject: note.title,
      body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: (note.priority || 'MEDIUM').toUpperCase(),
      isConfidential: true,
      enteredBy: 'AccuDefend',
      enteredDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guest-profiles/${guestId}/notes`,
        maestroNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guest-profiles/${guestId}/notes`, 201, durationMs);

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
    this._ensureAuthenticated();

    const maestroAlert = {
      profileId: guestId,
      hotelCode: this.hotelCode,
      alertType: 'CHARGEBACK_RISK',
      severity: (flagData.severity || 'HIGH').toUpperCase(),
      subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      isActive: true,
      enteredBy: 'AccuDefend',
      enteredDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guest-profiles/${guestId}/alerts`,
        maestroAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guest-profiles/${guestId}/alerts`, 201, durationMs);

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
    this._ensureAuthenticated();

    const maestroComment = {
      reservationId,
      hotelCode: this.hotelCode,
      noteCategory: 'ALERT',
      subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
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
      priority: 'HIGH',
      isConfidential: true,
      enteredBy: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        maestroComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

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
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const maestroComment = {
      reservationId,
      hotelCode: this.hotelCode,
      noteCategory: won ? 'INFO' : 'ALERT',
      subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      body: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: won ? 'MEDIUM' : 'HIGH',
      isConfidential: true,
      enteredBy: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        maestroComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

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
   * Register a webhook with Maestro PMS.
   * @param {Object} config
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callbackUrl: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToMaestro(e)),
      signingSecret: secret,
      active: true,
      hotelCode: this.hotelCode,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v1/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v1/webhooks', 201, durationMs);

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

    const eventType = payload.EventType || payload.eventType || payload.event;
    const data = payload.Data || payload.data || payload;

    return {
      eventType: this._mapMaestroEventToCanonical(eventType),
      timestamp: payload.Timestamp || payload.timestamp || new Date().toISOString(),
      hotelId: payload.HotelCode || payload.hotelCode || this.hotelCode,
      data: {
        reservationId: data.ReservationId || data.reservationId || data.confirmationNumber,
        guestId: data.ProfileId || data.guestId || data.profileId,
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

    const guest = pmsData.Guest || pmsData.guest || pmsData.PrimaryGuest || {};
    const room = pmsData.Room || pmsData.room || pmsData.RoomAssignment || {};
    const rate = pmsData.RatePlan || pmsData.ratePlan || {};
    const payment = pmsData.Payment || pmsData.payment || {};

    return {
      confirmationNumber: String(
        pmsData.ConfirmationNumber || pmsData.confirmationNumber || ''
      ),
      pmsReservationId: pmsData.ReservationId || pmsData.reservationId || pmsData.Id || '',
      status: normalizeReservationStatus(
        pmsData.Status || pmsData.status || pmsData.ReservationStatus
      ),
      guestProfileId: String(guest.ProfileId || guest.profileId || guest.GuestId || ''),
      guestName: normalizeGuestName({
        firstName: guest.FirstName || guest.firstName || '',
        lastName: guest.LastName || guest.lastName || '',
      }),
      email: guest.Email || guest.email || '',
      phone: normalizePhone(guest.Phone || guest.phone),
      address: normalizeAddress(guest.Address || guest.address),
      checkInDate: normalizeDate(pmsData.ArrivalDate || pmsData.arrivalDate),
      checkOutDate: normalizeDate(pmsData.DepartureDate || pmsData.departureDate),
      roomNumber: room.RoomNumber || room.roomNumber || room.Number || '',
      roomType: room.RoomType || room.roomType || room.Type || '',
      rateCode: rate.RateCode || rate.rateCode || '',
      ratePlanDescription: rate.Description || rate.description || rate.RatePlanName || '',
      totalAmount: normalizeAmount(pmsData.TotalAmount || pmsData.totalAmount),
      currency: normalizeCurrency(pmsData.CurrencyCode || pmsData.currencyCode),
      numberOfGuests: pmsData.NumberOfGuests || pmsData.numberOfGuests || 1,
      numberOfNights: this._calculateNights(
        pmsData.ArrivalDate || pmsData.arrivalDate,
        pmsData.DepartureDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.CardType || payment.cardType),
        cardLastFour: payment.CardLast4 || payment.cardLast4 || '',
        authCode: payment.AuthCode || payment.authCode || '',
      },
      bookingSource: pmsData.Source || pmsData.source || pmsData.BookingChannel || '',
      createdAt: normalizeDate(pmsData.CreatedDate || pmsData.createdDate),
      updatedAt: normalizeDate(pmsData.ModifiedDate || pmsData.modifiedDate),
      specialRequests: pmsData.SpecialRequests || pmsData.specialRequests || '',
      loyaltyNumber: pmsData.LoyaltyNumber || pmsData.loyaltyNumber || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.Folios || pmsData?.folios || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.Postings || folio.postings || folio.LineItems || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.FolioId || folio.folioId || folio.Id || '',
          folioWindowNumber: folio.WindowNumber || folio.windowNumber || 1,
          transactionId: posting.TransactionId || posting.transactionId || posting.Id || '',
          transactionCode: posting.TransactionCode || posting.transactionCode || '',
          category: normalizeFolioCategory(
            posting.Category || posting.category || posting.RevenueGroup || posting.TransactionCode
          ),
          description: posting.Description || posting.description || '',
          amount: normalizeAmount(posting.Amount || posting.amount),
          currency: normalizeCurrency(posting.CurrencyCode || posting.currencyCode),
          postDate: normalizeDate(posting.PostDate || posting.postDate),
          cardLastFour: posting.CardLast4 || posting.cardLast4 || '',
          authCode: posting.AuthCode || posting.authCode || '',
          reference: posting.Reference || posting.reference || '',
          reversalFlag: posting.IsReversal === true || posting.isReversal === true,
          quantity: posting.Quantity || posting.quantity || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.Profile || pmsData?.profile || pmsData || {};

    return {
      guestId: profile.ProfileId || profile.profileId || profile.Id || '',
      name: normalizeGuestName({
        firstName: profile.FirstName || profile.firstName || '',
        lastName: profile.LastName || profile.lastName || '',
      }),
      email: profile.Email || profile.email || '',
      phone: normalizePhone(profile.Phone || profile.phone),
      address: normalizeAddress(profile.Address || profile.address),
      vipCode: profile.VipCode || profile.vipCode || '',
      loyaltyNumber: profile.LoyaltyNumber || profile.loyaltyNumber || '',
      loyaltyLevel: profile.LoyaltyLevel || profile.loyaltyLevel || '',
      nationality: profile.Nationality || profile.nationality || '',
      language: profile.Language || profile.language || '',
      dateOfBirth: normalizeDate(profile.DateOfBirth || profile.dateOfBirth),
      companyName: profile.CompanyName || profile.companyName || '',
      totalStays: profile.TotalStays || profile.totalStays || 0,
      totalRevenue: normalizeAmount(profile.TotalRevenue || profile.totalRevenue),
      lastStayDate: normalizeDate(profile.LastStayDate || profile.lastStayDate),
      createdAt: normalizeDate(profile.CreatedDate || profile.createdDate),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.RatePlans || pmsData?.ratePlans || pmsData?.data || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.RateCode || rate.rateCode || '',
      name: rate.RatePlanName || rate.name || '',
      description: rate.Description || rate.description || '',
      category: rate.Category || rate.category || '',
      baseAmount: normalizeAmount(rate.BaseAmount || rate.baseAmount),
      currency: normalizeCurrency(rate.CurrencyCode || rate.currencyCode),
      startDate: normalizeDate(rate.StartDate || rate.startDate),
      endDate: normalizeDate(rate.EndDate || rate.endDate),
      isActive: (rate.Active !== false && rate.active !== false) &&
        (rate.Status || rate.status) !== 'INACTIVE',
      roomTypes: rate.RoomTypes || rate.roomTypes || [],
      inclusions: rate.Inclusions || rate.inclusions || [],
      cancellationPolicy: rate.CancellationPolicy || rate.cancellationPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v1/properties/info', {
        params: { hotelCode: this.hotelCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
          apiVersion: response.headers?.['x-api-version'] || 'v1',
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

  _mapStatusToMaestro(status) {
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

  _mapEventToMaestro(event) {
    const map = {
      'reservation.created': 'RESERVATION_NEW',
      'reservation.updated': 'RESERVATION_MODIFIED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECKIN',
      'guest.checked_out': 'GUEST_CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
    };
    return map[event] || event;
  }

  _mapMaestroEventToCanonical(maestroEvent) {
    const map = {
      RESERVATION_NEW: 'reservation.created',
      RESERVATION_MODIFIED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECKIN: 'guest.checked_in',
      GUEST_CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
    };
    return map[maestroEvent] || maestroEvent;
  }
}

module.exports = MaestroAdapter;
