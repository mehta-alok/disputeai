/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Guesty PMS Adapter
 *
 * Integrates with the Guesty REST API (v2).
 *
 * Authentication: OAuth2 (client_credentials grant).
 *   - Obtains access token from /oauth2/token
 *   - Bearer token sent in Authorization header
 *   - Token auto-refreshes on expiry
 *
 * Guesty is a leading vacation rental management platform used by
 * property managers handling multiple listings across Airbnb, VRBO,
 * Booking.com, and direct bookings. It provides:
 *   - Multi-channel reservation management
 *   - Guest communication and CRM
 *   - Listing and property management
 *   - Revenue and financial management
 *   - Automated workflows and task management
 *   - Owner statements and reporting
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://open-api.guesty.com/v2/
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

const DEFAULT_BASE_URL = 'https://open-api.guesty.com/api/v2';
const TOKEN_URL = 'https://open-api.guesty.com/oauth2/token';

class GuestyAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId      - Guesty OAuth2 client ID.
   * @param {string} config.credentials.clientSecret   - Guesty OAuth2 client secret.
   * @param {string} [config.credentials.accountId]    - Guesty account / organization ID.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'GUESTY',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.accountId = this.credentials.accountId || this.propertyId;
    this.accessToken = null;
    this.tokenExpiresAt = null;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Guesty using OAuth2 client_credentials grant.
   * @returns {Promise<void>}
   */
  async authenticate() {
    try {
      this._buildHttpClient({}, { timeout: 15000 });

      const response = await this.httpClient.post(TOKEN_URL, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'open-api',
      });

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

      this._buildAuthenticatedClient();

      logger.info(
        `[PMS:${this.pmsType}] Authenticated via OAuth2. Account: ${this.accountId}`
      );
    } catch (error) {
      this._logApiError('POST', TOKEN_URL, error);
      throw new Error(`Guesty authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh an expired access token by re-authenticating.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    try {
      const response = await this.httpClient.post(TOKEN_URL, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'open-api',
      });

      const tokenData = response.data;
      this.accessToken = tokenData.access_token;
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;

      this.httpClient.setHeader('Authorization', `Bearer ${this.accessToken}`);

      logger.info(`[PMS:${this.pmsType}] Token refreshed successfully.`);
    } catch (error) {
      this._logApiError('POST', TOKEN_URL + ' (refresh)', error);
      throw new Error(`Guesty token refresh failed: ${error.message}`);
    }
  }

  /** @private */
  _buildAuthenticatedClient() {
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 120, refillRate: 120, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  /** @private */
  _isTokenExpired() {
    return !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt - 300000;
  }

  /** @private */
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
   * Fetch a single reservation by confirmation code.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>} Normalized reservation object.
   */
  async getReservation(confirmationNumber) {
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(confirmationNumber)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${confirmationNumber}`, 200, durationMs);

    const reservation = result?.result || result?.data || result;
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

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationCode = params.confirmationNumber;
    if (params.guestName) queryParams['guest.fullName'] = params.guestName;
    if (params.checkInDate) queryParams.checkInFrom = params.checkInDate;
    if (params.checkOutDate) queryParams.checkOutTo = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLastFour = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToGuesty(params.status);
    queryParams.limit = params.limit || 50;
    queryParams.skip = params.offset || 0;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/reservations', { params: queryParams });
      return response.data;
    });

    this._logApiCall('GET', '/reservations', 200, durationMs);

    const reservations = result?.results || result?.data || [];
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/financials`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/financials`, 200, durationMs);

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
        `/guests/${encodeURIComponent(guestId)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/guests/${guestId}`, 200, durationMs);

    const guest = result?.result || result?.data || result;
    if (!guest || Object.keys(guest).length === 0) return null;

    return this.normalizeGuestProfile(guest);
  }

  /**
   * Fetch rate/pricing information for listings.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/listings', {
        params: { fields: 'prices,terms', ...params },
      });
      return response.data;
    });

    this._logApiCall('GET', '/listings (rates)', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest (via reservation notes in Guesty).
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
          body: note.content,
          priority: note.priority || 'medium',
          category: note.category || 'chargeback',
          source: 'AccuDefend',
          isInternal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?._id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert to Guesty via guest tags and notes.
   * @param {string} guestId
   * @param {Object} flagData
   * @returns {Promise<Object>}
   */
  async pushFlag(guestId, flagData) {
    await this._ensureValidToken();

    // Guesty uses tags for guest flagging
    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.put(
        `/guests/${encodeURIComponent(guestId)}`,
        {
          tags: ['AccuDefend-Flag', `severity-${flagData.severity || 'high'}`, 'chargeback-risk'],
          notes: {
            title: `AccuDefend Flag: ${flagData.reason}`,
            body: [
              `Severity: ${flagData.severity || 'high'}`,
              `Reason: ${flagData.reason}`,
              flagData.chargebackId ? `Chargeback ID: ${flagData.chargebackId}` : '',
              flagData.amount ? `Amount: $${flagData.amount}` : '',
              'Source: AccuDefend Chargeback Defense',
            ].filter(Boolean).join('\n'),
          },
        }
      );
      return response.data;
    });

    this._logApiCall('PUT', `/guests/${guestId} (flag)`, 200, durationMs);

    return {
      success: true,
      flagId: result?._id || result?.id || guestId,
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
          isInternal: true,
          category: 'chargeback_alert',
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback)`, 201, durationMs);

    return {
      success: true,
      noteId: result?._id || result?.id || result?.data?.id,
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
          isInternal: true,
          category: 'dispute_outcome',
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute)`, 201, durationMs);

    return {
      success: true,
      noteId: result?._id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with Guesty.
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
        url: config.callbackUrl,
        events: (config.events || []).map(e => this._mapEventToGuesty(e)),
        secret,
        active: true,
        description: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?._id || result?.id || result?.data?.id,
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

    const eventType = payload.event || payload.eventType;
    const data = payload.data || payload.reservation || payload.guest || {};

    return {
      eventType: this._mapGuestyEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
      data: {
        reservationId: data._id || data.reservationId || data.confirmationCode,
        guestId: data.guestId || data.guest?._id,
        listingId: data.listingId || data.listing?._id,
        accountId: data.accountId || this.accountId,
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

      // Use listings endpoint as a health check
      const response = await this.httpClient.get('/listings', {
        params: { limit: 1, fields: '_id,title' },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          accountId: this.accountId,
          apiVersion: 'v2',
          listingCount: response.data?.count || response.data?.results?.length || 0,
          tokenExpiresIn: Math.max(0, Math.floor((this.tokenExpiresAt - Date.now()) / 1000)),
          features: {
            realTimeSync: true,
            multiChannel: true,
            guestTags: true,
            financials: true,
            automations: true,
            oAuth2: true,
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
          accountId: this.accountId,
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
        pmsData.confirmationCode || pmsData.confirmation_code || pmsData._id || ''
      ),
      pmsReservationId: String(pmsData._id || pmsData.id || ''),
      status: normalizeReservationStatus(pmsData.status),
      guestProfileId: String(guest._id || guest.id || pmsData.guestId || ''),
      guestName: normalizeGuestName({
        firstName: guest.firstName || guest.first_name || '',
        lastName: guest.lastName || guest.last_name || '',
      }),
      email: guest.email || pmsData.guestEmail || '',
      phone: normalizePhone(guest.phone || guest.phones?.[0]),
      address: normalizeAddress({
        line1: guest.address?.street || guest.address?.full || '',
        line2: guest.address?.apt || '',
        city: guest.address?.city || '',
        state: guest.address?.state || '',
        postalCode: guest.address?.zipcode || guest.address?.zip || '',
        country: guest.address?.country || '',
      }),
      checkInDate: normalizeDate(pmsData.checkIn || pmsData.checkInDateLocalized),
      checkOutDate: normalizeDate(pmsData.checkOut || pmsData.checkOutDateLocalized),
      roomNumber: pmsData.listing?.nickname || pmsData.listingNickname || '',
      roomType: pmsData.listing?.propertyType || pmsData.propertyType || '',
      rateCode: pmsData.ratePlanId || '',
      ratePlanDescription: pmsData.ratePlanName || '',
      totalAmount: normalizeAmount(pmsData.money?.totalPaid || pmsData.totalPrice || pmsData.money?.fareAccommodation),
      currency: normalizeCurrency(pmsData.money?.currency || pmsData.currency),
      numberOfGuests: pmsData.guestsCount || (pmsData.guests?.adults || 0) + (pmsData.guests?.children || 0) || 1,
      numberOfNights: pmsData.nightsCount || this._calculateNights(
        pmsData.checkIn,
        pmsData.checkOut
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.money?.paymentMethod?.cardType || ''),
        cardLastFour: pmsData.money?.paymentMethod?.last4 || '',
        authCode: pmsData.money?.paymentMethod?.authCode || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.integration?.platform || '',
      createdAt: normalizeDate(pmsData.createdAt || pmsData.created),
      updatedAt: normalizeDate(pmsData.updatedAt || pmsData.updated),
      specialRequests: pmsData.guestNote || pmsData.specialRequests || '',
      loyaltyNumber: '',
      // Guesty-specific
      listingId: pmsData.listingId || pmsData.listing?._id || '',
      listingTitle: pmsData.listing?.title || pmsData.listingTitle || '',
      platform: pmsData.source || pmsData.integration?.platform || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const financials = pmsData?.financials || pmsData?.data || pmsData;
    const items = financials?.invoiceItems || financials?.items || financials?.charges || [];

    if (Array.isArray(financials) && !items.length) {
      return financials.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.invoiceId || item.invoice_id || '',
      transactionId: String(item._id || item.id || item.transactionId || ''),
      transactionCode: item.type || item.code || '',
      category: normalizeFolioCategory(
        item.type || item.category || item.title || item.description
      ),
      description: item.title || item.description || item.name || '',
      amount: normalizeAmount(item.amount || item.total),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.createdAt || item.date || item.postedDate),
      cardLastFour: item.cardLast4 || item.last4 || '',
      authCode: item.authCode || '',
      reference: item.reference || item.transactionRef || '',
      reversalFlag: item.isRefund === true || item.type === 'refund' || item.voided === true,
      quantity: item.quantity || 1,
      postedBy: item.createdBy || item.user || '',
      department: item.department || item.category || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData._id || pmsData.id || ''),
      name: normalizeGuestName({
        firstName: pmsData.firstName || pmsData.first_name || '',
        lastName: pmsData.lastName || pmsData.last_name || '',
      }),
      email: pmsData.email || pmsData.emails?.[0] || '',
      phone: normalizePhone(pmsData.phone || pmsData.phones?.[0]),
      address: normalizeAddress({
        line1: pmsData.address?.street || pmsData.address?.full || '',
        line2: pmsData.address?.apt || '',
        city: pmsData.address?.city || '',
        state: pmsData.address?.state || '',
        postalCode: pmsData.address?.zipcode || '',
        country: pmsData.address?.country || '',
      }),
      vipCode: pmsData.vip ? 'VIP' : '',
      loyaltyNumber: '',
      loyaltyLevel: '',
      nationality: pmsData.nationality || pmsData.address?.country || '',
      language: pmsData.language || pmsData.preferredLanguage || '',
      dateOfBirth: normalizeDate(pmsData.dateOfBirth),
      companyName: pmsData.company || '',
      totalStays: pmsData.totalStays || pmsData.reservationsCount || 0,
      totalRevenue: normalizeAmount(pmsData.totalRevenue || pmsData.lifetimeValue || 0),
      lastStayDate: normalizeDate(pmsData.lastStay || pmsData.lastReservation?.checkOut),
      tags: pmsData.tags || [],
      createdAt: normalizeDate(pmsData.createdAt),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const listings = pmsData?.results || pmsData?.data || pmsData;
    if (!Array.isArray(listings)) return [];

    return listings.map(listing => ({
      rateCode: String(listing._id || listing.id || ''),
      name: listing.title || listing.nickname || '',
      description: listing.publicDescription?.summary || listing.description || '',
      category: listing.propertyType || listing.type || '',
      baseAmount: normalizeAmount(listing.prices?.basePrice || listing.prices?.default || 0),
      currency: normalizeCurrency(listing.prices?.currency),
      startDate: null,
      endDate: null,
      isActive: listing.active !== false && listing.isListed !== false,
      roomTypes: [listing.propertyType || listing.type || ''],
      inclusions: [],
      cancellationPolicy: listing.terms?.cancellation || '',
      minNights: listing.terms?.minNights || listing.prices?.minNights || 0,
      maxNights: listing.terms?.maxNights || 0,
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
  _mapStatusToGuesty(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checked_in',
      checked_out: 'checked_out',
      cancelled: 'canceled',
      no_show: 'no_show',
      pending: 'inquiry',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToGuesty(event) {
    const map = {
      'reservation.created': 'reservation.new',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'reservation.checked_in',
      'guest.checked_out': 'reservation.checked_out',
      'payment.received': 'payment.received',
      'folio.updated': 'invoice.updated',
    };
    return map[event] || event;
  }

  /** @private */
  _mapGuestyEventToCanonical(guestyEvent) {
    const map = {
      'reservation.new': 'reservation.created',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'reservation.checked_in': 'guest.checked_in',
      'reservation.checked_out': 'guest.checked_out',
      'payment.received': 'payment.received',
      'invoice.updated': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
    };
    return map[guestyEvent] || guestyEvent;
  }
}

module.exports = GuestyAdapter;
