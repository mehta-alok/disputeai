/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Mews PMS Adapter
 *
 * Integrates with the Mews Connector API (v1).
 *
 * Authentication:  API Key based -- every request body includes
 *   { ClientToken, AccessToken, Client } fields.
 *
 * API style:  ALL endpoints are POST requests with JSON bodies.
 *   There are no GET/PUT/DELETE endpoints in the Mews Connector API.
 *
 * Reference: https://mews-systems.gitbook.io/connector-api/
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

const DEFAULT_BASE_URL = 'https://api.mews.com/api/connector/v1';

class MewsAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientToken  - Mews Client Token (identifies the integration).
   * @param {string} config.credentials.accessToken  - Mews Access Token (identifies the property / enterprise).
   * @param {string} [config.credentials.client]     - Integration client name (e.g. "AccuDefend").
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   * @param {string} [config.credentials.enterpriseId] - Mews Enterprise (property) ID.
   */
  constructor(config) {
    super({
      ...config,
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.clientToken = this.credentials.clientToken;
    this.accessToken = this.credentials.accessToken;
    this.clientName = this.credentials.client || 'AccuDefend';
    this.enterpriseId = this.credentials.enterpriseId || '';
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  async authenticate() {
    // Mews uses static tokens, no OAuth flow required.
    // We just validate the tokens work by hitting a lightweight endpoint.
    this._buildAuthenticatedClient();

    // Verify tokens with a minimal request
    try {
      const response = await this.httpClient.post('/configuration/get', this._baseBody());
      this.enterpriseId = response.data?.Enterprise?.Id || this.enterpriseId;
      logger.info(`[PMS:${this.pmsType}] Authenticated. Enterprise: ${this.enterpriseId}`);
    } catch (error) {
      this._logApiError('POST', '/configuration/get', error);
      throw new Error(`Mews authentication failed: ${error.message}`);
    }
  }

  async refreshAuth() {
    // Mews tokens are long-lived and don't expire in the traditional sense.
    // If a token is invalid, the property must re-provision.
    logger.info(`[PMS:${this.pmsType}] Token refresh not applicable (static API keys).`);
  }

  /** @private */
  _buildAuthenticatedClient() {
    // Mews doesn't use Authorization headers; tokens go in every request body.
    // But we still benefit from circuit breaker + retry.
    this._buildHttpClient(
      { 'Content-Type': 'application/json' },
      {
        rateLimit: { maxTokens: 120, refillRate: 120, intervalMs: 60000 },
      }
    );
  }

  /** @override */
  _getAuthHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  /**
   * Build the authentication portion of every Mews request body.
   * @param {Object} [extra] - Additional body fields.
   * @returns {Object}
   * @private
   */
  _baseBody(extra = {}) {
    return {
      ClientToken: this.clientToken,
      AccessToken: this.accessToken,
      Client: this.clientName,
      ...extra,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/reservations/getAll', this._baseBody({
        ReservationIds: [confirmationNumber],
        Extent: {
          Reservations: true,
          Customers: true,
          Items: true,
          Services: true,
        },
      }));
      return response.data;
    });

    this._logApiCall('POST', '/reservations/getAll', 200, durationMs);

    const reservations = result?.Reservations || [];
    if (reservations.length === 0) return null;

    // Mews returns Customers separately, keyed by ID
    const customersMap = this._buildLookupMap(result?.Customers || [], 'Id');

    return this.normalizeReservation(reservations[0], customersMap);
  }

  async searchReservations(params) {
    this._ensureAuthenticated();

    const body = this._baseBody({
      Extent: {
        Reservations: true,
        Customers: true,
        Items: true,
      },
      Limitation: { Count: params.limit || 50 },
    });

    // Mews uses time-based filters
    if (params.checkInDate || params.checkOutDate) {
      body.TimeFilter = 'Start';
      body.StartUtc = params.checkInDate
        ? normalizeDate(params.checkInDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      body.EndUtc = params.checkOutDate
        ? normalizeDate(params.checkOutDate)
        : new Date().toISOString();
    } else {
      // Default: last 30 days
      body.TimeFilter = 'Updated';
      body.StartUtc = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      body.EndUtc = new Date().toISOString();
    }

    if (params.confirmationNumber) {
      body.ReservationIds = [params.confirmationNumber];
    }

    if (params.status) {
      body.States = [this._mapStatusToMews(params.status)];
    }

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/reservations/getAll', body);
      return response.data;
    });

    this._logApiCall('POST', '/reservations/getAll', 200, durationMs);

    const customersMap = this._buildLookupMap(result?.Customers || [], 'Id');
    const reservations = result?.Reservations || [];

    let normalized = reservations.map(r => this.normalizeReservation(r, customersMap));

    // Client-side filtering for fields Mews doesn't support server-side
    if (params.guestName) {
      const search = params.guestName.toLowerCase();
      normalized = normalized.filter(r =>
        r.guestName.fullName.toLowerCase().includes(search)
      );
    }

    if (params.cardLastFour) {
      normalized = normalized.filter(r =>
        r.paymentMethod?.cardLastFour === params.cardLastFour
      );
    }

    return normalized;
  }

  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    // Mews separates bills and payments
    const [billsResult, paymentsResult] = await Promise.all([
      this._timed(async () => {
        const response = await this.httpClient.post('/bills/getAll', this._baseBody({
          ReservationIds: [reservationId],
          Extent: { Bills: true, Items: true },
        }));
        return response.data;
      }),
      this._timed(async () => {
        const response = await this.httpClient.post('/payments/getAll', this._baseBody({
          ReservationIds: [reservationId],
        }));
        return response.data;
      }),
    ]);

    this._logApiCall('POST', '/bills/getAll', 200, billsResult.durationMs);
    this._logApiCall('POST', '/payments/getAll', 200, paymentsResult.durationMs);

    return this.normalizeFolioItems({
      Bills: billsResult.result?.Bills || [],
      Payments: paymentsResult.result?.Payments || [],
    });
  }

  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/customers/getAll', this._baseBody({
        CustomerIds: [guestId],
        Extent: {
          Customers: true,
          Addresses: true,
          Documents: true,
        },
      }));
      return response.data;
    });

    this._logApiCall('POST', '/customers/getAll', 200, durationMs);

    const customers = result?.Customers || [];
    if (customers.length === 0) return null;

    return this.normalizeGuestProfile(customers[0]);
  }

  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/services/getAll', this._baseBody({
        Extent: { Services: true, Rates: true },
      }));
      return response.data;
    });

    this._logApiCall('POST', '/services/getAll', 200, durationMs);

    return this.normalizeRates(result);
  }

  async getReservationDocuments(reservationId) {
    this._ensureAuthenticated();

    // Mews doesn't have a dedicated documents API for reservations.
    // Documents are typically on the customer profile (ID scans, etc.).
    // Fetch the reservation to get the customer, then get their documents.
    const reservation = await this.getReservation(reservationId);
    if (!reservation || !reservation.guestProfileId) {
      return [];
    }

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/customers/getAll', this._baseBody({
        CustomerIds: [reservation.guestProfileId],
        Extent: { Documents: true },
      }));
      return response.data;
    });

    this._logApiCall('POST', '/customers/getAll (docs)', 200, durationMs);

    const documents = result?.Documents || [];
    return documents.map(doc => ({
      type: doc.Type || 'other',
      fileName: doc.FileName || `mews_doc_${doc.Id}`,
      mimeType: doc.ContentType || 'application/octet-stream',
      data: doc.Content ? Buffer.from(doc.Content, 'base64') : null,
      description: doc.Name || doc.Type || '',
    }));
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const mewsNote = this._baseBody({
      CustomerId: guestId,
      Notes: `[${note.category || 'AccuDefend'}] ${note.title}\n${note.content}`,
    });

    const { result, durationMs } = await this._timed(async () => {
      // Mews uses customer update to add notes
      const response = await this.httpClient.post('/customers/update', {
        ...this._baseBody(),
        CustomerUpdates: [{
          CustomerId: guestId,
          Notes: {
            Value: `[${note.category || 'AccuDefend'}] ${note.title}\n${note.content}`,
          },
          Classifications: note.priority === 'high'
            ? { Value: ['Problematic'] }
            : undefined,
        }],
      });
      return response.data;
    });

    this._logApiCall('POST', '/customers/update', 200, durationMs);

    return {
      success: true,
      noteId: result?.Customers?.[0]?.Id || guestId,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    // Mews uses customer "Classifications" for flags
    const classifications = ['Problematic'];
    if (flagData.severity === 'critical' || flagData.severity === 'high') {
      classifications.push('Blacklisted');
    }

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/customers/update', {
        ...this._baseBody(),
        CustomerUpdates: [{
          CustomerId: guestId,
          Classifications: { Value: classifications },
          Notes: {
            Value: `ACCUDEFEND FLAG: ${flagData.reason}` +
              (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
              (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
          },
        }],
      });
      return response.data;
    });

    this._logApiCall('POST', '/customers/update (flag)', 200, durationMs);

    return {
      success: true,
      flagId: result?.Customers?.[0]?.Id || guestId,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    // Mews doesn't have a native chargeback alert. We push a note to the
    // reservation's customer and update the reservation notes.
    const noteContent = [
      '=== CHARGEBACK ALERT ===',
      `Case #: ${alertData.caseNumber}`,
      `Amount: $${alertData.amount}`,
      `Reason Code: ${alertData.reasonCode}`,
      `Dispute Date: ${alertData.disputeDate}`,
      `Status: ${alertData.status}`,
      '--- Generated by AccuDefend ---',
    ].join('\n');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/reservations/update', {
        ...this._baseBody(),
        ReservationUpdates: [{
          ReservationId: reservationId,
          Notes: { Value: noteContent },
        }],
      });
      return response.data;
    });

    this._logApiCall('POST', '/reservations/update (chargeback)', 200, durationMs);

    return {
      success: true,
      reservationId,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';
    const noteContent = [
      `=== DISPUTE ${outcomeData.outcome} ===`,
      `Case #: ${outcomeData.caseNumber}`,
      `Outcome: ${outcomeData.outcome}`,
      `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
      `Resolved: ${outcomeData.resolvedDate}`,
      '--- Generated by AccuDefend ---',
    ].join('\n');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/reservations/update', {
        ...this._baseBody(),
        ReservationUpdates: [{
          ReservationId: reservationId,
          Notes: { Value: noteContent },
        }],
      });
      return response.data;
    });

    this._logApiCall('POST', '/reservations/update (outcome)', 200, durationMs);

    return {
      success: true,
      reservationId,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  async registerWebhook(callbackUrl, events) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks/subscribe', this._baseBody({
        Url: callbackUrl,
        Events: events.map(e => this._mapEventToMews(e)),
        IsActive: true,
      }));
      return response.data;
    });

    this._logApiCall('POST', '/webhooks/subscribe', 200, durationMs);

    return {
      webhookId: result?.Id || result?.WebhookId,
      callbackUrl,
      events,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  async deregisterWebhook(webhookId) {
    this._ensureAuthenticated();

    const { durationMs } = await this._timed(async () => {
      await this.httpClient.post('/webhooks/unsubscribe', this._baseBody({
        WebhookIds: [webhookId],
      }));
    });

    this._logApiCall('POST', '/webhooks/unsubscribe', 200, durationMs);
  }

  parseWebhookPayload(rawPayload, headers) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    // Mews webhooks: { Events: [{ Type, Id, ... }] }
    const events = payload.Events || [payload];
    const firstEvent = events[0] || {};

    return {
      eventType: this._mapMewsEventToCanonical(firstEvent.Type || firstEvent.Event),
      timestamp: payload.CreatedUtc || payload.Timestamp || new Date().toISOString(),
      data: {
        reservationId: firstEvent.EntityId || firstEvent.ReservationId,
        guestId: firstEvent.CustomerId,
        entityType: firstEvent.EntityType,
        events: events.map(e => ({
          type: this._mapMewsEventToCanonical(e.Type || e.Event),
          entityId: e.EntityId || e.Id,
          entityType: e.EntityType,
        })),
      },
      raw: payload,
    };
  }

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

  normalizeReservation(pmsData, customersMap = {}) {
    if (!pmsData) return null;

    const customerId = pmsData.CustomerId || pmsData.CompanionIds?.[0] || '';
    const customer = customersMap[customerId] || {};

    const guestName = normalizeGuestName({
      firstName: customer.FirstName || '',
      lastName: customer.LastName || '',
    });

    return {
      confirmationNumber: pmsData.Id || pmsData.Number || '',
      pmsReservationId: pmsData.Id || '',
      status: normalizeReservationStatus(pmsData.State || pmsData.Status),
      guestProfileId: customerId,
      guestName,
      email: customer.Email || '',
      phone: normalizePhone(customer.Phone || customer.CellPhone),
      address: normalizeAddress(customer.Address || {}),
      checkInDate: normalizeDate(pmsData.StartUtc || pmsData.CheckInUtc),
      checkOutDate: normalizeDate(pmsData.EndUtc || pmsData.CheckOutUtc),
      roomNumber: pmsData.AssignedResourceId || pmsData.RoomNumber || '',
      roomType: pmsData.RequestedCategoryId || pmsData.RoomCategoryId || '',
      rateCode: pmsData.RateId || '',
      ratePlanDescription: '',
      totalAmount: normalizeAmount(pmsData.TotalAmount || pmsData.Cost),
      currency: normalizeCurrency(pmsData.Currency || pmsData.CurrencyCode),
      numberOfGuests: pmsData.AdultCount || (pmsData.CompanionIds?.length || 0) + 1,
      numberOfNights: this._calculateNights(pmsData.StartUtc, pmsData.EndUtc),
      paymentMethod: {
        cardBrand: normalizeCardBrand(customer.PaymentCardType || ''),
        cardLastFour: customer.PaymentCardLast4 || '',
        authCode: '',
      },
      bookingSource: pmsData.ChannelManagerNumber ? 'OTA' : (pmsData.Origin || 'direct'),
      createdAt: normalizeDate(pmsData.CreatedUtc),
      updatedAt: normalizeDate(pmsData.UpdatedUtc),
      specialRequests: pmsData.Notes || '',
      loyaltyNumber: customer.LoyaltyCode || '',
      groupName: pmsData.GroupName || pmsData.TravelAgencyId || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const items = [];

    // Process bills (charges)
    const bills = pmsData?.Bills || [];
    for (const bill of bills) {
      const billItems = bill.Items || bill.Revenue || [];
      for (const item of billItems) {
        items.push({
          folioId: bill.Id || '',
          transactionId: item.Id || '',
          transactionCode: item.AccountingCategoryId || '',
          category: normalizeFolioCategory(item.Type || item.Category || item.Name),
          description: item.Name || item.Description || '',
          amount: normalizeAmount(item.Amount?.Value || item.Amount || item.TotalAmount),
          currency: normalizeCurrency(item.Amount?.Currency || item.Currency),
          postDate: normalizeDate(item.ConsumedUtc || item.CreatedUtc),
          cardLastFour: '',
          authCode: '',
          reference: item.OrderId || '',
          reversalFlag: item.IsCorrection === true,
          quantity: item.Count || 1,
        });
      }
    }

    // Process payments
    const payments = pmsData?.Payments || [];
    for (const payment of payments) {
      items.push({
        folioId: payment.BillId || '',
        transactionId: payment.Id || '',
        transactionCode: 'PAYMENT',
        category: 'payment',
        description: `Payment - ${payment.Type || 'Card'}`,
        amount: normalizeAmount(payment.Amount?.Value || payment.Amount),
        currency: normalizeCurrency(payment.Amount?.Currency || payment.Currency),
        postDate: normalizeDate(payment.CreatedUtc || payment.SettledUtc),
        cardLastFour: payment.CreditCard?.ObfuscatedNumber?.slice(-4) || '',
        authCode: payment.CreditCard?.AuthorizationCode || '',
        reference: payment.ReceiptIdentifier || '',
        reversalFlag: payment.State === 'Canceled' || payment.State === 'Failed',
        quantity: 1,
      });
    }

    return items;
  }

  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: pmsData.Id || '',
      name: normalizeGuestName({
        firstName: pmsData.FirstName || '',
        lastName: pmsData.LastName || '',
      }),
      email: pmsData.Email || '',
      phone: normalizePhone(pmsData.Phone || pmsData.CellPhone),
      address: normalizeAddress(pmsData.Address || {}),
      vipCode: pmsData.Loyalty?.Code || '',
      loyaltyNumber: pmsData.LoyaltyCode || pmsData.Loyalty?.MembershipId || '',
      loyaltyLevel: pmsData.Loyalty?.Level || '',
      nationality: pmsData.NationalityCode || pmsData.Nationality || '',
      language: pmsData.LanguageCode || pmsData.Language || '',
      dateOfBirth: normalizeDate(pmsData.BirthDateUtc || pmsData.BirthDate),
      companyName: pmsData.CompanyId || '',
      totalStays: pmsData.Statistics?.TotalStays || 0,
      totalRevenue: normalizeAmount(pmsData.Statistics?.TotalRevenue || 0),
      lastStayDate: normalizeDate(pmsData.Statistics?.LastStayDate),
      classifications: pmsData.Classifications || [],
      createdAt: normalizeDate(pmsData.CreatedUtc),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeRates(pmsData) {
    const services = pmsData?.Services || [];
    const rates = pmsData?.Rates || [];
    const allRates = [];

    // Map services (Mews "Services" are the top-level container)
    for (const service of services) {
      if (service.Type === 'Reservable' || service.IsActive) {
        // Find rates belonging to this service
        const serviceRates = rates.filter(r => r.ServiceId === service.Id);

        for (const rate of serviceRates) {
          allRates.push({
            rateCode: rate.Id || '',
            name: rate.Name?.en || rate.Name || service.Name?.en || service.Name || '',
            description: rate.Description?.en || rate.Description || '',
            category: rate.Type || service.Type || '',
            baseAmount: normalizeAmount(rate.Price?.Value || rate.BasePrice),
            currency: normalizeCurrency(rate.Price?.Currency || rate.Currency),
            startDate: normalizeDate(rate.StartUtc || rate.ValidFrom),
            endDate: normalizeDate(rate.EndUtc || rate.ValidTo),
            isActive: rate.IsActive !== false,
            roomTypes: rate.ApplicableCategoryIds || [],
            inclusions: rate.IncludedProducts || [],
            cancellationPolicy: rate.CancellationPolicy || '',
            serviceId: service.Id,
          });
        }
      }
    }

    // If no rates found via services, just normalize the raw rates array
    if (allRates.length === 0 && rates.length > 0) {
      for (const rate of rates) {
        allRates.push({
          rateCode: rate.Id || '',
          name: rate.Name?.en || rate.Name || '',
          description: rate.Description?.en || rate.Description || '',
          category: rate.Type || '',
          baseAmount: normalizeAmount(rate.Price?.Value || rate.BasePrice),
          currency: normalizeCurrency(rate.Price?.Currency || rate.Currency),
          startDate: normalizeDate(rate.StartUtc),
          endDate: normalizeDate(rate.EndUtc),
          isActive: rate.IsActive !== false,
          roomTypes: rate.ApplicableCategoryIds || [],
          inclusions: [],
          cancellationPolicy: '',
        });
      }
    }

    return allRates;
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.post('/configuration/get', this._baseBody());

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          enterpriseId: response.data?.Enterprise?.Id || this.enterpriseId,
          enterpriseName: response.data?.Enterprise?.Name || '',
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          error: error.message,
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    }
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  /** Build a { [keyField]: item } lookup map from an array. */
  _buildLookupMap(array, keyField) {
    const map = {};
    for (const item of array) {
      if (item[keyField]) map[item[keyField]] = item;
    }
    return map;
  }

  _calculateNights(start, end) {
    const s = normalizeDate(start);
    const e = normalizeDate(end);
    if (!s || !e) return 0;
    const diff = new Date(e) - new Date(s);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  _mapStatusToMews(status) {
    const map = {
      confirmed: 'Confirmed',
      checked_in: 'Started',
      checked_out: 'Processed',
      cancelled: 'Canceled',
      no_show: 'Canceled',
      pending: 'Optional',
    };
    return map[status] || status;
  }

  _mapEventToMews(event) {
    const map = {
      'reservation.created': 'ReservationCreated',
      'reservation.updated': 'ReservationUpdated',
      'reservation.cancelled': 'ReservationCanceled',
      'guest.checked_in': 'ReservationStarted',
      'guest.checked_out': 'ReservationProcessed',
      'payment.received': 'PaymentCreated',
      'folio.updated': 'BillUpdated',
    };
    return map[event] || event;
  }

  _mapMewsEventToCanonical(mewsEvent) {
    const map = {
      ReservationCreated: 'reservation.created',
      ReservationUpdated: 'reservation.updated',
      ReservationCanceled: 'reservation.cancelled',
      ReservationStarted: 'guest.checked_in',
      ReservationProcessed: 'guest.checked_out',
      PaymentCreated: 'payment.received',
      BillUpdated: 'folio.updated',
      CustomerCreated: 'guest.created',
      CustomerUpdated: 'guest.updated',
    };
    return map[mewsEvent] || mewsEvent;
  }
}

module.exports = MewsAdapter;
