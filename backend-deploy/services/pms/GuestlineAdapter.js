/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Guestline PMS Adapter
 *
 * Integrates with the Guestline REST API (v3).
 *
 * Authentication: OAuth2 (client_credentials grant).
 *   - Obtains access token from /connect/token
 *   - Bearer token sent in Authorization header
 *   - Token auto-refreshes on expiry
 *
 * Guestline is a UK-based hospitality PMS widely used across European
 * hotels, resorts, and pub groups. It provides:
 *   - Comprehensive reservation management
 *   - Guest CRM and profile management
 *   - Folio, billing, and payment processing (GBP / EUR centric)
 *   - Rate management with yield controls
 *   - Conference and events management
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.guestline.com/api/v3/
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

const DEFAULT_BASE_URL = 'https://api.guestline.com/api/v3';
const TOKEN_URL = 'https://identity.guestline.com/connect/token';

class GuestlineAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId      - OAuth2 client ID.
   * @param {string} config.credentials.clientSecret   - OAuth2 client secret.
   * @param {string} [config.credentials.siteId]       - Guestline site / property ID.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'GUESTLINE',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.siteId = this.credentials.siteId || this.propertyId;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.refreshToken = null;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Guestline using OAuth2 client_credentials grant.
   * @returns {Promise<void>}
   */
  async authenticate() {
    try {
      // Build a basic HTTP client for the token request
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

      // Rebuild with the Bearer token
      this._buildAuthenticatedClient();

      logger.info(
        `[PMS:${this.pmsType}] Authenticated via OAuth2. Site: ${this.siteId}`
      );
    } catch (error) {
      this._logApiError('POST', TOKEN_URL, error);
      throw new Error(`Guestline authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh an expired access token.
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

      this.httpClient.setHeader('Authorization', `Bearer ${this.accessToken}`);

      logger.info(`[PMS:${this.pmsType}] Token refreshed successfully.`);
    } catch (error) {
      this._logApiError('POST', TOKEN_URL + ' (refresh)', error);
      throw new Error(`Guestline token refresh failed: ${error.message}`);
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
      'X-Site-Id': this.siteId,
    };
  }

  /**
   * Check if the current token is expired or about to expire.
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
        `/reservations/${encodeURIComponent(confirmationNumber)}`,
        { params: { site_id: this.siteId } }
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
    await this._ensureValidToken();

    const queryParams = { site_id: this.siteId };
    if (params.confirmationNumber) queryParams.confirmation_number = params.confirmationNumber;
    if (params.guestName) queryParams.surname = params.guestName;
    if (params.checkInDate) queryParams.arrival_from = params.checkInDate;
    if (params.checkOutDate) queryParams.departure_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToGL(params.status);
    queryParams.page_size = params.limit || 50;
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/folios`,
        { params: { site_id: this.siteId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/folios`, 200, durationMs);

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
        { params: { site_id: this.siteId } }
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
        params: { site_id: this.siteId, ...params },
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          subject: note.title,
          body: note.content,
          priority: note.priority || 'medium',
          category: note.category || 'chargeback',
          source: 'AccuDefend',
          is_internal: true,
          site_id: this.siteId,
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
          site_id: this.siteId,
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
    await this._ensureValidToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
          body: [
            '=== CHARGEBACK ALERT ===',
            `Case #: ${alertData.caseNumber}`,
            `Amount: ${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: 'high',
          category: 'chargeback_alert',
          source: 'AccuDefend',
          is_internal: true,
          site_id: this.siteId,
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
    await this._ensureValidToken();

    const won = outcomeData.outcome === 'WON';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
          body: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: ${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: won ? 'medium' : 'high',
          category: 'dispute_outcome',
          source: 'AccuDefend',
          is_internal: true,
          site_id: this.siteId,
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
   * Register a webhook callback URL with Guestline.
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
        endpoint_url: config.callbackUrl,
        event_types: (config.events || []).map(e => this._mapEventToGL(e)),
        signing_secret: secret,
        site_id: this.siteId,
        enabled: true,
        description: 'AccuDefend Chargeback Defense Integration',
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

    const eventType = payload.EventType || payload.event_type || payload.event;
    const data = payload.Data || payload.data || {};

    return {
      eventType: this._mapGLEventToCanonical(eventType),
      timestamp: payload.Timestamp || payload.timestamp || new Date().toISOString(),
      data: {
        reservationId: data.ReservationId || data.reservation_id || data.ConfirmationNumber,
        guestId: data.GuestId || data.guest_id,
        siteId: data.SiteId || data.site_id || this.siteId,
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

      const response = await this.httpClient.get('/sites/current', {
        params: { site_id: this.siteId },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          siteId: this.siteId,
          apiVersion: 'v3',
          siteName: response.data?.site?.name || response.data?.property?.name || '',
          tokenExpiresIn: Math.max(0, Math.floor((this.tokenExpiresAt - Date.now()) / 1000)),
          features: {
            realTimeSync: true,
            guestAlerts: true,
            folioAccess: true,
            rateManagement: true,
            conferenceEvents: true,
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
          siteId: this.siteId,
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

    const guest = pmsData.Guest || pmsData.guest || pmsData.PrimaryGuest || {};

    return {
      confirmationNumber: String(
        pmsData.ConfirmationNumber || pmsData.confirmation_number || pmsData.BookingRef || pmsData.Id || ''
      ),
      pmsReservationId: String(pmsData.Id || pmsData.id || pmsData.ReservationId || ''),
      status: normalizeReservationStatus(pmsData.Status || pmsData.status || pmsData.BookingStatus),
      guestProfileId: String(guest.Id || guest.id || guest.GuestId || pmsData.GuestId || ''),
      guestName: normalizeGuestName({
        firstName: guest.FirstName || guest.first_name || guest.Forename || '',
        lastName: guest.LastName || guest.last_name || guest.Surname || '',
      }),
      email: guest.Email || guest.email || pmsData.GuestEmail || '',
      phone: normalizePhone(guest.Phone || guest.phone || guest.Telephone || guest.Mobile),
      address: normalizeAddress({
        line1: guest.AddressLine1 || guest.address_line_1 || guest.Street || '',
        line2: guest.AddressLine2 || guest.address_line_2 || '',
        city: guest.City || guest.city || guest.Town || '',
        state: guest.County || guest.state || guest.Region || '',
        postalCode: guest.PostCode || guest.postal_code || guest.Postcode || '',
        country: guest.Country || guest.country || guest.CountryCode || '',
      }),
      checkInDate: normalizeDate(pmsData.ArrivalDate || pmsData.arrival_date || pmsData.CheckIn),
      checkOutDate: normalizeDate(pmsData.DepartureDate || pmsData.departure_date || pmsData.CheckOut),
      roomNumber: pmsData.RoomNumber || pmsData.room_number || '',
      roomType: pmsData.RoomType || pmsData.room_type || pmsData.RoomTypeName || '',
      rateCode: pmsData.RatePlanId || pmsData.rate_plan_id || pmsData.RateCode || '',
      ratePlanDescription: pmsData.RatePlanName || pmsData.rate_plan_name || '',
      totalAmount: normalizeAmount(pmsData.TotalAmount || pmsData.total_amount || pmsData.GrandTotal),
      currency: normalizeCurrency(pmsData.Currency || pmsData.currency || 'GBP'),
      numberOfGuests: (pmsData.Adults || 0) + (pmsData.Children || 0) || pmsData.Occupancy || 1,
      numberOfNights: this._calculateNights(
        pmsData.ArrivalDate || pmsData.arrival_date,
        pmsData.DepartureDate || pmsData.departure_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.CardType || pmsData.card_type || pmsData.PaymentMethod || ''),
        cardLastFour: pmsData.CardLastFour || pmsData.card_last_four || '',
        authCode: pmsData.AuthCode || pmsData.auth_code || '',
      },
      bookingSource: pmsData.Source || pmsData.source || pmsData.Channel || pmsData.BookingChannel || '',
      createdAt: normalizeDate(pmsData.CreatedAt || pmsData.created_at || pmsData.BookedDate),
      updatedAt: normalizeDate(pmsData.UpdatedAt || pmsData.updated_at || pmsData.ModifiedDate),
      specialRequests: pmsData.SpecialRequests || pmsData.special_requests || pmsData.GuestNotes || '',
      loyaltyNumber: pmsData.LoyaltyNumber || pmsData.loyalty_number || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const folio = pmsData?.Folio || pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.Items || folio?.items || folio?.Charges || folio?.charges || [];

    if (Array.isArray(folio) && !items.length) {
      return folio.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.FolioId || item.folio_id || item.InvoiceId || '',
      transactionId: String(item.Id || item.id || item.TransactionId || ''),
      transactionCode: item.ChargeCode || item.charge_code || item.TransactionCode || '',
      category: normalizeFolioCategory(
        item.Category || item.category || item.ChargeType || item.Description
      ),
      description: item.Description || item.description || item.ChargeName || '',
      amount: normalizeAmount(item.Amount || item.amount || item.ChargeAmount),
      currency: normalizeCurrency(item.Currency || item.currency || 'GBP'),
      postDate: normalizeDate(item.PostedDate || item.posted_date || item.ChargeDate),
      cardLastFour: item.CardLastFour || item.card_last_four || '',
      authCode: item.AuthCode || item.auth_code || '',
      reference: item.Reference || item.reference || item.ReceiptNumber || '',
      reversalFlag: item.IsVoid === true || item.Reversed === true || item.voided === true,
      quantity: item.Quantity || item.quantity || 1,
      postedBy: item.PostedBy || item.posted_by || item.UserName || '',
      department: item.Department || item.department || item.RevenueGroup || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.Id || pmsData.id || pmsData.GuestId || ''),
      name: normalizeGuestName({
        firstName: pmsData.FirstName || pmsData.first_name || pmsData.Forename || '',
        lastName: pmsData.LastName || pmsData.last_name || pmsData.Surname || '',
      }),
      email: pmsData.Email || pmsData.email || '',
      phone: normalizePhone(pmsData.Phone || pmsData.phone || pmsData.Telephone || pmsData.Mobile),
      address: normalizeAddress({
        line1: pmsData.AddressLine1 || pmsData.address_line_1 || pmsData.Street || '',
        line2: pmsData.AddressLine2 || pmsData.address_line_2 || '',
        city: pmsData.City || pmsData.city || pmsData.Town || '',
        state: pmsData.County || pmsData.state || pmsData.Region || '',
        postalCode: pmsData.PostCode || pmsData.postal_code || pmsData.Postcode || '',
        country: pmsData.Country || pmsData.country || pmsData.CountryCode || '',
      }),
      vipCode: pmsData.VipStatus || pmsData.vip_status || pmsData.GuestType || '',
      loyaltyNumber: pmsData.LoyaltyNumber || pmsData.loyalty_number || '',
      loyaltyLevel: pmsData.LoyaltyTier || pmsData.loyalty_tier || '',
      nationality: pmsData.Nationality || pmsData.nationality || '',
      language: pmsData.Language || pmsData.language || pmsData.PreferredLanguage || '',
      dateOfBirth: normalizeDate(pmsData.DateOfBirth || pmsData.date_of_birth),
      companyName: pmsData.Company || pmsData.company || pmsData.CompanyName || '',
      totalStays: pmsData.TotalStays || pmsData.total_stays || pmsData.VisitCount || 0,
      totalRevenue: normalizeAmount(pmsData.TotalRevenue || pmsData.total_revenue || pmsData.LifetimeValue || 0),
      lastStayDate: normalizeDate(pmsData.LastStayDate || pmsData.last_stay_date || pmsData.LastDeparture),
      createdAt: normalizeDate(pmsData.CreatedAt || pmsData.created_at),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const rates = pmsData?.Rates || pmsData?.rates || pmsData?.RatePlans || pmsData?.data || pmsData;
    if (!Array.isArray(rates)) return [];

    return rates.map(rate => ({
      rateCode: String(rate.Id || rate.id || rate.RatePlanId || rate.Code || ''),
      name: rate.Name || rate.name || rate.RateName || '',
      description: rate.Description || rate.description || '',
      category: rate.Category || rate.category || rate.RateType || '',
      baseAmount: normalizeAmount(rate.BaseRate || rate.base_rate || rate.Amount || rate.DefaultRate),
      currency: normalizeCurrency(rate.Currency || rate.currency || 'GBP'),
      startDate: normalizeDate(rate.StartDate || rate.start_date || rate.ValidFrom),
      endDate: normalizeDate(rate.EndDate || rate.end_date || rate.ValidTo),
      isActive: rate.Active !== false && rate.Status !== 'Inactive' && rate.IsActive !== false,
      roomTypes: rate.RoomTypes || rate.room_types || [],
      inclusions: rate.Inclusions || rate.inclusions || rate.Packages || [],
      cancellationPolicy: rate.CancellationPolicy || rate.cancellation_policy || '',
      minNights: rate.MinNights || rate.min_nights || rate.MinimumStay || 0,
      maxNights: rate.MaxNights || rate.max_nights || rate.MaximumStay || 0,
      commissionable: rate.Commissionable === true || rate.commissionable === true,
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
  _mapStatusToGL(status) {
    const map = {
      confirmed: 'Confirmed',
      checked_in: 'InHouse',
      checked_out: 'Departed',
      cancelled: 'Cancelled',
      no_show: 'NoShow',
      pending: 'Provisional',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToGL(event) {
    const map = {
      'reservation.created': 'Reservation.Created',
      'reservation.updated': 'Reservation.Updated',
      'reservation.cancelled': 'Reservation.Cancelled',
      'guest.checked_in': 'Guest.CheckedIn',
      'guest.checked_out': 'Guest.CheckedOut',
      'payment.received': 'Payment.Received',
      'folio.updated': 'Folio.Updated',
    };
    return map[event] || event;
  }

  /** @private */
  _mapGLEventToCanonical(glEvent) {
    const map = {
      'Reservation.Created': 'reservation.created',
      'Reservation.Updated': 'reservation.updated',
      'Reservation.Cancelled': 'reservation.cancelled',
      'Guest.CheckedIn': 'guest.checked_in',
      'Guest.CheckedOut': 'guest.checked_out',
      'Payment.Received': 'payment.received',
      'Folio.Updated': 'folio.updated',
      'Guest.Created': 'guest.created',
      'Guest.Updated': 'guest.updated',
    };
    return map[glEvent] || glEvent;
  }
}

module.exports = GuestlineAdapter;
