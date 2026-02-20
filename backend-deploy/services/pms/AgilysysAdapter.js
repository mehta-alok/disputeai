/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Agilysys LMS/Stay PMS Adapter
 *
 * Integrates with the Agilysys Stay PMS REST API for enterprise hotel
 * property management. Agilysys is widely used across large hotel chains,
 * resorts, and gaming properties.
 *
 * Authentication: API Key (sent via x-api-key header).
 *
 * Key API modules used:
 *   Reservations  - Booking lookup and search
 *   Guests        - Guest profile management
 *   Folios        - Folio and charge management
 *   Rates         - Rate plan retrieval
 *   Webhooks      - Event subscription management
 *
 * Reference: https://developer.agilysys.com/
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

// Default base URL for Agilysys Stay API
const DEFAULT_BASE_URL = 'https://api.agilysys.com/stay/v2';

class AgilysysAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Agilysys API key.
   * @param {string} [config.credentials.tenantId]   - Agilysys tenant/property code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'AGILYSYS',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.tenantId = this.credentials.tenantId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the Agilysys API using the API key.
   * Validates the key by making a test request.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    // Validate the API key with a lightweight call
    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v2/properties/current', {
        params: { tenantId: this.tenantId },
      });
      this._logApiCall('GET', '/api/v2/properties/current', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v2/properties/current', error);
      throw new Error(`Agilysys authentication failed: ${error.message}`);
    }
  }

  /**
   * API Key auth does not require token refresh, but the method is provided
   * for interface compliance. Rebuilds the HTTP client with current credentials.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Rebuilding HTTP client with current API key`);
    this._buildAuthenticatedClient();
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
      'x-api-key': this.credentials.apiKey,
      'x-tenant-id': this.tenantId,
    };
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
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: {
          confirmationNumber,
          tenantId: this.tenantId,
          limit: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations by multiple criteria.
   * @param {Object} params - Search parameters.
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { tenantId: this.tenantId };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToAgilysys(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/reservations', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/reservations', 200, durationMs);

    const reservations = result?.reservations || result?.data || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - PMS reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/folios/${reservationId}`,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/folios/${reservationId}`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID.
   * @param {string} guestId
   * @returns {Promise<Object>} Normalized guest profile.
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v2/guests/${guestId}`,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v2/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plan information.
   * @param {Object} params - Filter parameters.
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v2/rates', {
        params: { ...params, tenantId: this.tenantId },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v2/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile in the PMS.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>} PMS-assigned note reference.
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const agilysysNote = {
      guestId,
      noteType: note.category || 'GENERAL',
      subject: note.title,
      body: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: (note.priority || 'medium').toUpperCase(),
      internal: true,
      createdBy: 'AccuDefend',
      createdDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/notes`,
        agilysysNote,
        { params: { tenantId: this.tenantId } }
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
   * Push a guest flag/alert to the PMS.
   * @param {string} guestId
   * @param {Object} flagData
   * @returns {Promise<Object>} PMS-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const agilysysAlert = {
      guestId,
      alertType: 'CHARGEBACK',
      severity: (flagData.severity || 'HIGH').toUpperCase(),
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      active: true,
      createdBy: 'AccuDefend',
      createdDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/guests/${guestId}/alerts`,
        agilysysAlert,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
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

    const agilysysComment = {
      reservationId,
      noteType: 'ALERT',
      subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
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
      priority: 'HIGH',
      internal: true,
      createdBy: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/reservations/${reservationId}/notes`,
        agilysysComment,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
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
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const agilysysComment = {
      reservationId,
      noteType: won ? 'INFO' : 'ALERT',
      subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      body: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: won ? 'MEDIUM' : 'HIGH',
      internal: true,
      createdBy: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v2/reservations/${reservationId}/notes`,
        agilysysComment,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v2/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with the Agilysys PMS.
   * @param {Object} config - Webhook configuration.
   * @param {string} config.callbackUrl - The callback URL.
   * @param {string[]} config.events - Event types to subscribe to.
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      url: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToAgilysys(e)),
      secret,
      active: true,
      tenantId: this.tenantId,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        '/api/v2/webhooks',
        webhookPayload,
        { params: { tenantId: this.tenantId } }
      );
      return response.data;
    });

    this._logApiCall('POST', '/api/v2/webhooks', 201, durationMs);

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
   * Parse an incoming webhook payload into a normalized event.
   * @param {Object} headers - HTTP request headers.
   * @param {Object|string} body - Raw webhook payload.
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapAgilysysEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.occurredAt || new Date().toISOString(),
      hotelId: payload.tenantId || this.tenantId,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.guestId || data.profileId,
        ...data,
      },
      raw: payload,
    };
  }

  // =========================================================================
  //  Normalization
  // =========================================================================

  /**
   * Normalize a raw Agilysys reservation into the canonical shape.
   * @param {Object} pmsData
   * @returns {Object}
   */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const guest = pmsData.guest || pmsData.primaryGuest || {};
    const room = pmsData.room || pmsData.roomDetails || {};
    const rate = pmsData.ratePlan || pmsData.rate || {};
    const payment = pmsData.payment || pmsData.paymentMethod || {};

    return {
      confirmationNumber: String(pmsData.confirmationNumber || pmsData.confirmationId || ''),
      pmsReservationId: pmsData.reservationId || pmsData.id || pmsData.confirmationNumber || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.reservationStatus),
      guestProfileId: String(guest.guestId || guest.profileId || ''),
      guestName: normalizeGuestName({
        firstName: guest.firstName || guest.givenName || '',
        lastName: guest.lastName || guest.surname || '',
      }),
      email: guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone || guest.phoneNumber),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.arrivalDate || pmsData.checkInDate),
      checkOutDate: normalizeDate(pmsData.departureDate || pmsData.checkOutDate),
      roomNumber: room.roomNumber || room.number || pmsData.roomNumber || '',
      roomType: room.roomType || room.type || room.roomTypeCode || '',
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      ratePlanDescription: rate.ratePlanName || rate.description || '',
      totalAmount: normalizeAmount(pmsData.totalAmount || pmsData.totalCharges),
      currency: normalizeCurrency(pmsData.currencyCode || pmsData.currency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.guestCount || 1,
      numberOfNights: this._calculateNights(
        pmsData.arrivalDate || pmsData.checkInDate,
        pmsData.departureDate || pmsData.checkOutDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.brand),
        cardLastFour: payment.cardLastFour || payment.last4 || '',
        authCode: payment.authorizationCode || payment.authCode || '',
      },
      bookingSource: pmsData.source || pmsData.bookingChannel || '',
      createdAt: normalizeDate(pmsData.createdDate || pmsData.createDateTime),
      updatedAt: normalizeDate(pmsData.modifiedDate || pmsData.lastModifiedDateTime),
      specialRequests: pmsData.specialRequests || pmsData.comments || '',
      loyaltyNumber: pmsData.loyaltyNumber || pmsData.membershipId || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /**
   * Normalize raw Agilysys folio items.
   * @param {Object} pmsData
   * @returns {Object[]}
   */
  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.folioWindows || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const charges = folio.charges || folio.lineItems || folio.transactions || [];

      for (const charge of charges) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || folio.folioWindow || 1,
          transactionId: charge.transactionId || charge.id || '',
          transactionCode: charge.transactionCode || charge.chargeCode || '',
          category: normalizeFolioCategory(
            charge.category || charge.revenueGroup || charge.transactionCode
          ),
          description: charge.description || charge.itemDescription || '',
          amount: normalizeAmount(charge.amount || charge.netAmount),
          currency: normalizeCurrency(charge.currencyCode || charge.currency),
          postDate: normalizeDate(charge.postDate || charge.transactionDate),
          cardLastFour: charge.cardLastFour || charge.last4 || '',
          authCode: charge.authorizationCode || charge.authCode || '',
          reference: charge.reference || charge.receiptNumber || '',
          reversalFlag: charge.reversed === true || charge.isReversal === true,
          quantity: charge.quantity || 1,
        });
      }
    }

    return allItems;
  }

  /**
   * Normalize a raw Agilysys guest profile.
   * @param {Object} pmsData
   * @returns {Object}
   */
  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guest || pmsData?.profile || pmsData || {};
    const addresses = profile.addresses || [];
    const emails = profile.emails || [];
    const phones = profile.phones || [];
    const primaryAddress = Array.isArray(addresses) ? addresses[0] : addresses;
    const primaryEmail = Array.isArray(emails)
      ? emails.find(e => e.primary) || emails[0]
      : emails;
    const primaryPhone = Array.isArray(phones)
      ? phones.find(p => p.primary) || phones[0]
      : phones;

    return {
      guestId: profile.guestId || profile.id || '',
      name: normalizeGuestName({
        firstName: profile.firstName || profile.givenName || '',
        lastName: profile.lastName || profile.surname || '',
      }),
      email: primaryEmail?.email || primaryEmail?.address || (typeof primaryEmail === 'string' ? primaryEmail : ''),
      phone: normalizePhone(primaryPhone?.number || primaryPhone?.phoneNumber || primaryPhone),
      address: normalizeAddress(primaryAddress),
      vipCode: profile.vipCode || profile.vipStatus || '',
      loyaltyNumber: profile.loyaltyNumber || profile.membershipId || '',
      loyaltyLevel: profile.loyaltyLevel || profile.membershipTier || '',
      nationality: profile.nationality || profile.countryOfResidence || '',
      language: profile.preferredLanguage || profile.language || '',
      dateOfBirth: normalizeDate(profile.dateOfBirth || profile.birthDate),
      companyName: profile.companyName || profile.company || '',
      totalStays: profile.totalStays || profile.stayCount || 0,
      totalRevenue: normalizeAmount(profile.totalRevenue || profile.lifetimeValue),
      lastStayDate: normalizeDate(profile.lastStayDate || profile.lastVisit),
      createdAt: normalizeDate(profile.createdDate || profile.createDateTime),
      pmsRaw: sanitizePII(profile),
    };
  }

  /**
   * Normalize raw Agilysys rate data.
   * @param {Object} pmsData
   * @returns {Object[]}
   */
  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlans || pmsData?.rates || pmsData?.data || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rateCode || rate.ratePlanCode || '',
      name: rate.ratePlanName || rate.name || '',
      description: rate.description || rate.longDescription || '',
      category: rate.category || rate.rateCategory || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount || rate.baseRate),
      currency: normalizeCurrency(rate.currencyCode || rate.currency),
      startDate: normalizeDate(rate.startDate || rate.effectiveDate),
      endDate: normalizeDate(rate.endDate || rate.expirationDate),
      isActive: rate.active !== false && rate.status !== 'INACTIVE',
      roomTypes: rate.roomTypes || rate.applicableRoomTypes || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancellationPolicy || rate.cancelPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the Agilysys API is reachable and credentials are valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v2/properties/current', {
        params: { tenantId: this.tenantId },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          tenantId: this.tenantId,
          apiVersion: response.headers?.['x-api-version'] || 'v2',
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          tenantId: this.tenantId,
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

  /** Map canonical status to Agilysys reservation status codes. */
  _mapStatusToAgilysys(status) {
    const map = {
      confirmed: 'CONFIRMED',
      checked_in: 'CHECKED_IN',
      checked_out: 'CHECKED_OUT',
      cancelled: 'CANCELLED',
      no_show: 'NO_SHOW',
      pending: 'PENDING',
    };
    return map[status] || status;
  }

  /** Map canonical event names to Agilysys webhook event types. */
  _mapEventToAgilysys(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_MODIFIED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'GUEST_CHECK_IN',
      'guest.checked_out': 'GUEST_CHECK_OUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_CHARGE_POSTED',
    };
    return map[event] || event;
  }

  /** Map Agilysys event types back to canonical. */
  _mapAgilysysEventToCanonical(agilysysEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_MODIFIED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      GUEST_CHECK_IN: 'guest.checked_in',
      GUEST_CHECK_OUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_CHARGE_POSTED: 'folio.updated',
    };
    return map[agilysysEvent] || agilysysEvent;
  }
}

module.exports = AgilysysAdapter;
