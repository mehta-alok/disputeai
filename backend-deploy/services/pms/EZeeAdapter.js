/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * eZee Technosys (eZee Absolute) PMS Adapter
 *
 * Integrates with the eZee Absolute PMS REST API. eZee Absolute is a
 * comprehensive cloud-based hotel PMS by eZee Technosys, widely used
 * by independent and mid-scale hotels globally for front desk, reservation,
 * channel management, and revenue management.
 *
 * Authentication: API Key (sent via X-eZee-ApiKey header).
 *
 * Key API modules used:
 *   Reservations  - Booking management
 *   Guests        - Guest profile management
 *   Folios        - Billing and charge management
 *   Rates         - Rate plan configuration
 *   Webhooks      - Event notifications
 *
 * Reference: https://developer.ezeetechnosys.com/
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

const DEFAULT_BASE_URL = 'https://api.ezeeabsolute.com/v1';

class EZeeAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - eZee API key.
   * @param {string} [config.credentials.hotelCode]  - eZee hotel/property code.
   * @param {string} [config.credentials.authToken]  - Optional session auth token.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'EZEE',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with eZee Absolute using the API key.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v1/hotel/info', {
        params: { hotel_code: this.hotelCode },
      });
      this._logApiCall('GET', '/api/v1/hotel/info', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v1/hotel/info', error);
      throw new Error(`eZee Absolute authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 60, refillRate: 60, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    const headers = {
      'X-eZee-ApiKey': this.credentials.apiKey,
      'X-Hotel-Code': this.hotelCode,
    };
    if (this.credentials.authToken) {
      headers['X-Auth-Token'] = this.credentials.authToken;
    }
    return headers;
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
          confirmation_no: confirmationNumber,
          hotel_code: this.hotelCode,
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
   * Search reservations.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { hotel_code: this.hotelCode };
    if (params.confirmationNumber) queryParams.confirmation_no = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.checkin_from = params.checkInDate;
    if (params.checkOutDate) queryParams.checkout_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToEZee(params.status);
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
   * Fetch the guest folio.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/folios/${reservationId}`,
        { params: { hotel_code: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/folios/${reservationId}`, 200, durationMs);

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
      const response = await this.httpClient.get(`/api/v1/guests/${guestId}`, {
        params: { hotel_code: this.hotelCode },
      });
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guests/${guestId}`, 200, durationMs);

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
      const response = await this.httpClient.get('/api/v1/rates', {
        params: { ...params, hotel_code: this.hotelCode },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const ezeeNote = {
      guest_id: guestId,
      hotel_code: this.hotelCode,
      note_type: note.category || 'general',
      subject: note.title,
      content: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: note.priority || 'medium',
      is_internal: true,
      source: 'AccuDefend',
      created_at: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/notes`,
        ezeeNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note_id || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const ezeeAlert = {
      guest_id: guestId,
      hotel_code: this.hotelCode,
      alert_type: 'chargeback_risk',
      severity: (flagData.severity || 'high').toLowerCase(),
      subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      is_active: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/alerts`,
        ezeeAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alert_id || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    const ezeeComment = {
      reservation_id: reservationId,
      hotel_code: this.hotelCode,
      note_type: 'alert',
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
      is_internal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        ezeeComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.note_id || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const ezeeComment = {
      reservation_id: reservationId,
      hotel_code: this.hotelCode,
      note_type: won ? 'info' : 'alert',
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
      is_internal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        ezeeComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.note_id || result?.id,
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
      callback_url: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToEZee(e)),
      signing_secret: secret,
      active: true,
      hotel_code: this.hotelCode,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v1/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v1/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhook_id || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.event_type || payload.event || payload.type;
    const data = payload.data || payload.payload || payload;

    return {
      eventType: this._mapEZeeEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.triggered_at || new Date().toISOString(),
      hotelId: payload.hotel_code || this.hotelCode,
      data: {
        reservationId: data.reservation_id || data.confirmation_no,
        guestId: data.guest_id || data.profile_id,
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

    const guest = pmsData.guest || pmsData.primary_guest || {};
    const room = pmsData.room || pmsData.room_assignment || {};
    const rate = pmsData.rate_plan || pmsData.rate || {};
    const payment = pmsData.payment || pmsData.payment_info || {};

    return {
      confirmationNumber: String(pmsData.confirmation_no || pmsData.booking_no || ''),
      pmsReservationId: pmsData.reservation_id || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.booking_status),
      guestProfileId: String(guest.guest_id || guest.id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.surname || '',
      }),
      email: guest.email || guest.email_address || '',
      phone: normalizePhone(guest.phone || guest.mobile),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.checkin_date || pmsData.arrival_date),
      checkOutDate: normalizeDate(pmsData.checkout_date || pmsData.departure_date),
      roomNumber: room.room_no || room.room_number || '',
      roomType: room.room_type || room.room_type_name || '',
      rateCode: rate.rate_code || rate.rate_plan_code || '',
      ratePlanDescription: rate.rate_plan_name || rate.description || '',
      totalAmount: normalizeAmount(pmsData.total_amount || pmsData.total_charges),
      currency: normalizeCurrency(pmsData.currency_code || pmsData.currency),
      numberOfGuests: pmsData.number_of_guests || pmsData.pax || 1,
      numberOfNights: this._calculateNights(
        pmsData.checkin_date || pmsData.arrival_date,
        pmsData.checkout_date || pmsData.departure_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.card_type || payment.brand),
        cardLastFour: payment.card_last4 || payment.last_4 || '',
        authCode: payment.auth_code || payment.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.booking_source || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.create_date),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modify_date),
      specialRequests: pmsData.special_requests || pmsData.guest_remarks || '',
      loyaltyNumber: pmsData.loyalty_no || pmsData.membership_id || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folio_list || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const charges = folio.charges || folio.line_items || folio.transactions || [];

      for (const charge of charges) {
        allItems.push({
          folioId: folio.folio_id || folio.id || '',
          folioWindowNumber: folio.window_no || folio.window_number || 1,
          transactionId: charge.transaction_id || charge.id || '',
          transactionCode: charge.transaction_code || charge.charge_code || '',
          category: normalizeFolioCategory(
            charge.category || charge.charge_category || charge.transaction_code
          ),
          description: charge.description || charge.charge_name || '',
          amount: normalizeAmount(charge.amount || charge.net_amount),
          currency: normalizeCurrency(charge.currency_code),
          postDate: normalizeDate(charge.post_date || charge.charge_date),
          cardLastFour: charge.card_last4 || '',
          authCode: charge.auth_code || '',
          reference: charge.reference || charge.receipt_no || '',
          reversalFlag: charge.is_reversal === true || charge.reversed === true,
          quantity: charge.quantity || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guest || pmsData?.profile || pmsData || {};

    return {
      guestId: profile.guest_id || profile.id || '',
      name: normalizeGuestName({
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
      }),
      email: profile.email || profile.email_address || '',
      phone: normalizePhone(profile.phone || profile.mobile),
      address: normalizeAddress(profile.address),
      vipCode: profile.vip_code || profile.vip_status || '',
      loyaltyNumber: profile.loyalty_no || profile.membership_id || '',
      loyaltyLevel: profile.loyalty_level || profile.membership_tier || '',
      nationality: profile.nationality || profile.country || '',
      language: profile.language || profile.preferred_language || '',
      dateOfBirth: normalizeDate(profile.date_of_birth || profile.dob),
      companyName: profile.company_name || profile.company || '',
      totalStays: profile.total_stays || profile.stay_count || 0,
      totalRevenue: normalizeAmount(profile.total_revenue || profile.lifetime_value),
      lastStayDate: normalizeDate(profile.last_stay_date || profile.last_visit),
      createdAt: normalizeDate(profile.created_at || profile.create_date),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.rate_plans || pmsData?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rate_code || rate.rate_plan_code || '',
      name: rate.rate_plan_name || rate.name || '',
      description: rate.description || rate.long_description || '',
      category: rate.category || rate.rate_category || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.amount),
      currency: normalizeCurrency(rate.currency_code),
      startDate: normalizeDate(rate.start_date || rate.valid_from),
      endDate: normalizeDate(rate.end_date || rate.valid_to),
      isActive: rate.is_active !== false && rate.status !== 'inactive',
      roomTypes: rate.room_types || rate.applicable_room_types || [],
      inclusions: rate.inclusions || rate.add_ons || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_policy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v1/hotel/info', {
        params: { hotel_code: this.hotelCode },
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

  _mapStatusToEZee(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checkedin',
      checked_out: 'checkedout',
      cancelled: 'cancelled',
      no_show: 'noshow',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  _mapEventToEZee(event) {
    const map = {
      'reservation.created': 'reservation_created',
      'reservation.updated': 'reservation_modified',
      'reservation.cancelled': 'reservation_cancelled',
      'guest.checked_in': 'guest_checkin',
      'guest.checked_out': 'guest_checkout',
      'payment.received': 'payment_posted',
      'folio.updated': 'folio_updated',
    };
    return map[event] || event;
  }

  _mapEZeeEventToCanonical(ezeeEvent) {
    const map = {
      reservation_created: 'reservation.created',
      reservation_modified: 'reservation.updated',
      reservation_cancelled: 'reservation.cancelled',
      guest_checkin: 'guest.checked_in',
      guest_checkout: 'guest.checked_out',
      payment_posted: 'payment.received',
      folio_updated: 'folio.updated',
    };
    return map[ezeeEvent] || ezeeEvent;
  }
}

module.exports = EZeeAdapter;
