/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * ThinkReservations PMS Adapter
 *
 * Integrates with the ThinkReservations REST API (v1).
 *
 * Authentication: API Key sent via X-API-Key header.
 *
 * ThinkReservations is a cloud-based PMS designed specifically for
 * bed & breakfasts, boutique hotels, and small inns. It provides:
 *   - Reservation management with channel manager integration
 *   - Guest profile and history tracking
 *   - Folio and payment processing
 *   - Rate management with yield controls
 *   - Housekeeping management
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.thinkreservations.com/api/v1/
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

const DEFAULT_BASE_URL = 'https://api.thinkreservations.com/api/v1';

class ThinkReservationsAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - ThinkReservations API key.
   * @param {string} [config.credentials.apiSecret]  - API secret for write operations.
   * @param {string} [config.credentials.innCode]    - Inn / property code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'THINK_RESERVATIONS',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.apiSecret = this.credentials.apiSecret || '';
    this.innCode = this.credentials.innCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with ThinkReservations by validating the API key.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/properties/info', {
        params: { inn_code: this.innCode },
      });

      const data = response.data;
      if (data?.property || data?.inn || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Inn: ${this.innCode}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/properties/info', error);
      throw new Error(`ThinkReservations authentication failed: ${error.message}`);
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
    const headers = {
      'X-API-Key': this.apiKey,
      'X-Inn-Code': this.innCode,
    };
    if (this.apiSecret) {
      headers['X-API-Secret'] = this.apiSecret;
    }
    return headers;
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
        { params: { inn_code: this.innCode } }
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

    const queryParams = { inn_code: this.innCode };
    if (params.confirmationNumber) queryParams.confirmation = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.checkin_from = params.checkInDate;
    if (params.checkOutDate) queryParams.checkout_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToTR(params.status);
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
   * Fetch the guest folio for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/folio`,
        { params: { inn_code: this.innCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/folio`, 200, durationMs);

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
        { params: { inn_code: this.innCode } }
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
        params: { inn_code: this.innCode, ...params },
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
          text: note.content,
          priority: note.priority || 'medium',
          category: note.category || 'chargeback',
          source: 'AccuDefend',
          is_private: true,
          inn_code: this.innCode,
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
        `/guests/${encodeURIComponent(guestId)}/alerts`,
        {
          reason: flagData.reason,
          severity: flagData.severity || 'high',
          alert_type: 'chargeback_risk',
          source: 'AccuDefend',
          chargeback_id: flagData.chargebackId || null,
          amount: flagData.amount || null,
          inn_code: this.innCode,
          is_active: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alert?.id || result?.id || result?.data?.id,
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
          text: [
            '=== CHARGEBACK ALERT ===',
            `Case #: ${alertData.caseNumber}`,
            `Amount: $${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: 'urgent',
          category: 'chargeback_alert',
          source: 'AccuDefend',
          is_private: true,
          inn_code: this.innCode,
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
          text: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: won ? 'normal' : 'urgent',
          category: 'dispute_outcome',
          source: 'AccuDefend',
          is_private: true,
          inn_code: this.innCode,
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
   * Register a webhook callback URL with ThinkReservations.
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
        callback_url: config.callbackUrl,
        event_types: (config.events || []).map(e => this._mapEventToTR(e)),
        signing_key: secret,
        inn_code: this.innCode,
        enabled: true,
        label: 'AccuDefend Chargeback Defense Integration',
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

    const eventType = payload.event_type || payload.event || payload.type;
    const data = payload.data || payload.reservation || payload.guest || {};

    return {
      eventType: this._mapTREventToCanonical(eventType),
      timestamp: payload.occurred_at || payload.timestamp || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.id || data.confirmation,
        guestId: data.guest_id || data.guest?.id,
        innCode: data.inn_code || this.innCode,
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

      const response = await this.httpClient.get('/properties/info', {
        params: { inn_code: this.innCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          innCode: this.innCode,
          apiVersion: 'v1',
          propertyName: response.data?.property?.name || response.data?.inn?.name || '',
          features: {
            realTimeSync: true,
            guestAlerts: true,
            folioAccess: true,
            rateManagement: true,
            channelManager: true,
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
          innCode: this.innCode,
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
        pmsData.confirmation_number || pmsData.booking_ref || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.reservation_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.surname || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || guest.mobile || guest.cell_phone),
      address: normalizeAddress({
        line1: guest.address_1 || guest.street || '',
        line2: guest.address_2 || '',
        city: guest.city || '',
        state: guest.state || guest.province || '',
        postalCode: guest.zip || guest.postal_code || '',
        country: guest.country || '',
      }),
      checkInDate: normalizeDate(pmsData.checkin_date || pmsData.arrival_date),
      checkOutDate: normalizeDate(pmsData.checkout_date || pmsData.departure_date),
      roomNumber: pmsData.room_name || pmsData.room_number || '',
      roomType: pmsData.room_type || pmsData.room_category || '',
      rateCode: pmsData.rate_plan_id || pmsData.rate_code || '',
      ratePlanDescription: pmsData.rate_plan_name || pmsData.rate_description || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.total_charges),
      currency: normalizeCurrency(pmsData.currency || 'USD'),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.guest_count || 1,
      numberOfNights: this._calculateNights(
        pmsData.checkin_date || pmsData.arrival_date,
        pmsData.checkout_date || pmsData.departure_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.payment_method || ''),
        cardLastFour: pmsData.card_last4 || pmsData.card_last_four || '',
        authCode: pmsData.auth_code || pmsData.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.origin || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_at),
      updatedAt: normalizeDate(pmsData.updated_at),
      specialRequests: pmsData.special_requests || pmsData.guest_comments || pmsData.notes || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const folio = pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.items || folio?.charges || folio?.line_items || [];

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
      cardLastFour: item.card_last4 || item.card_last_four || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.receipt_number || '',
      reversalFlag: item.voided === true || item.refunded === true || item.reversed === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.user_name || '',
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
        lastName: pmsData.last_name || pmsData.surname || '',
      }),
      email: pmsData.email || '',
      phone: normalizePhone(pmsData.phone || pmsData.mobile || pmsData.cell_phone),
      address: normalizeAddress({
        line1: pmsData.address_1 || pmsData.street || '',
        line2: pmsData.address_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.province || '',
        postalCode: pmsData.zip || pmsData.postal_code || '',
        country: pmsData.country || '',
      }),
      vipCode: pmsData.vip_level || pmsData.guest_type || '',
      loyaltyNumber: pmsData.loyalty_number || '',
      loyaltyLevel: pmsData.loyalty_level || '',
      nationality: pmsData.nationality || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company || pmsData.company_name || '',
      totalStays: pmsData.stay_count || pmsData.total_visits || 0,
      totalRevenue: normalizeAmount(pmsData.total_revenue || pmsData.lifetime_spend || 0),
      lastStayDate: normalizeDate(pmsData.last_checkout || pmsData.last_stay_date),
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
      category: rate.category || rate.rate_type || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.amount || rate.default_amount),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.start_date || rate.effective_from),
      endDate: normalizeDate(rate.end_date || rate.effective_to),
      isActive: rate.active !== false && rate.status !== 'disabled',
      roomTypes: rate.room_types || rate.room_categories || [],
      inclusions: rate.inclusions || rate.add_ons || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_terms || '',
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
  _mapStatusToTR(status) {
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
  _mapEventToTR(event) {
    const map = {
      'reservation.created': 'booking.created',
      'reservation.updated': 'booking.modified',
      'reservation.cancelled': 'booking.cancelled',
      'guest.checked_in': 'guest.arrived',
      'guest.checked_out': 'guest.departed',
      'payment.received': 'payment.processed',
      'folio.updated': 'folio.modified',
    };
    return map[event] || event;
  }

  /** @private */
  _mapTREventToCanonical(trEvent) {
    const map = {
      'booking.created': 'reservation.created',
      'booking.modified': 'reservation.updated',
      'booking.cancelled': 'reservation.cancelled',
      'guest.arrived': 'guest.checked_in',
      'guest.departed': 'guest.checked_out',
      'payment.processed': 'payment.received',
      'folio.modified': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
    };
    return map[trEvent] || trEvent;
  }
}

module.exports = ThinkReservationsAdapter;
