/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * AutoClerk PMS Adapter
 *
 * Integrates with the AutoClerk PMS REST API (v2).
 *
 * Authentication: API Key + optional API Secret sent via headers.
 *   - X-API-Key:    required
 *   - X-API-Secret: optional (required for write operations)
 *
 * AutoClerk has the richest feature set among supported PMS integrations:
 *   - Real-time sync via webhooks
 *   - Full document management (upload / download)
 *   - Guest flag and note write support
 *   - Signature capture retrieval
 *   - ID verification data
 *   - Audit trail access
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://docs.autoclerk.com/api/v2/
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

const DEFAULT_BASE_URL = 'https://api.autoclerk.com/v2';

class AutoClerkAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - AutoClerk API key.
   * @param {string} [config.credentials.apiSecret]  - AutoClerk API secret (for writes).
   * @param {string} [config.credentials.propertyCode] - Property / hotel code.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.apiSecret = this.credentials.apiSecret || '';
    this.propertyCode = this.credentials.propertyCode || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  async authenticate() {
    // Build the HTTP client with API key headers
    this._buildAuthenticatedClient();

    // Verify credentials with a lightweight ping
    try {
      const response = await this.httpClient.get('/health', {
        params: { propertyCode: this.propertyCode },
      });

      const data = response.data;
      if (data?.status === 'ok' || data?.healthy === true || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Property: ${this.propertyCode}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/health', error);
      throw new Error(`AutoClerk authentication failed: ${error.message}`);
    }
  }

  async refreshAuth() {
    // API keys are static; no refresh needed.
    logger.info(`[PMS:${this.pmsType}] Token refresh not applicable (static API key).`);
  }

  /** @private */
  _buildAuthenticatedClient() {
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 120, refillRate: 120, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    const headers = {
      'X-API-Key': this.apiKey,
    };
    if (this.apiSecret) {
      headers['X-API-Secret'] = this.apiSecret;
    }
    if (this.propertyCode) {
      headers['X-Property-Code'] = this.propertyCode;
    }
    return headers;
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  async getReservation(confirmationNumber) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(confirmationNumber)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${confirmationNumber}`, 200, durationMs);

    const reservation = result?.reservation || result?.data || result;
    if (!reservation || Object.keys(reservation).length === 0) return null;

    return this.normalizeReservation(reservation);
  }

  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = { propertyCode: this.propertyCode };
    if (params.confirmationNumber) queryParams.confirmationNumber = params.confirmationNumber;
    if (params.guestName) queryParams.guestName = params.guestName;
    if (params.checkInDate) queryParams.checkInDate = params.checkInDate;
    if (params.checkOutDate) queryParams.checkOutDate = params.checkOutDate;
    if (params.cardLastFour) queryParams.cardLast4 = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToAutoClerk(params.status);
    queryParams.limit = params.limit || 50;
    queryParams.offset = params.offset || 0;

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

  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/folios/${encodeURIComponent(reservationId)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/folios/${reservationId}`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  async getGuestProfile(guestId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/guests/${encodeURIComponent(guestId)}`
      );
      return response.data;
    });

    this._logApiCall('GET', `/guests/${guestId}`, 200, durationMs);

    const guest = result?.guest || result?.data || result;
    if (!guest || Object.keys(guest).length === 0) return null;

    return this.normalizeGuestProfile(guest);
  }

  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/rates', {
        params: { propertyCode: this.propertyCode, ...params },
      });
      return response.data;
    });

    this._logApiCall('GET', '/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  async getReservationDocuments(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/documents`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/documents`, 200, durationMs);

    const documents = result?.documents || result?.data || [];

    // For each document, fetch the actual content if a download URL is provided
    const enriched = [];
    for (const doc of documents) {
      let data = null;

      if (doc.content) {
        data = Buffer.from(doc.content, 'base64');
      } else if (doc.downloadUrl || doc.url) {
        try {
          const dlResponse = await this.httpClient.get(doc.downloadUrl || doc.url, {
            responseType: 'arraybuffer',
          });
          data = Buffer.from(dlResponse.data);
        } catch (dlError) {
          logger.warn(
            `[PMS:${this.pmsType}] Failed to download document ${doc.id}: ${dlError.message}`
          );
        }
      }

      enriched.push({
        type: doc.documentType || doc.type || doc.category || 'other',
        fileName: doc.fileName || doc.name || `doc_${doc.id || 'unknown'}`,
        mimeType: doc.mimeType || doc.contentType || 'application/octet-stream',
        data,
        description: doc.description || doc.title || doc.documentType || '',
        documentId: doc.id || doc.documentId || '',
        capturedAt: normalizeDate(doc.capturedAt || doc.createdAt),
      });
    }

    return enriched;
  }

  /**
   * Fetch signature capture image for a reservation.
   * AutoClerk-specific feature.
   *
   * @param {string} reservationId
   * @returns {Promise<Object|null>}
   */
  async getSignatureCapture(reservationId) {
    this._ensureAuthenticated();

    try {
      const { result, durationMs } = await this._timed(async () => {
        const response = await this.httpClient.get(
          `/reservations/${encodeURIComponent(reservationId)}/signature`
        );
        return response.data;
      });

      this._logApiCall('GET', `/reservations/${reservationId}/signature`, 200, durationMs);

      if (!result?.signature && !result?.data) return null;

      const sig = result.signature || result.data;
      return {
        imageData: sig.imageData ? Buffer.from(sig.imageData, 'base64') : null,
        mimeType: sig.mimeType || 'image/png',
        capturedAt: normalizeDate(sig.capturedAt || sig.timestamp),
        captureDevice: sig.deviceId || sig.captureDevice || '',
        verified: sig.verified === true,
      };
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Fetch ID verification data for a reservation.
   * AutoClerk-specific feature.
   *
   * @param {string} reservationId
   * @returns {Promise<Object|null>}
   */
  async getIdVerification(reservationId) {
    this._ensureAuthenticated();

    try {
      const { result, durationMs } = await this._timed(async () => {
        const response = await this.httpClient.get(
          `/reservations/${encodeURIComponent(reservationId)}/id-verification`
        );
        return response.data;
      });

      this._logApiCall('GET', `/reservations/${reservationId}/id-verification`, 200, durationMs);

      const idData = result?.verification || result?.data || result;
      if (!idData || Object.keys(idData).length === 0) return null;

      return {
        documentType: idData.documentType || idData.idType || '',
        documentNumber: idData.documentNumber ? '****' + String(idData.documentNumber).slice(-4) : '',
        issuingCountry: idData.issuingCountry || idData.country || '',
        issuingState: idData.issuingState || idData.state || '',
        expirationDate: normalizeDate(idData.expirationDate),
        verified: idData.verified === true || idData.matchResult === 'match',
        matchesReservation: idData.nameMatch === true || idData.matchesReservation === true,
        scannedAt: normalizeDate(idData.scannedAt || idData.capturedAt),
        scanDevice: idData.deviceId || idData.scanDevice || '',
      };
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  /**
   * Fetch audit trail for a reservation.
   * AutoClerk-specific feature.
   *
   * @param {string} reservationId
   * @returns {Promise<Object[]>}
   */
  async getAuditTrail(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/audit-trail`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/audit-trail`, 200, durationMs);

    const entries = result?.auditTrail || result?.entries || result?.data || [];
    return entries.map(entry => ({
      timestamp: normalizeDate(entry.timestamp || entry.createdAt),
      action: entry.action || entry.eventType || '',
      description: entry.description || entry.details || '',
      userId: entry.userId || entry.performedBy || '',
      userName: entry.userName || entry.performedByName || '',
      fieldChanged: entry.fieldName || entry.field || '',
      oldValue: entry.oldValue || entry.previousValue || '',
      newValue: entry.newValue || entry.currentValue || '',
      ipAddress: entry.ipAddress || '',
    }));
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/notes', {
        guestId,
        propertyCode: this.propertyCode,
        title: note.title,
        content: note.content,
        priority: note.priority || 'medium',
        category: note.category || 'chargeback',
        source: 'AccuDefend',
        isInternal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/notes', 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/flags`,
        {
          reason: flagData.reason,
          severity: flagData.severity || 'high',
          flagType: 'chargeback_history',
          source: 'AccuDefend',
          chargebackId: flagData.chargebackId || null,
          amount: flagData.amount || null,
          propertyCode: this.propertyCode,
          isActive: true,
          expiresAt: null, // Flags don't expire by default
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/flags`, 201, durationMs);

    return {
      success: true,
      flagId: result?.flagId || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    // AutoClerk supports a dedicated notes endpoint on reservations
    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/notes', {
        reservationId,
        propertyCode: this.propertyCode,
        title: `Chargeback Alert - Case ${alertData.caseNumber}`,
        content: [
          '=== CHARGEBACK ALERT ===',
          `Case #: ${alertData.caseNumber}`,
          `Amount: $${alertData.amount}`,
          `Reason Code: ${alertData.reasonCode}`,
          `Dispute Date: ${alertData.disputeDate}`,
          `Status: ${alertData.status}`,
          '--- Generated by AccuDefend Chargeback Defense System ---',
        ].join('\n'),
        priority: 'high',
        category: 'chargeback_alert',
        source: 'AccuDefend',
        isInternal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/notes (chargeback alert)', 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/notes', {
        reservationId,
        propertyCode: this.propertyCode,
        title: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
        content: [
          `=== DISPUTE ${outcomeData.outcome} ===`,
          `Case #: ${outcomeData.caseNumber}`,
          `Outcome: ${outcomeData.outcome}`,
          `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
          `Resolved: ${outcomeData.resolvedDate}`,
          '--- Generated by AccuDefend Chargeback Defense System ---',
        ].join('\n'),
        priority: won ? 'medium' : 'high',
        category: 'dispute_outcome',
        source: 'AccuDefend',
        isInternal: true,
      });
      return response.data;
    });

    this._logApiCall('POST', '/notes (dispute outcome)', 201, durationMs);

    return {
      success: true,
      noteId: result?.noteId || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Upload a document to AutoClerk (e.g., evidence PDF, compiled dispute package).
   * AutoClerk-specific feature.
   *
   * @param {string} reservationId
   * @param {Object} document
   * @param {string} document.fileName
   * @param {string} document.mimeType
   * @param {Buffer} document.data
   * @param {string} [document.category]
   * @param {string} [document.description]
   * @returns {Promise<Object>}
   */
  async uploadDocument(reservationId, document) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/documents', {
        reservationId,
        propertyCode: this.propertyCode,
        fileName: document.fileName,
        mimeType: document.mimeType,
        content: document.data.toString('base64'),
        category: document.category || 'chargeback_evidence',
        description: document.description || '',
        source: 'AccuDefend',
      });
      return response.data;
    });

    this._logApiCall('POST', '/documents', 201, durationMs);

    return {
      success: true,
      documentId: result?.documentId || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      fileName: document.fileName,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  async registerWebhook(callbackUrl, events) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks', {
        callbackUrl,
        events: events.map(e => this._mapEventToAutoClerk(e)),
        secret,
        propertyCode: this.propertyCode,
        isActive: true,
        description: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhookId || result?.id || result?.data?.id,
      callbackUrl,
      events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  async deregisterWebhook(webhookId) {
    this._ensureAuthenticated();

    const { durationMs } = await this._timed(async () => {
      await this.httpClient.delete(`/webhooks/${encodeURIComponent(webhookId)}`);
    });

    this._logApiCall('DELETE', `/webhooks/${webhookId}`, 204, durationMs);
  }

  parseWebhookPayload(rawPayload, headers) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    // AutoClerk webhook format: { event, timestamp, data: { ... } }
    const eventType = payload.event || payload.action || payload.type;
    const data = payload.data || payload.details || {};

    return {
      eventType: this._mapAutoClerkEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.created_at || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.reservationId || data.confirmation_number,
        guestId: data.guest_id || data.guestId,
        propertyCode: data.property_code || data.propertyCode || this.propertyCode,
        ...data,
      },
      raw: payload,
    };
  }

  verifyWebhookSignature(rawPayload, signature, secret) {
    const body = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);

    // AutoClerk uses HMAC-SHA256 with the timestamp prepended
    // Format: timestamp.body
    const timestamp = signature.split(',').find(p => p.startsWith('t='))?.slice(2);
    const sig = signature.split(',').find(p => p.startsWith('v1='))?.slice(3);

    if (!timestamp || !sig) {
      // Fallback: simple HMAC comparison
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

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
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

    const guest = pmsData.guest || pmsData.primaryGuest || {};

    return {
      confirmationNumber: String(
        pmsData.confirmation_number || pmsData.confirmationNumber || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || pmsData.confirmationNumber || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.reservation_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.firstName || pmsData.guest_first_name || '',
        lastName: guest.last_name || guest.lastName || pmsData.guest_last_name || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || guest.mobile || pmsData.guest_phone),
      address: normalizeAddress({
        line1: guest.address_line1 || guest.address || '',
        line2: guest.address_line2 || '',
        city: guest.city || '',
        state: guest.state || '',
        postalCode: guest.postal_code || guest.zip || '',
        country: guest.country || '',
      }),
      checkInDate: normalizeDate(pmsData.check_in_date || pmsData.checkInDate || pmsData.arrival),
      checkOutDate: normalizeDate(pmsData.check_out_date || pmsData.checkOutDate || pmsData.departure),
      roomNumber: pmsData.room_number || pmsData.roomNumber || '',
      roomType: pmsData.room_type || pmsData.roomType || pmsData.room_type_name || '',
      rateCode: pmsData.rate_code || pmsData.rateCode || '',
      ratePlanDescription: pmsData.rate_description || pmsData.ratePlanDescription || '',
      totalAmount: normalizeAmount(pmsData.total_amount || pmsData.totalAmount || pmsData.total),
      currency: normalizeCurrency(pmsData.currency || pmsData.currency_code),
      numberOfGuests: (pmsData.adults || 0) + (pmsData.children || 0) || pmsData.guest_count || 1,
      numberOfNights: this._calculateNights(
        pmsData.check_in_date || pmsData.checkInDate,
        pmsData.check_out_date || pmsData.checkOutDate
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(
          pmsData.card_type || pmsData.cardType || pmsData.payment_card_type || ''
        ),
        cardLastFour: pmsData.card_last4 || pmsData.cardLast4 || pmsData.card_last_four || '',
        authCode: pmsData.auth_code || pmsData.authorizationCode || '',
      },
      bookingSource: pmsData.booking_source || pmsData.source || pmsData.channel || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.createdAt),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.updatedAt),
      specialRequests: pmsData.special_requests || pmsData.specialRequests || pmsData.notes || '',
      loyaltyNumber: pmsData.loyalty_number || pmsData.loyaltyNumber || '',
      // AutoClerk-specific fields
      signatureCaptured: pmsData.signature_captured === true || pmsData.hasSignature === true,
      idVerified: pmsData.id_verified === true || pmsData.hasIdVerification === true,
      documentsAvailable: pmsData.documents_count || pmsData.documentCount || 0,
      auditTrailAvailable: pmsData.has_audit_trail !== false,
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeFolioItems(pmsData) {
    const folio = pmsData?.folio || pmsData?.data || pmsData;
    const items = folio?.items || folio?.transactions || folio?.line_items || [];

    if (Array.isArray(folio) && !items.length) {
      // Flat array of items
      return folio.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.folio_id || item.folioId || '',
      transactionId: String(item.id || item.transaction_id || item.transactionId || ''),
      transactionCode: item.transaction_code || item.transactionCode || item.code || '',
      category: normalizeFolioCategory(
        item.category || item.transaction_type || item.type || item.description
      ),
      description: item.description || item.item_description || item.name || '',
      amount: normalizeAmount(item.amount || item.total),
      currency: normalizeCurrency(item.currency || item.currency_code),
      postDate: normalizeDate(item.post_date || item.postDate || item.transaction_date || item.date),
      cardLastFour: item.card_last4 || item.cardLast4 || '',
      authCode: item.auth_code || item.authorizationCode || '',
      reference: item.reference || item.reference_number || '',
      reversalFlag: item.is_reversal === true || item.reversal === true || item.voided === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.user || item.cashier || '',
      department: item.department || item.department_code || '',
    };
  }

  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.first_name || pmsData.firstName || '',
        lastName: pmsData.last_name || pmsData.lastName || '',
      }),
      email: pmsData.email || '',
      phone: normalizePhone(pmsData.phone || pmsData.mobile || pmsData.cell_phone),
      address: normalizeAddress({
        line1: pmsData.address_line1 || pmsData.address || '',
        line2: pmsData.address_line2 || '',
        city: pmsData.city || '',
        state: pmsData.state || '',
        postalCode: pmsData.postal_code || pmsData.zip || '',
        country: pmsData.country || '',
      }),
      vipCode: pmsData.vip_code || pmsData.vipStatus || '',
      loyaltyNumber: pmsData.loyalty_number || pmsData.loyaltyNumber || '',
      loyaltyLevel: pmsData.loyalty_level || pmsData.loyaltyLevel || '',
      nationality: pmsData.nationality || pmsData.country || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company || pmsData.company_name || '',
      totalStays: pmsData.total_stays || pmsData.visit_count || 0,
      totalRevenue: normalizeAmount(pmsData.total_revenue || pmsData.lifetime_value || 0),
      lastStayDate: normalizeDate(pmsData.last_stay || pmsData.last_visit_date),
      // AutoClerk-specific
      flags: (pmsData.flags || []).map(f => ({
        id: f.id || f.flag_id,
        type: f.type || f.flag_type,
        reason: f.reason || f.description,
        severity: f.severity || 'medium',
        isActive: f.is_active !== false,
        createdAt: normalizeDate(f.created_at),
      })),
      idOnFile: pmsData.id_on_file === true || pmsData.has_id === true,
      signatureOnFile: pmsData.signature_on_file === true || pmsData.has_signature === true,
      createdAt: normalizeDate(pmsData.created_at || pmsData.createdAt),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  normalizeRates(pmsData) {
    const rates = pmsData?.rates || pmsData?.data || pmsData;
    if (!Array.isArray(rates)) return [];

    return rates.map(rate => ({
      rateCode: String(rate.id || rate.rate_code || rate.code || ''),
      name: rate.name || rate.rate_name || '',
      description: rate.description || rate.long_description || '',
      category: rate.category || rate.rate_category || '',
      baseAmount: normalizeAmount(rate.base_rate || rate.amount || rate.default_rate),
      currency: normalizeCurrency(rate.currency || rate.currency_code),
      startDate: normalizeDate(rate.start_date || rate.effective_date),
      endDate: normalizeDate(rate.end_date || rate.expiry_date),
      isActive: rate.is_active !== false && rate.status !== 'inactive',
      roomTypes: rate.room_types || rate.applicable_room_types || [],
      inclusions: rate.inclusions || rate.packages || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_policy || '',
      minNights: rate.min_nights || rate.minimum_stay || 0,
      maxNights: rate.max_nights || rate.maximum_stay || 0,
      commissionable: rate.commissionable === true,
    }));
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/health', {
        params: { propertyCode: this.propertyCode },
      });

      const data = response.data;

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          propertyCode: this.propertyCode,
          apiVersion: data?.version || data?.apiVersion || 'v2',
          features: {
            realTimeSync: true,
            autoEvidence: true,
            signatureCapture: true,
            idVerification: true,
            documentManagement: true,
            auditTrail: true,
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
    const s = normalizeDate(arrival);
    const e = normalizeDate(departure);
    if (!s || !e) return 0;
    const diff = new Date(e) - new Date(s);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  _mapStatusToAutoClerk(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'in_house',
      checked_out: 'checked_out',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  _mapEventToAutoClerk(event) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'guest.checkin',
      'guest.checked_out': 'guest.checkout',
      'payment.received': 'payment.created',
      'folio.updated': 'folio.updated',
      'document.uploaded': 'document.created',
    };
    return map[event] || event;
  }

  _mapAutoClerkEventToCanonical(acEvent) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checkin': 'guest.checked_in',
      'guest.checkout': 'guest.checked_out',
      'payment.created': 'payment.received',
      'folio.updated': 'folio.updated',
      'document.created': 'document.uploaded',
      'guest.flagged': 'guest.flagged',
      'signature.captured': 'signature.captured',
      'id.verified': 'id.verified',
    };
    return map[acEvent] || acEvent;
  }
}

module.exports = AutoClerkAdapter;
