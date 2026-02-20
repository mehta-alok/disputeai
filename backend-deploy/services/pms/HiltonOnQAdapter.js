/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Hilton OnQ PMS Adapter
 *
 * Integrates with Hilton's proprietary OnQ Property Management System
 * via the Hilton API Gateway.
 *
 * Authentication: OAuth 2.0 client_credentials flow through the
 *   Hilton Developer Portal API Gateway. Tokens auto-refresh when
 *   within 5 minutes of expiry.
 *
 * Key capabilities:
 *   - Reservation management via OnQ REST API v2
 *   - Guest folio retrieval with itemized charges
 *   - Guest profile management with Hilton Honors integration
 *   - Rate plan lookups including Honors member pricing
 *   - Two-way sync: push chargeback alerts, dispute outcomes, flags, notes
 *   - Webhook registration for real-time OnQ event streaming
 *   - Digital Key status tracking
 *   - Connected Room integration data
 *   - Hilton Honors loyalty tier and points data
 *
 * Reference: https://developer.hilton.com/documentation
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

// Default base URL for Hilton OnQ API Gateway
const DEFAULT_BASE_URL = 'https://api.hilton.com/onq/v2';
const TOKEN_URL = 'https://auth.hilton.com/oauth2/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hilton Honors loyalty tier mapping.
 * Maps internal tier codes to human-readable tier names.
 */
const HONORS_TIER_MAP = {
  MBR: 'Member',
  SLV: 'Silver',
  GLD: 'Gold',
  DMD: 'Diamond',
  LTD: 'Lifetime Diamond',
};

/**
 * Hilton brand portfolio mapping.
 */
const HILTON_BRAND_CODES = {
  HI: 'Hilton Hotels & Resorts',
  WA: 'Waldorf Astoria',
  LX: 'LXR Hotels & Resorts',
  CH: 'Conrad Hotels & Resorts',
  QQ: 'Canopy by Hilton',
  RU: 'Signia by Hilton',
  UA: 'Graduate Hotels',
  DT: 'DoubleTree by Hilton',
  ES: 'Embassy Suites by Hilton',
  GI: 'Hilton Garden Inn',
  HP: 'Hampton by Hilton',
  TU: 'Tru by Hilton',
  HX: 'Homewood Suites by Hilton',
  HW: 'Home2 Suites by Hilton',
  SA: 'Spark by Hilton',
  OL: 'Tapestry Collection by Hilton',
  UP: 'Tempo by Hilton',
  PO: 'Motto by Hilton',
  CU: 'Curio Collection by Hilton',
};

class HiltonOnQAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId         - Hilton API client ID.
   * @param {string} config.credentials.clientSecret     - Hilton API client secret.
   * @param {string} config.credentials.apiKey           - Hilton API Gateway key.
   * @param {string} [config.credentials.accessToken]    - Cached OAuth access token.
   * @param {string} [config.credentials.refreshToken]   - OAuth refresh token.
   * @param {number} [config.credentials.expiresAt]      - Token expiry epoch ms.
   * @param {string} [config.credentials.propertyCode]   - Hilton property (CTYHOCN) code.
   * @param {string} [config.credentials.brandCode]      - Hilton brand code (HI, WA, CH, etc.).
   * @param {string} [config.credentials.tokenUrl]       - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]        - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'HILTON_ONQ',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
    this.brandCode = this.credentials.brandCode || 'HI';
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the Hilton OnQ API Gateway using OAuth 2.0.
   * Uses client_credentials grant with Hilton-specific API key header.
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
          'x-hilton-api-key': this.credentials.apiKey,
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
    params.append('scope', 'onq.reservations onq.guests onq.folios onq.rates onq.webhooks');

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-hilton-api-key': this.credentials.apiKey,
        },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`Hilton OnQ authentication failed: ${error.message}`);
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
      'x-hilton-api-key': this.credentials.apiKey,
      'x-hilton-property-code': this.propertyCode,
      'x-hilton-brand-code': this.brandCode,
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
   * Fetch a single reservation by confirmation number from Hilton OnQ.
   * @param {string} confirmationNumber - Hilton confirmation number.
   * @returns {Promise<Object|null>} Normalized reservation or null if not found.
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/properties/${this.propertyCode}/reservations`,
        {
          params: {
            confirmationNumber,
            limit: 1,
            expand: 'guest,payment,loyalty,digitalKey,connectedRoom',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by multiple criteria.
   * Supports Hilton-specific filters including Honors member ID.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]
   * @param {string} [params.checkOutDate]
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @param {string} [params.honorsNumber] - Hilton Honors membership number.
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
    if (params.status) queryParams.reservationStatus = this._mapStatusToOnQ(params.status);
    if (params.honorsNumber) queryParams.honorsMemberId = params.honorsNumber;
    queryParams.limit = params.limit || 50;
    queryParams.expand = 'guest,payment,loyalty';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/properties/${this.propertyCode}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - OnQ reservation ID.
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
            propertyCode: this.propertyCode,
            includePayments: true,
            includeAdjustments: true,
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/folios', 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID from Hilton OnQ.
   * Includes Hilton Honors data, digital key status, and Connected Room info.
   * @param {string} guestId - OnQ guest profile ID.
   * @returns {Promise<Object>} Normalized guest profile with Honors data.
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/guests/${guestId}`,
        {
          params: {
            expand: 'honors,preferences,stayHistory,digitalKey,connectedRoom',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plan information for the property.
   * Includes Hilton Honors member-exclusive and points rates.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/properties/${this.propertyCode}/rates`,
        { params: { ...params, includeHonorsRates: true, includePointsRates: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/properties/${this.propertyCode}/rates`, 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile in Hilton OnQ.
   * @param {string} guestId - OnQ guest profile ID.
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]
   * @param {string} [note.category]
   * @returns {Promise<Object>} OnQ-assigned note reference.
   */
  async pushNote(guestId, note) {
    await this._ensureToken();

    const onqNote = {
      note: {
        type: 'INTERNAL_COMMENT',
        category: note.category || 'CHARGEBACK_DEFENSE',
        title: note.title,
        body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        priority: this._mapPriorityToOnQ(note.priority),
        source: 'ACCUDEFEND',
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        onqNote
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
   * Push a guest flag / alert to Hilton OnQ.
   * @param {string} guestId - OnQ guest profile ID.
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} OnQ-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const onqAlert = {
      alert: {
        type: 'CHARGEBACK_FLAG',
        severity: this._mapSeverityToOnQ(flagData.severity),
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        description: `CHARGEBACK ALERT: ${flagData.reason}` +
          (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
          (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        source: 'ACCUDEFEND',
        propertyCode: this.propertyCode,
        guestVisible: false,
        frontDeskAlert: flagData.severity === 'critical' || flagData.severity === 'high',
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        onqAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      frontDeskAlerted: flagData.severity === 'critical' || flagData.severity === 'high',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation in Hilton OnQ.
   * @param {string} reservationId - OnQ reservation ID.
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

    const onqComment = {
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
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        onqComment
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
   * Push a dispute outcome notification to Hilton OnQ.
   * @param {string} reservationId - OnQ reservation ID.
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
    const onqComment = {
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
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        onqComment
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
   * Register a webhook callback URL with Hilton OnQ.
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
        events: (config.events || []).map(e => this._mapEventToOnQ(e)),
        secret,
        active: true,
        propertyCode: this.propertyCode,
        brandCode: this.brandCode,
        contentType: 'application/json',
        apiVersion: 'v2',
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/properties/${this.propertyCode}/webhooks`,
        webhookPayload
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/properties/${this.propertyCode}/webhooks`, 201, durationMs);

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
   * Parse an incoming Hilton OnQ webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapOnQEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.eventTime || new Date().toISOString(),
      propertyCode: payload.propertyCode || this.propertyCode,
      brandCode: payload.brandCode || this.brandCode,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestProfileId || data.guestId,
        honorsNumber: data.honorsMemberId || data.honorsNumber,
        digitalKeyStatus: data.digitalKeyStatus || null,
        connectedRoomId: data.connectedRoomId || null,
        ...data,
      },
      raw: payload,
    };
  }

  /**
   * Verify the HMAC signature on an incoming Hilton OnQ webhook.
   * @param {string|Buffer} rawPayload
   * @param {string} signature - Value of x-hilton-webhook-signature header.
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
   * Normalize a raw Hilton OnQ reservation into the canonical shape.
   * Includes Honors loyalty data, digital key status, and Connected Room data.
   * @param {Object} pmsData - Raw OnQ reservation object.
   * @returns {Object} Normalized reservation.
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const roomStay = pmsData.roomStay || pmsData.stayDetails || {};
    const guest = pmsData.guest || pmsData.primaryGuest || pmsData.guestInfo || {};
    const payment = pmsData.payment || pmsData.paymentInfo || pmsData.paymentMethods?.[0] || {};
    const honors = pmsData.honorsInfo || pmsData.loyalty || guest.honorsInfo || {};
    const ratePlan = roomStay.ratePlan || roomStay.ratePlans?.[0] || {};
    const roomType = roomStay.roomType || roomStay.roomTypes?.[0] || {};
    const digitalKey = pmsData.digitalKey || pmsData.digitalKeyInfo || {};
    const connectedRoom = pmsData.connectedRoom || pmsData.connectedRoomInfo || {};

    const confirmationNumber =
      pmsData.confirmationNumber ||
      pmsData.hiltonConfirmation ||
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
      pmsReservationId: pmsData.reservationId || pmsData.onqReservationId || confirmationNumber,
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
      bookingSource: pmsData.sourceCode || pmsData.bookingChannel || '',
      createdAt: normalizeDate(pmsData.createDateTime || pmsData.createdAt),
      updatedAt: normalizeDate(pmsData.lastModifyDateTime || pmsData.updatedAt),
      specialRequests: pmsData.specialRequests || pmsData.guestComments || '',
      // Hilton-specific fields
      loyaltyNumber: honors.honorsNumber || honors.membershipId || pmsData.honorsNumber || '',
      loyaltyTier: HONORS_TIER_MAP[honors.tierCode] || honors.tierName || honors.memberLevel || '',
      brandCode: pmsData.brandCode || this.brandCode,
      brandName: HILTON_BRAND_CODES[pmsData.brandCode || this.brandCode] || '',
      digitalKeyEnabled: digitalKey.enabled === true || digitalKey.status === 'ACTIVE',
      digitalKeyStatus: digitalKey.status || 'UNAVAILABLE',
      connectedRoomId: connectedRoom.roomId || connectedRoom.id || null,
      connectedRoomEnabled: connectedRoom.enabled === true,
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw Hilton OnQ folio items into canonical shape.
   * @param {Object} pmsData - Raw OnQ folio response.
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
          outlet: posting.outlet || posting.revenueCenter || '',
        });
      }
    }

    return allItems;
  }

  /**
   * Normalize a raw Hilton OnQ guest profile into canonical shape.
   * Includes Honors loyalty data, digital key info, and stay history.
   * @param {Object} pmsData - Raw OnQ guest profile response.
   * @returns {Object} Normalized guest profile.
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guestProfile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.guestName || {};
    const addresses = profile.addresses || [];
    const emails = profile.emails || [];
    const phones = profile.phones || [];
    const honors = profile.honorsInfo || profile.loyalty || {};
    const digitalKey = profile.digitalKey || profile.digitalKeyInfo || {};
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
      // Honors loyalty data
      loyaltyNumber: honors.honorsNumber || honors.membershipId || profile.honorsNumber || '',
      loyaltyLevel: HONORS_TIER_MAP[honors.tierCode] || honors.tierName || '',
      loyaltyPoints: honors.pointsBalance || honors.availablePoints || 0,
      loyaltyLifetimeNights: honors.lifetimeNights || 0,
      loyaltyYearNights: honors.currentYearNights || 0,
      // Digital key
      digitalKeyEnabled: digitalKey.enabled === true,
      digitalKeyDevices: digitalKey.registeredDevices || [],
      nationality: profile.nationality || profile.countryOfResidence || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.birthDate || profile.dateOfBirth),
      companyName: profile.company?.name || profile.companyName || '',
      totalStays: profile.stayHistory?.totalStays || profile.totalVisits || 0,
      totalRevenue: normalizeAmount(profile.stayHistory?.totalRevenue || profile.lifetimeRevenue),
      lastStayDate: normalizeDate(profile.stayHistory?.lastStayDate || profile.lastVisitDate),
      roomPreferences: profile.roomPreferences || [],
      communicationPreferences: profile.communicationPreferences || {},
      createdAt: normalizeDate(profile.createDateTime || profile.createdAt),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw Hilton OnQ rate data into canonical shape.
   * @param {Object} pmsData - Raw OnQ rate response.
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
      isHonorsRate: rate.honorsExclusive === true || rate.loyaltyRate === true,
      honorsPointsRequired: rate.pointsRequired || rate.honorsPoints || 0,
      honorsTierRequired: HONORS_TIER_MAP[rate.requiredTier] || rate.minimumTier || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Hilton OnQ API is reachable and credentials are valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get(
        `/api/v2/properties/${this.propertyCode}/reservations`,
        { params: { limit: 1 } }
      );

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.propertyCode,
          brandCode: this.brandCode,
          brandName: HILTON_BRAND_CODES[this.brandCode] || 'Unknown',
          apiVersion: response.headers?.['x-onq-api-version'] || 'v2',
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
          propertyCode: this.propertyCode,
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

  /** Map canonical priority to OnQ priority levels. */
  _mapPriorityToOnQ(priority) {
    const map = { low: 'LOW', medium: 'NORMAL', high: 'HIGH', critical: 'CRITICAL' };
    return map[priority] || 'NORMAL';
  }

  /** Map canonical severity to OnQ severity levels. */
  _mapSeverityToOnQ(severity) {
    const map = { low: 'INFO', medium: 'WARNING', high: 'HIGH', critical: 'CRITICAL' };
    return map[severity] || 'WARNING';
  }

  /** Map canonical status to OnQ reservation status codes. */
  _mapStatusToOnQ(status) {
    const map = {
      confirmed: 'CONFIRMED',
      checked_in: 'INHOUSE',
      checked_out: 'DEPARTED',
      cancelled: 'CANCELLED',
      no_show: 'NO_SHOW',
      pending: 'PENDING',
    };
    return map[status] || status;
  }

  /** Map canonical event names to OnQ webhook event types. */
  _mapEventToOnQ(event) {
    const map = {
      'reservation.created': 'RESERVATION.CREATED',
      'reservation.updated': 'RESERVATION.MODIFIED',
      'reservation.cancelled': 'RESERVATION.CANCELLED',
      'guest.checked_in': 'GUEST.CHECKIN',
      'guest.checked_out': 'GUEST.CHECKOUT',
      'payment.received': 'PAYMENT.POSTED',
      'folio.updated': 'FOLIO.UPDATED',
      'digitalkey.activated': 'DIGITALKEY.ACTIVATED',
      'connectedroom.updated': 'CONNECTEDROOM.UPDATED',
    };
    return map[event] || event;
  }

  /** Map OnQ event types back to canonical. */
  _mapOnQEventToCanonical(onqEvent) {
    const map = {
      'RESERVATION.CREATED': 'reservation.created',
      'RESERVATION.MODIFIED': 'reservation.updated',
      'RESERVATION.CANCELLED': 'reservation.cancelled',
      'GUEST.CHECKIN': 'guest.checked_in',
      'GUEST.CHECKOUT': 'guest.checked_out',
      'PAYMENT.POSTED': 'payment.received',
      'FOLIO.UPDATED': 'folio.updated',
      'DIGITALKEY.ACTIVATED': 'digitalkey.activated',
      'CONNECTEDROOM.UPDATED': 'connectedroom.updated',
    };
    return map[onqEvent] || onqEvent;
  }
}

module.exports = HiltonOnQAdapter;
