/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Little Hotelier PMS Adapter
 *
 * Integrates with the Little Hotelier REST API (v1).
 *
 * Authentication: API Key sent via X-API-Key header.
 *
 * Little Hotelier is designed for small accommodation providers including
 * boutique hotels, B&Bs, guesthouses, and hostels. It provides:
 *   - Reservation management with OTA channel sync
 *   - Guest profile management
 *   - Folio and payment tracking
 *   - Rate plan management
 *   - Webhook-based event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.littlehotelier.com/api/v1/
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

const DEFAULT_BASE_URL = 'https://api.littlehotelier.com/api/v1';

class LittleHotelierAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Little Hotelier API key.
   * @param {string} [config.credentials.propertyId] - Property / hotel identifier.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'LITTLE_HOTELIER',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.lhPropertyId = this.credentials.propertyId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Little Hotelier by validating the API key against
   * the health endpoint.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/properties/current', {
        params: { property_id: this.lhPropertyId },
      });

      const data = response.data;
      if (data?.property || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Property: ${this.lhPropertyId}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/properties/current', error);
      throw new Error(`Little Hotelier authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 60, refillRate: 60, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      'X-API-Key': this.apiKey,
      'X-Property-Id': this.lhPropertyId,
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
        { params: { property_id: this.lhPropertyId } }
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

    const queryParams = { property_id: this.lhPropertyId };
    if (params.confirmationNumber) queryParams.confirmation_number = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.check_in_from = params.checkInDate;
    if (params.checkOutDate) queryParams.check_out_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToLH(params.status);
    queryParams.per_page = params.limit || 50;
    queryParams.page = params.page || 1;

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
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - PMS reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/folios`,
        { params: { property_id: this.lhPropertyId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/folios`, 200, durationMs);

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
        { params: { property_id: this.lhPropertyId } }
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
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/rates', {
        params: { property_id: this.lhPropertyId, ...params },
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
   * Push a textual note to a guest profile in the PMS.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>} PMS-assigned note reference.
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/guests/notes', {
        guest_id: guestId,
        property_id: this.lhPropertyId,
        title: note.title,
        body: note.content,
        priority: note.priority || 'medium',
        category: note.category || 'chargeback',
        source: 'AccuDefend',
        internal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/guests/notes', 201, durationMs);

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
   * @returns {Promise<Object>} PMS-assigned flag reference.
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
          property_id: this.lhPropertyId,
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
      const response = await this.httpClient.post('/guests/notes', {
        reservation_id: reservationId,
        property_id: this.lhPropertyId,
        title: `Chargeback Alert - Case ${alertData.caseNumber}`,
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
        category: 'chargeback_alert',
        source: 'AccuDefend',
        internal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/guests/notes (chargeback alert)', 201, durationMs);

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
      const response = await this.httpClient.post('/guests/notes', {
        reservation_id: reservationId,
        property_id: this.lhPropertyId,
        title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
        body: [
          `=== DISPUTE ${outcomeData.outcome} ===`,
          `Case #: ${outcomeData.caseNumber}`,
          `Outcome: ${outcomeData.outcome}`,
          `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
          `Resolved: ${outcomeData.resolvedDate}`,
          '--- Generated by AccuDefend Chargeback Defense System ---',
        ].join('\n'),
        priority: won ? 'medium' : 'high',
        category: 'dispute_outcome',
        source: 'AccuDefend',
        internal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/guests/notes (dispute outcome)', 201, durationMs);

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
   * Register a webhook callback URL with Little Hotelier.
   * @param {Object} config - Webhook configuration.
   * @param {string} config.callbackUrl - Our endpoint URL.
   * @param {string[]} config.events    - Event types to subscribe to.
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks', {
        url: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToLH(e)),
        secret,
        property_id: this.lhPropertyId,
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
   * Parse an incoming raw webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.event || payload.event_type || payload.type;
    const data = payload.data || payload.payload || {};

    return {
      eventType: this._mapLHEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.created_at || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.id || data.confirmation_number,
        guestId: data.guest_id || data.guest?.id,
        propertyId: data.property_id || this.lhPropertyId,
        ...data,
      },
      raw: payload,
    };
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Little Hotelier API is reachable and credentials are valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/properties/current', {
        params: { property_id: this.lhPropertyId },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyId: this.lhPropertyId,
          apiVersion: 'v1',
          propertyName: response.data?.property?.name || '',
          features: {
            realTimeSync: true,
            guestFlags: true,
            folioAccess: true,
            rateManagement: true,
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
          propertyId: this.lhPropertyId,
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
        pmsData.confirmation_number || pmsData.booking_reference || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.booking_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.surname || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || guest.mobile || guest.telephone),
      address: normalizeAddress({
        line1: guest.address || guest.street_address || '',
        line2: guest.address_2 || '',
        city: guest.city || '',
        state: guest.state || guest.region || '',
        postalCode: guest.postcode || guest.postal_code || guest.zip || '',
        country: guest.country || guest.country_code || '',
      }),
      checkInDate: normalizeDate(pmsData.check_in || pmsData.arrival_date),
      checkOutDate: normalizeDate(pmsData.check_out || pmsData.departure_date),
      roomNumber: pmsData.room_number || pmsData.room || '',
      roomType: pmsData.room_type || pmsData.room_type_name || '',
      rateCode: pmsData.rate_plan_id || pmsData.rate_code || '',
      ratePlanDescription: pmsData.rate_plan_name || pmsData.rate_description || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.total_amount),
      currency: normalizeCurrency(pmsData.currency || pmsData.currency_code),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.number_of_guests || 1,
      numberOfNights: this._calculateNights(
        pmsData.check_in || pmsData.arrival_date,
        pmsData.check_out || pmsData.departure_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.payment_type || ''),
        cardLastFour: pmsData.card_last_four || pmsData.card_last_4 || '',
        authCode: pmsData.auth_code || pmsData.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.booking_source || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_at),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modified_at),
      specialRequests: pmsData.special_requests || pmsData.notes || pmsData.guest_notes || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const folio = pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.items || folio?.line_items || folio?.charges || [];

    if (Array.isArray(folio) && !items.length) {
      return folio.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.folio_id || item.invoice_id || '',
      transactionId: String(item.id || item.transaction_id || ''),
      transactionCode: item.transaction_code || item.charge_code || '',
      category: normalizeFolioCategory(
        item.category || item.charge_type || item.type || item.description
      ),
      description: item.description || item.charge_description || item.name || '',
      amount: normalizeAmount(item.amount || item.total),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.posted_at || item.charge_date || item.date),
      cardLastFour: item.card_last_four || item.card_last_4 || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.receipt_number || '',
      reversalFlag: item.is_void === true || item.reversed === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.user || '',
      department: item.department || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.first_name || pmsData.given_name || '',
        lastName: pmsData.last_name || pmsData.surname || '',
      }),
      email: pmsData.email || '',
      phone: normalizePhone(pmsData.phone || pmsData.mobile || pmsData.telephone),
      address: normalizeAddress({
        line1: pmsData.address || pmsData.street_address || '',
        line2: pmsData.address_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.region || '',
        postalCode: pmsData.postcode || pmsData.postal_code || '',
        country: pmsData.country || pmsData.country_code || '',
      }),
      vipCode: pmsData.vip_status || pmsData.vip_code || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      loyaltyLevel: pmsData.loyalty_tier || '',
      nationality: pmsData.nationality || pmsData.country || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company || pmsData.company_name || '',
      totalStays: pmsData.total_stays || pmsData.stay_count || 0,
      totalRevenue: normalizeAmount(pmsData.total_revenue || pmsData.lifetime_value || 0),
      lastStayDate: normalizeDate(pmsData.last_stay || pmsData.last_check_out),
      createdAt: normalizeDate(pmsData.created_at),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const rates = pmsData?.rates || pmsData?.rate_plans || pmsData?.data || pmsData;
    if (!Array.isArray(rates)) return [];

    return rates.map(rate => ({
      rateCode: String(rate.id || rate.rate_plan_id || rate.code || ''),
      name: rate.name || rate.rate_name || '',
      description: rate.description || '',
      category: rate.category || rate.rate_type || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.amount || rate.default_amount),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.start_date || rate.valid_from),
      endDate: normalizeDate(rate.end_date || rate.valid_to),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: rate.room_types || rate.applicable_rooms || [],
      inclusions: rate.inclusions || rate.extras || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_policy || '',
      minNights: rate.min_stay || rate.minimum_nights || 0,
      maxNights: rate.max_stay || rate.maximum_nights || 0,
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
  _mapStatusToLH(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checked_in',
      checked_out: 'checked_out',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToLH(event) {
    const map = {
      'reservation.created': 'booking.new',
      'reservation.updated': 'booking.modified',
      'reservation.cancelled': 'booking.cancelled',
      'guest.checked_in': 'booking.checked_in',
      'guest.checked_out': 'booking.checked_out',
      'payment.received': 'payment.received',
      'folio.updated': 'folio.updated',
    };
    return map[event] || event;
  }

  /** @private */
  _mapLHEventToCanonical(lhEvent) {
    const map = {
      'booking.new': 'reservation.created',
      'booking.modified': 'reservation.updated',
      'booking.cancelled': 'reservation.cancelled',
      'booking.checked_in': 'guest.checked_in',
      'booking.checked_out': 'guest.checked_out',
      'payment.received': 'payment.received',
      'folio.updated': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
    };
    return map[lhEvent] || lhEvent;
  }
}

module.exports = LittleHotelierAdapter;
