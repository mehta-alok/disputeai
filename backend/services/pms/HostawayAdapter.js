/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Hostaway PMS Adapter
 *
 * Integrates with the Hostaway REST API (v1).
 *
 * Authentication: API Key sent via Authorization header as Bearer token.
 *
 * Hostaway is a vacation rental management platform used by property
 * managers for short-term rental operations. It provides:
 *   - Multi-channel distribution (Airbnb, VRBO, Booking.com, etc.)
 *   - Reservation management and calendar sync
 *   - Guest communication automation
 *   - Financial reporting and owner statements
 *   - Dynamic pricing integration
 *   - Task and operations management
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://api.hostaway.com/documentation/v1/
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

const DEFAULT_BASE_URL = 'https://api.hostaway.com/api/v1';

class HostawayAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Hostaway API key (used as Bearer token).
   * @param {string} [config.credentials.accountId]  - Hostaway account ID.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'HOSTAWAY',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.accountId = this.credentials.accountId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Hostaway by validating the API key.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/me');

      const data = response.data;
      if (data?.result || data?.status === 'success' || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Account: ${this.accountId}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/me', error);
      throw new Error(`Hostaway authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 100, refillRate: 100, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by ID or confirmation code.
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
    this._ensureAuthenticated();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.hostawayReservationId = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalStartDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureEndDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLastFour = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToHostaway(params.status);
    queryParams.limit = params.limit || 50;
    queryParams.offset = params.offset || 0;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/reservations', { params: queryParams });
      return response.data;
    });

    this._logApiCall('GET', '/reservations', 200, durationMs);

    const reservations = result?.result || result?.data || [];
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
    this._ensureAuthenticated();

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
   * Fetch listing/pricing information.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/listings', {
        params: { ...params },
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
   * Push a textual note to a guest/reservation.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          title: note.title,
          body: note.content,
          priority: note.priority || 'medium',
          type: note.category || 'chargeback',
          source: 'AccuDefend',
          isInternal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.result?.id || result?.id || result?.data?.id,
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
          flagType: 'chargeback_risk',
          source: 'AccuDefend',
          chargebackId: flagData.chargebackId || null,
          amount: flagData.amount || null,
          isActive: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/flags`, 201, durationMs);

    return {
      success: true,
      flagId: result?.result?.id || result?.id || result?.data?.id,
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
          body: [
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
          isInternal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.result?.id || result?.id || result?.data?.id,
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
          body: [
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
          isInternal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.result?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with Hostaway.
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
        events: (config.events || []).map(e => this._mapEventToHostaway(e)),
        secret,
        isActive: true,
        name: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?.result?.id || result?.id || result?.data?.id,
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

    const eventType = payload.event || payload.eventType || payload.type;
    const data = payload.data || payload.reservation || {};

    return {
      eventType: this._mapHostawayEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
      data: {
        reservationId: data.id || data.hostawayReservationId || data.reservationId,
        guestId: data.guestId || data.guest?.id,
        listingId: data.listingMapId || data.listingId,
        channelId: data.channelId || data.source,
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

      const response = await this.httpClient.get('/me');

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          accountId: this.accountId,
          apiVersion: 'v1',
          accountName: response.data?.result?.name || '',
          features: {
            realTimeSync: true,
            multiChannel: true,
            guestFlags: true,
            financials: true,
            dynamicPricing: true,
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

    return {
      confirmationNumber: String(
        pmsData.hostawayReservationId || pmsData.channelReservationId || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.hostawayReservationId || ''),
      status: normalizeReservationStatus(pmsData.status),
      guestProfileId: String(pmsData.guestId || pmsData.guest?.id || ''),
      guestName: normalizeGuestName({
        firstName: pmsData.guestFirstName || pmsData.guest?.firstName || '',
        lastName: pmsData.guestLastName || pmsData.guest?.lastName || '',
      }),
      email: pmsData.guestEmail || pmsData.guest?.email || '',
      phone: normalizePhone(pmsData.guestPhone || pmsData.guest?.phone),
      address: normalizeAddress({
        line1: pmsData.guestAddress || pmsData.guest?.address || '',
        line2: '',
        city: pmsData.guestCity || pmsData.guest?.city || '',
        state: pmsData.guestState || pmsData.guest?.state || '',
        postalCode: pmsData.guestZipCode || pmsData.guest?.zipCode || '',
        country: pmsData.guestCountry || pmsData.guest?.country || '',
      }),
      checkInDate: normalizeDate(pmsData.arrivalDate || pmsData.checkInDate),
      checkOutDate: normalizeDate(pmsData.departureDate || pmsData.checkOutDate),
      roomNumber: pmsData.listingName || pmsData.listingMapId?.toString() || '',
      roomType: pmsData.listingType || pmsData.propertyType || '',
      rateCode: '',
      ratePlanDescription: '',
      totalAmount: normalizeAmount(pmsData.totalPrice || pmsData.hostPayout),
      currency: normalizeCurrency(pmsData.currency || pmsData.listingCurrency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.guestsCount || 1,
      numberOfNights: pmsData.nights || this._calculateNights(
        pmsData.arrivalDate,
        pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.paymentMethod || ''),
        cardLastFour: pmsData.cardLastFour || '',
        authCode: pmsData.authorizationCode || '',
      },
      bookingSource: pmsData.channelName || pmsData.source || '',
      createdAt: normalizeDate(pmsData.insertedOn || pmsData.createdAt),
      updatedAt: normalizeDate(pmsData.updatedOn || pmsData.updatedAt),
      specialRequests: pmsData.guestNote || pmsData.specialRequests || pmsData.comment || '',
      loyaltyNumber: '',
      // Hostaway-specific
      listingMapId: pmsData.listingMapId || '',
      channelReservationId: pmsData.channelReservationId || '',
      channelName: pmsData.channelName || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const financials = pmsData?.result || pmsData?.data || pmsData;
    const items = financials?.items || financials?.charges || financials?.transactions || [];

    if (Array.isArray(financials) && !items.length) {
      return financials.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.invoiceId || item.folioId || '',
      transactionId: String(item.id || item.transactionId || ''),
      transactionCode: item.type || item.code || '',
      category: normalizeFolioCategory(
        item.type || item.category || item.description
      ),
      description: item.description || item.title || item.name || '',
      amount: normalizeAmount(item.amount || item.total),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.date || item.createdAt || item.postedDate),
      cardLastFour: item.cardLastFour || item.last4 || '',
      authCode: item.authCode || '',
      reference: item.reference || item.transactionRef || '',
      reversalFlag: item.isRefund === true || item.type === 'refund' || item.voided === true,
      quantity: item.quantity || 1,
      postedBy: item.createdBy || item.user || '',
      department: item.department || '',
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guestId || ''),
      name: normalizeGuestName({
        firstName: pmsData.firstName || pmsData.first_name || '',
        lastName: pmsData.lastName || pmsData.last_name || '',
      }),
      email: pmsData.email || '',
      phone: normalizePhone(pmsData.phone || pmsData.phoneNumber),
      address: normalizeAddress({
        line1: pmsData.address || pmsData.street || '',
        line2: '',
        city: pmsData.city || '',
        state: pmsData.state || '',
        postalCode: pmsData.zipCode || pmsData.postalCode || '',
        country: pmsData.country || pmsData.countryCode || '',
      }),
      vipCode: '',
      loyaltyNumber: '',
      loyaltyLevel: '',
      nationality: pmsData.country || pmsData.nationality || '',
      language: pmsData.language || '',
      dateOfBirth: normalizeDate(pmsData.dateOfBirth),
      companyName: pmsData.company || '',
      totalStays: pmsData.reservationCount || pmsData.totalStays || 0,
      totalRevenue: normalizeAmount(pmsData.totalRevenue || pmsData.lifetimeSpend || 0),
      lastStayDate: normalizeDate(pmsData.lastDepartureDate || pmsData.lastStay),
      createdAt: normalizeDate(pmsData.insertedOn || pmsData.createdAt),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const listings = pmsData?.result || pmsData?.data || pmsData;
    if (!Array.isArray(listings)) return [];

    return listings.map(listing => ({
      rateCode: String(listing.id || listing.listingMapId || ''),
      name: listing.name || listing.internalName || '',
      description: listing.description || listing.publicDescription || '',
      category: listing.propertyType || listing.type || '',
      baseAmount: normalizeAmount(listing.basePrice || listing.price || 0),
      currency: normalizeCurrency(listing.currency || listing.currencyCode),
      startDate: null,
      endDate: null,
      isActive: listing.isActive !== false && listing.isListed !== false,
      roomTypes: [listing.propertyType || listing.type || ''],
      inclusions: [],
      cancellationPolicy: listing.cancellationPolicy || '',
      minNights: listing.minNights || listing.minimumStay || 0,
      maxNights: listing.maxNights || listing.maximumStay || 0,
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
  _mapStatusToHostaway(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'checkedIn',
      checked_out: 'checkedOut',
      cancelled: 'cancelled',
      no_show: 'noShow',
      pending: 'inquiry',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToHostaway(event) {
    const map = {
      'reservation.created': 'reservationCreated',
      'reservation.updated': 'reservationUpdated',
      'reservation.cancelled': 'reservationCancelled',
      'guest.checked_in': 'reservationCheckedIn',
      'guest.checked_out': 'reservationCheckedOut',
      'payment.received': 'paymentReceived',
      'folio.updated': 'financialsUpdated',
    };
    return map[event] || event;
  }

  /** @private */
  _mapHostawayEventToCanonical(haEvent) {
    const map = {
      reservationCreated: 'reservation.created',
      reservationUpdated: 'reservation.updated',
      reservationCancelled: 'reservation.cancelled',
      reservationCheckedIn: 'guest.checked_in',
      reservationCheckedOut: 'guest.checked_out',
      paymentReceived: 'payment.received',
      financialsUpdated: 'folio.updated',
      guestCreated: 'guest.created',
    };
    return map[haEvent] || haEvent;
  }
}

module.exports = HostawayAdapter;
