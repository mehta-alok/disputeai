/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Hyatt Hotels OPERA-based PMS Adapter
 *
 * Integrates with Hyatt's customized Oracle OPERA PMS deployment via
 * the Hyatt API Portal. Hyatt runs a heavily customized OPERA instance
 * with proprietary extensions for World of Hyatt loyalty, FIND experience
 * platform, and brand-specific compliance.
 *
 * Authentication: OAuth 2.0 client_credentials flow via the Hyatt API Portal.
 *   Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key capabilities:
 *   - Reservation CRUD via Hyatt REST API v1
 *   - Guest folio retrieval (itemized charges)
 *   - Guest profile management with World of Hyatt loyalty integration
 *   - Rate plan lookups including World of Hyatt member pricing
 *   - Two-way sync: push chargeback alerts, dispute outcomes, flags, notes
 *   - Webhook registration for real-time event streaming
 *   - FIND experience platform integration
 *   - World of Hyatt loyalty tier, points, and milestone data
 *
 * Reference: https://developer.hyatt.com/documentation
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

// Default base URL for Hyatt API Portal
const DEFAULT_BASE_URL = 'https://api.hyatt.com/opera/v1';
const TOKEN_URL = 'https://auth.hyatt.com/oauth2/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * World of Hyatt loyalty tier mapping.
 * Maps internal tier codes to human-readable tier names.
 */
const WOH_TIER_MAP = {
  MBR: 'Member',
  DSC: 'Discoverist',
  EXP: 'Explorist',
  GLB: 'Globalist',
  LTG: 'Lifetime Globalist',
};

/**
 * Hyatt brand portfolio mapping.
 */
const HYATT_BRAND_CODES = {
  PH: 'Park Hyatt',
  GH: 'Grand Hyatt',
  HR: 'Hyatt Regency',
  HH: 'Hyatt',
  AH: 'Andaz',
  AL: 'Alila',
  TU: 'Thompson Hotels',
  HY: 'Hyatt Centric',
  HC: 'Caption by Hyatt',
  JH: 'JdV by Hyatt',
  BH: 'The Unbound Collection by Hyatt',
  DH: 'Destination by Hyatt',
  HP: 'Hyatt Place',
  HW: 'Hyatt House',
  UR: 'UrCove',
  HG: 'Hyatt Studios',
  EX: 'Exhale',
  MR: 'Miraval',
};

class HyattOperaAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId         - Hyatt API client ID.
   * @param {string} config.credentials.clientSecret     - Hyatt API client secret.
   * @param {string} config.credentials.apiKey           - Hyatt API Portal key.
   * @param {string} [config.credentials.accessToken]    - Cached OAuth access token.
   * @param {string} [config.credentials.refreshToken]   - OAuth refresh token.
   * @param {number} [config.credentials.expiresAt]      - Token expiry epoch ms.
   * @param {string} [config.credentials.propertyCode]   - Hyatt property (spirit) code.
   * @param {string} [config.credentials.brandCode]      - Hyatt brand code (PH, GH, HR, etc.).
   * @param {string} [config.credentials.tokenUrl]       - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]        - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'HYATT_OPERA',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
    this.brandCode = this.credentials.brandCode || 'HR';
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the Hyatt API Portal using OAuth 2.0.
   * Uses client_credentials grant with Hyatt-specific API key header.
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
          'x-hyatt-api-key': this.credentials.apiKey,
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
    params.append('scope', 'opera.reservations opera.guests opera.folios opera.rates opera.webhooks');

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-hyatt-api-key': this.credentials.apiKey,
        },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`Hyatt OPERA authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 80, refillRate: 80, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'x-hyatt-api-key': this.credentials.apiKey,
      'x-hyatt-property-code': this.propertyCode,
      'x-hyatt-brand-code': this.brandCode,
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
   * Fetch a single reservation by confirmation number from Hyatt OPERA.
   * @param {string} confirmationNumber - Hyatt confirmation number.
   * @returns {Promise<Object|null>} Normalized reservation or null if not found.
   */
  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        {
          params: {
            confirmationNumber,
            limit: 1,
            expand: 'guest,payment,loyalty,findExperience',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations?.reservationInfo || result?.reservations || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by multiple criteria.
   * Supports Hyatt-specific filters including World of Hyatt member ID.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]
   * @param {string} [params.checkOutDate]
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @param {string} [params.wohNumber] - World of Hyatt membership number.
   * @param {number} [params.limit]
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalStartDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureEndDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.paymentCardLastFour = params.cardLastFour;
    if (params.status) queryParams.reservationStatus = this._mapStatusToHyatt(params.status);
    if (params.wohNumber) queryParams.loyaltyMemberId = params.wohNumber;
    queryParams.limit = params.limit || 50;
    queryParams.expand = 'guest,payment,loyalty';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/reservations`, 200, durationMs);

    const reservations = result?.reservations?.reservationInfo || result?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - Hyatt OPERA reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/folios`,
        {
          params: {
            reservationId,
            includePayments: true,
            includeAdjustments: true,
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID from Hyatt OPERA.
   * Includes World of Hyatt loyalty data and FIND experience preferences.
   * @param {string} guestId - Hyatt guest profile ID.
   * @returns {Promise<Object>} Normalized guest profile with WoH data.
   */
  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/guests/${guestId}`,
        {
          params: {
            expand: 'loyalty,preferences,stayHistory,findExperience',
          },
        }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plan information for the property.
   * Includes World of Hyatt member rates and points+cash rates.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/rates`,
        { params: { ...params, includeWoHRates: true, includePointsCash: true } }
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
   * Push a textual note to a guest profile in Hyatt OPERA.
   * @param {string} guestId - Hyatt guest profile ID.
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]
   * @param {string} [note.category]
   * @returns {Promise<Object>} Hyatt-assigned note reference.
   */
  async pushNote(guestId, note) {
    await this._ensureToken();

    const hyattNote = {
      comment: {
        text: {
          value: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        },
        type: 'GEN',
        title: note.title,
        category: note.category || 'CHARGEBACK_DEFENSE',
        priority: this._mapPriorityToHyatt(note.priority),
        source: 'ACCUDEFEND',
        internal: true,
        guestViewable: false,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/comments`,
        hyattNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/comments`, 201, durationMs);

    return {
      success: true,
      noteId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert to Hyatt OPERA.
   * High-severity flags trigger front desk alerts in the OPERA PMS.
   * @param {string} guestId - Hyatt guest profile ID.
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} Hyatt-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    const hyattAlert = {
      comment: {
        text: {
          value: `CHARGEBACK ALERT: ${flagData.reason}` +
            (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
            (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        },
        type: 'ALT',
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        severity: this._mapSeverityToHyatt(flagData.severity),
        source: 'ACCUDEFEND',
        internal: true,
        guestViewable: false,
        operaTrace: flagData.severity === 'critical' || flagData.severity === 'high',
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/comments`,
        hyattAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/comments`, 201, durationMs);

    // For critical severity, also push to FIND experience platform
    if (flagData.severity === 'critical') {
      await this._pushFINDAlert(guestId, flagData);
    }

    return {
      success: true,
      flagId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      operaTraceSet: flagData.severity === 'critical' || flagData.severity === 'high',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation in Hyatt OPERA.
   * @param {string} reservationId - Hyatt OPERA reservation ID.
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

    const hyattComment = {
      comment: {
        text: {
          value: [
            '=== CHARGEBACK ALERT ===',
            `Case #: ${alertData.caseNumber}`,
            `Amount: $${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            '---',
            'Generated by AccuDefend Chargeback Defense System',
          ].join('\n'),
        },
        type: 'ALT',
        title: `Chargeback Alert - Case ${alertData.caseNumber}`,
        source: 'ACCUDEFEND',
        internal: true,
        guestViewable: false,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        hyattComment
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
   * Push a dispute outcome notification to Hyatt OPERA.
   * @param {string} reservationId - Hyatt OPERA reservation ID.
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
    const hyattComment = {
      comment: {
        text: {
          value: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            '---',
            'Generated by AccuDefend Chargeback Defense System',
          ].join('\n'),
        },
        type: won ? 'GEN' : 'ALT',
        title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
        source: 'ACCUDEFEND',
        internal: true,
        guestViewable: false,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        hyattComment
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
   * Register a webhook callback URL with Hyatt OPERA.
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
        events: (config.events || []).map(e => this._mapEventToHyatt(e)),
        secret,
        active: true,
        propertyCode: this.propertyCode,
        brandCode: this.brandCode,
        format: 'JSON',
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
   * Parse an incoming Hyatt OPERA webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapHyattEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
      propertyCode: payload.propertyCode || payload.hotelId || this.propertyCode,
      brandCode: payload.brandCode || this.brandCode,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.profileId || data.guestId,
        wohNumber: data.loyaltyMemberId || data.wohNumber,
        findExperienceId: data.findExperienceId || null,
        ...data,
      },
      raw: payload,
    };
  }

  /**
   * Verify the HMAC signature on an incoming Hyatt OPERA webhook.
   * @param {string|Buffer} rawPayload
   * @param {string} signature - Value of x-hyatt-webhook-signature header.
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
   * Normalize a raw Hyatt OPERA reservation into the canonical shape.
   * Includes World of Hyatt loyalty data and FIND experience information.
   * @param {Object} pmsData - Raw Hyatt OPERA reservation object.
   * @returns {Object} Normalized reservation.
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const resInfo = pmsData.reservationIdList || pmsData;
    const roomStay = pmsData.roomStay || pmsData.roomStays?.[0] || {};
    const guestNames = pmsData.guestNameList?.guestName || pmsData.guestNames || [];
    const primaryGuest = guestNames[0] || pmsData.primaryGuest || pmsData.guest || {};
    const payment = pmsData.paymentMethods?.[0] || pmsData.cashiering?.payment || {};
    const loyalty = pmsData.loyaltyInfo || pmsData.wohInfo || primaryGuest.loyalty || {};
    const ratePlan = roomStay.ratePlans?.[0] || roomStay.ratePlan || {};
    const roomType = roomStay.roomTypes?.[0] || roomStay.roomType || {};
    const findExperience = pmsData.findExperience || pmsData.findInfo || {};

    const confirmationNumber =
      resInfo?.confirmationNumber ||
      resInfo?.id?.value ||
      pmsData.confirmationNumber ||
      pmsData.reservationId ||
      '';

    const guestProfileId =
      primaryGuest.profileId?.value ||
      primaryGuest.profileId ||
      pmsData.guestProfileId ||
      '';

    const guestNameObj = primaryGuest.givenName || primaryGuest.name
      ? {
          firstName: primaryGuest.givenName || primaryGuest.name?.givenName || primaryGuest.name?.firstName || '',
          lastName: primaryGuest.surname || primaryGuest.name?.surname || primaryGuest.name?.lastName || '',
        }
      : normalizeGuestName(primaryGuest.nameTitle || primaryGuest);

    return {
      confirmationNumber: String(confirmationNumber),
      pmsReservationId: pmsData.reservationId || pmsData.id?.value || confirmationNumber,
      status: normalizeReservationStatus(
        pmsData.reservationStatus || pmsData.status || roomStay.status
      ),
      guestProfileId: String(guestProfileId),
      guestName: guestNameObj,
      email: primaryGuest.email?.value || primaryGuest.email || '',
      phone: normalizePhone(primaryGuest.phone?.value || primaryGuest.phone),
      address: normalizeAddress(primaryGuest.address || primaryGuest.addressInfo),
      checkInDate: normalizeDate(
        roomStay.arrivalDate || roomStay.stayDateRange?.startDate || pmsData.arrivalDate
      ),
      checkOutDate: normalizeDate(
        roomStay.departureDate || roomStay.stayDateRange?.endDate || pmsData.departureDate
      ),
      roomNumber: roomStay.roomId || roomStay.room?.roomNumber || '',
      roomType: roomType.roomTypeCode || roomType.code || roomType.description || '',
      rateCode: ratePlan.ratePlanCode || ratePlan.code || '',
      ratePlanDescription: ratePlan.ratePlanName || ratePlan.description || '',
      totalAmount: normalizeAmount(
        roomStay.total?.amount || roomStay.totalAmount || pmsData.totalAmount
      ),
      currency: normalizeCurrency(
        roomStay.total?.currencyCode || roomStay.currencyCode || pmsData.currencyCode
      ),
      numberOfGuests: pmsData.numberOfGuests || roomStay.guestCount || guestNames.length || 1,
      numberOfNights: this._calculateNights(
        roomStay.arrivalDate || pmsData.arrivalDate,
        roomStay.departureDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.paymentCard?.cardType),
        cardLastFour: payment.cardNumber?.slice(-4) || payment.paymentCard?.cardNumberMasked?.slice(-4) || '',
        authCode: payment.approvalCode || payment.paymentCard?.approvalCode || '',
      },
      bookingSource: pmsData.sourceCode || pmsData.origin || '',
      createdAt: normalizeDate(pmsData.createDateTime || pmsData.createdAt),
      updatedAt: normalizeDate(pmsData.lastModifyDateTime || pmsData.updatedAt),
      specialRequests: pmsData.specialRequests || pmsData.comments?.map(c => c.text?.value).filter(Boolean).join('; ') || '',
      // Hyatt-specific fields
      loyaltyNumber: loyalty.wohNumber || loyalty.membershipId || pmsData.wohNumber || '',
      loyaltyTier: WOH_TIER_MAP[loyalty.tierCode] || loyalty.tierName || loyalty.membershipLevel || '',
      brandCode: pmsData.brandCode || this.brandCode,
      brandName: HYATT_BRAND_CODES[pmsData.brandCode || this.brandCode] || '',
      spiritCode: pmsData.spiritCode || this.propertyCode,
      findExperienceId: findExperience.experienceId || findExperience.id || null,
      findExperienceBooked: Array.isArray(findExperience.bookedExperiences) ? findExperience.bookedExperiences : [],
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw Hyatt OPERA folio items into canonical shape.
   * @param {Object} pmsData - Raw Hyatt folio response.
   * @returns {Object[]} Array of normalized folio items.
   */
  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioWindows || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.postings || folio.folioItems || folio.transactions || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || folio.folioWindowNo || 1,
          transactionId: posting.transactionId || posting.id || '',
          transactionCode: posting.transactionCode || posting.trxCode || '',
          category: normalizeFolioCategory(
            posting.transactionGroup || posting.category || posting.transactionCode
          ),
          description: posting.description || posting.transactionDescription || posting.remark || '',
          amount: normalizeAmount(posting.amount || posting.netAmount),
          currency: normalizeCurrency(posting.currencyCode),
          postDate: normalizeDate(posting.postingDate || posting.transactionDate),
          cardLastFour: posting.creditCardNumber?.slice(-4) || posting.cardLastFour || '',
          authCode: posting.approvalCode || posting.authorizationCode || '',
          reference: posting.reference || posting.folioView || '',
          reversalFlag: posting.reversal === true || posting.reversalFlag === 'Y',
          quantity: posting.quantity || 1,
          revenueCenter: posting.revenueCenter || posting.outlet || '',
        });
      }
    }

    return allItems;
  }

  /**
   * Normalize a raw Hyatt OPERA guest profile into canonical shape.
   * Includes World of Hyatt loyalty data and FIND experience preferences.
   * @param {Object} pmsData - Raw Hyatt guest profile response.
   * @returns {Object} Normalized guest profile.
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.profileDetails?.profile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.customer?.name || {};
    const addresses = profile.addresses?.address || profile.addresses || [];
    const emails = profile.emails?.email || profile.emails || [];
    const phones = profile.phones?.phone || profile.phones || [];
    const loyalty = profile.loyaltyInfo || profile.wohInfo || {};
    const findPrefs = profile.findExperience || profile.findPreferences || {};
    const primaryAddress = Array.isArray(addresses) ? addresses[0] : addresses;
    const primaryEmail = Array.isArray(emails) ? emails.find(e => e.primary) || emails[0] : emails;
    const primaryPhone = Array.isArray(phones) ? phones.find(p => p.primary) || phones[0] : phones;

    return {
      guestId: profile.profileId?.value || profile.id || '',
      name: normalizeGuestName({
        firstName: name.givenName || name.firstName || '',
        lastName: name.surname || name.lastName || '',
      }),
      email: primaryEmail?.value || primaryEmail?.email || (typeof primaryEmail === 'string' ? primaryEmail : ''),
      phone: normalizePhone(primaryPhone?.value || primaryPhone?.phoneNumber || primaryPhone),
      address: normalizeAddress(primaryAddress),
      vipCode: profile.vipCode || profile.vipStatus || '',
      // World of Hyatt loyalty data
      loyaltyNumber: loyalty.wohNumber || loyalty.membershipId || profile.wohNumber || '',
      loyaltyLevel: WOH_TIER_MAP[loyalty.tierCode] || loyalty.tierName || '',
      loyaltyPoints: loyalty.pointsBalance || loyalty.availablePoints || 0,
      loyaltyLifetimeNights: loyalty.lifetimeNights || 0,
      loyaltyYearNights: loyalty.qualifyingNightsThisYear || loyalty.currentYearNights || 0,
      loyaltyMilestoneRewards: loyalty.milestoneRewards || [],
      // FIND experience data
      findPreferences: findPrefs.categories || findPrefs.interests || [],
      findBookedExperiences: findPrefs.bookedExperiences || [],
      nationality: profile.nationality || profile.nationCode || '',
      language: profile.language || profile.communicationLanguage || '',
      dateOfBirth: normalizeDate(profile.birthDate || profile.dateOfBirth),
      companyName: profile.company?.companyName || profile.companyName || '',
      totalStays: profile.stayHistory?.totalStays || profile.totalVisits || 0,
      totalRevenue: normalizeAmount(profile.stayHistory?.totalRevenue || profile.totalRevenue),
      lastStayDate: normalizeDate(profile.stayHistory?.lastStayDate || profile.lastVisitDate),
      createdAt: normalizeDate(profile.createDateTime || profile.createdAt),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw Hyatt OPERA rate data into canonical shape.
   * @param {Object} pmsData - Raw Hyatt rate response.
   * @returns {Object[]} Array of normalized rate objects.
   */
  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlanCodes || pmsData?.ratePlans || pmsData?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.ratePlanCode || rate.code || '',
      name: rate.ratePlanName || rate.shortDescription || rate.description || '',
      description: rate.longDescription || rate.description || '',
      category: rate.ratePlanCategory || rate.category || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.effectiveDate),
      endDate: normalizeDate(rate.endDate || rate.expiryDate),
      isActive: rate.active !== false && rate.status !== 'INACTIVE',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancelPolicy || rate.cancellationPolicy || '',
      isWoHRate: rate.wohExclusive === true || rate.loyaltyRate === true,
      wohPointsRequired: rate.pointsRequired || rate.wohPoints || 0,
      wohPointsCashOption: rate.pointsCashAmount || null,
      wohTierRequired: WOH_TIER_MAP[rate.requiredTier] || rate.minimumTier || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Hyatt OPERA API is reachable and credentials are valid.
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
          brandName: HYATT_BRAND_CODES[this.brandCode] || 'Unknown',
          apiVersion: response.headers?.['x-hyatt-api-version'] || 'v1',
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

  /** Push a FIND experience platform alert for critical chargeback flags. */
  async _pushFINDAlert(guestId, flagData) {
    try {
      await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/find/alerts`,
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
      logger.info(`[PMS:${this.pmsType}] FIND alert pushed for guest ${guestId}`);
    } catch (error) {
      // FIND alerts are best-effort; log but don't fail the main operation
      logger.warn(`[PMS:${this.pmsType}] Failed to push FIND alert: ${error.message}`);
    }
  }

  /** Map canonical priority to Hyatt priority levels. */
  _mapPriorityToHyatt(priority) {
    const map = { low: 'LOW', medium: 'NORMAL', high: 'HIGH', critical: 'URGENT' };
    return map[priority] || 'NORMAL';
  }

  /** Map canonical severity to Hyatt severity levels. */
  _mapSeverityToHyatt(severity) {
    const map = { low: 'INFO', medium: 'WARNING', high: 'CRITICAL', critical: 'EMERGENCY' };
    return map[severity] || 'WARNING';
  }

  /** Map canonical status to Hyatt OPERA reservation status codes. */
  _mapStatusToHyatt(status) {
    const map = {
      confirmed: 'RESERVED',
      checked_in: 'INHOUSE',
      checked_out: 'CHECKEDOUT',
      cancelled: 'CANCELLED',
      no_show: 'NOSHOW',
      pending: 'TENTATIVE',
    };
    return map[status] || status;
  }

  /** Map canonical event names to Hyatt webhook event types. */
  _mapEventToHyatt(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_UPDATED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECKIN',
      'guest.checked_out': 'GUEST_CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
      'loyalty.updated': 'WOH_STATUS_CHANGE',
      'find.booked': 'FIND_EXPERIENCE_BOOKED',
    };
    return map[event] || event;
  }

  /** Map Hyatt event types back to canonical. */
  _mapHyattEventToCanonical(hyattEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_UPDATED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECKIN: 'guest.checked_in',
      GUEST_CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
      WOH_STATUS_CHANGE: 'loyalty.updated',
      FIND_EXPERIENCE_BOOKED: 'find.booked',
    };
    return map[hyattEvent] || hyattEvent;
  }
}

module.exports = HyattOperaAdapter;
