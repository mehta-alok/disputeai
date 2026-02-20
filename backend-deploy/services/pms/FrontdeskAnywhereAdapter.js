/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Frontdesk Anywhere PMS Adapter
 *
 * Integrates with the Frontdesk Anywhere REST API (v2).
 *
 * Authentication: OAuth2 (client_credentials grant).
 *   - Obtains access token from /oauth/token
 *   - Bearer token sent in Authorization header
 *   - Token auto-refreshes on expiry
 *
 * Frontdesk Anywhere is a cloud-based PMS designed for boutique hotels
 * and independent properties. It provides:
 *   - Full reservation lifecycle management
 *   - Guest CRM with profile history
 *   - Integrated billing and folio management
 *   - Channel manager connectivity
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.frontdeskanywhere.com/api/v2/
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

const DEFAULT_BASE_URL = 'https://api.frontdeskanywhere.com/api/v2';
const TOKEN_URL = 'https://api.frontdeskanywhere.com/oauth/token';

class FrontdeskAnywhereAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId      - OAuth2 client ID.
   * @param {string} config.credentials.clientSecret   - OAuth2 client secret.
   * @param {string} [config.credentials.propertyCode] - Property identifier.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'FRONTDESK_ANYWHERE',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.fdaPropertyCode = this.credentials.propertyCode || this.propertyId;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.refreshToken = null;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Frontdesk Anywhere using OAuth2 client_credentials grant.
   * @returns {Promise<void>}
   */
  async authenticate() {
    try {
      // First, build a basic HTTP client without auth for the token request
      this._buildHttpClient({}, { timeout: 15000 });

      const response = await this.httpClient.post(TOKEN_URL, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'reservations guests folios rates webhooks',
      });

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token || null;
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

      // Rebuild the HTTP client with the access token
      this._buildAuthenticatedClient();

      logger.info(
        `[PMS:${this.pmsType}] Authenticated via OAuth2. Property: ${this.fdaPropertyCode}`
      );
    } catch (error) {
      this._logApiError('POST', TOKEN_URL, error);
      throw new Error(`Frontdesk Anywhere authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh an expired access token using the refresh token or re-authenticate.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    try {
      const body = this.refreshToken
        ? {
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
            client_id: this.clientId,
            client_secret: this.clientSecret,
          }
        : {
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            scope: 'reservations guests folios rates webhooks',
          };

      const response = await this.httpClient.post(TOKEN_URL, body);

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token || this.refreshToken;
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

      // Update the HTTP client headers
      this.httpClient.setHeader('Authorization', `Bearer ${this.accessToken}`);

      logger.info(`[PMS:${this.pmsType}] Token refreshed successfully.`);
    } catch (error) {
      this._logApiError('POST', TOKEN_URL + ' (refresh)', error);
      throw new Error(`Frontdesk Anywhere token refresh failed: ${error.message}`);
    }
  }

  /** @private */
  _buildAuthenticatedClient() {
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 100, refillRate: 100, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'X-Property-Code': this.fdaPropertyCode,
    };
  }

  /**
   * Check if the current token is expired or about to expire (within 5 min).
   * @returns {boolean}
   * @private
   */
  _isTokenExpired() {
    return !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt - 300000;
  }

  /**
   * Ensure authenticated and auto-refresh token if needed.
   * @private
   */
  async _ensureValidToken() {
    this._ensureAuthenticated();
    if (this._isTokenExpired()) {
      await this.refreshAuth();
    }
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/bookings/${encodeURIComponent(confirmationNumber)}`,
        { params: { property_code: this.fdaPropertyCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/bookings/${confirmationNumber}`, 200, durationMs);

    const reservation = result?.booking || result?.data || result;
    if (!reservation || Object.keys(reservation).length === 0) return null;

    return this.normalizeReservation(reservation);
  }

  /**
   * Search reservations by multiple criteria.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    await this._ensureValidToken();

    const queryParams = { property_code: this.fdaPropertyCode };
    if (params.confirmationNumber) queryParams.confirmation_number = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.check_in_from = params.checkInDate;
    if (params.checkOutDate) queryParams.check_out_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToFDA(params.status);
    queryParams.limit = params.limit || 50;
    queryParams.offset = params.offset || 0;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/bookings', { params: queryParams });
      return response.data;
    });

    this._logApiCall('GET', '/bookings', 200, durationMs);

    const bookings = result?.bookings || result?.data || [];
    return (Array.isArray(bookings) ? bookings : []).map(r =>
      this.normalizeReservation(r)
    );
  }

  /**
   * Fetch the guest folio for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/bookings/${encodeURIComponent(reservationId)}/folio`,
        { params: { property_code: this.fdaPropertyCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/bookings/${reservationId}/folio`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID.
   * @param {string} guestId
   * @returns {Promise<Object|null>} Normalized guest profile.
   */
  async getGuestProfile(guestId) {
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/guests/${encodeURIComponent(guestId)}`,
        { params: { property_code: this.fdaPropertyCode } }
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/rates', {
        params: { property_code: this.fdaPropertyCode, ...params },
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
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          title: note.title,
          content: note.content,
          priority: note.priority || 'medium',
          category: note.category || 'chargeback',
          source: 'AccuDefend',
          internal: true,
          property_code: this.fdaPropertyCode,
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/alerts`,
        {
          reason: flagData.reason,
          severity: flagData.severity || 'high',
          alert_type: 'chargeback_history',
          source: 'AccuDefend',
          chargeback_id: flagData.chargebackId || null,
          amount: flagData.amount || null,
          property_code: this.fdaPropertyCode,
          active: true,
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/bookings/${encodeURIComponent(reservationId)}/notes`,
        {
          title: `Chargeback Alert - Case ${alertData.caseNumber}`,
          content: [
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
          property_code: this.fdaPropertyCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/bookings/${reservationId}/notes`, 201, durationMs);

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
    await this._ensureValidToken();

    const won = outcomeData.outcome === 'WON';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/bookings/${encodeURIComponent(reservationId)}/notes`,
        {
          title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
          content: [
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
          property_code: this.fdaPropertyCode,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/bookings/${reservationId}/notes (dispute outcome)`, 201, durationMs);

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
   * Register a webhook callback URL with Frontdesk Anywhere.
   * @param {Object} config
   * @param {string} config.callbackUrl
   * @param {string[]} config.events
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    await this._ensureValidToken();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks', {
        callback_url: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToFDA(e)),
        signing_secret: secret,
        property_code: this.fdaPropertyCode,
        active: true,
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

    const eventType = payload.event || payload.event_type || payload.type;
    const data = payload.data || payload.booking || payload.guest || {};

    return {
      eventType: this._mapFDAEventToCanonical(eventType),
      timestamp: payload.occurred_at || payload.timestamp || new Date().toISOString(),
      data: {
        reservationId: data.booking_id || data.id || data.confirmation_number,
        guestId: data.guest_id || data.guest?.id,
        propertyCode: data.property_code || this.fdaPropertyCode,
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
      if (this._isTokenExpired()) {
        await this.refreshAuth();
      }

      const response = await this.httpClient.get('/properties/info', {
        params: { property_code: this.fdaPropertyCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.fdaPropertyCode,
          apiVersion: 'v2',
          propertyName: response.data?.property?.name || '',
          tokenExpiresIn: Math.max(0, Math.floor((this.tokenExpiresAt - Date.now()) / 1000)),
          features: {
            realTimeSync: true,
            guestAlerts: true,
            folioAccess: true,
            rateManagement: true,
            webhooks: true,
            oAuth2: true,
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
          propertyCode: this.fdaPropertyCode,
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
      pmsReservationId: String(pmsData.id || pmsData.booking_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.booking_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.family_name || '',
      }),
      email: guest.email || pmsData.contact_email || '',
      phone: normalizePhone(guest.phone || guest.mobile_phone || guest.telephone),
      address: normalizeAddress({
        line1: guest.address_line_1 || guest.street || '',
        line2: guest.address_line_2 || '',
        city: guest.city || '',
        state: guest.state || guest.province || '',
        postalCode: guest.postal_code || guest.zip_code || '',
        country: guest.country || guest.country_code || '',
      }),
      checkInDate: normalizeDate(pmsData.check_in_date || pmsData.arrival),
      checkOutDate: normalizeDate(pmsData.check_out_date || pmsData.departure),
      roomNumber: pmsData.room_number || pmsData.assigned_room || '',
      roomType: pmsData.room_type || pmsData.room_type_name || '',
      rateCode: pmsData.rate_plan_id || pmsData.rate_code || '',
      ratePlanDescription: pmsData.rate_plan_name || '',
      totalAmount: normalizeAmount(pmsData.total_charge || pmsData.total_amount || pmsData.grand_total),
      currency: normalizeCurrency(pmsData.currency || pmsData.currency_code),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.occupancy || 1,
      numberOfNights: this._calculateNights(
        pmsData.check_in_date || pmsData.arrival,
        pmsData.check_out_date || pmsData.departure
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.payment_method || ''),
        cardLastFour: pmsData.card_last_four || pmsData.card_number_last4 || '',
        authCode: pmsData.authorization_code || pmsData.auth_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.origin || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booking_date),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.last_modified),
      specialRequests: pmsData.special_requests || pmsData.guest_notes || '',
      loyaltyNumber: pmsData.loyalty_number || pmsData.membership_number || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const folio = pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.items || folio?.charges || folio?.transactions || [];

    if (Array.isArray(folio) && !items.length) {
      return folio.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.folio_id || item.invoice_id || '',
      transactionId: String(item.id || item.charge_id || item.transaction_id || ''),
      transactionCode: item.charge_code || item.transaction_code || '',
      category: normalizeFolioCategory(
        item.category || item.charge_type || item.type || item.description
      ),
      description: item.description || item.charge_description || item.item_name || '',
      amount: normalizeAmount(item.amount || item.charge_amount),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.posted_date || item.charge_date || item.created_at),
      cardLastFour: item.card_last_four || item.card_last4 || '',
      authCode: item.auth_code || item.authorization_code || '',
      reference: item.reference || item.receipt_number || '',
      reversalFlag: item.voided === true || item.reversed === true || item.is_refund === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.cashier || item.user_name || '',
      department: item.department || item.revenue_center || '',
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
      phone: normalizePhone(pmsData.phone || pmsData.mobile_phone || pmsData.telephone),
      address: normalizeAddress({
        line1: pmsData.address_line_1 || pmsData.street || '',
        line2: pmsData.address_line_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.province || '',
        postalCode: pmsData.postal_code || pmsData.zip_code || '',
        country: pmsData.country || pmsData.country_code || '',
      }),
      vipCode: pmsData.vip_level || pmsData.vip_code || '',
      loyaltyNumber: pmsData.loyalty_number || pmsData.membership_number || '',
      loyaltyLevel: pmsData.loyalty_tier || pmsData.membership_level || '',
      nationality: pmsData.nationality || pmsData.country_of_origin || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company_name || pmsData.organization || '',
      totalStays: pmsData.total_stays || pmsData.visit_count || 0,
      totalRevenue: normalizeAmount(pmsData.total_revenue || pmsData.lifetime_spend || 0),
      lastStayDate: normalizeDate(pmsData.last_stay_date || pmsData.last_checkout),
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
      description: rate.description || rate.long_description || '',
      category: rate.category || rate.rate_type || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.default_amount || rate.amount),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.effective_from || rate.start_date),
      endDate: normalizeDate(rate.effective_to || rate.end_date),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: rate.room_types || rate.applicable_room_types || [],
      inclusions: rate.inclusions || rate.add_ons || [],
      cancellationPolicy: rate.cancellation_policy || '',
      minNights: rate.minimum_stay || rate.min_nights || 0,
      maxNights: rate.maximum_stay || rate.max_nights || 0,
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
  _mapStatusToFDA(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'in_house',
      checked_out: 'departed',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToFDA(event) {
    const map = {
      'reservation.created': 'booking.created',
      'reservation.updated': 'booking.updated',
      'reservation.cancelled': 'booking.cancelled',
      'guest.checked_in': 'booking.checked_in',
      'guest.checked_out': 'booking.checked_out',
      'payment.received': 'payment.posted',
      'folio.updated': 'folio.changed',
    };
    return map[event] || event;
  }

  /** @private */
  _mapFDAEventToCanonical(fdaEvent) {
    const map = {
      'booking.created': 'reservation.created',
      'booking.updated': 'reservation.updated',
      'booking.cancelled': 'reservation.cancelled',
      'booking.checked_in': 'guest.checked_in',
      'booking.checked_out': 'guest.checked_out',
      'payment.posted': 'payment.received',
      'folio.changed': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
    };
    return map[fdaEvent] || fdaEvent;
  }
}

module.exports = FrontdeskAnywhereAdapter;
