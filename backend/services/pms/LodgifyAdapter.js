/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Lodgify PMS Adapter
 *
 * Integrates with the Lodgify REST API (v2).
 *
 * Authentication: API Key sent via X-ApiKey header.
 *
 * Lodgify is a vacation rental software platform designed for property
 * owners and managers. It provides:
 *   - Property listing and website builder
 *   - Multi-channel reservation management (Airbnb, VRBO, Booking.com)
 *   - Guest communication management
 *   - Payment processing and invoicing
 *   - Rate and availability management
 *   - Property management tools
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://docs.lodgify.com/reference/v2/
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

const DEFAULT_BASE_URL = 'https://api.lodgify.com/api/v2';

class LodgifyAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Lodgify API key.
   * @param {string} [config.credentials.ownerId]    - Lodgify owner / account ID.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'LODGIFY',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.ownerId = this.credentials.ownerId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Lodgify by validating the API key against the
   * user info endpoint.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/properties');

      const data = response.data;
      if (data || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Owner: ${this.ownerId}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/properties', error);
      throw new Error(`Lodgify authentication failed: ${error.message}`);
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
      'X-ApiKey': this.apiKey,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by ID.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>} Normalized reservation object.
   */
  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(confirmationNumber)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${confirmationNumber}`, 200, durationMs);

    const reservation = result?.data || result;
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

    const queryParams = {};
    if (params.confirmationNumber) queryParams.id = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.arrival_from = params.checkInDate;
    if (params.checkOutDate) queryParams.departure_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToLodgify(params.status);
    queryParams.size = params.limit || 50;
    queryParams.page = params.page || 1;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/reservations', { params: queryParams });
      return response.data;
    });

    this._logApiCall('GET', '/reservations', 200, durationMs);

    const reservations = result?.items || result?.data || result;
    return (Array.isArray(reservations) ? reservations : []).map(r =>
      this.normalizeReservation(r)
    );
  }

  /**
   * Fetch the guest folio (financial data) for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/payments`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/payments`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile. Lodgify uses property-centric model,
   * so guest data is fetched from the booking guest endpoint.
   * @param {string} guestId
   * @returns {Promise<Object|null>} Normalized guest profile.
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/guests/${encodeURIComponent(guestId)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/guests/${guestId}`, 200, durationMs);

    const guest = result?.data || result;
    if (!guest || Object.keys(guest).length === 0) return null;

    return this.normalizeGuestProfile(guest);
  }

  /**
   * Fetch rate/pricing information for properties.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/properties', {
        params: { includeRates: true, ...params },
      });
      return response.data;
    });

    this._logApiCall('GET', '/properties (rates)', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest/reservation.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    // Lodgify notes are attached to reservations via the booking note API
    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          title: note.title,
          text: note.content,
          priority: note.priority || 'medium',
          type: note.category || 'chargeback',
          source: 'AccuDefend',
          is_internal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.id || result?.data?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert.
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
          is_active: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/flags`, 201, durationMs);

    return {
      success: true,
      flagId: result?.id || result?.data?.id,
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
          priority: 'high',
          type: 'chargeback_alert',
          source: 'AccuDefend',
          is_internal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.id || result?.data?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome notification.
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
          priority: won ? 'medium' : 'high',
          type: 'dispute_outcome',
          source: 'AccuDefend',
          is_internal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with Lodgify.
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
        events: (config.events || []).map(e => this._mapEventToLodgify(e)),
        secret,
        active: true,
        name: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?.id || result?.data?.id,
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
    const data = payload.data || payload.booking || payload.property || {};

    return {
      eventType: this._mapLodgifyEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.created_at || new Date().toISOString(),
      data: {
        reservationId: data.booking_id || data.id || data.reservation_id,
        guestId: data.guest_id || data.guest?.id,
        propertyId: data.property_id || this.ownerId,
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

      const response = await this.httpClient.get('/properties', {
        params: { size: 1 },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          ownerId: this.ownerId,
          apiVersion: 'v2',
          propertyCount: response.data?.total || response.data?.items?.length || 0,
          features: {
            realTimeSync: true,
            multiChannel: true,
            guestManagement: true,
            paymentTracking: true,
            propertyWebsite: true,
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
          ownerId: this.ownerId,
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

    const guest = pmsData.guest || {};

    return {
      confirmationNumber: String(
        pmsData.id || pmsData.booking_id || pmsData.confirmation_code || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.booking_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.booking_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.name?.split(' ')[0] || pmsData.guest_name?.split(' ')[0] || '',
        lastName: guest.last_name || guest.name?.split(' ').slice(1).join(' ') || pmsData.guest_name?.split(' ').slice(1).join(' ') || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || pmsData.guest_phone),
      address: normalizeAddress({
        line1: guest.address || guest.street || '',
        line2: guest.address_2 || '',
        city: guest.city || '',
        state: guest.state || guest.region || '',
        postalCode: guest.zip || guest.postal_code || '',
        country: guest.country || guest.country_code || '',
      }),
      checkInDate: normalizeDate(pmsData.arrival || pmsData.check_in || pmsData.date_arrival),
      checkOutDate: normalizeDate(pmsData.departure || pmsData.check_out || pmsData.date_departure),
      roomNumber: pmsData.property_name || pmsData.room_name || '',
      roomType: pmsData.property_type || pmsData.room_type_name || '',
      rateCode: pmsData.rate_id || '',
      ratePlanDescription: pmsData.rate_name || '',
      totalAmount: normalizeAmount(pmsData.total_amount || pmsData.total || pmsData.subtotal),
      currency: normalizeCurrency(pmsData.currency || pmsData.currency_code),
      numberOfGuests: pmsData.people || pmsData.guest_count || (pmsData.adults || 0) + (pmsData.children || 0) || 1,
      numberOfNights: pmsData.nights || this._calculateNights(
        pmsData.arrival || pmsData.check_in,
        pmsData.departure || pmsData.check_out
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.payment_method || pmsData.card_type || ''),
        cardLastFour: pmsData.card_last_four || pmsData.card_last4 || '',
        authCode: pmsData.auth_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.origin || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_at),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modified_at),
      specialRequests: pmsData.special_requests || pmsData.notes || pmsData.guest_message || '',
      loyaltyNumber: '',
      // Lodgify-specific
      propertyId: pmsData.property_id || '',
      propertyName: pmsData.property_name || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const payments = pmsData?.items || pmsData?.data || pmsData;

    if (Array.isArray(payments)) {
      return payments.map(item => this._normalizeSingleFolioItem(item));
    }

    const items = payments?.items || payments?.payments || payments?.transactions || [];
    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.invoice_id || item.folio_id || '',
      transactionId: String(item.id || item.payment_id || item.transaction_id || ''),
      transactionCode: item.type || item.payment_type || '',
      category: normalizeFolioCategory(
        item.type || item.category || item.description
      ),
      description: item.description || item.title || item.payment_description || '',
      amount: normalizeAmount(item.amount || item.total),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.date || item.payment_date || item.created_at),
      cardLastFour: item.card_last_four || item.card_last4 || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.transaction_ref || '',
      reversalFlag: item.is_refund === true || item.type === 'refund' || item.status === 'refunded',
      quantity: item.quantity || 1,
      postedBy: item.created_by || item.user || '',
      department: item.department || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.first_name || pmsData.name?.split(' ')[0] || '',
        lastName: pmsData.last_name || pmsData.name?.split(' ').slice(1).join(' ') || '',
      }),
      email: pmsData.email || '',
      phone: normalizePhone(pmsData.phone || pmsData.phone_number),
      address: normalizeAddress({
        line1: pmsData.address || pmsData.street || '',
        line2: pmsData.address_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.region || '',
        postalCode: pmsData.zip || pmsData.postal_code || '',
        country: pmsData.country || pmsData.country_code || '',
      }),
      vipCode: '',
      loyaltyNumber: '',
      loyaltyLevel: '',
      nationality: pmsData.nationality || pmsData.country || '',
      language: pmsData.language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth),
      companyName: pmsData.company || '',
      totalStays: pmsData.booking_count || pmsData.total_bookings || 0,
      totalRevenue: normalizeAmount(pmsData.total_revenue || pmsData.lifetime_spend || 0),
      lastStayDate: normalizeDate(pmsData.last_departure || pmsData.last_booking),
      createdAt: normalizeDate(pmsData.created_at),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const properties = pmsData?.items || pmsData?.data || pmsData;
    if (!Array.isArray(properties)) return [];

    return properties.map(prop => ({
      rateCode: String(prop.id || prop.property_id || ''),
      name: prop.name || prop.property_name || '',
      description: prop.description || prop.public_description || '',
      category: prop.property_type || prop.type || 'vacation_rental',
      baseAmount: normalizeAmount(prop.base_price || prop.rates?.base_rate || 0),
      currency: normalizeCurrency(prop.currency),
      startDate: null,
      endDate: null,
      isActive: prop.active !== false && prop.is_listed !== false,
      roomTypes: [prop.property_type || prop.type || ''],
      inclusions: [],
      cancellationPolicy: prop.cancellation_policy || '',
      minNights: prop.min_nights || prop.minimum_stay || 0,
      maxNights: prop.max_nights || prop.maximum_stay || 0,
      commissionable: false,
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
  _mapStatusToLodgify(status) {
    const map = {
      confirmed: 'Booked',
      checked_in: 'CheckedIn',
      checked_out: 'CheckedOut',
      cancelled: 'Declined',
      no_show: 'NoShow',
      pending: 'Open',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToLodgify(event) {
    const map = {
      'reservation.created': 'booking_created',
      'reservation.updated': 'booking_updated',
      'reservation.cancelled': 'booking_cancelled',
      'guest.checked_in': 'guest_checked_in',
      'guest.checked_out': 'guest_checked_out',
      'payment.received': 'payment_received',
      'folio.updated': 'transaction_created',
    };
    return map[event] || event;
  }

  /** @private */
  _mapLodgifyEventToCanonical(lgEvent) {
    const map = {
      booking_created: 'reservation.created',
      booking_updated: 'reservation.updated',
      booking_cancelled: 'reservation.cancelled',
      guest_checked_in: 'guest.checked_in',
      guest_checked_out: 'guest.checked_out',
      payment_received: 'payment.received',
      transaction_created: 'folio.updated',
    };
    return map[lgEvent] || lgEvent;
  }
}

module.exports = LodgifyAdapter;
