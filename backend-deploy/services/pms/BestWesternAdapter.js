/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Best Western Hotels & Resorts PMS Adapter
 *
 * Integrates with Best Western's centralized PMS integration layer,
 * which aggregates access to properties running either OPERA or Maestro
 * PMS systems through a unified REST API.
 *
 * Authentication: API Key-based authentication via x-bw-api-key header.
 *   No OAuth flow required -- the API key is provisioned through the
 *   Best Western Partner Portal and is long-lived.
 *
 * Key capabilities:
 *   - Reservation management via Best Western REST API v1
 *   - Guest folio retrieval (itemized charges)
 *   - Guest profile management with Best Western Rewards integration
 *   - Rate plan lookups including Rewards member pricing
 *   - Two-way sync: push chargeback alerts, dispute outcomes, flags, notes
 *   - Webhook registration for real-time event streaming
 *   - Best Western Rewards loyalty tier and points data
 *   - BWR elite benefits tracking
 *
 * Reference: https://developer.bestwestern.com/documentation
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

// Default base URL for Best Western API
const DEFAULT_BASE_URL = 'https://api.bestwestern.com/pms/v1';

/**
 * Best Western Rewards loyalty tier mapping.
 * Maps internal tier codes to human-readable tier names.
 */
const BWR_TIER_MAP = {
  BLU: 'Blue',
  GLD: 'Gold',
  PLT: 'Platinum',
  DMD: 'Diamond',
  DSL: 'Diamond Select',
  LTD: 'Lifetime Diamond',
};

/**
 * Best Western brand portfolio mapping.
 */
const BW_BRAND_CODES = {
  BW: 'Best Western',
  BWP: 'Best Western Plus',
  BWR: 'Best Western Premier',
  SUR: 'SureStay Hotel',
  SRP: 'SureStay Plus Hotel',
  SRC: 'SureStay Collection',
  VIB: 'Vib',
  GLO: 'Glo',
  EXE: 'Executive Residency',
  AID: 'Aiden',
  SAV: 'Sadie',
  BWS: 'BW Signature Collection',
  BWP2: 'BW Premier Collection',
};

class BestWesternAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey           - Best Western API key.
   * @param {string} config.credentials.apiSecret        - Best Western API secret (for webhook signature verification).
   * @param {string} [config.credentials.propertyCode]   - Best Western property code.
   * @param {string} [config.credentials.brandCode]      - Best Western brand code (BW, BWP, BWR, etc.).
   * @param {string} [config.credentials.partnerId]      - AccuDefend partner ID in BW system.
   * @param {string} [config.credentials.baseUrl]        - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'BEST_WESTERN',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
    this.brandCode = this.credentials.brandCode || 'BW';
    this.partnerId = this.credentials.partnerId || 'ACCUDEFEND';
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the Best Western API using API Key authentication.
   * Best Western uses a simpler API key model -- no OAuth token exchange needed.
   * Validates the API key by making a lightweight health-check request.
   * @returns {Promise<void>}
   */
  async authenticate() {
    if (this.httpClient) {
      // Already authenticated, verify the key is still valid
      try {
        await this.httpClient.get(
          `/api/v1/properties/${this.propertyCode}/status`,
          { params: { limit: 1 } }
        );
        return;
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          logger.warn(`[PMS:${this.pmsType}] API key may be expired or revoked, re-initializing client`);
        } else {
          // Network error or other transient issue, keep existing client
          return;
        }
      }
    }

    this._buildAuthenticatedClient();

    // Validate API key with a lightweight call
    try {
      const startMs = Date.now();
      await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/status`
      );
      this._logApiCall('GET', `/api/v1/properties/${this.propertyCode}/status`, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', `/api/v1/properties/${this.propertyCode}/status`, error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error(`Best Western authentication failed: Invalid API key or insufficient permissions`);
      }
      // For non-auth errors, log a warning but don't fail -- the API might be temporarily down
      logger.warn(`[PMS:${this.pmsType}] API validation call failed (non-auth): ${error.message}`);
    }
  }

  /**
   * Refresh authentication. For API key auth, this re-initializes the HTTP client.
   * API keys are long-lived and don't expire like OAuth tokens, but this method
   * supports the BasePMSAdapter contract for consistency.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Re-initializing HTTP client with API key`);
    this._buildAuthenticatedClient();
  }

  /** @private */
  _buildAuthenticatedClient() {
    const headers = this._getAuthHeaders();
    this._buildHttpClient(headers, {
      rateLimit: { maxTokens: 60, refillRate: 60, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      'x-bw-api-key': this.credentials.apiKey,
      'x-bw-partner-id': this.partnerId,
      'x-bw-property-code': this.propertyCode,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by confirmation number from Best Western.
   * @param {string} confirmationNumber - Best Western confirmation number.
   * @returns {Promise<Object|null>} Normalized reservation or null if not found.
   */
  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/reservations`,
        {
          params: {
            confirmationNumber,
            limit: 1,
            expand: 'guest,payment,loyalty',
          },
        }
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
   * Supports Best Western-specific filters including BWR member ID.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]
   * @param {string} [params.checkOutDate]
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @param {string} [params.bwrNumber] - Best Western Rewards membership number.
   * @param {number} [params.limit]
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.paymentCardLastFour = params.cardLastFour;
    if (params.status) queryParams.reservationStatus = this._mapStatusToBW(params.status);
    if (params.bwrNumber) queryParams.rewardsMemberId = params.bwrNumber;
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

    const reservations = result?.reservations || result?.data?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - Best Western reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

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
   * Fetch a guest profile by guest ID from Best Western.
   * Includes Best Western Rewards loyalty data and stay history.
   * @param {string} guestId - Best Western guest profile ID.
   * @returns {Promise<Object>} Normalized guest profile with BWR data.
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/guests/${guestId}`,
        {
          params: {
            expand: 'rewards,preferences,stayHistory',
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
   * Includes BWR member rates.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/properties/${this.propertyCode}/rates`,
        { params: { ...params, includeRewardsRates: true } }
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
   * Push a textual note to a guest profile in Best Western.
   * @param {string} guestId - Best Western guest profile ID.
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]
   * @param {string} [note.category]
   * @returns {Promise<Object>} BW-assigned note reference.
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const bwNote = {
      note: {
        type: 'INTERNAL',
        category: note.category || 'CHARGEBACK_DEFENSE',
        title: note.title,
        body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        priority: this._mapPriorityToBW(note.priority),
        source: 'ACCUDEFEND',
        partnerId: this.partnerId,
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/notes`,
        bwNote
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
   * Push a guest flag / alert to Best Western.
   * @param {string} guestId - Best Western guest profile ID.
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} BW-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const bwAlert = {
      alert: {
        type: 'CHARGEBACK_FLAG',
        severity: this._mapSeverityToBW(flagData.severity),
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        description: `CHARGEBACK ALERT: ${flagData.reason}` +
          (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
          (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        source: 'ACCUDEFEND',
        partnerId: this.partnerId,
        propertyCode: this.propertyCode,
        guestVisible: false,
        frontDeskNotification: flagData.severity === 'critical' || flagData.severity === 'high',
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/alerts`,
        bwAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      frontDeskNotified: flagData.severity === 'critical' || flagData.severity === 'high',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation in Best Western.
   * @param {string} reservationId - Best Western reservation ID.
   * @param {Object} alertData
   * @param {string} alertData.caseNumber
   * @param {number} alertData.amount
   * @param {string} alertData.reasonCode
   * @param {string} alertData.disputeDate
   * @param {string} alertData.status
   * @returns {Promise<Object>}
   */
  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    const bwComment = {
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
        partnerId: this.partnerId,
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        bwComment
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
   * Push a dispute outcome notification to Best Western.
   * @param {string} reservationId - Best Western reservation ID.
   * @param {Object} outcomeData
   * @param {string} outcomeData.caseNumber
   * @param {string} outcomeData.outcome  - WON | LOST
   * @param {number} outcomeData.amount
   * @param {string} outcomeData.resolvedDate
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const bwComment = {
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
        partnerId: this.partnerId,
        propertyCode: this.propertyCode,
        guestVisible: false,
        createdAt: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/properties/${this.propertyCode}/reservations/${reservationId}/comments`,
        bwComment
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
   * Register a webhook callback URL with Best Western.
   * @param {Object} config - Webhook configuration.
   * @param {string} config.callbackUrl - Our endpoint URL.
   * @param {string[]} config.events    - Event types to subscribe to.
   * @returns {Promise<Object>} Webhook registration details.
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = this.credentials.apiSecret || crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      subscription: {
        callbackUrl: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToBW(e)),
        secret,
        active: true,
        propertyCode: this.propertyCode,
        partnerId: this.partnerId,
        contentType: 'application/json',
        apiVersion: 'v1',
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
      webhookId: result?.subscriptionId || result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming Best Western webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapBWEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.eventTime || new Date().toISOString(),
      propertyCode: payload.propertyCode || this.propertyCode,
      brandCode: payload.brandCode || this.brandCode,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestProfileId || data.guestId,
        bwrNumber: data.rewardsMemberId || data.bwrNumber,
        ...data,
      },
      raw: payload,
    };
  }

  /**
   * Verify the HMAC signature on an incoming Best Western webhook.
   * Uses the API secret for signature verification.
   * @param {string|Buffer} rawPayload
   * @param {string} signature - Value of x-bw-webhook-signature header.
   * @param {string} secret
   * @returns {boolean}
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    const signingSecret = secret || this.credentials.apiSecret;
    if (!signingSecret) {
      logger.warn(`[PMS:${this.pmsType}] No webhook secret available for signature verification`);
      return false;
    }

    const body = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const expected = crypto
      .createHmac('sha256', signingSecret)
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
   * Normalize a raw Best Western reservation into the canonical shape.
   * Includes Best Western Rewards loyalty data.
   * @param {Object} pmsData - Raw Best Western reservation object.
   * @returns {Object} Normalized reservation.
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const roomStay = pmsData.roomStay || pmsData.stayDetails || {};
    const guest = pmsData.guest || pmsData.primaryGuest || pmsData.guestInfo || {};
    const payment = pmsData.payment || pmsData.paymentInfo || pmsData.paymentMethods?.[0] || {};
    const rewards = pmsData.rewardsInfo || pmsData.loyalty || guest.rewardsInfo || {};
    const ratePlan = roomStay.ratePlan || roomStay.ratePlans?.[0] || {};
    const roomType = roomStay.roomType || roomStay.roomTypes?.[0] || {};

    const confirmationNumber =
      pmsData.confirmationNumber ||
      pmsData.bwConfirmation ||
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
      pmsReservationId: pmsData.reservationId || pmsData.bwReservationId || confirmationNumber,
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
      // Best Western-specific fields
      loyaltyNumber: rewards.bwrNumber || rewards.membershipId || pmsData.bwrNumber || '',
      loyaltyTier: BWR_TIER_MAP[rewards.tierCode] || rewards.tierName || rewards.memberLevel || '',
      brandCode: pmsData.brandCode || this.brandCode,
      brandName: BW_BRAND_CODES[pmsData.brandCode || this.brandCode] || '',
      propertyPmsType: pmsData.underlyingPms || 'UNKNOWN',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw Best Western folio items into canonical shape.
   * @param {Object} pmsData - Raw Best Western folio response.
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
   * Normalize a raw Best Western guest profile into canonical shape.
   * Includes Best Western Rewards loyalty data and stay history.
   * @param {Object} pmsData - Raw Best Western guest profile response.
   * @returns {Object} Normalized guest profile.
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guestProfile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.guestName || {};
    const addresses = profile.addresses || [];
    const emails = profile.emails || [];
    const phones = profile.phones || [];
    const rewards = profile.rewardsInfo || profile.loyalty || {};
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
      // Best Western Rewards loyalty data
      loyaltyNumber: rewards.bwrNumber || rewards.membershipId || profile.bwrNumber || '',
      loyaltyLevel: BWR_TIER_MAP[rewards.tierCode] || rewards.tierName || '',
      loyaltyPoints: rewards.pointsBalance || rewards.availablePoints || 0,
      loyaltyLifetimeNights: rewards.lifetimeNights || 0,
      loyaltyYearNights: rewards.qualifyingNightsThisYear || rewards.currentYearNights || 0,
      rewardsEliteBenefits: rewards.eliteBenefits || [],
      nationality: profile.nationality || profile.countryOfResidence || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.birthDate || profile.dateOfBirth),
      companyName: profile.company?.name || profile.companyName || '',
      totalStays: profile.stayHistory?.totalStays || profile.totalVisits || 0,
      totalRevenue: normalizeAmount(profile.stayHistory?.totalRevenue || profile.lifetimeRevenue),
      lastStayDate: normalizeDate(profile.stayHistory?.lastStayDate || profile.lastVisitDate),
      roomPreferences: profile.roomPreferences || [],
      createdAt: normalizeDate(profile.createDateTime || profile.createdAt),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw Best Western rate data into canonical shape.
   * @param {Object} pmsData - Raw Best Western rate response.
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
      isBWRRate: rate.rewardsExclusive === true || rate.loyaltyRate === true,
      bwrPointsRequired: rate.pointsRequired || rate.rewardsPoints || 0,
      bwrTierRequired: BWR_TIER_MAP[rate.requiredTier] || rate.minimumTier || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Best Western API is reachable and API key is valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

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
          brandName: BW_BRAND_CODES[this.brandCode] || 'Unknown',
          apiVersion: response.headers?.['x-bw-api-version'] || 'v1',
          authMethod: 'API_KEY',
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
          authMethod: 'API_KEY',
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

  /** Map canonical priority to BW priority levels. */
  _mapPriorityToBW(priority) {
    const map = { low: 'LOW', medium: 'NORMAL', high: 'HIGH', critical: 'URGENT' };
    return map[priority] || 'NORMAL';
  }

  /** Map canonical severity to BW severity levels. */
  _mapSeverityToBW(severity) {
    const map = { low: 'INFO', medium: 'WARNING', high: 'HIGH', critical: 'CRITICAL' };
    return map[severity] || 'WARNING';
  }

  /** Map canonical status to BW reservation status codes. */
  _mapStatusToBW(status) {
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

  /** Map canonical event names to BW webhook event types. */
  _mapEventToBW(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_MODIFIED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECKIN',
      'guest.checked_out': 'GUEST_CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
      'loyalty.updated': 'BWR_STATUS_CHANGE',
    };
    return map[event] || event;
  }

  /** Map BW event types back to canonical. */
  _mapBWEventToCanonical(bwEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_MODIFIED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECKIN: 'guest.checked_in',
      GUEST_CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
      BWR_STATUS_CHANGE: 'loyalty.updated',
    };
    return map[bwEvent] || bwEvent;
  }
}

module.exports = BestWesternAdapter;
