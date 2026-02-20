/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Visa Resolve Online (VROL) Dispute Adapter
 *
 * Implements two-way integration with Visa's VROL platform:
 *   - VROL is Visa's official dispute resolution portal for acquirers and merchants
 *   - Handles the full chargeback lifecycle: first chargeback, representment,
 *     pre-arbitration, arbitration, and compliance cases
 *   - Supports TC40 fraud report ingestion and CDRN alert cross-referencing
 *   - Implements Visa Compelling Evidence 3.0 (CE3.0) for enhanced fraud
 *     representment with transaction history matching
 *   - Covers all Visa reason codes from 10.1 through 13.7
 *
 * Auth: OAuth2 via Visa Developer Portal (client_credentials grant).
 *       Requires mutual TLS (mTLS) certificate for production.
 * Base URL: https://sandbox.api.visa.com (configurable via VISA_VROL_API_URL env var)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// VISA REASON CODE MAPPINGS (Complete Set)
// =============================================================================

const VISA_REASON_CODES = {
  '10.1': {
    code: '10.1', category: 'FRAUD',
    description: 'EMV Liability Shift Counterfeit Fraud',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability_certificate'],
    responseDeadlineDays: 30
  },
  '10.2': {
    code: '10.2', category: 'FRAUD',
    description: 'EMV Liability Shift Non-Counterfeit Fraud',
    compellingEvidenceTypes: ['emv_chip_transaction_log', 'terminal_capability_certificate', 'pin_validation_log'],
    responseDeadlineDays: 30
  },
  '10.3': {
    code: '10.3', category: 'FRAUD',
    description: 'Other Fraud - Card-Present Environment',
    compellingEvidenceTypes: ['signed_receipt', 'chip_read_log', 'surveillance_footage', 'id_verification'],
    responseDeadlineDays: 30
  },
  '10.4': {
    code: '10.4', category: 'FRAUD',
    description: 'Other Fraud - Card-Absent Environment',
    compellingEvidenceTypes: [
      'avs_cvv_match', 'delivery_confirmation', 'device_fingerprint',
      'ip_address_match', 'prior_undisputed_transactions', '3ds_authentication'
    ],
    responseDeadlineDays: 30,
    ce3Eligible: true
  },
  '10.5': {
    code: '10.5', category: 'FRAUD',
    description: 'Visa Fraud Monitoring Program',
    compellingEvidenceTypes: ['transaction_receipt', 'proof_of_delivery', 'signed_registration'],
    responseDeadlineDays: 30
  },
  '11.1': {
    code: '11.1', category: 'AUTHORIZATION',
    description: 'Card Recovery Bulletin',
    compellingEvidenceTypes: ['authorization_approval_code', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  '11.2': {
    code: '11.2', category: 'AUTHORIZATION',
    description: 'Declined Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log'],
    responseDeadlineDays: 30
  },
  '11.3': {
    code: '11.3', category: 'AUTHORIZATION',
    description: 'No Authorization',
    compellingEvidenceTypes: ['authorization_approval_code', 'authorization_log', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  '12.1': {
    code: '12.1', category: 'PROCESSING_ERROR',
    description: 'Late Presentment',
    compellingEvidenceTypes: ['transaction_date_proof', 'authorization_date'],
    responseDeadlineDays: 30
  },
  '12.2': {
    code: '12.2', category: 'PROCESSING_ERROR',
    description: 'Incorrect Transaction Code',
    compellingEvidenceTypes: ['original_transaction_receipt', 'corrected_transaction_data'],
    responseDeadlineDays: 30
  },
  '12.3': {
    code: '12.3', category: 'PROCESSING_ERROR',
    description: 'Incorrect Currency',
    compellingEvidenceTypes: ['currency_conversion_receipt', 'cardholder_agreement'],
    responseDeadlineDays: 30
  },
  '12.4': {
    code: '12.4', category: 'PROCESSING_ERROR',
    description: 'Incorrect Account Number',
    compellingEvidenceTypes: ['account_verification', 'transaction_receipt'],
    responseDeadlineDays: 30
  },
  '12.5': {
    code: '12.5', category: 'PROCESSING_ERROR',
    description: 'Incorrect Amount',
    compellingEvidenceTypes: ['signed_receipt', 'folio', 'itemized_charges'],
    responseDeadlineDays: 30
  },
  '12.6': {
    code: '12.6', category: 'PROCESSING_ERROR',
    description: 'Duplicate Processing/Paid by Other Means',
    compellingEvidenceTypes: ['transaction_log', 'unique_transaction_ids', 'separate_service_proof'],
    responseDeadlineDays: 30
  },
  '12.7': {
    code: '12.7', category: 'PROCESSING_ERROR',
    description: 'Invalid Data',
    compellingEvidenceTypes: ['valid_transaction_data', 'authorization_log'],
    responseDeadlineDays: 30
  },
  '13.1': {
    code: '13.1', category: 'CONSUMER_DISPUTE',
    description: 'Merchandise/Services Not Received',
    compellingEvidenceTypes: [
      'proof_of_delivery', 'check_in_confirmation', 'folio',
      'guest_registration_card', 'id_verification', 'key_card_access_log'
    ],
    responseDeadlineDays: 30
  },
  '13.2': {
    code: '13.2', category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Recurring Transaction',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement'],
    responseDeadlineDays: 30
  },
  '13.3': {
    code: '13.3', category: 'CONSUMER_DISPUTE',
    description: 'Not as Described or Defective Merchandise/Services',
    compellingEvidenceTypes: [
      'service_description', 'terms_accepted', 'guest_correspondence',
      'folio', 'quality_documentation', 'photos'
    ],
    responseDeadlineDays: 30
  },
  '13.4': {
    code: '13.4', category: 'CONSUMER_DISPUTE',
    description: 'Counterfeit Merchandise',
    compellingEvidenceTypes: ['authenticity_proof', 'supplier_documentation'],
    responseDeadlineDays: 30
  },
  '13.5': {
    code: '13.5', category: 'CONSUMER_DISPUTE',
    description: 'Misrepresentation',
    compellingEvidenceTypes: ['accurate_listing', 'terms_accepted', 'guest_correspondence'],
    responseDeadlineDays: 30
  },
  '13.6': {
    code: '13.6', category: 'CONSUMER_DISPUTE',
    description: 'Credit Not Processed',
    compellingEvidenceTypes: [
      'refund_policy', 'terms_and_conditions', 'no_refund_entitlement',
      'credit_issued_proof'
    ],
    responseDeadlineDays: 30
  },
  '13.7': {
    code: '13.7', category: 'CONSUMER_DISPUTE',
    description: 'Cancelled Merchandise/Services',
    compellingEvidenceTypes: [
      'cancellation_policy', 'no_show_documentation', 'terms_accepted',
      'guest_folio', 'reservation_confirmation'
    ],
    responseDeadlineDays: 30
  }
};

// VROL dispute stage definitions
const DISPUTE_STAGES = {
  FIRST_CHARGEBACK: 'first_chargeback',
  REPRESENTMENT: 'representment',
  PRE_ARBITRATION: 'pre_arbitration',
  ARBITRATION: 'arbitration',
  COMPLIANCE: 'compliance'
};

// VROL portal status -> AccuDefend internal status
const STATUS_MAP_FROM_VROL = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending_merchant_response': 'PENDING',
  'under_review': 'IN_REVIEW',
  'issuer_review': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'representment_filed': 'SUBMITTED',
  'pre_arbitration_pending': 'IN_REVIEW',
  'arbitration_pending': 'IN_REVIEW',
  'merchant_won': 'WON',
  'representment_accepted': 'WON',
  'merchant_lost': 'LOST',
  'representment_declined': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'accepted_by_merchant': 'RESOLVED'
};

// AccuDefend status -> VROL portal status
const STATUS_MAP_TO_VROL = {
  'PENDING': 'open',
  'IN_REVIEW': 'under_review',
  'SUBMITTED': 'representment_filed',
  'WON': 'merchant_won',
  'LOST': 'merchant_lost',
  'EXPIRED': 'expired',
  'RESOLVED': 'closed'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'dispute.created',
  'dispute.updated',
  'dispute.status_changed',
  'representment.accepted',
  'representment.declined',
  'pre_arbitration.initiated',
  'arbitration.initiated',
  'tc40.received',
  'compliance.case_opened'
];


class VisaVROLAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.clientId       - Visa Developer Portal OAuth2 client ID
   * @param {string} config.credentials.clientSecret   - Visa Developer Portal OAuth2 client secret
   * @param {string} config.credentials.merchantId     - Visa Merchant ID (VMID)
   * @param {string} config.credentials.acquirerBIN    - Acquiring bank BIN
   * @param {string} [config.credentials.mTLSCertPath] - Path to mTLS client certificate (PEM)
   * @param {string} [config.credentials.mTLSKeyPath]  - Path to mTLS private key (PEM)
   * @param {string} [config.credentials.webhookSecret]- Shared secret for webhook signature verification
   * @param {string} [config.baseUrl]                  - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'VISA_VROL',
      baseUrl: config.baseUrl || process.env.VISA_VROL_API_URL || 'https://sandbox.api.visa.com'
    });

    this.clientId = this.credentials.clientId;
    this.clientSecret = this.credentials.clientSecret;
    this.merchantId = this.credentials.merchantId;
    this.acquirerBIN = this.credentials.acquirerBIN;
    this.mTLSCertPath = this.credentials.mTLSCertPath || null;
    this.mTLSKeyPath = this.credentials.mTLSKeyPath || null;
    this.webhookSecret = this.credentials.webhookSecret || null;

    // OAuth2 token cache
    this._accessToken = null;
    this._tokenExpiresAt = 0;

    // Initialize HTTP client (auth header added dynamically via interceptor)
    this._initHttpClient({
      'X-Merchant-ID': this.merchantId,
      'X-Acquirer-BIN': this.acquirerBIN
    });

    // Add request interceptor to inject OAuth2 Bearer token
    this.httpClient.interceptors.request.use(async (reqConfig) => {
      const token = await this._ensureAccessToken();
      reqConfig.headers['Authorization'] = `Bearer ${token}`;
      return reqConfig;
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with Visa Developer Portal using OAuth2 client_credentials grant.
   * Tokens are cached and refreshed automatically before expiry.
   *
   * @returns {Promise<Object>} { accessToken, expiresIn, tokenType }
   */
  async authenticate() {
    logger.info('[VROL] Authenticating with Visa Developer Portal (OAuth2 client_credentials)');

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await this._withRetry(() =>
        this.httpClient.post('/oauth2/token', 'grant_type=client_credentials', {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );

      const data = response.data;
      this._accessToken = data.access_token;
      // Refresh 60 seconds before actual expiry
      this._tokenExpiresAt = Date.now() + ((data.expires_in - 60) * 1000);

      logger.info(`[VROL] Authentication successful. Token expires in ${data.expires_in}s`);

      return {
        accessToken: this._accessToken,
        expiresIn: data.expires_in,
        tokenType: data.token_type || 'Bearer'
      };
    } catch (error) {
      logger.error('[VROL] Authentication failed:', this._extractErrorMessage(error));
      throw new Error(`VROL OAuth2 authentication failed: ${this._extractErrorMessage(error)}`);
    }
  }

  /**
   * Ensure we have a valid access token, refreshing if expired.
   *
   * @returns {Promise<string>} Valid access token
   * @private
   */
  async _ensureAccessToken() {
    if (this._accessToken && Date.now() < this._tokenExpiresAt) {
      return this._accessToken;
    }
    const auth = await this.authenticate();
    return auth.accessToken;
  }

  // ===========================================================================
  // INBOUND: Receive FROM Visa VROL
  // ===========================================================================

  /**
   * Receive and normalize a dispute payload from VROL.
   * Handles first chargebacks, pre-arbitration cases, TC40 fraud reports,
   * and compliance cases.
   *
   * @param {Object} disputeData - Raw VROL dispute payload
   * @returns {Promise<Object>} Normalized dispute object
   */
  async receiveDispute(disputeData) {
    logger.info(`[VROL] Receiving dispute: ${disputeData.disputeId || disputeData.caseId || disputeData.vrolCaseNumber}`);

    const normalized = this.normalizeDispute(disputeData);

    // If this is a TC40 fraud report, flag it for enhanced review
    if (disputeData.tc40Data || disputeData.fraudType === 'TC40') {
      normalized.tc40Report = this._parseTC40Data(disputeData.tc40Data || disputeData);
      normalized.alertType = 'TC40';
      normalized.requiresEnhancedReview = true;
    }

    // Calculate response deadline based on dispute stage
    if (!normalized.dueDate) {
      normalized.dueDate = this._calculateResponseDeadline(
        normalized.disputeDate,
        normalized.disputeStage,
        normalized.reasonCode
      );
    }

    logger.info(`[VROL] Dispute normalized: ${normalized.disputeId} | Stage: ${normalized.disputeStage} | Reason: ${normalized.reasonCode} | Due: ${normalized.dueDate}`);
    return normalized;
  }

  /**
   * Query VROL for the current status of a dispute.
   *
   * @param {string} disputeId - VROL dispute identifier
   * @returns {Promise<Object>} Status details
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/visadirect/v1/disputes/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status || data.caseStatus),
      portalStatus: data.status || data.caseStatus,
      stage: data.stage || data.disputeStage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      lastUpdated: data.lastUpdatedDate || data.updatedAt,
      notes: data.statusNotes || data.notes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      financialImpact: data.financialImpact || null,
      issuerResponse: data.issuerResponse || null
    };
  }

  /**
   * Retrieve evidence requirements for a VROL dispute.
   * Combines VROL's specific requirements with reason-code-based compelling evidence rules.
   *
   * @param {string} disputeId - VROL dispute identifier
   * @returns {Promise<Object>} Evidence requirements
   */
  async getEvidenceRequirements(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/visadirect/v1/disputes/${disputeId}`)
    );

    const dispute = response.data;
    const reasonCode = dispute.reasonCode || dispute.conditionCode;
    const reasonInfo = VISA_REASON_CODES[reasonCode] || {};

    const portalRequired = dispute.requiredEvidenceTypes || [];
    const reasonRequired = reasonInfo.compellingEvidenceTypes || [];
    const allRequired = [...new Set([...portalRequired, ...reasonRequired])];

    // Check CE3.0 eligibility
    const ce3Eligible = reasonInfo.ce3Eligible || false;

    return {
      disputeId,
      requiredTypes: allRequired,
      portalRequiredTypes: portalRequired,
      recommendedTypes: reasonRequired,
      deadline: dispute.responseDeadline || dispute.dueDate,
      deadlineDays: reasonInfo.responseDeadlineDays || 30,
      instructions: dispute.evidenceInstructions || this._getDefaultEvidenceInstructions(reasonCode),
      reasonCode,
      reasonCategory: reasonInfo.category || 'UNKNOWN',
      ce3Eligible,
      ce3Requirements: ce3Eligible ? this._getCE3Requirements() : null,
      stage: dispute.stage || DISPUTE_STAGES.FIRST_CHARGEBACK
    };
  }

  /**
   * Fetch a paginated list of disputes from VROL.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated dispute list
   */
  async listDisputes(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      status: params.status || undefined,
      stage: params.stage || undefined,
      reasonCode: params.reasonCode || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/visadirect/v1/disputes', { params: queryParams })
    );

    const data = response.data;
    const disputes = data.disputes || data.cases || data.data || [];

    return {
      disputes: disputes.map((d) => this.normalizeDispute(d)),
      totalCount: data.totalCount || data.totalRecords || disputes.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Visa VROL
  // ===========================================================================

  /**
   * Submit an evidence package to VROL for a dispute representment.
   * Supports standard evidence as well as CE3.0 compelling evidence packages.
   *
   * @param {string} disputeId - VROL dispute identifier
   * @param {Object} evidence  - Evidence package with files and metadata
   * @returns {Promise<Object>} Submission result
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      evidenceCategory: metadata.evidenceCategory || 'compelling_evidence',
      compellingEvidenceVersion: metadata.ce3 ? '3.0' : '2.0',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        documentCategory: file.category || 'evidence',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        data: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`,
        sequenceNumber: index + 1
      })),
      transactionDetails: {
        cardholderName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        authorizationCode: metadata.authorizationCode,
        acquirerReferenceNumber: metadata.acquirerReferenceNumber
      },
      merchantNarrative: metadata.notes || '',
      idempotencyKey: this._generateIdempotencyKey('vrol_evidence')
    };

    // Attach CE3.0 data if applicable
    if (metadata.ce3 && metadata.ce3TransactionHistory) {
      payload.compellingEvidence3 = this._buildCE3Payload(metadata.ce3TransactionHistory);
    }

    const response = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/evidence`, payload)
    );

    logger.info(`[VROL] Evidence submitted for dispute ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to VROL for a disputed transaction.
   * This formally contests the chargeback with the issuer.
   *
   * @param {string} disputeId    - VROL dispute identifier
   * @param {Object} response     - Representment response details
   * @returns {Promise<Object>}   Result of representment filing
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      representmentType: responseData.representmentType || 'first_representment',
      disputeStage: responseData.stage || DISPUTE_STAGES.REPRESENTMENT,
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        version: responseData.compellingEvidence?.version || '2.0',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceFingerprint: responseData.compellingEvidence?.deviceFingerprint || null,
        ipAddress: responseData.compellingEvidence?.ipAddress || null,
        authenticationData: responseData.compellingEvidence?.authenticationData || null
      },
      guestDetails: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyaltyNumber: responseData.guestDetails?.loyaltyNumber || null,
        idVerified: responseData.guestDetails?.idVerified || false
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
        earlyCheckout: responseData.stayDetails?.earlyCheckout || false,
        folioNumber: responseData.stayDetails?.folioNumber || null
      },
      evidenceIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('vrol_response')
    };

    const resp = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/represent`, payload)
    );

    logger.info(`[VROL] Representment filed for dispute ${disputeId} (stage: ${payload.disputeStage})`);

    return {
      responseId: resp.data.responseId || resp.data.representmentId || resp.data.id,
      status: resp.data.status || 'filed',
      stage: payload.disputeStage,
      message: resp.data.message || 'Representment filed successfully',
      timestamp: resp.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a VROL dispute (do not contest).
   *
   * @param {string} disputeId - VROL dispute identifier
   * @returns {Promise<Object>} Acceptance result
   */
  async acceptDispute(disputeId) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      action: 'accept_liability',
      merchantNotes: 'Liability accepted by merchant via AccuDefend',
      idempotencyKey: this._generateIdempotencyKey('vrol_accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/accept`, payload)
    );

    logger.info(`[VROL] Dispute ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Dispute liability accepted'
    };
  }

  // ===========================================================================
  // PRE-ARBITRATION AND ARBITRATION
  // ===========================================================================

  /**
   * Respond to a pre-arbitration case on VROL.
   * Pre-arbitration occurs when the issuer contests the representment.
   *
   * @param {string} disputeId   - VROL dispute identifier
   * @param {Object} preArbData  - Pre-arbitration response data
   * @returns {Promise<Object>}  Result of pre-arbitration response
   */
  async respondToPreArbitration(disputeId, preArbData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      action: preArbData.action || 'contest', // 'contest' or 'accept'
      additionalEvidence: preArbData.additionalEvidence || [],
      merchantNarrative: preArbData.narrative || '',
      requestArbitration: preArbData.requestArbitration || false,
      evidenceIds: preArbData.evidenceIds || [],
      idempotencyKey: this._generateIdempotencyKey('vrol_prearb')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/pre-arbitration`, payload)
    );

    logger.info(`[VROL] Pre-arbitration response filed for dispute ${disputeId} (action: ${payload.action})`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'filed',
      stage: DISPUTE_STAGES.PRE_ARBITRATION,
      message: response.data.message || 'Pre-arbitration response filed',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * File for arbitration with Visa on a disputed transaction.
   * Arbitration is the final stage where Visa reviews and makes a binding decision.
   *
   * @param {string} disputeId      - VROL dispute identifier
   * @param {Object} arbitrationData - Arbitration filing data
   * @returns {Promise<Object>}      Result of arbitration filing
   */
  async fileArbitration(disputeId, arbitrationData) {
    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      stage: DISPUTE_STAGES.ARBITRATION,
      arbitrationReason: arbitrationData.reason || 'compelling_evidence',
      merchantNarrative: arbitrationData.narrative || '',
      evidenceIds: arbitrationData.evidenceIds || [],
      requestedOutcome: arbitrationData.requestedOutcome || 'reverse_chargeback',
      financialLiabilityAccepted: arbitrationData.acceptFilingFee || false,
      idempotencyKey: this._generateIdempotencyKey('vrol_arb')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/arbitration`, payload)
    );

    logger.info(`[VROL] Arbitration filed for dispute ${disputeId}`);

    return {
      arbitrationId: response.data.arbitrationId || response.data.id,
      status: response.data.status || 'filed',
      stage: DISPUTE_STAGES.ARBITRATION,
      estimatedDecisionDate: response.data.estimatedDecisionDate || null,
      filingFee: response.data.filingFee || null,
      message: response.data.message || 'Arbitration case filed with Visa',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // TC40 FRAUD REPORTS
  // ===========================================================================

  /**
   * Fetch TC40 fraud reports from VROL.
   * TC40 reports are fraud notifications filed by issuers that precede chargebacks.
   *
   * @param {Object} params - Query parameters for TC40 reports
   * @returns {Promise<Object>} List of TC40 fraud reports
   */
  async fetchTC40Reports(params = {}) {
    const queryParams = {
      startDate: params.since || undefined,
      endDate: params.until || undefined,
      fraudType: params.fraudType || undefined,
      page: params.page || 1,
      pageSize: Math.min(params.limit || 50, 100)
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/visadirect/v1/tc40-reports', { params: queryParams })
    );

    const data = response.data;
    const reports = data.reports || data.data || [];

    return {
      reports: reports.map((r) => this._parseTC40Data(r)),
      totalCount: data.totalCount || reports.length,
      hasMore: data.hasMore || false,
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // COMPELLING EVIDENCE 3.0
  // ===========================================================================

  /**
   * Submit a Visa Compelling Evidence 3.0 (CE3.0) package.
   * CE3.0 allows merchants to provide historical transaction data showing
   * the same customer device/IP was used in prior undisputed transactions.
   *
   * @param {string} disputeId          - VROL dispute identifier
   * @param {Object} ce3Data            - CE3.0 evidence data
   * @param {Array}  ce3Data.priorTransactions - At least 2 prior undisputed transactions
   * @returns {Promise<Object>}         CE3.0 submission result
   */
  async submitCE3Evidence(disputeId, ce3Data) {
    if (!ce3Data.priorTransactions || ce3Data.priorTransactions.length < 2) {
      throw new Error('CE3.0 requires at least 2 prior undisputed transactions from the same cardholder');
    }

    const payload = {
      disputeId,
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      compellingEvidenceVersion: '3.0',
      disputedTransaction: {
        transactionId: ce3Data.disputedTransactionId,
        transactionDate: ce3Data.disputedTransactionDate,
        amount: ce3Data.disputedAmount,
        ipAddress: ce3Data.disputedIP,
        deviceFingerprint: ce3Data.disputedDeviceId,
        shippingAddress: ce3Data.disputedShippingAddress || null
      },
      priorUndisputedTransactions: ce3Data.priorTransactions.map((txn, idx) => ({
        sequenceNumber: idx + 1,
        transactionId: txn.transactionId,
        transactionDate: txn.transactionDate,
        amount: txn.amount,
        ipAddress: txn.ipAddress,
        deviceFingerprint: txn.deviceFingerprint || txn.deviceId,
        shippingAddress: txn.shippingAddress || null,
        outcome: txn.outcome || 'settled',
        authorizationCode: txn.authorizationCode || null
      })),
      matchingCriteria: {
        ipAddressMatch: ce3Data.ipAddressMatch !== false,
        deviceFingerprintMatch: ce3Data.deviceFingerprintMatch !== false,
        shippingAddressMatch: ce3Data.shippingAddressMatch || false,
        cardholderNameMatch: ce3Data.cardholderNameMatch || false
      },
      merchantNarrative: ce3Data.narrative || 'CE3.0 evidence: prior undisputed transactions from same device/IP',
      idempotencyKey: this._generateIdempotencyKey('vrol_ce3')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/visadirect/v1/disputes/${disputeId}/compelling-evidence-3`, payload)
    );

    logger.info(`[VROL] CE3.0 evidence submitted for dispute ${disputeId} with ${ce3Data.priorTransactions.length} prior transactions`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      ce3Accepted: response.data.ce3Accepted || response.data.accepted || false,
      matchScore: response.data.matchScore || null,
      status: response.data.status || 'submitted',
      message: response.data.message || 'CE3.0 evidence submitted for review',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw VROL webhook payload.
   * VROL sends webhooks as JSON with structure:
   *   { eventType, caseId, data, timestamp, signature }
   *
   * @param {Object} headers - HTTP request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} Parsed webhook event
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[VROL] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid VROL webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[VROL] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid VROL webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify signature if webhook secret is configured
    const signature = headers['x-visa-signature'] || headers['x-vrol-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[VROL] Webhook signature verification failed');
        throw new Error('Invalid VROL webhook signature');
      }
    }

    return {
      event: parsed.eventType || parsed.event,
      disputeId: parsed.caseId || parsed.disputeId,
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-visa-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-visa-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with VROL for event notifications.
   *
   * @param {Object} config - Webhook registration configuration
   * @param {string} config.callbackUrl - Endpoint URL to receive webhooks
   * @param {string[]} [config.events]  - Event types to subscribe to
   * @returns {Promise<Object>} Registration result
   */
  async registerWebhook(config) {
    const callbackUrl = typeof config === 'string' ? config : config.callbackUrl;
    const events = (typeof config === 'object' && config.events) ? config.events : WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      merchantId: this.merchantId,
      acquirerBIN: this.acquirerBIN,
      callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      apiVersion: 'v1'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/visadirect/v1/webhooks', payload)
    );

    this.webhookSecret = webhookSecret;

    logger.info(`[VROL] Webhook registered: ${callbackUrl} for events: ${events.join(', ')}`);

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
   * Normalize a VROL dispute/case into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw VROL dispute data
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.disputeId || portalData.caseId || portalData.vrolCaseNumber || portalData.id;
    const caseNumber = portalData.vrolCaseNumber || portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.disputeAmount || portalData.transactionAmount || 0);

    const reasonCode = portalData.reasonCode || portalData.conditionCode || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || portalData.maskedPAN?.slice(-4) || '',
      cardBrand: 'VISA',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.disputeDate || portalData.chargebackDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status || portalData.caseStatus),
      portalStatus: portalData.status || portalData.caseStatus,
      disputeStage: portalData.stage || portalData.disputeStage || DISPUTE_STAGES.FIRST_CHARGEBACK,
      alertType: portalData.alertType || 'DISPUTE',
      isPreChargeback: false,
      transactionId: portalData.transactionId || portalData.acquirerReferenceNumber || '',
      transactionDate: portalData.transactionDate || null,
      authorizationCode: portalData.authorizationCode || portalData.approvalCode || '',
      acquirerReferenceNumber: portalData.acquirerReferenceNumber || portalData.arn || '',
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'VISA_VROL',
      rawData: portalData
    };
  }

  /**
   * Map a VROL status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - VROL status value
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_VROL[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Visa reason code to a structured object with category and description.
   *
   * @param {string} portalCode - Visa reason code (e.g. '10.4', '13.1')
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim();
    const known = VISA_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    if (normalized.startsWith('10.')) {
      return { code: normalized, category: 'FRAUD', description: `Visa Fraud - Code ${normalized}` };
    }
    if (normalized.startsWith('11.')) {
      return { code: normalized, category: 'AUTHORIZATION', description: `Visa Authorization - Code ${normalized}` };
    }
    if (normalized.startsWith('12.')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Visa Processing Error - Code ${normalized}` };
    }
    if (normalized.startsWith('13.')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Visa Consumer Dispute - Code ${normalized}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Visa Reason Code ${normalized}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the VROL API.
   *
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      // Ensure we can authenticate
      await this._ensureAccessToken();

      const response = await this.httpClient.get('/visadirect/v1/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Visa VROL API is reachable and authenticated',
        details: {
          portalType: 'VISA_VROL',
          merchantId: this.merchantId,
          acquirerBIN: this.acquirerBIN,
          apiVersion: 'v1',
          responseStatus: response.status,
          authenticated: true
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Visa VROL health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'VISA_VROL',
          merchantId: this.merchantId,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Parse a TC40 fraud report into a structured object.
   *
   * @param {Object} tc40Data - Raw TC40 data from VROL
   * @returns {Object} Parsed TC40 report
   * @private
   */
  _parseTC40Data(tc40Data) {
    return {
      reportId: tc40Data.tc40ReportId || tc40Data.reportId || tc40Data.id,
      fraudType: tc40Data.fraudType || tc40Data.fraudClassification || 'unknown',
      reportDate: tc40Data.reportDate || tc40Data.filingDate,
      cardNumber: tc40Data.maskedPAN || tc40Data.cardLastFour,
      transactionAmount: parseFloat(tc40Data.transactionAmount || tc40Data.amount || 0),
      transactionDate: tc40Data.transactionDate,
      merchantName: tc40Data.merchantName || tc40Data.merchantDescriptor,
      issuerName: tc40Data.issuerName || '',
      issuerCountry: tc40Data.issuerCountry || '',
      fraudAmount: parseFloat(tc40Data.fraudAmount || tc40Data.transactionAmount || 0),
      accountDeviceType: tc40Data.accountDeviceType || '',
      cardPresent: tc40Data.cardPresent || false,
      ecommerceIndicator: tc40Data.ecommerceIndicator || '',
      rawData: tc40Data
    };
  }

  /**
   * Build CE3.0 payload structure from transaction history data.
   *
   * @param {Array} transactionHistory - Prior undisputed transactions
   * @returns {Object} CE3.0 formatted payload
   * @private
   */
  _buildCE3Payload(transactionHistory) {
    return {
      version: '3.0',
      transactionCount: transactionHistory.length,
      transactions: transactionHistory.map((txn, idx) => ({
        sequence: idx + 1,
        transactionId: txn.transactionId,
        date: txn.transactionDate,
        amount: txn.amount,
        currency: txn.currency || 'USD',
        ipAddress: txn.ipAddress,
        deviceId: txn.deviceFingerprint || txn.deviceId,
        shippingAddress: txn.shippingAddress || null,
        authorizationCode: txn.authorizationCode,
        settled: txn.settled !== false,
        disputed: txn.disputed === true
      })),
      matchingSummary: {
        ipMatches: transactionHistory.filter(t => t.ipAddress).length,
        deviceMatches: transactionHistory.filter(t => t.deviceFingerprint || t.deviceId).length,
        addressMatches: transactionHistory.filter(t => t.shippingAddress).length
      }
    };
  }

  /**
   * Get CE3.0 requirements description.
   *
   * @returns {Object} CE3.0 requirements
   * @private
   */
  _getCE3Requirements() {
    return {
      minimumPriorTransactions: 2,
      requiredMatchFields: ['ipAddress', 'deviceFingerprint'],
      optionalMatchFields: ['shippingAddress', 'cardholderName'],
      transactionAgeLimit: '365 days',
      description: 'Visa Compelling Evidence 3.0 requires at least 2 prior undisputed transactions ' +
                   'from the same cardholder with matching IP address and/or device fingerprint. ' +
                   'Transactions must be within 365 days of the disputed transaction.'
    };
  }

  /**
   * Calculate the response deadline based on dispute stage and reason code.
   *
   * @param {string} disputeDate - ISO date of the dispute
   * @param {string} stage       - Dispute stage
   * @param {string} reasonCode  - Visa reason code
   * @returns {string} ISO date of the response deadline
   * @private
   */
  _calculateResponseDeadline(disputeDate, stage, reasonCode) {
    const baseDate = new Date(disputeDate || Date.now());
    const reasonInfo = VISA_REASON_CODES[reasonCode] || {};
    let deadlineDays = reasonInfo.responseDeadlineDays || 30;

    // Adjust deadline based on dispute stage
    switch (stage) {
      case DISPUTE_STAGES.PRE_ARBITRATION:
        deadlineDays = 30;
        break;
      case DISPUTE_STAGES.ARBITRATION:
        deadlineDays = 10;
        break;
      case DISPUTE_STAGES.COMPLIANCE:
        deadlineDays = 45;
        break;
      default:
        // First chargeback uses reason-code-specific deadline
        break;
    }

    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + deadlineDays);
    return deadline.toISOString();
  }

  /**
   * Return default evidence instructions based on the Visa reason code.
   *
   * @param {string} reasonCode - Visa reason code
   * @returns {string} Evidence instructions
   * @private
   */
  _getDefaultEvidenceInstructions(reasonCode) {
    const instructions = {
      '10.4': 'Provide compelling evidence for card-absent fraud: AVS/CVV match, ' +
              'device fingerprint, IP address logs, 3-D Secure authentication data, ' +
              'and at least two prior undisputed transactions from the same device/IP (CE3.0 eligible).',
      '13.1': 'Provide proof the guest received hotel services: check-in confirmation, ' +
              'signed registration card, room folio, key card access logs, and ID verification.',
      '13.2': 'Provide signed agreement with recurring charge terms and cancellation policy. ' +
              'Show proof that the cancellation policy was properly disclosed at booking.',
      '13.3': 'Provide booking confirmation showing room type/amenities, guest folio, ' +
              'property photos, and any correspondence with the guest about the stay.',
      '13.6': 'Provide refund policy accepted by guest, proof no cancellation was received, ' +
              'or proof that a credit has already been issued.',
      '13.7': 'Provide cancellation policy accepted at booking, no-show documentation, ' +
              'reservation confirmation with terms, and guest folio.'
    };

    return instructions[reasonCode] ||
      'Submit all available evidence including guest folio, signed registration, ' +
      'booking confirmation, authorization records, and any other relevant documentation.';
  }
}

module.exports = VisaVROLAdapter;
