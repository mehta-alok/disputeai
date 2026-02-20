/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Marriott International GXP / FSPMS (Opera-based) PMS Adapter
 *
 * Integrates with Marriott's proprietary Guest Experience Platform (GXP),
 * built on top of Oracle OPERA Cloud, via the Marriott Developer API Gateway.
 *
 * Authentication: OAuth 2.0 client_credentials flow with Marriott-specific
 *   auth headers (x-marriott-api-key, x-marriott-brand-code).
 *   Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key capabilities:
 *   - Reservation CRUD via GXP REST API
 *   - Guest folio retrieval (itemized charges)
 *   - Guest profile management with Marriott Bonvoy loyalty integration
 *   - Rate plan lookups
 *   - Two-way sync: push chargeback alerts, dispute outcomes, flags, notes
 *   - Webhook registration for real-time event streaming
 *   - M Live alert integration for brand standard compliance
 *   - Marriott Bonvoy loyalty tier and points data
 *
 * Reference: https://developer.marriott.com/documentation
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

// Default base URL for Marriott GXP API Gateway
const DEFAULT_BASE_URL = 'https://api.marriott.com/gxp/v1';
const TOKEN_URL = 'https://auth.marriott.com/oauth2/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Marriott Bonvoy loyalty tier mapping.
 * Maps internal tier codes to human-readable tier names.
 */
const BONVOY_TIER_MAP = {
  MEM: 'Member',
  SLV: 'Silver Elite',
  GLD: 'Gold Elite',
  PLT: 'Platinum Elite',
  TIT: 'Titanium Elite',
  AMB: 'Ambassador Elite',
  LTG: 'Lifetime Gold Elite',
  LTP: 'Lifetime Platinum Elite',
  LTT: 'Lifetime Titanium Elite',
};

/**
 * Marriott brand codes for brand standard compliance tracking.
 */
const MARRIOTT_BRAND_CODES = {
  MC: 'Marriott Hotels',
  RC: 'The Ritz-Carlton',
  WH: 'W Hotels',
  SI: 'Sheraton',
  WI: 'Westin',
  LE: 'Le Meridien',
  XR: 'St. Regis',
  LC: 'The Luxury Collection',
  AK: 'Autograph Collection',
  TX: 'Renaissance Hotels',
  CY: 'Courtyard',
  BR: 'Fairfield Inn & Suites',
  RI: 'Residence Inn',
  SH: 'SpringHill Suites',
  AR: 'AC Hotels',
  AL: 'Aloft Hotels',
  EL: 'Element Hotels',
  OX: 'Four Points',
  MD: 'Moxy Hotels',
};

class MarriottGXPAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId         - Marriott API client ID.
   * @param {string} config.credentials.clientSecret     - Marriott API client secret.
   * @param {string} config.credentials.apiKey           - Marriott x-marriott-api-key header.
   * @param {string} [config.credentials.accessToken]    - Cached OAuth access token.
   * @param {string} [config.credentials.refreshToken]   - OAuth refresh token.
   * @param {number} [config.credentials.expiresAt]      - Token expiry epoch ms.
   * @param {string} [config.credentials.propertyCode]   - Marriott property (MARSHA) code.
   * @param {string} [config.credentials.brandCode]      - Marriott brand code (MC, RC, WH, etc.).
   * @param {string} [config.credentials.tokenUrl]       - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]        - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'MARRIOTT_GXP',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
    this.brandCode = this.credentials.brandCode || 'MC';
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the Marriott GXP API Gateway using OAuth 2.0.
   * Uses client_credentials grant with Marriott-specific headers.
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
          'x-marriott-api-key': this.credentials.apiKey,
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
    params.append('scope', 'gxp.reservations gxp.guests gxp.folios gxp.rates gxp.webhooks');

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-marriott-api-key': this.credentials.apiKey,
        },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`Marriott GXP authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 120, refillRate: 120, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'x-marriott-api-key': this.credentials.apiKey,
      'x-marriott-brand-code': this.brandCode,
      'x-marriott-property-code': this.propertyCode,
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
   * Fetch a single reservation by confirmation number from Marriott GXP.
   * @param {string} confirmationNumber - Marriott confirmation number.
   * @returns {Promise<Object|null>} Normalized reservation or null if not found.
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        { params: { confirmationNumber, limit: 1, includeExtended: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by multiple criteria.
   * Supports Marriott-specific filters including Bonvoy member ID and brand code.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]  - ISO date string.
   * @param {string} [params.checkOutDate] - ISO date string.
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @param {string} [params.bonvoyNumber] - Marriott Bonvoy membership number.
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
    if (params.status) queryParams.reservationStatus = this._mapStatusToMarriott(params.status);
    if (params.bonvoyNumber) queryParams.loyaltyMemberId = params.bonvoyNumber;
    queryParams.limit = params.limit || 50;
    queryParams.includeExtended = true;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations || result?.data?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * Retrieves all folio windows including room, incidentals, and F&B.
   * @param {string} reservationId - GXP reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/folios`,
        { params: { reservationId, includePayments: true, includeAdjustments: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID from Marriott GXP.
   * Includes Bonvoy loyalty data, stay history, and brand preferences.
   * @param {string} guestId - GXP guest profile ID.
   * @returns {Promise<Object>} Normalized guest profile with Bonvoy data.
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/guests/${guestId}/profile`,
        { params: { includeLoyalty: true, includePreferences: true, includeHistory: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guests/${guestId}/profile`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plan information for the property.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/rates`,
        { params: { ...params, includeBonvoyRates: true } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/rates`, 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile in Marriott GXP.
   * Notes are tagged with AccuDefend source for traceability.
   * @param {string} guestId - GXP guest profile ID.
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]  - low | medium | high
   * @param {string} [note.category]  - e.g. "chargeback", "fraud_alert"
   * @returns {Promise<Object>} GXP-assigned note reference.
   */
  async pushNote(guestId, note) {
    await this._ensureToken();

    const gxpNote = {
      note: {
        type: 'INTERNAL',
        category: note.category || 'CHARGEBACK_DEFENSE',
        title: note.title,
        body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        priority: this._mapPriorityToMarriott(note.priority),
        source: 'ACCUDEFEND',
        brandCode: this.brandCode,
        createdAt: new Date().toISOString(),
        guestViewable: false,
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/notes`,
        gxpNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert to Marriott GXP.
   * High-severity flags also trigger M Live alerts for brand standard compliance.
   * @param {string} guestId - GXP guest profile ID.
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity   - low | medium | high | critical
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} GXP-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const gxpAlert = {
      alert: {
        type: 'CHARGEBACK_FLAG',
        severity: this._mapSeverityToMarriott(flagData.severity),
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        description: `CHARGEBACK ALERT: ${flagData.reason}` +
          (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
          (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        source: 'ACCUDEFEND',
        brandCode: this.brandCode,
        propertyCode: this.propertyCode,
        guestViewable: false,
        mLiveAlert: flagData.severity === 'critical' || flagData.severity === 'high',
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/alerts`,
        gxpAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/alerts`, 201, durationMs);

    // If critical severity, also push an M Live notification
    if (flagData.severity === 'critical') {
      await this._pushMLiveAlert(guestId, flagData);
    }

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      mLiveTriggered: flagData.severity === 'critical' || flagData.severity === 'high',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation in Marriott GXP.
   * Creates a reservation-level alert with full dispute details.
   * @param {string} reservationId - GXP reservation ID.
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

    const gxpComment = {
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
        brandCode: this.brandCode,
        guestViewable: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        gxpComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../reservations/${reservationId}/comments`, 201, durationMs);

    return {
      success: true,
      commentId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome notification to Marriott GXP.
   * Updates the reservation with the final dispute resolution.
   * @param {string} reservationId - GXP reservation ID.
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
    const gxpComment = {
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
        brandCode: this.brandCode,
        guestViewable: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        gxpComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/.../reservations/${reservationId}/comments`, 201, durationMs);

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
   * Register a webhook callback URL with Marriott GXP.
   * Subscribes to reservation, guest, and payment events.
   * @param {Object} config - Webhook configuration.
   * @param {string} config.callbackUrl - Our endpoint URL.
   * @param {string[]} config.events    - Event types to subscribe to.
   * @returns {Promise<Object>} Webhook registration details.
   */
  async registerWebhook(config) {
    await this._ensureToken();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      webhook: {
        callbackUrl: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToMarriott(e)),
        secret,
        active: true,
        propertyCode: this.propertyCode,
        brandCode: this.brandCode,
        format: 'JSON',
        version: 'v1',
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/webhooks`,
        webhookPayload
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/properties/${this.propertyCode}/webhooks`, 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming Marriott GXP webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event: { eventType, timestamp, data }
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapMarriottEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
      propertyCode: payload.propertyCode || this.propertyCode,
      brandCode: payload.brandCode || this.brandCode,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestProfileId || data.guestId,
        bonvoyNumber: data.loyaltyMemberId || data.bonvoyNumber,
        ...data,
      },
      raw: payload,
    };
  }

  /**
   * Verify the HMAC signature on an incoming Marriott GXP webhook.
   * @param {string|Buffer} rawPayload
   * @param {string} signature - Value of x-marriott-webhook-signature header.
   * @param {string} secret - Shared secret from webhook registration.
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
   * Normalize a raw Marriott GXP reservation response into the canonical shape.
   * Includes Bonvoy loyalty data and brand-specific fields.
   * @param {Object} pmsData - Raw GXP reservation object.
   * @returns {Object} Normalized reservation.
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const roomStay = pmsData.roomStay || pmsData.roomStays?.[0] || {};
    const guest = pmsData.primaryGuest || pmsData.guest || pmsData.guestInfo || {};
    const payment = pmsData.paymentInfo || pmsData.payment || pmsData.paymentMethods?.[0] || {};
    const loyalty = pmsData.loyaltyInfo || pmsData.bonvoyInfo || guest.loyalty || {};
    const ratePlan = roomStay.ratePlan || roomStay.ratePlans?.[0] || {};
    const roomType = roomStay.roomType || roomStay.roomTypes?.[0] || {};

    const confirmationNumber =
      pmsData.confirmationNumber ||
      pmsData.marshaConfirmation ||
      pmsData.reservationId ||
      '';

    const guestNameObj = guest.givenName || guest.name
      ? {
          firstName: guest.givenName || guest.name?.givenName || guest.name?.firstName || '',
          lastName: guest.surname || guest.name?.surname || guest.name?.lastName || '',
        }
      : normalizeGuestName(guest.fullName || guest);

    return {
      confirmationNumber: String(confirmationNumber),
      pmsReservationId: pmsData.reservationId || pmsData.gxpId || confirmationNumber,
      status: normalizeReservationStatus(
        pmsData.reservationStatus || pmsData.status || roomStay.status
      ),
      guestProfileId: String(guest.profileId || guest.guestId || ''),
      guestName: guestNameObj,
      email: guest.email?.value || guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone?.value || guest.phone || guest.phoneNumber),
      address: normalizeAddress(guest.address || guest.addressInfo),
      checkInDate: normalizeDate(
        roomStay.arrivalDate || roomStay.checkInDate || pmsData.arrivalDate
      ),
      checkOutDate: normalizeDate(
        roomStay.departureDate || roomStay.checkOutDate || pmsData.departureDate
      ),
      roomNumber: roomStay.roomNumber || roomStay.room?.number || '',
      roomType: roomType.code || roomType.roomTypeCode || roomType.description || '',
      rateCode: ratePlan.rateCode || ratePlan.ratePlanCode || '',
      ratePlanDescription: ratePlan.description || ratePlan.ratePlanName || '',
      totalAmount: normalizeAmount(
        roomStay.totalAmount || roomStay.total?.amount || pmsData.totalAmount
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
      // Marriott-specific fields
      loyaltyNumber: loyalty.bonvoyNumber || loyalty.membershipId || pmsData.bonvoyNumber || '',
      loyaltyTier: BONVOY_TIER_MAP[loyalty.tierCode] || loyalty.tierName || loyalty.membershipLevel || '',
      brandCode: pmsData.brandCode || this.brandCode,
      brandName: MARRIOTT_BRAND_CODES[pmsData.brandCode || this.brandCode] || '',
      marshaCode: pmsData.marshaCode || this.propertyCode,
      brandComplianceFlags: pmsData.complianceFlags || [],
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw Marriott GXP folio items into canonical shape.
   * @param {Object} pmsData - Raw GXP folio response.
   * @returns {Object[]} Array of normalized folio items.
   */
  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioWindows || pmsData?.data?.folios || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.postings || folio.lineItems || folio.transactions || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || folio.folioWindow || 1,
          transactionId: posting.transactionId || posting.id || '',
          transactionCode: posting.transactionCode || posting.trxCode || '',
          category: normalizeFolioCategory(
            posting.category || posting.transactionGroup || posting.transactionCode
          ),
          description: posting.description || posting.itemDescription || posting.remark || '',
          amount: normalizeAmount(posting.amount || posting.netAmount),
          currency: normalizeCurrency(posting.currencyCode),
          postDate: normalizeDate(posting.postingDate || posting.transactionDate),
          cardLastFour: posting.cardLastFour || posting.creditCardNumber?.slice(-4) || '',
          authCode: posting.approvalCode || posting.authorizationCode || '',
          reference: posting.reference || posting.receiptNumber || '',
          reversalFlag: posting.reversal === true || posting.isReversal === true,
          quantity: posting.quantity || 1,
          revenueCenter: posting.revenueCenter || posting.outlet || '',
        });
      }
    }

    return allItems;
  }

  /**
   * Normalize a raw Marriott GXP guest profile into canonical shape.
   * Includes full Bonvoy loyalty program data and stay history.
   * @param {Object} pmsData - Raw GXP guest profile response.
   * @returns {Object} Normalized guest profile with Bonvoy integration data.
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guestProfile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.guestName || {};
    const addresses = profile.addresses || [];
    const emails = profile.emails || [];
    const phones = profile.phones || [];
    const loyalty = profile.loyaltyInfo || profile.bonvoyInfo || {};
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
      // Bonvoy loyalty data
      loyaltyNumber: loyalty.bonvoyNumber || loyalty.membershipId || profile.bonvoyNumber || '',
      loyaltyLevel: BONVOY_TIER_MAP[loyalty.tierCode] || loyalty.tierName || '',
      loyaltyPoints: loyalty.pointsBalance || loyalty.availablePoints || 0,
      loyaltyLifetimeNights: loyalty.lifetimeNights || loyalty.totalLifetimeNights || 0,
      loyaltyYearNights: loyalty.currentYearNights || loyalty.eliteNightsThisYear || 0,
      nationality: profile.nationality || profile.countryOfResidence || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.birthDate || profile.dateOfBirth),
      companyName: profile.company?.name || profile.companyName || '',
      totalStays: profile.stayHistory?.totalStays || profile.totalVisits || 0,
      totalRevenue: normalizeAmount(profile.stayHistory?.totalRevenue || profile.lifetimeRevenue),
      lastStayDate: normalizeDate(profile.stayHistory?.lastStayDate || profile.lastVisitDate),
      // Marriott-specific
      brandPreferences: profile.brandPreferences || [],
      roomPreferences: profile.roomPreferences || [],
      communicationPreferences: profile.communicationPreferences || {},
      createdAt: normalizeDate(profile.createDateTime || profile.createdAt),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw Marriott GXP rate data into canonical shape.
   * Includes Bonvoy member-exclusive rates.
   * @param {Object} pmsData - Raw GXP rate response.
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
      isBonvoyRate: rate.bonvoyExclusive === true || rate.loyaltyRate === true,
      bonvoyPointsRequired: rate.pointsRequired || rate.bonvoyPoints || 0,
      bonvoyTierRequired: BONVOY_TIER_MAP[rate.requiredTier] || rate.minimumTier || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Marriott GXP API is reachable and credentials are valid.
   * Tests connectivity by performing a minimal reservation search.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        { params: { limit: 1 } }
      );

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.propertyCode,
          brandCode: this.brandCode,
          brandName: MARRIOTT_BRAND_CODES[this.brandCode] || 'Unknown',
          apiVersion: response.headers?.['x-gxp-api-version'] || 'unknown',
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

  /** Push an M Live alert for critical-severity chargeback flags. */
  async _pushMLiveAlert(guestId, flagData) {
    try {
      await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/mlive/alerts`,
        {
          alert: {
            type: 'CHARGEBACK_CRITICAL',
            guestId,
            message: `Critical chargeback alert: ${flagData.reason} | Amount: $${flagData.amount || 'N/A'}`,
            priority: 'IMMEDIATE',
            source: 'ACCUDEFEND',
          },
        }
      );
      logger.info(`[PMS:${this.pmsType}] M Live alert pushed for guest ${guestId}`);
    } catch (error) {
      // M Live alerts are best-effort; log but don't fail the main operation
      logger.warn(`[PMS:${this.pmsType}] Failed to push M Live alert: ${error.message}`);
    }
  }

  /** Map canonical priority to Marriott GXP priority levels. */
  _mapPriorityToMarriott(priority) {
    const map = {
      low: 'LOW',
      medium: 'NORMAL',
      high: 'HIGH',
      critical: 'URGENT',
    };
    return map[priority] || 'NORMAL';
  }

  /** Map canonical severity to Marriott GXP severity levels. */
  _mapSeverityToMarriott(severity) {
    const map = {
      low: 'INFORMATIONAL',
      medium: 'WARNING',
      high: 'CRITICAL',
      critical: 'EMERGENCY',
    };
    return map[severity] || 'WARNING';
  }

  /** Map canonical status to Marriott GXP reservation status codes. */
  _mapStatusToMarriott(status) {
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

  /** Map canonical event names to Marriott GXP webhook event types. */
  _mapEventToMarriott(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_MODIFIED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECKIN',
      'guest.checked_out': 'GUEST_CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
      'loyalty.updated': 'BONVOY_STATUS_CHANGE',
    };
    return map[event] || event;
  }

  /** Map Marriott GXP event types back to canonical. */
  _mapMarriottEventToCanonical(marriottEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_MODIFIED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECKIN: 'guest.checked_in',
      GUEST_CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
      BONVOY_STATUS_CHANGE: 'loyalty.updated',
    };
    return map[marriottEvent] || marriottEvent;
  }
}

module.exports = MarriottGXPAdapter;
