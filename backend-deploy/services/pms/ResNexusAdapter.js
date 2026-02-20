/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * ResNexus PMS Adapter
 *
 * Integrates with the ResNexus REST API (v2).
 *
 * Authentication: API Key sent via X-API-Key header.
 *
 * ResNexus is a cloud-based property management system designed for
 * campgrounds, lodges, B&Bs, vacation rentals, and small hotels. It provides:
 *   - Reservation and booking management
 *   - Guest profile management
 *   - Payment processing and folio management
 *   - Rate and availability management
 *   - Online booking engine
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.resnexus.com/api/v2/
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

const DEFAULT_BASE_URL = 'https://api.resnexus.com/api/v2';

class ResNexusAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey         - ResNexus API key.
   * @param {string} [config.credentials.propertyCode] - Property / site code.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'RESNEXUS',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.rnPropertyCode = this.credentials.propertyCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with ResNexus by validating the API key against the
   * property endpoint.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/properties/current', {
        params: { property_code: this.rnPropertyCode },
      });

      const data = response.data;
      if (data?.property || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Property: ${this.rnPropertyCode}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/properties/current', error);
      throw new Error(`ResNexus authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 80, refillRate: 80, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      'X-API-Key': this.apiKey,
      'X-Property-Code': this.rnPropertyCode,
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
        { params: { property_code: this.rnPropertyCode } }
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

    const queryParams = { property_code: this.rnPropertyCode };
    if (params.confirmationNumber) queryParams.confirmation_number = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.arrival_from = params.checkInDate;
    if (params.checkOutDate) queryParams.departure_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToRN(params.status);
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
        { params: { property_code: this.rnPropertyCode } }
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
        { params: { property_code: this.rnPropertyCode } }
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
        params: { property_code: this.rnPropertyCode, ...params },
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
          title: note.title,
          body: note.content,
          priority: note.priority || 'medium',
          note_type: note.category || 'chargeback',
          source: 'AccuDefend',
          internal: true,
          property_code: this.rnPropertyCode,
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
          flag_type: 'chargeback_risk',
          source: 'AccuDefend',
          chargeback_id: flagData.chargebackId || null,
          amount: flagData.amount || null,
          property_code: this.rnPropertyCode,
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
          note_type: 'chargeback_alert',
          source: 'AccuDefend',
          internal: true,
          property_code: this.rnPropertyCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback)`, 201, durationMs);

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
          note_type: 'dispute_outcome',
          source: 'AccuDefend',
          internal: true,
          property_code: this.rnPropertyCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute)`, 201, durationMs);

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
   * Register a webhook callback URL with ResNexus.
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
        events: (config.events || []).map(e => this._mapEventToRN(e)),
        secret,
        property_code: this.rnPropertyCode,
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
      eventType: this._mapRNEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.fired_at || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.id || data.confirmation_number,
        guestId: data.guest_id || data.guest?.id,
        propertyCode: data.property_code || this.rnPropertyCode,
        siteType: data.site_type || data.accommodation_type || '',
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

      const response = await this.httpClient.get('/properties/current', {
        params: { property_code: this.rnPropertyCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.rnPropertyCode,
          apiVersion: 'v2',
          propertyName: response.data?.property?.name || '',
          propertyType: response.data?.property?.type || '',
          features: {
            realTimeSync: true,
            guestFlags: true,
            folioAccess: true,
            rateManagement: true,
            onlineBooking: true,
            campgroundSupport: true,
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
          propertyCode: this.rnPropertyCode,
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
        pmsData.confirmation_number || pmsData.booking_number || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.booking_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.family_name || '',
      }),
      email: guest.email || pmsData.contact_email || '',
      phone: normalizePhone(guest.phone || guest.mobile || guest.phone_number),
      address: normalizeAddress({
        line1: guest.address || guest.street_address || '',
        line2: guest.address_2 || guest.address_line_2 || '',
        city: guest.city || '',
        state: guest.state || guest.province || '',
        postalCode: guest.zip || guest.postal_code || '',
        country: guest.country || guest.country_code || '',
      }),
      checkInDate: normalizeDate(pmsData.arrival_date || pmsData.check_in),
      checkOutDate: normalizeDate(pmsData.departure_date || pmsData.check_out),
      roomNumber: pmsData.site_number || pmsData.room_number || pmsData.unit_name || '',
      roomType: pmsData.site_type || pmsData.room_type || pmsData.accommodation_type || '',
      rateCode: pmsData.rate_plan_id || pmsData.rate_code || '',
      ratePlanDescription: pmsData.rate_plan_name || pmsData.rate_description || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.total_charges || pmsData.balance_due),
      currency: normalizeCurrency(pmsData.currency || 'USD'),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.occupants || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrival_date || pmsData.check_in,
        pmsData.departure_date || pmsData.check_out
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.payment_type || ''),
        cardLastFour: pmsData.card_last_four || pmsData.card_last4 || '',
        authCode: pmsData.auth_code || pmsData.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.booking_source || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_on),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modified_at),
      specialRequests: pmsData.special_requests || pmsData.notes || pmsData.guest_message || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      // ResNexus-specific: campground/lodge fields
      siteNumber: pmsData.site_number || pmsData.lot_number || '',
      vehicleInfo: pmsData.vehicle_info || pmsData.rv_info || '',
      petInfo: pmsData.pet_info || pmsData.pets || '',
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
      folioId: item.folio_id || item.invoice_id || '',
      transactionId: String(item.id || item.charge_id || ''),
      transactionCode: item.charge_code || item.transaction_code || '',
      category: normalizeFolioCategory(
        item.category || item.charge_type || item.type || item.description
      ),
      description: item.description || item.charge_name || item.name || '',
      amount: normalizeAmount(item.amount || item.charge_amount),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.posted_at || item.charge_date || item.date),
      cardLastFour: item.card_last_four || item.card_last4 || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.receipt_number || '',
      reversalFlag: item.voided === true || item.refunded === true || item.reversed === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.user || '',
      department: item.department || item.category_code || '',
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
      email: pmsData.email || pmsData.contact_email || '',
      phone: normalizePhone(pmsData.phone || pmsData.mobile || pmsData.phone_number),
      address: normalizeAddress({
        line1: pmsData.address || pmsData.street_address || '',
        line2: pmsData.address_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.province || '',
        postalCode: pmsData.zip || pmsData.postal_code || '',
        country: pmsData.country || pmsData.country_code || '',
      }),
      vipCode: pmsData.guest_type || pmsData.vip_status || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      loyaltyLevel: pmsData.loyalty_tier || '',
      nationality: pmsData.nationality || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company || pmsData.organization || '',
      totalStays: pmsData.visit_count || pmsData.total_stays || 0,
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
      rateCode: String(rate.id || rate.rate_plan_id || rate.code || ''),
      name: rate.name || rate.rate_name || '',
      description: rate.description || rate.details || '',
      category: rate.category || rate.rate_type || rate.site_type || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.amount || rate.nightly_rate),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.start_date || rate.valid_from),
      endDate: normalizeDate(rate.end_date || rate.valid_to),
      isActive: rate.active !== false && rate.status !== 'disabled',
      roomTypes: rate.site_types || rate.room_types || rate.accommodation_types || [],
      inclusions: rate.inclusions || rate.add_ons || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_policy || '',
      minNights: rate.min_nights || rate.minimum_stay || 0,
      maxNights: rate.max_nights || rate.maximum_stay || 0,
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
  _mapStatusToRN(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'arrived',
      checked_out: 'departed',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToRN(event) {
    const map = {
      'reservation.created': 'booking.new',
      'reservation.updated': 'booking.modified',
      'reservation.cancelled': 'booking.cancelled',
      'guest.checked_in': 'guest.arrived',
      'guest.checked_out': 'guest.departed',
      'payment.received': 'payment.completed',
      'folio.updated': 'folio.changed',
    };
    return map[event] || event;
  }

  /** @private */
  _mapRNEventToCanonical(rnEvent) {
    const map = {
      'booking.new': 'reservation.created',
      'booking.modified': 'reservation.updated',
      'booking.cancelled': 'reservation.cancelled',
      'guest.arrived': 'guest.checked_in',
      'guest.departed': 'guest.checked_out',
      'payment.completed': 'payment.received',
      'folio.changed': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
    };
    return map[rnEvent] || rnEvent;
  }
}

module.exports = ResNexusAdapter;
