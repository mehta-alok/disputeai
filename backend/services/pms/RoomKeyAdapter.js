/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * RoomKeyPMS Adapter
 *
 * Integrates with the RoomKeyPMS cloud-based hotel management REST API.
 * RoomKeyPMS is designed for independent and boutique hotels, offering
 * comprehensive reservation, guest, and billing management.
 *
 * Authentication: API Key (sent via X-RoomKey-ApiKey header).
 *
 * Key API modules used:
 *   Bookings   - Reservation management
 *   Guests     - Guest profile management
 *   Billing    - Folio and charge management
 *   Rates      - Rate plan queries
 *   Webhooks   - Event subscription management
 *
 * Reference: https://developer.roomkeypms.com/
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

const DEFAULT_BASE_URL = 'https://api.roomkeypms.com/v1';

class RoomKeyAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - RoomKeyPMS API key.
   * @param {string} [config.credentials.propertyCode] - RoomKeyPMS property identifier.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'ROOMKEY',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  async authenticate() {
    this._buildAuthenticatedClient();

    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v1/properties/current', {
        params: { propertyCode: this.propertyCode },
      });
      this._logApiCall('GET', '/api/v1/properties/current', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v1/properties/current', error);
      throw new Error(`RoomKeyPMS authentication failed: ${error.message}`);
    }
  }

  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Rebuilding HTTP client with current API key`);
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
      'X-RoomKey-ApiKey': this.credentials.apiKey,
      'X-Property-Code': this.propertyCode,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/bookings', {
        params: {
          confirmationNumber,
          propertyCode: this.propertyCode,
          limit: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/bookings', 200, durationMs);

    const bookings = result?.bookings || result?.data || [];
    if (bookings.length === 0) return null;

    return this.normalizeReservation(bookings[0]);
  }

  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { propertyCode: this.propertyCode };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.checkInDate = params.checkInDate;
    if (params.checkOutDate) queryParams.checkOutDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToRoomKey(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/bookings', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/bookings', 200, durationMs);

    const bookings = result?.bookings || result?.data || [];
    return bookings.map(b => this.normalizeReservation(b));
  }

  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/bookings/${reservationId}/billing`,
        { params: { propertyCode: this.propertyCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/bookings/${reservationId}/billing`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(`/api/v1/guests/${guestId}`, {
        params: { propertyCode: this.propertyCode },
      });
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/rates', {
        params: { ...params, propertyCode: this.propertyCode },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const rkNote = {
      guestId,
      propertyCode: this.propertyCode,
      type: note.category || 'general',
      title: note.title,
      content: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      priority: note.priority || 'medium',
      isInternal: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/notes`,
        rkNote
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

  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const rkAlert = {
      guestId,
      propertyCode: this.propertyCode,
      alertType: 'chargeback',
      severity: flagData.severity || 'high',
      title: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      active: true,
      source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/alerts`,
        rkAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.alertId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    const rkComment = {
      bookingId: reservationId,
      propertyCode: this.propertyCode,
      type: 'alert',
      title: `Chargeback Alert - Case ${alertData.caseNumber}`,
      content: [
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
      isInternal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/bookings/${reservationId}/notes`,
        rkComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/bookings/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.noteId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const rkComment = {
      bookingId: reservationId,
      propertyCode: this.propertyCode,
      type: won ? 'info' : 'alert',
      title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      content: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      priority: won ? 'medium' : 'high',
      isInternal: true,
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/bookings/${reservationId}/notes`,
        rkComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/bookings/${reservationId}/notes`, 201, durationMs);

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

  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');
    const webhookPayload = {
      callbackUrl: config.callbackUrl,
      events: (config.events || []).map(e => this._mapEventToRoomKey(e)),
      signingSecret: secret,
      active: true,
      propertyCode: this.propertyCode,
      description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v1/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v1/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.payload || payload;

    return {
      eventType: this._mapRoomKeyEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.occurredAt || new Date().toISOString(),
      hotelId: payload.propertyCode || this.propertyCode,
      data: {
        reservationId: data.bookingId || data.reservationId || data.confirmationNumber,
        guestId: data.guestId || data.profileId,
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

    const guest = pmsData.guest || pmsData.primaryGuest || {};
    const room = pmsData.room || pmsData.roomAssignment || {};
    const rate = pmsData.ratePlan || pmsData.rate || {};
    const payment = pmsData.payment || pmsData.paymentMethod || {};

    return {
      confirmationNumber: String(pmsData.confirmationNumber || pmsData.bookingNumber || ''),
      pmsReservationId: pmsData.bookingId || pmsData.id || '',
      status: normalizeReservationStatus(pmsData.status || pmsData.bookingStatus),
      guestProfileId: String(guest.guestId || guest.id || ''),
      guestName: normalizeGuestName({
        firstName: guest.firstName || guest.givenName || '',
        lastName: guest.lastName || guest.surname || '',
      }),
      email: guest.email || guest.emailAddress || '',
      phone: normalizePhone(guest.phone || guest.phoneNumber),
      address: normalizeAddress(guest.address),
      checkInDate: normalizeDate(pmsData.checkInDate || pmsData.arrivalDate),
      checkOutDate: normalizeDate(pmsData.checkOutDate || pmsData.departureDate),
      roomNumber: room.roomNumber || room.number || '',
      roomType: room.roomType || room.type || '',
      rateCode: rate.rateCode || rate.code || '',
      ratePlanDescription: rate.description || rate.name || '',
      totalAmount: normalizeAmount(pmsData.totalAmount || pmsData.totalCharges),
      currency: normalizeCurrency(pmsData.currencyCode || pmsData.currency),
      numberOfGuests: pmsData.numberOfGuests || pmsData.guestCount || 1,
      numberOfNights: this._calculateNights(
        pmsData.checkInDate || pmsData.arrivalDate,
        pmsData.checkOutDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.cardType || payment.brand),
        cardLastFour: payment.cardLastFour || payment.last4 || '',
        authCode: payment.authCode || payment.authorizationCode || '',
      },
      bookingSource: pmsData.source || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.createdAt || pmsData.createDate),
      updatedAt: normalizeDate(pmsData.updatedAt || pmsData.modifyDate),
      specialRequests: pmsData.specialRequests || pmsData.notes || '',
      loyaltyNumber: pmsData.loyaltyNumber || pmsData.membershipId || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.folios || pmsData?.billing || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const charges = folio.charges || folio.lineItems || folio.transactions || [];

      for (const charge of charges) {
        allItems.push({
          folioId: folio.folioId || folio.id || '',
          folioWindowNumber: folio.windowNumber || 1,
          transactionId: charge.transactionId || charge.id || '',
          transactionCode: charge.transactionCode || charge.chargeCode || '',
          category: normalizeFolioCategory(
            charge.category || charge.chargeType || charge.transactionCode
          ),
          description: charge.description || charge.itemName || '',
          amount: normalizeAmount(charge.amount || charge.total),
          currency: normalizeCurrency(charge.currencyCode),
          postDate: normalizeDate(charge.postDate || charge.date),
          cardLastFour: charge.cardLastFour || '',
          authCode: charge.authCode || '',
          reference: charge.reference || '',
          reversalFlag: charge.isReversal === true || charge.reversed === true,
          quantity: charge.quantity || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.guest || pmsData?.profile || pmsData || {};

    return {
      guestId: profile.guestId || profile.id || '',
      name: normalizeGuestName({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
      }),
      email: profile.email || profile.emailAddress || '',
      phone: normalizePhone(profile.phone || profile.phoneNumber),
      address: normalizeAddress(profile.address),
      vipCode: profile.vipCode || profile.vipStatus || '',
      loyaltyNumber: profile.loyaltyNumber || profile.membershipId || '',
      loyaltyLevel: profile.loyaltyLevel || profile.membershipTier || '',
      nationality: profile.nationality || '',
      language: profile.language || profile.preferredLanguage || '',
      dateOfBirth: normalizeDate(profile.dateOfBirth),
      companyName: profile.companyName || profile.company || '',
      totalStays: profile.totalStays || profile.stayCount || 0,
      totalRevenue: normalizeAmount(profile.totalRevenue || profile.lifetimeValue),
      lastStayDate: normalizeDate(profile.lastStayDate || profile.lastVisit),
      createdAt: normalizeDate(profile.createdAt || profile.createDate),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlans || pmsData?.rates || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.rateCode || rate.code || '',
      name: rate.name || rate.ratePlanName || '',
      description: rate.description || '',
      category: rate.category || '',
      baseAmount: normalizeAmount(rate.baseAmount || rate.amount),
      currency: normalizeCurrency(rate.currencyCode),
      startDate: normalizeDate(rate.startDate || rate.validFrom),
      endDate: normalizeDate(rate.endDate || rate.validTo),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: rate.roomTypes || [],
      inclusions: rate.inclusions || [],
      cancellationPolicy: rate.cancellationPolicy || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v1/properties/current', {
        params: { propertyCode: this.propertyCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.propertyCode,
          apiVersion: response.headers?.['x-api-version'] || 'v1',
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

  _mapStatusToRoomKey(status) {
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

  _mapEventToRoomKey(event) {
    const map = {
      'reservation.created': 'booking.created',
      'reservation.updated': 'booking.updated',
      'reservation.cancelled': 'booking.cancelled',
      'guest.checked_in': 'guest.checkin',
      'guest.checked_out': 'guest.checkout',
      'payment.received': 'payment.posted',
      'folio.updated': 'billing.updated',
    };
    return map[event] || event;
  }

  _mapRoomKeyEventToCanonical(rkEvent) {
    const map = {
      'booking.created': 'reservation.created',
      'booking.updated': 'reservation.updated',
      'booking.cancelled': 'reservation.cancelled',
      'guest.checkin': 'guest.checked_in',
      'guest.checkout': 'guest.checked_out',
      'payment.posted': 'payment.received',
      'billing.updated': 'folio.updated',
    };
    return map[rkEvent] || rkEvent;
  }
}

module.exports = RoomKeyAdapter;
