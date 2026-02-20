/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * WebRezPro PMS Adapter
 *
 * Integrates with the WebRezPro Cloud PMS REST API (v1).
 *
 * Authentication: API Key sent via Authorization header as Bearer token.
 *
 * WebRezPro is a cloud-based property management system designed for
 * small to mid-size hotels, inns, resorts, and vacation rentals. It provides:
 *   - Reservation and front desk management
 *   - Guest profile management
 *   - Accounting and folio management
 *   - Rate and inventory management
 *   - Online booking engine integration
 *   - Webhook notifications for real-time events
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.webrezpro.com/api/v1/
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

const DEFAULT_BASE_URL = 'https://api.webrezpro.com/api/v1';

class WebRezProAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - WebRezPro API key (used as Bearer token).
   * @param {string} [config.credentials.hotelCode]  - Property / hotel code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'WEBREZPRO',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with WebRezPro by validating the API key against the
   * property info endpoint.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/properties/me', {
        params: { hotel_code: this.hotelCode },
      });

      const data = response.data;
      if (data?.property || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Hotel: ${this.hotelCode}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/properties/me', error);
      throw new Error(`WebRezPro authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh authentication. API keys are static so no refresh is needed.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Token refresh not applicable (static API key).`);
  }

  /** @private */
  _buildAuthenticatedClient() {
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 90, refillRate: 90, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-Hotel-Code': this.hotelCode,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by confirmation number.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>} Normalized reservation object.
   */
  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(confirmationNumber)}`,
        { params: { hotel_code: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${confirmationNumber}`, 200, durationMs);

    const reservation = result?.reservation || result?.data || result;
    if (!reservation || Object.keys(reservation).length === 0) return null;

    return this.normalizeReservation(reservation);
  }

  /**
   * Search reservations by multiple criteria.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { hotel_code: this.hotelCode };
    if (params.confirmationNumber) queryParams.confirmation = params.confirmationNumber;
    if (params.guestName) queryParams.name = params.guestName;
    if (params.checkInDate) queryParams.arrival_from = params.checkInDate;
    if (params.checkOutDate) queryParams.departure_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToWRP(params.status);
    queryParams.limit = params.limit || 50;
    queryParams.offset = params.offset || 0;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/reservations', { params: queryParams });
      return response.data;
    });

    this._logApiCall('GET', '/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    return (Array.isArray(reservations) ? reservations : []).map(r =>
      this.normalizeReservation(r)
    );
  }

  /**
   * Fetch the guest folio for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/charges`,
        { params: { hotel_code: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/charges`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID.
   * @param {string} guestId
   * @returns {Promise<Object|null>} Normalized guest profile.
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/guests/${encodeURIComponent(guestId)}`,
        { params: { hotel_code: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/guests/${guestId}`, 200, durationMs);

    const guest = result?.guest || result?.data || result;
    if (!guest || Object.keys(guest).length === 0) return null;

    return this.normalizeGuestProfile(guest);
  }

  /**
   * Fetch rate plan information.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/rates', {
        params: { hotel_code: this.hotelCode, ...params },
      });
      return response.data;
    });

    this._logApiCall('GET', '/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          subject: note.title,
          body: note.content,
          priority: note.priority || 'medium',
          note_type: note.category || 'chargeback',
          source: 'AccuDefend',
          internal: true,
          hotel_code: this.hotelCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert to the PMS.
   * @param {string} guestId
   * @param {Object} flagData
   * @returns {Promise<Object>}
   */
  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/flags`,
        {
          reason: flagData.reason,
          severity: flagData.severity || 'high',
          flag_type: 'chargeback_history',
          source: 'AccuDefend',
          chargeback_id: flagData.chargebackId || null,
          amount: flagData.amount || null,
          hotel_code: this.hotelCode,
          active: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/flags`, 201, durationMs);

    return {
      success: true,
      flagId: result?.flag?.id || result?.id || result?.data?.id,
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

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
          body: [
            '=== CHARGEBACK ALERT ===',
            `Case #: ${alertData.caseNumber}`,
            `Amount: $${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: 'high',
          note_type: 'chargeback_alert',
          source: 'AccuDefend',
          internal: true,
          hotel_code: this.hotelCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback alert)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome notification to the PMS.
   * @param {string} reservationId
   * @param {Object} outcomeData
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
          body: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: won ? 'medium' : 'high',
          note_type: 'dispute_outcome',
          source: 'AccuDefend',
          internal: true,
          hotel_code: this.hotelCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute outcome)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with WebRezPro.
   * @param {Object} config
   * @param {string} config.callbackUrl
   * @param {string[]} config.events
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks', {
        url: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToWRP(e)),
        secret,
        hotel_code: this.hotelCode,
        active: true,
        description: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhook?.id || result?.id || result?.data?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming raw webhook payload.
   * @param {Object} headers
   * @param {Object|string} body
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.event || payload.event_type || payload.type;
    const data = payload.data || payload.reservation || payload.guest || {};

    return {
      eventType: this._mapWRPEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.created_at || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.id || data.confirmation,
        guestId: data.guest_id || data.guest?.id,
        hotelCode: data.hotel_code || this.hotelCode,
        ...data,
      },
      raw: payload,
    };
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify API reachability and credential validity.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/properties/me', {
        params: { hotel_code: this.hotelCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
          apiVersion: 'v1',
          propertyName: response.data?.property?.name || '',
          features: {
            realTimeSync: true,
            guestFlags: true,
            folioAccess: true,
            rateManagement: true,
            onlineBooking: true,
            webhooks: true,
          },
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
  //  Normalization
  // =========================================================================

  /** @override */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const guest = pmsData.guest || pmsData.primary_guest || {};

    return {
      confirmationNumber: String(
        pmsData.confirmation_number || pmsData.confirmation || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.res_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.family_name || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || guest.home_phone || guest.cell_phone),
      address: normalizeAddress({
        line1: guest.address1 || guest.street || '',
        line2: guest.address2 || '',
        city: guest.city || '',
        state: guest.state || guest.province || '',
        postalCode: guest.postal_code || guest.zip || '',
        country: guest.country || '',
      }),
      checkInDate: normalizeDate(pmsData.arrival_date || pmsData.check_in),
      checkOutDate: normalizeDate(pmsData.departure_date || pmsData.check_out),
      roomNumber: pmsData.room_number || pmsData.room || '',
      roomType: pmsData.room_type || pmsData.room_type_name || '',
      rateCode: pmsData.rate_id || pmsData.rate_code || '',
      ratePlanDescription: pmsData.rate_name || pmsData.rate_description || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.total_charges || pmsData.grand_total),
      currency: normalizeCurrency(pmsData.currency || pmsData.currency_code),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.occupancy || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrival_date || pmsData.check_in,
        pmsData.departure_date || pmsData.check_out
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.cc_type || ''),
        cardLastFour: pmsData.card_last4 || pmsData.cc_last4 || '',
        authCode: pmsData.auth_code || pmsData.authorization || '',
      },
      bookingSource: pmsData.source || pmsData.booking_source || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_date),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modified_date),
      specialRequests: pmsData.special_requests || pmsData.comments || pmsData.notes || '',
      loyaltyNumber: pmsData.loyalty_id || pmsData.member_number || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const folio = pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.charges || folio?.items || folio?.line_items || [];

    if (Array.isArray(folio) && !items.length) {
      return folio.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.folio_id || item.folio_number || '',
      transactionId: String(item.id || item.charge_id || ''),
      transactionCode: item.charge_code || item.revenue_code || '',
      category: normalizeFolioCategory(
        item.category || item.charge_type || item.revenue_type || item.description
      ),
      description: item.description || item.charge_description || item.name || '',
      amount: normalizeAmount(item.amount || item.charge_amount),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.posted_date || item.charge_date || item.date),
      cardLastFour: item.card_last4 || item.cc_last4 || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.receipt || '',
      reversalFlag: item.voided === true || item.reversed === true,
      quantity: item.quantity || item.qty || 1,
      postedBy: item.posted_by || item.user || item.cashier_id || '',
      department: item.department || item.dept_code || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.first_name || pmsData.given_name || '',
        lastName: pmsData.last_name || pmsData.family_name || '',
      }),
      email: pmsData.email || pmsData.primary_email || '',
      phone: normalizePhone(pmsData.phone || pmsData.home_phone || pmsData.cell_phone),
      address: normalizeAddress({
        line1: pmsData.address1 || pmsData.street || '',
        line2: pmsData.address2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.province || '',
        postalCode: pmsData.postal_code || pmsData.zip || '',
        country: pmsData.country || '',
      }),
      vipCode: pmsData.vip_status || pmsData.vip || '',
      loyaltyNumber: pmsData.loyalty_id || pmsData.member_number || '',
      loyaltyLevel: pmsData.loyalty_level || pmsData.member_tier || '',
      nationality: pmsData.nationality || pmsData.country || '',
      language: pmsData.language || pmsData.preferred_lang || '',
      dateOfBirth: normalizeDate(pmsData.birth_date || pmsData.dob),
      companyName: pmsData.company || pmsData.company_name || '',
      totalStays: pmsData.stay_count || pmsData.total_visits || 0,
      totalRevenue: normalizeAmount(pmsData.lifetime_revenue || pmsData.total_spend || 0),
      lastStayDate: normalizeDate(pmsData.last_departure || pmsData.last_stay),
      createdAt: normalizeDate(pmsData.created_at),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const rates = pmsData?.rates || pmsData?.rate_plans || pmsData?.data || pmsData;
    if (!Array.isArray(rates)) return [];

    return rates.map(rate => ({
      rateCode: String(rate.id || rate.rate_id || rate.code || ''),
      name: rate.name || rate.rate_name || '',
      description: rate.description || rate.details || '',
      category: rate.category || rate.rate_type || '',
      baseAmount: normalizeAmount(rate.base_amount || rate.default_rate || rate.amount),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.start_date || rate.valid_from),
      endDate: normalizeDate(rate.end_date || rate.valid_to),
      isActive: rate.active !== false && rate.status !== 'disabled',
      roomTypes: rate.room_types || rate.applicable_rooms || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancel_policy || rate.cancellation_policy || '',
      minNights: rate.min_stay || rate.min_nights || 0,
      maxNights: rate.max_stay || rate.max_nights || 0,
      commissionable: rate.commissionable === true,
    }));
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  /** @private */
  _calculateNights(arrival, departure) {
    const s = normalizeDate(arrival);
    const e = normalizeDate(departure);
    if (!s || !e) return 0;
    const diff = new Date(e) - new Date(s);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  /** @private */
  _mapStatusToWRP(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'in_house',
      checked_out: 'checked_out',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToWRP(event) {
    const map = {
      'reservation.created': 'reservation.new',
      'reservation.updated': 'reservation.modified',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'reservation.checked_in',
      'guest.checked_out': 'reservation.checked_out',
      'payment.received': 'payment.posted',
      'folio.updated': 'folio.changed',
    };
    return map[event] || event;
  }

  /** @private */
  _mapWRPEventToCanonical(wrpEvent) {
    const map = {
      'reservation.new': 'reservation.created',
      'reservation.modified': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'reservation.checked_in': 'guest.checked_in',
      'reservation.checked_out': 'guest.checked_out',
      'payment.posted': 'payment.received',
      'folio.changed': 'folio.updated',
      'guest.new': 'guest.created',
      'guest.modified': 'guest.updated',
    };
    return map[wrpEvent] || wrpEvent;
  }
}

module.exports = WebRezProAdapter;
