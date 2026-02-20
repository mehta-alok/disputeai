/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Oracle Opera Cloud PMS Adapter
 *
 * Integrates with the Oracle Hospitality OPERA Cloud REST API.
 *
 * Authentication: OAuth 2.0 (client_credentials or authorization_code flow).
 *   - Tokens auto-refresh when within 5 minutes of expiry.
 *
 * Key API modules used:
 *   RSV  - Reservations
 *   CSH  - Cashiering / Folios
 *   CRM  - Customer Relationship (Profiles)
 *   LOV  - List of Values (Rates, codes)
 *   INT  - Integration (Webhooks)
 *   DMS  - Document Management (optional)
 *
 * Reference: https://docs.oracle.com/en/industries/hospitality/opera-cloud/
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

// Default base URL for Opera Cloud REST gateway
const DEFAULT_BASE_URL = 'https://api.oracle.com/opera/v1';
const TOKEN_URL = 'https://login.oracle.com/oauth2/token';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

class OperaCloudAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId
   * @param {string} config.credentials.clientSecret
   * @param {string} [config.credentials.accessToken]
   * @param {string} [config.credentials.refreshToken]
   * @param {number} [config.credentials.expiresAt]    - Epoch ms.
   * @param {string} [config.credentials.hotelId]      - Opera hotel/property code.
   * @param {string} [config.credentials.appKey]       - Oracle application key.
   * @param {string} [config.credentials.tokenUrl]     - Override token endpoint.
   * @param {string} [config.credentials.baseUrl]      - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.hotelId = this.credentials.hotelId || this.propertyId;
    this.tokenUrl = this.credentials.tokenUrl || TOKEN_URL;
    this.tokenExpiresAt = this.credentials.expiresAt || 0;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  async authenticate() {
    // If we already have a valid token, just build the client
    if (this.credentials.accessToken && !this._isTokenExpiringSoon()) {
      this._buildAuthenticatedClient();
      return;
    }

    // If we have a refresh token, use it
    if (this.credentials.refreshToken) {
      await this.refreshAuth();
      return;
    }

    // Otherwise do a client_credentials grant
    await this._clientCredentialsGrant();
  }

  async refreshAuth() {
    const startMs = Date.now();

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', this.credentials.refreshToken);
      params.append('client_id', this.credentials.clientId);
      params.append('client_secret', this.credentials.clientSecret);

      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      // Fallback to client_credentials if refresh fails
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

    try {
      const response = await axios.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      this._applyTokenResponse(response.data);
      this._buildAuthenticatedClient();
      this._logApiCall('POST', this.tokenUrl, 200, Date.now() - startMs);
    } catch (error) {
      this._logApiError('POST', this.tokenUrl, error);
      throw new Error(`Opera Cloud authentication failed: ${error.message}`);
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
      rateLimit: { maxTokens: 100, refillRate: 100, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    const headers = {
      Authorization: `Bearer ${this.credentials.accessToken}`,
    };
    if (this.credentials.appKey) {
      headers['x-app-key'] = this.credentials.appKey;
    }
    return headers;
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

  async getReservation(confirmationNumber) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      // Opera uses confirmationNumber as a query param on the search endpoint
      // or as part of the reservation ID path
      const response = await this.httpClient.get(
        `/rsv/v1/hotels/${this.hotelId}/reservations`,
        { params: { confirmationNumber, limit: 1 } }
      );
      return response.data;
    });

    this._logApiCall('GET', '/rsv/v1/.../reservations', 200, durationMs);

    // Opera returns reservations.reservationInfo[]
    const reservations = result?.reservations?.reservationInfo || result?.reservations || [];
    if (reservations.length === 0) {
      return null;
    }

    return this.normalizeReservation(reservations[0]);
  }

  async searchReservations(params) {
    await this._ensureToken();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.arrivalStartDate = params.checkInDate;
    if (params.checkOutDate) queryParams.departureEndDate = params.checkOutDate;
    if (params.status) queryParams.reservationStatus = this._mapStatusToOpera(params.status);
    queryParams.limit = params.limit || 50;

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/rsv/v1/hotels/${this.hotelId}/reservations`,
        { params: queryParams }
      );
      return response.data;
    });

    this._logApiCall('GET', '/rsv/v1/.../reservations', 200, durationMs);

    const reservations = result?.reservations?.reservationInfo || result?.reservations || [];
    return reservations.map(r => this.normalizeReservation(r));
  }

  async getGuestFolio(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/csh/v1/hotels/${this.hotelId}/folios`,
        { params: { reservationId } }
      );
      return response.data;
    });

    this._logApiCall('GET', '/csh/v1/.../folios', 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  async getGuestProfile(guestId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/crm/v1/hotels/${this.hotelId}/profiles/${guestId}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/crm/v1/.../profiles/${guestId}`, 200, durationMs);

    return this.normalizeGuestProfile(result);
  }

  async getRates(params = {}) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/lov/v1/hotels/${this.hotelId}/ratePlanCodes`,
        { params }
      );
      return response.data;
    });

    this._logApiCall('GET', '/lov/v1/.../ratePlanCodes', 200, durationMs);

    return this.normalizeRates(result);
  }

  async getReservationDocuments(reservationId) {
    await this._ensureToken();

    const { result, durationMs } = await this._timed(async () => {
      // Opera stores documents under DMS module or as attachments on the reservation
      const response = await this.httpClient.get(
        `/rsv/v1/hotels/${this.hotelId}/reservations/${reservationId}/attachments`
      );
      return response.data;
    });

    this._logApiCall('GET', `/rsv/v1/.../reservations/${reservationId}/attachments`, 200, durationMs);

    const attachments = result?.attachments || result?.links || [];
    return attachments.map(att => ({
      type: att.attachmentType || att.category || 'other',
      fileName: att.fileName || att.name || `document_${att.id}`,
      mimeType: att.mimeType || att.contentType || 'application/octet-stream',
      data: att.content ? Buffer.from(att.content, 'base64') : null,
      description: att.description || att.title || '',
      url: att.url || att.downloadUrl || null,
    }));
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    await this._ensureToken();

    const operaNote = {
      comment: {
        text: {
          value: `[${note.category || 'AccuDefend'}] ${note.title}\n\n${note.content}`,
        },
        type: 'GEN', // General comment
        title: note.title,
        internal: true,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/crm/v1/hotels/${this.hotelId}/profiles/${guestId}/comments`,
        operaNote
      );
      return response.data;
    });

    this._logApiCall('POST', `/crm/v1/.../profiles/${guestId}/comments`, 201, durationMs);

    return {
      success: true,
      noteId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    await this._ensureToken();

    // Opera represents flags as alert-type comments or traces
    const operaAlert = {
      comment: {
        text: {
          value: `CHARGEBACK ALERT: ${flagData.reason}` +
            (flagData.amount ? ` | Amount: $${flagData.amount}` : '') +
            (flagData.chargebackId ? ` | Case: ${flagData.chargebackId}` : ''),
        },
        type: 'ALT', // Alert comment type
        title: `AccuDefend Flag: ${flagData.severity?.toUpperCase() || 'HIGH'}`,
        internal: true,
        guestViewable: false,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/crm/v1/hotels/${this.hotelId}/profiles/${guestId}/comments`,
        operaAlert
      );
      return response.data;
    });

    this._logApiCall('POST', `/crm/v1/.../profiles/${guestId}/comments`, 201, durationMs);

    return {
      success: true,
      flagId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    await this._ensureToken();

    const operaComment = {
      comment: {
        text: {
          value: [
            `=== CHARGEBACK ALERT ===`,
            `Case #: ${alertData.caseNumber}`,
            `Amount: $${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            `---`,
            `Generated by AccuDefend Chargeback Defense System`,
          ].join('\n'),
        },
        type: 'ALT',
        title: `Chargeback Alert - Case ${alertData.caseNumber}`,
        internal: true,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/rsv/v1/hotels/${this.hotelId}/reservations/${reservationId}/comments`,
        operaComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/rsv/v1/.../reservations/${reservationId}/comments`, 201, durationMs);

    return {
      success: true,
      commentId: result?.commentId || result?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    await this._ensureToken();

    const won = outcomeData.outcome === 'WON';
    const operaComment = {
      comment: {
        text: {
          value: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            `---`,
            `Generated by AccuDefend Chargeback Defense System`,
          ].join('\n'),
        },
        type: won ? 'GEN' : 'ALT',
        title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
        internal: true,
        time: new Date().toISOString(),
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/rsv/v1/hotels/${this.hotelId}/reservations/${reservationId}/comments`,
        operaComment
      );
      return response.data;
    });

    this._logApiCall('POST', `/rsv/v1/.../reservations/${reservationId}/comments`, 201, durationMs);

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

  async registerWebhook(callbackUrl, events) {
    await this._ensureToken();

    const webhookPayload = {
      webhook: {
        callbackUrl,
        events: events.map(e => this._mapEventToOpera(e)),
        secret: crypto.randomBytes(32).toString('hex'),
        active: true,
      },
    };

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/int/v1/webhooks`,
        webhookPayload
      );
      return response.data;
    });

    this._logApiCall('POST', '/int/v1/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id,
      callbackUrl,
      events,
      secret: webhookPayload.webhook.secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  async deregisterWebhook(webhookId) {
    await this._ensureToken();

    const { durationMs } = await this._timed(async () => {
      await this.httpClient.delete(`/int/v1/webhooks/${webhookId}`);
    });

    this._logApiCall('DELETE', `/int/v1/webhooks/${webhookId}`, 204, durationMs);
  }

  parseWebhookPayload(rawPayload, headers) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    // Opera webhook payloads typically have: eventType, hotelId, data
    const eventType = payload.eventType || payload.event || payload.type;
    const data = payload.data || payload.details || payload;

    return {
      eventType: this._mapOperaEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.createdAt || new Date().toISOString(),
      hotelId: payload.hotelId || this.hotelId,
      data: {
        reservationId: data.reservationId || data.confirmationNumber,
        guestId: data.profileId || data.guestId,
        ...data,
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

  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    // Opera nests data deeply: reservationInfo -> roomStay, guestNameList, etc.
    const resInfo = pmsData.reservationIdList || pmsData;
    const roomStay = pmsData.roomStay || pmsData.roomStays?.[0] || {};
    const guestNames = pmsData.guestNameList?.guestName || pmsData.guestNames || [];
    const primaryGuest = guestNames[0] || {};
    const ratePlan = roomStay.ratePlans?.[0] || roomStay.ratePlan || {};
    const roomType = roomStay.roomTypes?.[0] || roomStay.roomType || {};
    const payment = pmsData.paymentMethods?.[0] || pmsData.cashiering?.payment || {};

    // Extract confirmation number from various Opera structures
    const confirmationNumber =
      resInfo?.confirmationNumber ||
      resInfo?.id?.value ||
      pmsData.confirmationNumber ||
      pmsData.reservationId ||
      '';

    // Extract guest profile ID
    const guestProfileId =
      primaryGuest.profileId?.value ||
      primaryGuest.profileId ||
      pmsData.guestProfileId ||
      '';

    const guestNameObj = primaryGuest.givenName || primaryGuest.name
      ? {
          firstName: primaryGuest.givenName || primaryGuest.name?.givenName || '',
          lastName: primaryGuest.surname || primaryGuest.name?.surname || '',
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
      loyaltyNumber: pmsData.membershipId || pmsData.loyalty?.membershipNumber || '',
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    // Opera cashiering returns folioWindows -> postings or folioItems
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
        });
      }
    }

    return allItems;
  }

  normalizeGuestProfile(pmsData) {
    const profile = pmsData?.profileDetails?.profile || pmsData?.profile || pmsData || {};
    const name = profile.name || profile.customer?.name || {};
    const addresses = profile.addresses?.address || profile.addresses || [];
    const emails = profile.emails?.email || profile.emails || [];
    const phones = profile.phones?.phone || profile.phones || [];
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
      loyaltyNumber: profile.membershipId || profile.membership?.membershipNumber || '',
      loyaltyLevel: profile.membershipLevel || profile.membership?.membershipLevel || '',
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

  normalizeRates(pmsData) {
    const ratePlans = pmsData?.ratePlanCodes || pmsData?.ratePlans || pmsData?.listOfValues || [];

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
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      await this._ensureToken();

      const response = await this.httpClient.get(
        `/rsv/v1/hotels/${this.hotelId}/reservations`,
        { params: { limit: 1 } }
      );

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          hotelId: this.hotelId,
          apiVersion: response.headers?.['x-api-version'] || 'unknown',
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
          hotelId: this.hotelId,
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

  /** Map canonical status to Opera's reservation status codes. */
  _mapStatusToOpera(status) {
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

  /** Map canonical event names to Opera webhook event types. */
  _mapEventToOpera(event) {
    const map = {
      'reservation.created': 'RESERVATION_CREATED',
      'reservation.updated': 'RESERVATION_UPDATED',
      'reservation.cancelled': 'RESERVATION_CANCELLED',
      'guest.checked_in': 'CHECKIN',
      'guest.checked_out': 'CHECKOUT',
      'payment.received': 'PAYMENT_POSTED',
      'folio.updated': 'FOLIO_UPDATED',
    };
    return map[event] || event;
  }

  /** Map Opera event types back to canonical. */
  _mapOperaEventToCanonical(operaEvent) {
    const map = {
      RESERVATION_CREATED: 'reservation.created',
      RESERVATION_UPDATED: 'reservation.updated',
      RESERVATION_CANCELLED: 'reservation.cancelled',
      CHECKIN: 'guest.checked_in',
      CHECKOUT: 'guest.checked_out',
      PAYMENT_POSTED: 'payment.received',
      FOLIO_UPDATED: 'folio.updated',
    };
    return map[operaEvent] || operaEvent;
  }
}

module.exports = OperaCloudAdapter;
