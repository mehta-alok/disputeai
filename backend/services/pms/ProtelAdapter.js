/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * protel PMS Adapter
 *
 * Integrates with the protel PMS REST/SOAP hybrid API. protel is a
 * German-developed, industry-leading hotel management system used by
 * thousands of hotels worldwide for front office, reservation, and
 * guest management.
 *
 * Authentication: HTTP Basic Auth (username:password).
 *   - protel uses Basic Auth with optional API key for extended API access.
 *
 * Key API modules used:
 *   Reservations  - Booking lifecycle management
 *   Guests        - Guest profile management
 *   Folios        - Financial postings and accounting
 *   Rates         - Rate plan configuration
 *   Webhooks      - Event notification management
 *
 * Reference: https://developer.protel.net/
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

const DEFAULT_BASE_URL = 'https://api.protel.net/rest/v1';

class ProtelAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.username     - protel API username.
   * @param {string} config.credentials.password     - protel API password.
   * @param {string} [config.credentials.apiKey]     - Optional additional API key.
   * @param {string} [config.credentials.hotelCode]  - protel property/hotel code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: 'PROTEL',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelCode = this.credentials.hotelCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with protel PMS using HTTP Basic Auth.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    const startMs = Date.now();
    try {
      await this.httpClient.get('/api/v1/hotel/info', {
        params: { hotelCode: this.hotelCode },
      });
      this._logApiCall('GET', '/api/v1/hotel/info', 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('GET', '/api/v1/hotel/info', error);
      throw new Error(`protel PMS authentication failed: ${error.message}`);
    }
  }

  /**
   * Basic Auth does not need refresh. Rebuilds client.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Rebuilding HTTP client with current credentials`);
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
    const encoded = Buffer.from(
      `${this.credentials.username}:${this.credentials.password}`
    ).toString('base64');
    const headers = {
      Authorization: `Basic ${encoded}`,
      'X-Hotel-Code': this.hotelCode,
    };
    if (this.credentials.apiKey) {
      headers['X-Api-Key'] = this.credentials.apiKey;
    }
    return headers;
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by confirmation number.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>}
   */
  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/reservations', {
        params: {
          confirmationNumber,
          hotelCode: this.hotelCode,
          maxResults: 1,
        },
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/reservations', 200, durationMs);

    const reservations = result?.Reservations || result?.reservations || result?.data || [];
    if (reservations.length === 0) return null;

    return this.normalizeReservation(reservations[0]);
  }

  /**
   * Search reservations.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { hotelCode: this.hotelCode };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToProtel(params.status);
    queryParams.maxResults = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/reservations', {
        params: queryParams,
      });
      return response.data;
    });

    this._logApiCall('GET', '/api/v1/reservations', 200, durationMs);

    const reservations = result?.Reservations || result?.reservations || result?.data || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  /**
   * Fetch the guest folio.
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/api/v1/reservations/${reservationId}/folios`,
        { params: { hotelCode: this.hotelCode } }
      );
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/reservations/${reservationId}/folios`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile.
   * @param {string} guestId
   * @returns {Promise<Object>}
   */
  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(`/api/v1/guests/${guestId}`, {
        params: { hotelCode: this.hotelCode },
      });
      return response.data;
    });

    this._logApiCall('GET', `/api/v1/guests/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  /**
   * Fetch rate plans.
   * @param {Object} params
   * @returns {Promise<Object[]>}
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/api/v1/rates', {
        params: { ...params, hotelCode: this.hotelCode },
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

    const protelNote = {
      GuestId: guestId,
      HotelCode: this.hotelCode,
      NoteType: note.category || 'GENERAL',
      Subject: note.title,
      Text: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
      Priority: (note.priority || 'MEDIUM').toUpperCase(),
      IsInternal: true,
      Source: 'AccuDefend',
      CreatedDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/notes`,
        protelNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.NoteId || result?.noteId || result?.Id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const protelAlert = {
      GuestId: guestId,
      HotelCode: this.hotelCode,
      AlertType: 'CHARGEBACK_RISK',
      Severity: (flagData.severity || 'HIGH').toUpperCase(),
      Subject: `AccuDefend Flag: ${(flagData.severity || 'HIGH').toUpperCase()}`,
      Message: `CHARGEBACK ALERT: ${flagData.reason}` +
        (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
        (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
      IsActive: true,
      Source: 'AccuDefend',
      CreatedDate: new Date().toISOString(),
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/guests/${guestId}/alerts`,
        protelAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/guests/${guestId}/alerts`, 201, durationMs);

    return {
      success: true,
      flagId: result?.AlertId || result?.alertId || result?.Id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    const protelComment = {
      ReservationId: reservationId,
      HotelCode: this.hotelCode,
      NoteType: 'ALERT',
      Subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
      Text: [
        '=== CHARGEBACK ALERT ===',
        `Case #: ${alertData.caseNumber}`,
        `Amount: $${alertData.amount}`,
        `Reason Code: ${alertData.reasonCode}`,
        `Dispute Date: ${alertData.disputeDate}`,
        `Status: ${alertData.status}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      Priority: 'HIGH',
      IsInternal: true,
      Source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        protelComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.NoteId || result?.noteId || result?.Id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const protelComment = {
      ReservationId: reservationId,
      HotelCode: this.hotelCode,
      NoteType: won ? 'INFO' : 'ALERT',
      Subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
      Text: [
        `=== DISPUTE ${outcomeData.outcome} ===`,
        `Case #: ${outcomeData.caseNumber}`,
        `Outcome: ${outcomeData.outcome}`,
        `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
        `Resolved: ${outcomeData.resolvedDate}`,
        '---',
        'Generated by AccuDefend Chargeback Defense System',
      ].join('\n'),
      Priority: won ? 'MEDIUM' : 'HIGH',
      IsInternal: true,
      Source: 'AccuDefend',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/api/v1/reservations/${reservationId}/notes`,
        protelComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/api/v1/reservations/${reservationId}/notes`, 201, durationMs);

    return {
      success: true,
      commentId: result?.NoteId || result?.noteId || result?.Id,
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
      CallbackUrl: config.callbackUrl,
      Events: (config.events || []).map(e => this._mapEventToProtel(e)),
      SigningSecret: secret,
      Active: true,
      HotelCode: this.hotelCode,
      Description: 'AccuDefend Chargeback Defense Webhook',
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/api/v1/webhooks', webhookPayload);
      return response.data;
    });

    this._logApiCall('POST', '/api/v1/webhooks', 201, durationMs);

    return {
      webhookId: result?.WebhookId || result?.webhookId || result?.Id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.EventType || payload.eventType || payload.event;
    const data = payload.Data || payload.data || payload;

    return {
      eventType: this._mapProtelEventToCanonical(eventType),
      timestamp: payload.Timestamp || payload.timestamp || new Date().toISOString(),
      hotelId: payload.HotelCode || payload.hotelCode || this.hotelCode,
      data: {
        reservationId: data.ReservationId || data.reservationId || data.ConfirmationNumber,
        guestId: data.GuestId || data.guestId || data.ProfileId,
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

    // protel uses PascalCase in API responses
    const guest = pmsData.Guest || pmsData.guest || pmsData.PrimaryGuest || {};
    const room = pmsData.Room || pmsData.room || pmsData.RoomAssignment || {};
    const rate = pmsData.RatePlan || pmsData.ratePlan || {};
    const payment = pmsData.Payment || pmsData.payment || {};

    return {
      confirmationNumber: String(
        pmsData.ConfirmationNumber || pmsData.confirmationNumber || ''
      ),
      pmsReservationId: pmsData.ReservationId || pmsData.reservationId || pmsData.Id || '',
      status: normalizeReservationStatus(
        pmsData.Status || pmsData.status || pmsData.ReservationStatus
      ),
      guestProfileId: String(guest.GuestId || guest.guestId || guest.ProfileId || ''),
      guestName: normalizeGuestName({
        firstName: guest.FirstName || guest.firstName || guest.Vorname || '',
        lastName: guest.LastName || guest.lastName || guest.Nachname || '',
      }),
      email: guest.Email || guest.email || '',
      phone: normalizePhone(guest.Phone || guest.phone || guest.Telefon),
      address: normalizeAddress(guest.Address || guest.address || guest.Adresse),
      checkInDate: normalizeDate(pmsData.ArrivalDate || pmsData.arrivalDate || pmsData.Anreise),
      checkOutDate: normalizeDate(pmsData.DepartureDate || pmsData.departureDate || pmsData.Abreise),
      roomNumber: room.RoomNumber || room.roomNumber || room.Zimmernummer || '',
      roomType: room.RoomType || room.roomType || room.Zimmertyp || '',
      rateCode: rate.RateCode || rate.rateCode || rate.Ratencode || '',
      ratePlanDescription: rate.Description || rate.description || rate.Bezeichnung || '',
      totalAmount: normalizeAmount(pmsData.TotalAmount || pmsData.totalAmount || pmsData.Gesamtbetrag),
      currency: normalizeCurrency(pmsData.CurrencyCode || pmsData.currencyCode || pmsData.Waehrung),
      numberOfGuests: pmsData.NumberOfGuests || pmsData.numberOfGuests || pmsData.Gaestezahl || 1,
      numberOfNights: this._calculateNights(
        pmsData.ArrivalDate || pmsData.arrivalDate,
        pmsData.DepartureDate || pmsData.departureDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(payment.CardType || payment.cardType || payment.Kartentyp),
        cardLastFour: payment.CardLast4 || payment.cardLast4 || payment.KartenNr4 || '',
        authCode: payment.AuthCode || payment.authCode || payment.Autorisierungscode || '',
      },
      bookingSource: pmsData.Source || pmsData.source || pmsData.Buchungsquelle || '',
      createdAt: normalizeDate(pmsData.CreatedDate || pmsData.createdDate || pmsData.Erstellungsdatum),
      updatedAt: normalizeDate(pmsData.ModifiedDate || pmsData.modifiedDate || pmsData.Aenderungsdatum),
      specialRequests: pmsData.SpecialRequests || pmsData.specialRequests || pmsData.Sonderwuensche || '',
      loyaltyNumber: pmsData.LoyaltyNumber || pmsData.loyaltyNumber || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folios = pmsData?.Folios || pmsData?.folios || pmsData?.data || [];
    const allItems = [];

    for (const folio of Array.isArray(folios) ? folios : [folios]) {
      const postings = folio.Postings || folio.postings || folio.Buchungen || [];

      for (const posting of postings) {
        allItems.push({
          folioId: folio.FolioId || folio.folioId || folio.Id || '',
          folioWindowNumber: folio.WindowNumber || folio.windowNumber || folio.FensterNr || 1,
          transactionId: posting.TransactionId || posting.transactionId || posting.BuchungsId || '',
          transactionCode: posting.TransactionCode || posting.transactionCode || posting.Buchungscode || '',
          category: normalizeFolioCategory(
            posting.Category || posting.category || posting.Kategorie || posting.TransactionCode
          ),
          description: posting.Description || posting.description || posting.Bezeichnung || '',
          amount: normalizeAmount(posting.Amount || posting.amount || posting.Betrag),
          currency: normalizeCurrency(posting.CurrencyCode || posting.currencyCode || posting.Waehrung),
          postDate: normalizeDate(posting.PostDate || posting.postDate || posting.Buchungsdatum),
          cardLastFour: posting.CardLast4 || posting.cardLast4 || '',
          authCode: posting.AuthCode || posting.authCode || '',
          reference: posting.Reference || posting.reference || posting.Referenz || '',
          reversalFlag: posting.IsReversal === true || posting.isReversal === true || posting.Storno === true,
          quantity: posting.Quantity || posting.quantity || posting.Menge || 1,
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.Guest || pmsData?.guest || pmsData?.Profile || pmsData || {};

    return {
      guestId: profile.GuestId || profile.guestId || profile.Id || '',
      name: normalizeGuestName({
        firstName: profile.FirstName || profile.firstName || profile.Vorname || '',
        lastName: profile.LastName || profile.lastName || profile.Nachname || '',
      }),
      email: profile.Email || profile.email || '',
      phone: normalizePhone(profile.Phone || profile.phone || profile.Telefon),
      address: normalizeAddress(profile.Address || profile.address || profile.Adresse),
      vipCode: profile.VipCode || profile.vipCode || profile.VipStatus || '',
      loyaltyNumber: profile.LoyaltyNumber || profile.loyaltyNumber || '',
      loyaltyLevel: profile.LoyaltyLevel || profile.loyaltyLevel || '',
      nationality: profile.Nationality || profile.nationality || profile.Nationalitaet || '',
      language: profile.Language || profile.language || profile.Sprache || '',
      dateOfBirth: normalizeDate(profile.DateOfBirth || profile.dateOfBirth || profile.Geburtsdatum),
      companyName: profile.CompanyName || profile.companyName || profile.Firma || '',
      totalStays: profile.TotalStays || profile.totalStays || profile.AnzahlAufenthalte || 0,
      totalRevenue: normalizeAmount(profile.TotalRevenue || profile.totalRevenue || profile.Gesamtumsatz),
      lastStayDate: normalizeDate(profile.LastStayDate || profile.lastStayDate || profile.LetzterAufenthalt),
      createdAt: normalizeDate(profile.CreatedDate || profile.createdDate || profile.Erstellungsdatum),
      pmsRaw: sanitizePII(profile),
    };
  }

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.RatePlans || pmsData?.ratePlans || pmsData?.data || [];

    return (Array.isArray(ratePlans) ? ratePlans : []).map(rate => ({
      rateCode: rate.RateCode || rate.rateCode || rate.Ratencode || '',
      name: rate.RatePlanName || rate.name || rate.Bezeichnung || '',
      description: rate.Description || rate.description || rate.Beschreibung || '',
      category: rate.Category || rate.category || rate.Kategorie || '',
      baseAmount: normalizeAmount(rate.BaseAmount || rate.baseAmount || rate.Grundpreis),
      currency: normalizeCurrency(rate.CurrencyCode || rate.currencyCode || rate.Waehrung),
      startDate: normalizeDate(rate.StartDate || rate.startDate || rate.GueltigVon),
      endDate: normalizeDate(rate.EndDate || rate.endDate || rate.GueltigBis),
      isActive: (rate.Active !== false && rate.active !== false) &&
        (rate.Status || rate.status) !== 'INACTIVE',
      roomTypes: rate.RoomTypes || rate.roomTypes || rate.Zimmertypen || [],
      inclusions: rate.Inclusions || rate.inclusions || rate.Leistungen || [],
      cancellationPolicy: rate.CancellationPolicy || rate.cancellationPolicy || rate.Stornobedingungen || '',
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/api/v1/hotel/info', {
        params: { hotelCode: this.hotelCode },
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelCode: this.hotelCode,
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
          hotelCode: this.hotelCode,
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

  _mapStatusToProtel(status) {
    const map = {
      confirmed: 'DEFINITE',
      checked_in: 'INHOUSE',
      checked_out: 'DEPARTED',
      cancelled: 'CANCELLED',
      no_show: 'NOSHOW',
      pending: 'TENTATIVE',
    };
    return map[status] || status;
  }

  _mapEventToProtel(event) {
    const map = {
      'reservation.created': 'ReservationCreated',
      'reservation.updated': 'ReservationModified',
      'reservation.cancelled': 'ReservationCancelled',
      'guest.checked_in': 'GuestCheckIn',
      'guest.checked_out': 'GuestCheckOut',
      'payment.received': 'PaymentPosted',
      'folio.updated': 'FolioUpdated',
    };
    return map[event] || event;
  }

  _mapProtelEventToCanonical(protelEvent) {
    const map = {
      ReservationCreated: 'reservation.created',
      ReservationModified: 'reservation.updated',
      ReservationCancelled: 'reservation.cancelled',
      GuestCheckIn: 'guest.checked_in',
      GuestCheckOut: 'guest.checked_out',
      PaymentPosted: 'payment.received',
      FolioUpdated: 'folio.updated',
    };
    return map[protelEvent] || protelEvent;
  }
}

module.exports = ProtelAdapter;
