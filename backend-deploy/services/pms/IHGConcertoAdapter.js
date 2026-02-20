/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * IHG Hotels & Resorts Concerto PMS Adapter
 *
 * Integrates with IHG's next-generation Concerto cloud PMS platform
 * via the IHG Developer Portal REST API.
 *
 * Authentication: OAuth 2.0 client_credentials flow via IHG Developer Portal.
 *   Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key capabilities:
 *   - Reservation management via Concerto REST API v2
 *   - Guest folio retrieval (itemized charges)
 *   - Guest profile management with IHG One Rewards integration
 *   - Rate plan lookups including One Rewards member pricing and points
 *   - Two-way sync: push chargeback alerts, dispute outcomes, flags, notes
 *   - Webhook registration for real-time event streaming
 *   - IHG One Rewards loyalty tier, points, and milestone data
 *   - Guest recognition data for personalized service
 *
 * Reference: https://developer.ihg.com/documentation
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

// Default base URL for IHG Concerto API
const DEFAULT_BASE_URL = 'https://api.ihg.com/concerto/v2';
const TOKEN_URL = 'https://auth.ihg.com/oauth2/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * IHG One Rewards loyalty tier mapping.
 * Maps internal tier codes to human-readable tier names.
 */
const ONE_REWARDS_TIER_MAP = {
  CLB: 'Club',
  SLV: 'Silver Elite',
  GLD: 'Gold Elite',
  PLT: 'Platinum Elite',
  DMD: 'Diamond Elite',
  KIM: 'Kimpton Inner Circle',
  RCA: 'Royal Ambassador',
  INT: 'InterContinental Ambassador',
};

/**
 * IHG brand portfolio mapping.
 */
const IHG_BRAND_CODES = {
  IC: 'InterContinental Hotels & Resorts',
  KI: 'Kimpton Hotels & Restaurants',
  RC: 'Regent Hotels & Resorts',
  SX: 'Six Senses Hotels Resorts Spas',
  VN: 'Vignette Collection',
  HI: 'Hotel Indigo',
  HJ: 'HUALUXE Hotels & Resorts',
  CP: 'Crowne Plaza Hotels & Resorts',
  VH: 'voco Hotels',
  EX: 'Holiday Inn Express',
  HO: 'Holiday Inn Hotels & Resorts',
  HR: 'Holiday Inn Resort',
  HV: 'Holiday Inn Club Vacations',
  GN: 'Garner',
  AV: 'avid Hotels',
  AM: 'Atwell Suites',
  SW: 'Staybridge Suites',
  CW: 'Candlewood Suites',
  EE: 'Even Hotels',
};

class IHGConcertoAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId         - IHG API client ID.
   * @param {string} config.credentials.clientSecret     - IHG API client secret.
   * @param {string} config.credentials.apiKey           - IHG Developer Portal API key.
   * @param {string} [config.credentials.accessToken]    - Cached OAuth access token.
   * @param {string} [config.credentials.refreshToken]   - OAuth refresh token.
   * @param {number} [config.credentials.expiresAt]      - Token expiry epoch ms.
   * @param {string} [config.credentials.hotelCode]      - IHG hotel (MNEMONIC) code.
   * @param {string} [config.credentials.brandCode]      - IHG brand code (IC, KI, CP, etc.).
   * @param {string} [config.credentials.tokenUrl]       - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]        - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'IHG_CONCERTO',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
    this.brandCode = this.credentials.brandCode || 'HO';
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the IHG Concerto API via the Developer Portal OAuth 2.0.
   * Uses client_credentials grant with IHG-specific API key header.
   * @returns {Promise<void>}
   */
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

  /**
   * Refresh an expired or soon-to-expire OAuth token.
   * Falls back to client_credentials grant if refresh fails.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    const startMs = Date.now();

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.credentials.refreshToken);
      params.append('client_id', this.credentials.clientId);
      params.append('client_secret', this.credentials.clientSecret);

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-ihg-api-key': this.credentials.apiKey,
        },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      logger.warn(`[PMS:${this.pmsType}] Refresh token failed, falling back to client_credentials`);
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
    params.append('scope', 'concerto.reservations concerto.guests concerto.folios concerto.rates concerto.webhooks');

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-ihg-api-key': this.credentials.apiKey,
        },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`IHG Concerto authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 90, refillRate: 90, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'x-ihg-api-key': this.credentials.apiKey,
      'x-ihg-hotel-code': this.hotelCode,
      'x-ihg-brand-code': this.brandCode,
    };
  }

  /** @private - Auto-refresh before every call if token is about to expire */
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

  /**
   * Fetch a single reservation by confirmation number from IHG Concerto.
   * @param {string} confirmationNumber - IHG confirmation number.
   * @returns {Promise<Object|null>} Normalized reservation or null if not found.
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/hotels/${this.hotelCode}/reservations`,
        {
          params: {
            confirmationNumber,
            limit: 1,
            expand: 'guest,payment,loyalty,recognition',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/hotels/${this.hotelCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by multiple criteria.
   * Supports IHG-specific filters including One Rewards member ID.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]
   * @param {string} [params.checkOutDate]
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @param {string} [params.oneRewardsNumber] - IHG One Rewards membership number.
   * @param {number} [params.limit]
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.paymentCardLastFour = params.cardLastFour;
    if (params.status) queryParams.reservationStatus = this._mapStatusToConcerto(params.status);
    if (params.oneRewardsNumber) queryParams.loyaltyMemberId = params.oneRewardsNumber;
    queryParams.limit = params.limit || 50;
    queryParams.expand = 'guest,payment,loyalty';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/hotels/${this.hotelCode}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/hotels/${this.hotelCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - Concerto reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/folios`,
        {
          params: {
            reservationId,
            hotelCode: this.hotelCode,
            includePayments: true,
            includeAdjustments: true,
            includePointsRedemptions: true,
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/folios', 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID from IHG Concerto.
   * Includes One Rewards loyalty data and guest recognition preferences.
   * @param {string} guestId - Concerto guest profile ID.
   * @returns {Promise<Object>} Normalized guest profile with One Rewards data.
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/guests/${guestId}`,
        {
          params: {
            expand: 'loyalty,preferences,stayHistory,recognition,amenities',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plan information for the hotel.
   * Includes IHG One Rewards member rates and points rates.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/hotels/${this.hotelCode}/rates`,
        { params: { ...params, includeOneRewardsRates: true, includePointsRates: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/hotels/${this.hotelCode}/rates`, 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile in IHG Concerto.
   * @param {string} guestId - Concerto guest profile ID.
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]
   * @param {string} [note.category]
   * @returns {Promise<Object>} Concerto-assigned note reference.
   */
  async pushNote(guestId, note) {
    await this._ensureToken();

    const concertoNote = {
      note: {
        type: 'INTERNAL',
        category: note.category || 'CHARGEBACK_DEFENSE',
        title: note.title,
        body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        priority: this._mapPriorityToConcerto(note.priority),
        source: 'ACCUDEFEND',
        hotelCode: this.hotelCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        concertoNote
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

  /**
   * Push a guest flag / alert to IHG Concerto.
   * High-severity flags trigger front desk alerts and guest recognition warnings.
   * @param {string} guestId - Concerto guest profile ID.
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} Concerto-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const concertoAlert = {
      alert: {
        type: 'CHARGEBACK_FLAG',
        severity: this._mapSeverityToConcerto(flagData.severity),
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        description: `CHARGEBACK ALERT: ${flagData.reason}` +
          (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
          (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        source: 'ACCUDEFEND',
        hotelCode: this.hotelCode,
        guestVisible: false,
        frontDeskNotification: flagData.severity === 'critical' || flagData.severity === 'high',
        guestRecognitionFlag: true,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        concertoAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/alerts`, 201, durationMs);

    // For critical severity, also update guest recognition record
    if (flagData.severity === 'critical' || flagData.severity === 'high') {
      await this._updateGuestRecognition(guestId, flagData);
    }

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      recognitionUpdated: flagData.severity === 'critical' || flagData.severity === 'high',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation in IHG Concerto.
   * @param {string} reservationId - Concerto reservation ID.
   * @param {Object} alertData
   * @param {string} alertData.caseNumber
   * @param {number} alertData.amount
   * @param {string} alertData.reasonCode
   * @param {string} alertData.disputeDate
   * @param {string} alertData.status
   * @returns {Promise<Object>}
   */
  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const concertoComment = {
      comment: {
        type: 'CHARGEBACK_ALERT',
        priority: 'URGENT',
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
        title: `Chargeback Alert - Case ${alertData.caseNumber}`,
        source: 'ACCUDEFEND',
        hotelCode: this.hotelCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/hotels/${this.hotelCode}/reservations/${reservationId}/comments`,
        concertoComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/.../reservations/${reservationId}/comments`, 201, durationMs);

    return {
      success: true,
      commentId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome notification to IHG Concerto.
   * @param {string} reservationId - Concerto reservation ID.
   * @param {Object} outcomeData
   * @param {string} outcomeData.caseNumber
   * @param {string} outcomeData.outcome  - WON | LOST
   * @param {number} outcomeData.amount
   * @param {string} outcomeData.resolvedDate
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const concertoComment = {
      comment: {
        type: won ? 'DISPUTE_RESOLVED' : 'CHARGEBACK_ALERT',
        priority: won ? 'NORMAL' : 'HIGH',
        body: [
          `=== DISPUTE ${outcomeData.outcome} ===`,
          `Case #: ${outcomeData.caseNumber}`,
          `Outcome: ${outcomeData.outcome}`,
          `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
          `Resolved: ${outcomeData.resolvedDate}`,
          '---',
          'Generated by AccuDefend Chargeback Defense System',
        ].join('\n'),
        title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
        source: 'ACCUDEFEND',
        hotelCode: this.hotelCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/hotels/${this.hotelCode}/reservations/${reservationId}/comments`,
        concertoComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/.../reservations/${reservationId}/comments`, 201, durationMs);

    return {
      success: true,
      commentId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with IHG Concerto.
   * @param {Object} config - Webhook configuration.
   * @param {string} config.callbackUrl - Our endpoint URL.
   * @param {string[]} config.events    - Event types to subscribe to.
   * @returns {Promise<Object>} Webhook registration details.
   */
  async registerWebhook(config) {
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      subscription: {
        callbackUrl: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToConcerto(e)),
        secret,
        active: true,
        hotelCode: this.hotelCode,
        brandCode: this.brandCode,
        contentType: 'application/json',
        apiVersion: 'v2',
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/hotels/${this.hotelCode}/webhooks`,
        webhookPayload
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/hotels/${this.hotelCode}/webhooks`, 201, durationMs);

    return {
      webhookId: result?.subscriptionId || result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming IHG Concerto webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapConcertoEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.eventTime || new Date().toISOString(),
      hotelCode: payload.hotelCode || this.hotelCode,
      brandCode: payload.brandCode || this.brandCode,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestProfileId || data.guestId,
        oneRewardsNumber: data.loyaltyMemberId || data.oneRewardsNumber,
        recognitionLevel: data.guestRecognitionLevel || null,
        ...data,
      },
      raw: payload,
    };
  }

  /**
   * Verify the HMAC signature on an incoming IHG Concerto webhook.
   * @param {string|Buffer} rawPayload
   * @param {string} signature - Value of x-ihg-webhook-signature header.
   * @param {string} secret
   * @returns {boolean}
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    const body = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      return false;
    }
  }

  // =========================================================================
  //  Normalization
  // =========================================================================

  /**
   * Normalize a raw IHG Concerto reservation into the canonical shape.
   * Includes One Rewards loyalty data and guest recognition information.
   * @param {Object} pmsData - Raw Concerto reservation object.
   * @returns {Object} Normalized reservation.
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const roomStay = pmsData.roomStay || pmsData.stayDetails || {};
    const guest = pmsData.guest || pmsData.primaryGuest || pmsData.guestInfo || {};
    const payment = pmsData.payment || pmsData.paymentInfo || pmsData.paymentMethods?.[0] || {};
    const loyalty = pmsData.loyaltyInfo || pmsData.oneRewardsInfo || guest.loyalty || {};
    const recognition = pmsData.guestRecognition || pmsData.recognition || {};
    const ratePlan = roomStay.ratePlan || roomStay.ratePlans?.[0] || {};
    const roomType = roomStay.roomType || roomStay.roomTypes?.[0] || {};

    const confirmationNumber =
      pmsData.confirmationNumber ||
      pmsData.ihgConfirmation ||
      pmsData.reservationId ||
      '';

    const guestNameObj = guest.givenName || guest.name
      ? {
          firstName: guest.givenName || guest.name?.firstName || guest.name?.givenName || '',
          lastName: guest.surname || guest.name?.lastName || guest.name?.surname || '',
        }
      : normalizeGuestName(guest.fullName || guest);

    return {
      confirmationNumber: String(confirmationNumber),
      pmsReservationId: pmsData.reservationId || pmsData.concertoId || confirmationNumber,
      status: normalizeReservationStatus(
        pmsData.reservationStatus || pmsData.status || roomStay.status
      ),
      guestProfileId: String(guest.profileId || guest.guestId || ''),
      guestName: guestNameObj,
      email: guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone || guest.phoneNumber),
      address: normalizeAddress(guest.address || guest.addressInfo),
      checkInDate: normalizeDate(
        roomStay.arrivalDate || roomStay.checkInDate || pmsData.arrivalDate
      ),
      checkOutDate: normalizeDate(
        roomStay.departureDate || roomStay.checkOutDate || pmsData.departureDate
      ),
      roomNumber: roomStay.roomNumber || roomStay.assignedRoom || '',
      roomType: roomType.code || roomType.roomTypeCode || roomType.description || '',
      rateCode: ratePlan.rateCode || ratePlan.ratePlanCode || '',
      ratePlanDescription: ratePlan.description || ratePlan.ratePlanName || '',
      totalAmount: normalizeAmount(
        roomStay.totalAmount || roomStay.total?.amount || pmsData.totalCharges
      ),
      currency: normalizeCurrency(
        roomStay.currencyCode || roomStay.total?.currencyCode || pmsData.currencyCode
      ),
      numberOfGuests: pmsData.numberOfGuests || roomStay.guestCount || 1,
      numberOfNights: this._calculateNights(
        roomStay.arrivalDate || pmsData.arrivalDate,
        roomStay.departureDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.cardBrand),
        cardLastFour: payment.cardLastFour || payment.cardNumber?.slice(-4) || '',
        authCode: payment.authorizationCode || payment.approvalCode || '',
      },
      bookingSource: pmsData.sourceCode || pmsData.bookingChannel || pmsData.origin || '',
      createdAt: normalizeDate(pmsData.createDateTime || pmsData.createdAt),
      updatedAt: normalizeDate(pmsData.lastModifyDateTime || pmsData.updatedAt),
      specialRequests: pmsData.specialRequests || pmsData.guestComments || '',
      // IHG-specific fields
      loyaltyNumber: loyalty.oneRewardsNumber || loyalty.membershipId || pmsData.oneRewardsNumber || '',
      loyaltyTier: ONE_REWARDS_TIER_MAP[loyalty.tierCode] || loyalty.tierName || loyalty.memberLevel || '',
      brandCode: pmsData.brandCode || this.brandCode,
      brandName: IHG_BRAND_CODES[pmsData.brandCode || this.brandCode] || '',
      hotelCode: pmsData.hotelCode || this.hotelCode,
      guestRecognitionLevel: recognition.level || recognition.recognitionLevel || '',
      guestRecognitionPreferences: recognition.preferences || [],
      guestRecognitionAmenities: recognition.welcomeAmenities || [],
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw IHG Concerto folio items into canonical shape.
   * @param {Object} pmsData - Raw Concerto folio response.
   * @returns {Object[]} Array of normalized folio items.
   */
  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioWindows || pmsData?.data?.folios || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.postings || folio.lineItems || folio.charges || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || folio.folioWindow || 1,
          transactionId: posting.transactionId || posting.id || '',
          transactionCode: posting.transactionCode || posting.chargeCode || '',
          category: normalizeFolioCategory(
            posting.category || posting.chargeCategory || posting.transactionCode
          ),
          description: posting.description || posting.chargeDescription || posting.remark || '',
          amount: normalizeAmount(posting.amount || posting.netAmount),
          currency: normalizeCurrency(posting.currencyCode),
          postDate: normalizeDate(posting.postingDate || posting.transactionDate),
          cardLastFour: posting.cardLastFour || posting.creditCardNumber?.slice(-4) || '',
          authCode: posting.approvalCode || posting.authorizationCode || '',
          reference: posting.reference || posting.receiptNumber || '',
          reversalFlag: posting.reversal === true || posting.isReversal === true,
          quantity: posting.quantity || 1,
          pointsRedemption: posting.pointsUsed || posting.rewardsPointsRedeemed || 0,
          outlet: posting.outlet || posting.revenueCenter || '',
        });
      }
    }

    return allItems;
  }

  /**
   * Normalize a raw IHG Concerto guest profile into canonical shape.
   * Includes One Rewards data, guest recognition, and welcome amenity preferences.
   * @param {Object} pmsData - Raw Concerto guest profile response.
   * @returns {Object} Normalized guest profile.
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guestProfile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.guestName || {};
    const addresses = profile.addresses || [];
    const emails = profile.emails || [];
    const phones = profile.phones || [];
    const loyalty = profile.loyaltyInfo || profile.oneRewardsInfo || {};
    const recognition = profile.guestRecognition || profile.recognition || {};
    const primaryAddress = Array.isArray(addresses) ? addresses[0] : addresses;
    const primaryEmail = Array.isArray(emails) ? emails.find(e => e.primary) || emails[0] : emails;
    const primaryPhone = Array.isArray(phones) ? phones.find(p => p.primary) || phones[0] : phones;

    return {
      guestId: profile.profileId || profile.guestId || profile.id || '',
      name: normalizeGuestName({
        firstName: name.givenName || name.firstName || '',
        lastName: name.surname || name.lastName || '',
      }),
      email: primaryEmail?.value || primaryEmail?.email || (typeof primaryEmail === 'string' ? primaryEmail : ''),
      phone: normalizePhone(primaryPhone?.value || primaryPhone?.phoneNumber || primaryPhone),
      address: normalizeAddress(primaryAddress),
      vipCode: profile.vipCode || profile.vipStatus || '',
      // One Rewards loyalty data
      loyaltyNumber: loyalty.oneRewardsNumber || loyalty.membershipId || profile.oneRewardsNumber || '',
      loyaltyLevel: ONE_REWARDS_TIER_MAP[loyalty.tierCode] || loyalty.tierName || '',
      loyaltyPoints: loyalty.pointsBalance || loyalty.availablePoints || 0,
      loyaltyLifetimeNights: loyalty.lifetimeNights || 0,
      loyaltyYearNights: loyalty.qualifyingNightsThisYear || loyalty.currentYearNights || 0,
      loyaltyMilestoneRewards: loyalty.milestoneRewards || [],
      // Guest recognition data
      guestRecognitionLevel: recognition.level || recognition.recognitionLevel || '',
      guestRecognitionPreferences: recognition.preferences || [],
      welcomeAmenities: recognition.welcomeAmenities || [],
      stayPreferences: recognition.stayPreferences || {},
      nationality: profile.nationality || profile.countryOfResidence || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.birthDate || profile.dateOfBirth),
      companyName: profile.company?.name || profile.companyName || '',
      totalStays: profile.stayHistory?.totalStays || profile.totalVisits || 0,
      totalRevenue: normalizeAmount(profile.stayHistory?.totalRevenue || profile.lifetimeRevenue),
      lastStayDate: normalizeDate(profile.stayHistory?.lastStayDate || profile.lastVisitDate),
      communicationPreferences: profile.communicationPreferences || {},
      createdAt: normalizeDate(profile.createDateTime || profile.createdAt),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw IHG Concerto rate data into canonical shape.
   * @param {Object} pmsData - Raw Concerto rate response.
   * @returns {Object[]} Array of normalized rate objects.
   */
  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlans || pmsData?.rates || pmsData?.data?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rateCode || rate.ratePlanCode || rate.code || '',
      name: rate.rateName || rate.shortDescription || rate.description || '',
      description: rate.longDescription || rate.description || '',
      category: rate.rateCategory || rate.category || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount || rate.averageRate),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.effectiveDate),
      endDate: normalizeDate(rate.endDate || rate.expiryDate),
      isActive: rate.active !== false && rate.status !== 'INACTIVE',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancelPolicy || rate.cancellationPolicy || '',
      isOneRewardsRate: rate.oneRewardsExclusive === true || rate.loyaltyRate === true,
      oneRewardsPointsRequired: rate.pointsRequired || rate.rewardsPoints || 0,
      oneRewardsTierRequired: ONE_REWARDS_TIER_MAP[rate.requiredTier] || rate.minimumTier || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the IHG Concerto API is reachable and credentials are valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get(
        `/api/v2/hotels/${this.hotelCode}/reservations`,
        { params: { limit: 1 } }
      );

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
          brandCode: this.brandCode,
          brandName: IHG_BRAND_CODES[this.brandCode] || 'Unknown',
          apiVersion: response.headers?.['x-concerto-api-version'] || 'v2',
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
          hotelCode: this.hotelCode,
          brandCode: this.brandCode,
          error: error.message,
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    }
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  /** Calculate number of nights between two dates. */
  _calculateNights(arrival, departure) {
    const a = normalizeDate(arrival);
    const d = normalizeDate(departure);
    if (!a || !d) return 0;
    const diff = new Date(d) - new Date(a);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  /** Update guest recognition record with chargeback flag for front desk awareness. */
  async _updateGuestRecognition(guestId, flagData) {
    try {
      await this.httpClient.patch(
        `/api/v2/guests/${guestId}/recognition`,
        {
          alerts: [{
            type: 'CHARGEBACK_WARNING',
            severity: flagData.severity?.toUpperCase() || 'HIGH',
            message: `Chargeback alert: ${flagData.reason} | Amount: $${flagData.amount || 'N/A'}`,
            source: 'ACCUDEFEND',
            createdAt: new Date().toISOString(),
          }],
        }
      );
      logger.info(`[PMS:${this.pmsType}] Guest recognition updated for guest ${guestId}`);
    } catch (error) {
      // Guest recognition updates are best-effort; log but don't fail the main operation
      logger.warn(`[PMS:${this.pmsType}] Failed to update guest recognition: ${error.message}`);
    }
  }

  /** Map canonical priority to Concerto priority levels. */
  _mapPriorityToConcerto(priority) {
    const map = { low: 'LOW', medium: 'NORMAL', high: 'HIGH', critical: 'URGENT' };
    return map[priority] || 'NORMAL';
  }

  /** Map canonical severity to Concerto severity levels. */
  _mapSeverityToConcerto(severity) {
    const map = { low: 'INFO', medium: 'WARNING', high: 'HIGH', critical: 'CRITICAL' };
    return map[severity] || 'WARNING';
  }

  /** Map canonical status to Concerto reservation status codes. */
  _mapStatusToConcerto(status) {
    const map = {
      confirmed: 'CONFIRMED',
      checked_in: 'INHOUSE',
      checked_out: 'CHECKED_OUT',
      cancelled: 'CANCELLED',
      no_show: 'NO_SHOW',
      pending: 'PENDING',
    };
    return map[status] || status;
  }

  /** Map canonical event names to Concerto webhook event types. */
  _mapEventToConcerto(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_MODIFIED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECKIN',
      'guest.checked_out': 'GUEST_CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
      'loyalty.updated': 'ONE_REWARDS_STATUS_CHANGE',
      'recognition.updated': 'GUEST_RECOGNITION_UPDATED',
    };
    return map[event] || event;
  }

  /** Map Concerto event types back to canonical. */
  _mapConcertoEventToCanonical(concertoEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_MODIFIED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECKIN: 'guest.checked_in',
      GUEST_CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
      ONE_REWARDS_STATUS_CHANGE: 'loyalty.updated',
      GUEST_RECOGNITION_UPDATED: 'recognition.updated',
    };
    return map[concertoEvent] || concertoEvent;
  }
}

module.exports = IHGConcertoAdapter;
