/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * StayNTouch PMS Adapter
 *
 * Integrates with the StayNTouch PMS REST API. StayNTouch is a mobile-first,
 * cloud-based PMS known for digital check-in/out, contactless guest
 * experiences, and digital signature support.
 *
 * Authentication: OAuth 2.0 (client_credentials flow).
 *   - Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key API modules used:
 *   Reservations  - Booking lifecycle
 *   Guests        - Guest profile management
 *   Folios        - Folio/charge management
 *   Rates         - Rate plan queries
 *   Webhooks      - Event subscriptions
 *
 * Reference: https://developer.stayntouch.com/
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

const DEFAULT_BASE_URL = 'https://api.stayntouch.com/pms/v2';
const TOKEN_URL = 'https://auth.stayntouch.com/oauth/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

class StayntouchAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId       - OAuth client ID.
   * @param {string} config.credentials.clientSecret   - OAuth client secret.
   * @param {string} [config.credentials.accessToken]  - Pre-existing token.
   * @param {string} [config.credentials.refreshToken] - Pre-existing refresh token.
   * @param {number} [config.credentials.expiresAt]    - Epoch ms.
   * @param {string} [config.credentials.hotelId]      - StayNTouch hotel identifier.
   * @param {string} [config.credentials.tokenUrl]     - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'STAYNTOUCH',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelId = this.credentials.hotelId || this.propertyId;
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
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

    await this._clientCredentialsGrant();
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
      logger.warn(`[PMS:${this.pmsType}] Refresh failed, falling back to client_credentials`);
      await this._clientCredentialsGrant();
    }
  }

  /** @private */
  async _clientCredentialsGrant() {
    const startMs = Date.now();

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.credentials.clientId);
    params.append('client_secret', this.credentials.clientSecret);

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`StayNTouch authentication failed: ${error.message}`);
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
    const headers = this._getAuthHeaders();
    this._buildHttpClient(headers, {
      rateLimit: { maxTokens: 100, refillRate: 100, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'X-Hotel-Id': this.hotelId,
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

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: { confirmation_number: confirmationNumber, hotel_id: this.hotelId, limit: 1 },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.results || [];
    if (reservations.length === 0) return null;

    return this.normalizeReservation(reservations[0]);
  }

  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = { hotel_id: this.hotelId };
    if (params.confirmationNumber) queryParams.confirmation_number = params.confirmationNumber;
    if (params.guestName) queryParams.guest_name = params.guestName;
    if (params.checkInDate) queryParams.arrival_date = params.checkInDate;
    if (params.checkOutDate) queryParams.departure_date = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToStayntouch(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.results || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/reservations/${reservationId}/folios`,
        { params: { hotel_id: this.hotelId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/reservations/${reservationId}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(`/api/v2/guests/${guestId}`, {
        params: { hotel_id: this.hotelId },
      });
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/rates', {
        params: { ...params, hotel_id: this.hotelId },
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
    await this._ensureToken();

    const sntNote = {
      guest_id: guestId,
      hotel_id: this.hotelId,
      note_type: note.category || 'general',
      title: note.title,
      body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: note.priority || 'medium',
      is_internal: true,
      created_by: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        sntNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note_id || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const sntAlert = {
      guest_id: guestId,
      hotel_id: this.hotelId,
      alert_type: 'chargeback_risk',
      severity: (flagData.severity || 'high').toLowerCase(),
      title: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      is_active: true,
      source: 'accudefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        sntAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alert_id || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const sntComment = {
      reservation_id: reservationId,
      hotel_id: this.hotelId,
      note_type: 'alert',
      title: `Chargeback Alert - Case ${alertData.caseNumber}`,
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
      priority: 'high',
      is_internal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/reservations/${reservationId}/notes`,
        sntComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.note_id || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const sntComment = {
      reservation_id: reservationId,
      hotel_id: this.hotelId,
      note_type: won ? 'info' : 'alert',
      title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      body: [
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
        `/api/v2/reservations/${reservationId}/notes`,
        sntComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

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
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callback_url: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToStayntouch(e)),
      signing_secret: secret,
      active: true,
      hotel_id: this.hotelId,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v2/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v2/webhooks', 201, durationMs);

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
      eventType: this._mapStayntouchEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.occurred_at || new Date().toISOString(),
      hotelId: payload.hotel_id || this.hotelId,
      data: {
        reservationId: data.reservation_id || data.confirmation_number,
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
    const payment = pmsData.payment || pmsData.payment_method || {};

    return {
      confirmationNumber: String(pmsData.confirmation_number || pmsData.confirm_no || ''),
      pmsReservationId: pmsData.reservation_id || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.reservation_status),
      guestProfileId: String(guest.guest_id || guest.id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.surname || '',
      }),
      email: guest.email || '',
      phone: normalizePhone(guest.phone || guest.mobile),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.arrival_date || pmsData.check_in_date),
      checkOutDate: normalizeDate(pmsData.departure_date || pmsData.check_out_date),
      roomNumber: room.room_number || room.number || '',
      roomType: room.room_type || room.room_type_code || '',
      rateCode: rate.rate_code || rate.rate_plan_code || '',
      ratePlanDescription: rate.rate_plan_name || rate.description || '',
      totalAmount: normalizeAmount(pmsData.total_amount || pmsData.total_charges),
      currency: normalizeCurrency(pmsData.currency_code || pmsData.currency),
      numberOfGuests: pmsData.number_of_guests || pmsData.guest_count || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrival_date || pmsData.check_in_date,
        pmsData.departure_date || pmsData.check_out_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.card_type || payment.brand),
        cardLastFour: payment.card_last_four || payment.last_4 || '',
        authCode: payment.auth_code || payment.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.booking_source || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.create_date),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modify_date),
      specialRequests: pmsData.special_requests || pmsData.guest_comments || '',
      loyaltyNumber: pmsData.loyalty_number || pmsData.membership_id || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folio_list || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const charges = folio.charges || folio.line_items || folio.transactions || [];

      for (const charge of charges) {
        allItems.push({
          folioId: folio.folio_id || folio.id || '',
          folioWindowNumber: folio.window_number || 1,
          transactionId: charge.transaction_id || charge.id || '',
          transactionCode: charge.transaction_code || charge.charge_code || '',
          category: normalizeFolioCategory(
            charge.category || charge.revenue_group || charge.transaction_code
          ),
          description: charge.description || charge.item_description || '',
          amount: normalizeAmount(charge.amount || charge.net_amount),
          currency: normalizeCurrency(charge.currency_code),
          postDate: normalizeDate(charge.post_date || charge.transaction_date),
          cardLastFour: charge.card_last_four || '',
          authCode: charge.auth_code || '',
          reference: charge.reference || '',
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
      email: profile.email || '',
      phone: normalizePhone(profile.phone || profile.mobile),
      address: normalizeAddress(profile.address),
      vipCode: profile.vip_code || profile.vip_status || '',
      loyaltyNumber: profile.loyalty_number || profile.membership_id || '',
      loyaltyLevel: profile.loyalty_level || profile.membership_tier || '',
      nationality: profile.nationality || '',
      language: profile.preferred_language || profile.language || '',
      dateOfBirth: normalizeDate(profile.date_of_birth || profile.birth_date),
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
      description: rate.description || '',
      category: rate.category || rate.rate_category || '',
      baseAmount: normalizeAmount(rate.base_amount || rate.amount),
      currency: normalizeCurrency(rate.currency_code),
      startDate: normalizeDate(rate.start_date || rate.valid_from),
      endDate: normalizeDate(rate.end_date || rate.valid_to),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: rate.room_types || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancellation_policy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get('/api/v2/hotels/current', {
        params: { hotel_id: this.hotelId },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelId: this.hotelId,
          apiVersion: response.headers?.['x-api-version'] || 'v2',
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
          hotelId: this.hotelId,
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

  _mapStatusToStayntouch(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checked_in',
      checked_out: 'checked_out',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'pending',
    };
    return map[status] || status;
  }

  _mapEventToStayntouch(event) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'guest.checked_in',
      'guest.checked_out': 'guest.checked_out',
      'payment.received': 'payment.posted',
      'folio.updated': 'folio.updated',
    };
    return map[event] || event;
  }

  _mapStayntouchEventToCanonical(sntEvent) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'guest.checked_in',
      'guest.checked_out': 'guest.checked_out',
      'payment.posted': 'payment.received',
      'folio.updated': 'folio.updated',
    };
    return map[sntEvent] || sntEvent;
  }
}

module.exports = StayntouchAdapter;
