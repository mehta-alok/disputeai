/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Fiserv (formerly First Data) Dispute Adapter
 *
 * Implements two-way integration with Fiserv's dispute management platform:
 *   - Receive chargeback notifications via ClientLine reporting
 *   - Submit compelling evidence and representment packages
 *   - Track dispute lifecycle through Fiserv's portal
 *   - Supports Clover merchant integrations
 *
 * Auth: OAuth2 client credentials flow. Access tokens are cached and refreshed
 *       automatically before expiration.
 * Base URL: https://connect.fiservapis.com/api/v2 (configurable via FISERV_API_URL env var)
 *
 * Fiserv processes transactions across multiple card networks and provides
 * unified chargeback management through their ClientLine and Clover platforms.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// FISERV REASON CODE MAPPINGS
// =============================================================================

const FISERV_REASON_CODES = {
  '10.1': { code: '10.1', category: 'FRAUD', description: 'EMV Liability Shift Counterfeit Fraud' },
  '10.4': { code: '10.4', category: 'FRAUD', description: 'Other Fraud - Card-Absent Environment' },
  '10.5': { code: '10.5', category: 'FRAUD', description: 'Visa Fraud Monitoring Program' },
  '13.1': { code: '13.1', category: 'CONSUMER_DISPUTE', description: 'Merchandise/Services Not Received' },
  '13.2': { code: '13.2', category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring Transaction' },
  '13.3': { code: '13.3', category: 'CONSUMER_DISPUTE', description: 'Not as Described or Defective' },
  '13.6': { code: '13.6', category: 'CONSUMER_DISPUTE', description: 'Credit Not Processed' },
  '13.7': { code: '13.7', category: 'CONSUMER_DISPUTE', description: 'Cancelled Merchandise/Services' },
  '4837': { code: '4837', category: 'FRAUD', description: 'No Cardholder Authorization (MC)' },
  '4853': { code: '4853', category: 'CONSUMER_DISPUTE', description: 'Cardholder Dispute (MC)' },
  '4863': { code: '4863', category: 'CONSUMER_DISPUTE', description: 'Cardholder Does Not Recognize (MC)' },
  'A01':  { code: 'A01',  category: 'FRAUD', description: 'Charge Amount Exceeds Authorization (Amex)' },
  'C28':  { code: 'C28',  category: 'CONSUMER_DISPUTE', description: 'Cancelled Recurring (Discover)' },
  'F10':  { code: 'F10',  category: 'FRAUD', description: 'Missing Imprint (Amex)' },
  'F29':  { code: 'F29',  category: 'FRAUD', description: 'Card Not Present (Amex)' }
};

// Fiserv portal status -> AccuDefend internal status
const STATUS_MAP_FROM_FISERV = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'awaiting_response': 'PENDING',
  'under_review': 'IN_REVIEW',
  'in_review': 'IN_REVIEW',
  'documents_received': 'IN_REVIEW',
  'represented': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'won': 'WON',
  'merchant_won': 'WON',
  'chargeback_reversed': 'WON',
  'lost': 'LOST',
  'merchant_lost': 'LOST',
  'second_chargeback': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED'
};

// Fiserv webhook event types
const WEBHOOK_EVENTS = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status_changed',
  'chargeback.evidence_due',
  'chargeback.resolved',
  'chargeback.second_presentment'
];


class FiservAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId     - OAuth2 Client ID
   * @param {string} config.credentials.clientSecret - OAuth2 Client Secret
   * @param {string} config.credentials.merchantId   - Fiserv Merchant ID (MID)
   * @param {string} [config.credentials.terminalId] - Terminal ID (for Clover)
   * @param {string} [config.credentials.webhookSecret] - Shared secret for webhook verification
   * @param {string} [config.baseUrl] - Override default API base URL
   * @param {string} [config.tokenUrl] - Override OAuth2 token endpoint
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'FISERV',
      baseUrl: config.baseUrl || process.env.FISERV_API_URL || 'https://connect.fiservapis.com/api/v2'
    });

    this.merchantId = this.credentials.merchantId;
    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.terminalId = this.credentials.terminalId || '';
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.tokenUrl = config.tokenUrl || process.env.FISERV_TOKEN_URL || 'https://connect.fiservapis.com/oauth2/token';

    // OAuth2 token state
    this.accessToken = null;
    this.tokenExpiresAt = 0;

    // Initialize HTTP client (token will be set after authentication)
    this._initHttpClient({
      'X-Merchant-ID': this.merchantId
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Fiserv using OAuth2 client credentials flow.
   * Caches the access token and refreshes it automatically before expiration.
   *
   * @returns {Promise<Object>} { authenticated: boolean, expiresAt, message }
   */
  async authenticate() {
    try {
      const tokenPayload = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'disputes chargebacks merchants'
      });

      const response = await this._withRetry(() =>
        this.httpClient.post(this.tokenUrl, tokenPayload.toString(), {
          baseURL: '',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );

      const data = response.data;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000) - 60000; // 60s buffer

      // Update default Authorization header
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      logger.info(`[Fiserv] OAuth2 authentication successful for merchant ${this.merchantId}`);

      return {
        authenticated: true,
        merchantId: this.merchantId,
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
        message: 'Successfully authenticated with Fiserv API via OAuth2'
      };
    } catch (error) {
      logger.error(`[Fiserv] OAuth2 authentication failed: ${this._extractErrorMessage(error)}`);

      return {
        authenticated: false,
        merchantId: this.merchantId,
        message: `OAuth2 authentication failed: ${this._extractErrorMessage(error)}`
      };
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary.
   *
   * @returns {Promise<void>}
   */
  async _ensureAuthenticated() {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      const result = await this.authenticate();
      if (!result.authenticated) {
        throw new Error(`Fiserv authentication failed: ${result.message}`);
      }
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Fiserv
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload pushed from Fiserv.
   *
   * @param {Object} disputeData - Raw dispute data from Fiserv
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[Fiserv] Receiving dispute: ${disputeData.chargebackId || disputeData.disputeId || disputeData.id}`);

    const normalized = this.normalizeDispute(disputeData);

    logger.info(`[Fiserv] Dispute normalized: ${normalized.disputeId} (${normalized.reasonCode})`);
    return normalized;
  }

  /**
   * Submit compelling evidence to Fiserv for a dispute.
   *
   * @param {string} disputeId - Fiserv dispute identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message }
   */
  async submitEvidence(disputeId, evidence) {
    await this._ensureAuthenticated();

    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      representmentType: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        type: file.type || 'supporting_document',
        name: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        content: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`,
        category: file.category || 'general'
      })),
      transactionInfo: {
        guestName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        amount: metadata.transactionAmount,
        date: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authCode: metadata.authorizationCode
      },
      notes: metadata.notes || '',
      requestId: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v2/disputes/${disputeId}/documents`, payload)
    );

    logger.info(`[Fiserv] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Query Fiserv for the current status of a dispute.
   *
   * @param {string} disputeId - Fiserv dispute identifier
   * @returns {Promise<Object>} { disputeId, status, lastUpdated, notes }
   */
  async getDisputeStatus(disputeId) {
    await this._ensureAuthenticated();

    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v2/merchants/${this.merchantId}/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.lastUpdated || data.updatedAt,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      dueDate: data.responseDeadline || data.dueDate || null,
      chargebackStage: data.chargebackStage || null
    };
  }

  /**
   * Push a representment response to Fiserv.
   *
   * @param {string} disputeId - Fiserv dispute identifier
   * @param {Object} responseData - Representment data
   * @returns {Promise<Object>} { responseId, status, message }
   */
  async pushResponse(disputeId, responseData) {
    await this._ensureAuthenticated();

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      representmentType: responseData.representmentType || 'first_representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null
      },
      guestDetails: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyaltyId: responseData.guestDetails?.loyaltyNumber || null
      },
      stayDetails: {
        propertyName: responseData.stayDetails?.propertyName,
        confirmationNumber: responseData.stayDetails?.confirmationNumber,
        checkInDate: responseData.stayDetails?.checkInDate,
        checkOutDate: responseData.stayDetails?.checkOutDate,
        roomType: responseData.stayDetails?.roomType,
        roomRate: responseData.stayDetails?.roomRate,
        totalCharges: responseData.stayDetails?.totalCharges,
        noShow: responseData.stayDetails?.noShow || false,
        earlyCheckout: responseData.stayDetails?.earlyCheckout || false
      },
      documentIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      requestId: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v2/disputes/${disputeId}/represent`, payload)
    );

    logger.info(`[Fiserv] Representment submitted for dispute ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Representment submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a dispute.
   *
   * @param {string} disputeId - Fiserv dispute identifier
   * @returns {Promise<Object>} { accepted: true, disputeId }
   */
  async acceptDispute(disputeId) {
    await this._ensureAuthenticated();

    const payload = {
      chargebackId: disputeId,
      merchantId: this.merchantId,
      action: 'accept',
      reason: 'Liability accepted by merchant',
      requestId: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/api/v2/disputes/${disputeId}/accept`, payload)
    );

    logger.info(`[Fiserv] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute accepted'
    };
  }

  /**
   * Fetch a paginated list of disputes from Fiserv.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore }
   */
  async listDisputes(params = {}) {
    await this._ensureAuthenticated();

    const queryParams = {
      fromDate: params.since || undefined,
      status: params.status || undefined,
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get(`/api/v2/merchants/${this.merchantId}/disputes`, { params: queryParams })
    );

    const data = response.data;
    const disputes = data.chargebacks || data.disputes || data.data || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.total || disputes.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Fiserv webhook payload.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[Fiserv] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Fiserv webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Fiserv] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Fiserv webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify webhook signature
    const signature = headers['x-fiserv-signature'] || headers['X-Fiserv-Signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Fiserv] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event || parsed.type,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-fiserv-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || parsed.id || headers['x-fiserv-delivery-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook with Fiserv.
   *
   * @param {Object} config - Webhook configuration
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    await this._ensureAuthenticated();

    const callbackUrl = config.callbackUrl || config;
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      url: callbackUrl,
      events,
      active: true,
      signingSecret: webhookSecret,
      description: 'AccuDefend chargeback integration'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/api/v2/webhooks', payload)
    );

    logger.info(`[Fiserv] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.webhookId || response.data.id,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      message: response.data.message || 'Webhook registered successfully'
    };
  }

  // ===========================================================================
  // NORMALIZATION
  // ===========================================================================

  /**
   * Normalize a Fiserv dispute into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw dispute data from Fiserv
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.disputeId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || portalData.arn || null;
    const amount = parseFloat(portalData.amount || portalData.chargebackAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.chargebackReasonCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);
    const cardBrand = portalData.cardBrand || portalData.network || portalData.cardType || 'UNKNOWN';

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.last4 || portalData.maskedPan?.slice(-4) || '',
      cardBrand: cardBrand.toUpperCase(),
      guestName: portalData.cardholderName || portalData.customerName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.disputeDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      chargebackStage: portalData.stage || portalData.chargebackStage || 'first_chargeback',
      transactionId: portalData.transactionId || portalData.arn || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'FISERV',
      rawData: portalData
    };
  }

  /**
   * Map a Fiserv status string to AccuDefend internal status.
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_FISERV[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a reason code to a structured object.
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = FISERV_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    if (normalized.startsWith('13.')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    if (normalized.startsWith('48')) return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Mastercard Dispute - Code ${normalized}` };

    return { code: normalized, category: 'UNKNOWN', description: `Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Fiserv API.
   *
   * @returns {Promise<Object>} { healthy: boolean, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      await this._ensureAuthenticated();
      const response = await this.httpClient.get('/api/v2/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Fiserv API is reachable',
        details: {
          portalType: 'FISERV',
          merchantId: this.merchantId,
          tokenValid: Date.now() < this.tokenExpiresAt,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Fiserv API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'FISERV',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = FiservAdapter;
