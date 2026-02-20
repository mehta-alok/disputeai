/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Riskified E-Commerce Fraud Prevention Adapter
 *
 * Implements two-way integration with Riskified's fraud prevention and
 * chargeback management platform:
 *   - Machine Learning Fraud Detection: Real-time order decisions powered
 *     by ML models trained on billions of transactions across the Riskified
 *     merchant network.
 *   - Chargeback Guarantee: Riskified provides a financial guarantee on
 *     approved orders. If an approved order results in a fraud chargeback,
 *     Riskified reimburses the merchant for the full chargeback amount.
 *   - Chargeback Recovery: Dispute management for non-guaranteed chargebacks
 *     with evidence submission, representment workflows, and outcome tracking.
 *   - Policy Abuse Prevention: Identifies and prevents return abuse, promo
 *     abuse, reseller abuse, and account takeover distinct from payment fraud.
 *   - Order Linking: Connects orders across devices, accounts, and payment
 *     methods using behavioral analytics and device fingerprinting.
 *   - Behavioral Analytics: Analyzes user behavior patterns (mouse movements,
 *     typing patterns, navigation flow) to distinguish humans from bots and
 *     legitimate users from fraudsters.
 *
 * Auth: API Key + Shop Domain sent in request headers.
 * Base URL: https://api.riskified.com/api/v2 (configurable)
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

// =============================================================================
// RISKIFIED REASON CODE MAPPINGS
// =============================================================================

const RISKIFIED_REASON_CODES = {
  'FRAUD': {
    code: 'FRAUD',
    category: 'FRAUD',
    description: 'Fraudulent transaction identified',
    compellingEvidenceTypes: ['device_fingerprint', 'ip_address_match', 'avs_cvv_match', 'prior_undisputed_transactions']
  },
  'UNAUTHORIZED': {
    code: 'UNAUTHORIZED',
    category: 'FRAUD',
    description: 'Unauthorized use of payment credentials',
    compellingEvidenceTypes: ['avs_cvv_match', 'device_fingerprint', '3ds_authentication', 'ip_address_match']
  },
  'FRIENDLY_FRAUD': {
    code: 'FRIENDLY_FRAUD',
    category: 'FRAUD',
    description: 'Legitimate cardholder disputes valid transaction',
    compellingEvidenceTypes: ['proof_of_delivery', 'guest_registration', 'folio', 'guest_correspondence']
  },
  'ITEM_NOT_RECEIVED': {
    code: 'ITEM_NOT_RECEIVED',
    category: 'CONSUMER_DISPUTE',
    description: 'Service or merchandise not received',
    compellingEvidenceTypes: ['check_in_confirmation', 'folio', 'guest_registration_card', 'key_card_logs']
  },
  'ITEM_NOT_AS_DESCRIBED': {
    code: 'ITEM_NOT_AS_DESCRIBED',
    category: 'CONSUMER_DISPUTE',
    description: 'Service not as described or defective',
    compellingEvidenceTypes: ['service_description', 'terms_accepted', 'guest_correspondence', 'quality_documentation']
  },
  'CREDIT_NOT_PROCESSED': {
    code: 'CREDIT_NOT_PROCESSED',
    category: 'CONSUMER_DISPUTE',
    description: 'Expected credit or refund not processed',
    compellingEvidenceTypes: ['refund_policy', 'terms_and_conditions', 'credit_issued_proof']
  },
  'CANCELLED': {
    code: 'CANCELLED',
    category: 'CONSUMER_DISPUTE',
    description: 'Cancelled service or reservation dispute',
    compellingEvidenceTypes: ['cancellation_policy', 'no_show_documentation', 'reservation_confirmation', 'terms_accepted']
  },
  'DUPLICATE': {
    code: 'DUPLICATE',
    category: 'PROCESSING_ERROR',
    description: 'Duplicate charge for same transaction',
    compellingEvidenceTypes: ['transaction_records', 'folio', 'itemized_charges']
  },
  'SUBSCRIPTION_CANCELLED': {
    code: 'SUBSCRIPTION_CANCELLED',
    category: 'CONSUMER_DISPUTE',
    description: 'Recurring charge after cancellation',
    compellingEvidenceTypes: ['terms_and_conditions', 'cancellation_policy', 'signed_agreement']
  },
  'POLICY_ABUSE': {
    code: 'POLICY_ABUSE',
    category: 'ABUSE',
    description: 'Policy abuse detected (returns, promos, reselling)',
    compellingEvidenceTypes: ['terms_and_conditions', 'abuse_evidence', 'account_history']
  },
  'ACCOUNT_TAKEOVER': {
    code: 'ACCOUNT_TAKEOVER',
    category: 'FRAUD',
    description: 'Account takeover - unauthorized access to legitimate account',
    compellingEvidenceTypes: ['login_history', 'device_fingerprint', 'ip_address_logs', 'password_change_records']
  }
};

// Riskified portal status -> AccuDefend internal status
const STATUS_MAP_FROM_RISKIFIED = {
  'new': 'PENDING',
  'open': 'PENDING',
  'pending': 'PENDING',
  'review': 'IN_REVIEW',
  'under_review': 'IN_REVIEW',
  'investigating': 'IN_REVIEW',
  'evidence_submitted': 'SUBMITTED',
  'submitted': 'SUBMITTED',
  'responded': 'SUBMITTED',
  'won': 'WON',
  'reversed': 'WON',
  'chargeback_reversed': 'WON',
  'lost': 'LOST',
  'upheld': 'LOST',
  'chargeback_upheld': 'LOST',
  'expired': 'EXPIRED',
  'closed': 'RESOLVED',
  'resolved': 'RESOLVED',
  'guaranteed_covered': 'RESOLVED'
};

// AccuDefend status -> Riskified portal status
const STATUS_MAP_TO_RISKIFIED = {
  'PENDING': 'open',
  'IN_REVIEW': 'review',
  'SUBMITTED': 'submitted',
  'WON': 'won',
  'LOST': 'lost',
  'EXPIRED': 'expired'
};

// Riskified decision types
const DECISION_TYPES = {
  APPROVE: 'approve',
  DECLINE: 'decline',
  REVIEW: 'review',
  ESCALATE: 'escalate'
};

// Webhook event types
const WEBHOOK_EVENTS = [
  'decision.created',
  'decision.updated',
  'chargeback.created',
  'chargeback.updated',
  'chargeback.resolved',
  'evidence.requested',
  'guarantee.claim_created',
  'guarantee.claim_resolved',
  'abuse.detected',
  'order.linked'
];


class RiskifiedAdapter extends BaseDisputeAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Riskified API Key (HMAC secret)
   * @param {string} config.credentials.shopDomain   - Shop domain registered with Riskified
   * @param {string} [config.credentials.webhookSecret] - Shared webhook verification secret
   * @param {boolean} [config.credentials.guaranteeEnabled] - Chargeback guarantee active
   * @param {boolean} [config.credentials.abusePreventionEnabled] - Policy abuse prevention active
   * @param {string} [config.baseUrl] - Override default API base URL
   */
  constructor(config) {
    super({
      ...config,
      portalType: config.portalType || 'RISKIFIED',
      baseUrl: config.baseUrl || process.env.RISKIFIED_API_URL || 'https://api.riskified.com/api/v2'
    });

    this.shopDomain = this.credentials.shopDomain;
    this.webhookSecret = this.credentials.webhookSecret || '';
    this.guaranteeEnabled = this.credentials.guaranteeEnabled || false;
    this.abusePreventionEnabled = this.credentials.abusePreventionEnabled || false;

    // Initialize HTTP client with Riskified auth headers
    // Riskified uses HMAC-SHA256 signing for request authentication
    this._initHttpClient({
      'X-RISKIFIED-SHOP-DOMAIN': this.shopDomain,
      'X-RISKIFIED-API-KEY': this.credentials.apiKey
    });

    // Add request interceptor to sign each request with HMAC
    this.httpClient.interceptors.request.use((requestConfig) => {
      const body = requestConfig.data ? JSON.stringify(requestConfig.data) : '';
      const hmac = crypto
        .createHmac('sha256', this.credentials.apiKey)
        .update(body)
        .digest('hex');
      requestConfig.headers['X-RISKIFIED-HMAC-SHA256'] = hmac;
      return requestConfig;
    });
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Authenticate with the Riskified API and verify credentials.
   * Riskified uses API Key + Shop Domain with HMAC request signing.
   *
   * @returns {Promise<Object>} { authenticated, shopDomain, features }
   */
  async authenticate() {
    try {
      const response = await this._withRetry(() =>
        this.httpClient.get('/auth/verify')
      );

      const data = response.data;
      logger.info(`[Riskified] Authentication successful for shop ${this.shopDomain}`);

      return {
        authenticated: true,
        shopDomain: data.shopDomain || this.shopDomain,
        shopName: data.shopName || '',
        features: data.features || [],
        guaranteeEnabled: data.guaranteeEnabled || this.guaranteeEnabled,
        abusePreventionEnabled: data.abusePreventionEnabled || this.abusePreventionEnabled,
        expiresAt: data.tokenExpiry || null
      };
    } catch (error) {
      logger.error(`[Riskified] Authentication failed: ${this._extractErrorMessage(error)}`);
      return {
        authenticated: false,
        shopDomain: this.shopDomain,
        error: this._extractErrorMessage(error)
      };
    }
  }

  // ===========================================================================
  // INBOUND: Receive FROM Riskified
  // ===========================================================================

  /**
   * Receive and normalize a chargeback payload from Riskified.
   * Enriches with decision data and guarantee status when available.
   *
   * @param {Object} disputeData - Raw chargeback data from Riskified
   * @returns {Promise<Object>} Normalized dispute object in AccuDefend format
   */
  async receiveDispute(disputeData) {
    logger.info(`[Riskified] Receiving chargeback: ${disputeData.chargebackId || disputeData.id}`);

    // Enrich with order decision data if available
    if (disputeData.orderId && !disputeData.decision) {
      try {
        const decision = await this.getOrderDecision(disputeData.orderId);
        disputeData._decisionEnriched = true;
        disputeData.decision = decision.decision;
        disputeData.decisionScore = decision.score;
        disputeData.orderLinking = decision.linkingData;
      } catch (err) {
        logger.warn(`[Riskified] Could not enrich with decision data: ${err.message}`);
      }
    }

    // Check guarantee status
    if (this.guaranteeEnabled && disputeData.orderId && !disputeData.guaranteeStatus) {
      try {
        const guarantee = await this.getGuaranteeStatus(disputeData.orderId);
        disputeData._guaranteeEnriched = true;
        disputeData.guaranteeStatus = guarantee.status;
        disputeData.guaranteeCovered = guarantee.covered;
      } catch (err) {
        logger.warn(`[Riskified] Could not enrich with guarantee status: ${err.message}`);
      }
    }

    const normalized = this.normalizeDispute(disputeData);
    logger.info(
      `[Riskified] Chargeback normalized: ${normalized.disputeId} ` +
      `(Decision: ${disputeData.decision || 'N/A'}, Guarantee: ${disputeData.guaranteeStatus || 'N/A'})`
    );
    return normalized;
  }

  /**
   * Query Riskified for the current status of a chargeback.
   *
   * @param {string} disputeId - Riskified chargeback identifier
   * @returns {Promise<Object>} Chargeback status with decision and guarantee info
   */
  async getDisputeStatus(disputeId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/chargebacks/${disputeId}`)
    );

    const data = response.data;

    return {
      disputeId,
      status: this.normalizeDisputeStatus(data.status),
      portalStatus: data.status,
      lastUpdated: data.updatedAt || data.lastModified,
      notes: data.notes || data.statusNotes || '',
      outcome: data.outcome || null,
      outcomeDate: data.outcomeDate || null,
      decision: data.decision || null,
      guaranteeStatus: data.guaranteeStatus || null,
      guaranteeCovered: data.guaranteeCovered || false,
      orderId: data.orderId || null,
      orderLinking: data.orderLinking || null
    };
  }

  /**
   * Fetch a paginated list of chargebacks from Riskified.
   *
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} { disputes: [], totalCount, hasMore, page }
   */
  async listDisputes(params = {}) {
    const queryParams = {
      since: params.since || undefined,
      status: params.status || undefined,
      decision: params.decision || undefined,
      guaranteeStatus: params.guaranteeStatus || undefined,
      page: params.page || 1,
      limit: Math.min(params.limit || 50, 100),
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc'
    };

    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) delete queryParams[key];
    });

    const response = await this._withRetry(() =>
      this.httpClient.get('/chargebacks', { params: queryParams })
    );

    const data = response.data;
    const chargebacks = data.chargebacks || data.data || [];

    return {
      disputes: chargebacks.map(cb => this.normalizeDispute(cb)),
      totalCount: data.totalCount || data.total || chargebacks.length,
      hasMore: data.hasMore || (data.page < data.totalPages),
      page: data.page || queryParams.page
    };
  }

  // ===========================================================================
  // OUTBOUND: Send TO Riskified
  // ===========================================================================

  /**
   * Submit evidence to Riskified for a chargeback dispute.
   *
   * @param {string} disputeId - Riskified chargeback identifier
   * @param {Object} evidence - Evidence package with files and metadata
   * @returns {Promise<Object>} { submissionId, status, message, timestamp }
   */
  async submitEvidence(disputeId, evidence) {
    const files = evidence.files || [];
    const metadata = evidence.metadata || {};

    const payload = {
      chargebackId: disputeId,
      shopDomain: this.shopDomain,
      evidenceCategory: metadata.evidenceCategory || 'compelling_evidence',
      documents: files.map((file, index) => ({
        documentType: file.type || 'supporting_document',
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/pdf',
        data: file.data instanceof Buffer ? file.data.toString('base64') : file.data,
        description: file.description || `Evidence document ${index + 1}`
      })),
      transactionDetails: {
        guestName: metadata.guestName,
        confirmationNumber: metadata.confirmationNumber,
        checkInDate: metadata.checkInDate,
        checkOutDate: metadata.checkOutDate,
        transactionAmount: metadata.transactionAmount,
        transactionDate: metadata.transactionDate,
        transactionId: metadata.transactionId,
        orderId: metadata.orderId
      },
      decisionContext: {
        orderId: metadata.orderId || null,
        decision: metadata.decision || null,
        decisionScore: metadata.decisionScore || null,
        linkingData: metadata.linkingData || null
      },
      behavioralData: {
        deviceFingerprint: metadata.deviceFingerprint || null,
        sessionData: metadata.sessionData || null,
        orderLinkingIds: metadata.orderLinkingIds || []
      },
      merchantNarrative: metadata.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('evidence')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/evidence`, payload)
    );

    logger.info(`[Riskified] Evidence submitted for chargeback ${disputeId}: ${response.data.submissionId || 'OK'}`);

    return {
      submissionId: response.data.submissionId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Evidence submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Push a representment response to Riskified for a chargeback.
   *
   * @param {string} disputeId - Riskified chargeback identifier
   * @param {Object} responseData - Response with evidence and details
   * @returns {Promise<Object>} { responseId, status, message, timestamp }
   */
  async pushResponse(disputeId, responseData) {
    const payload = {
      chargebackId: disputeId,
      shopDomain: this.shopDomain,
      responseType: responseData.representmentType || 'representment',
      compellingEvidence: {
        type: responseData.compellingEvidence?.type || 'generic',
        description: responseData.compellingEvidence?.description || '',
        priorUndisputedTransactions: responseData.compellingEvidence?.priorTransactions || [],
        deviceInfo: responseData.compellingEvidence?.deviceInfo || null,
        linkingEvidence: responseData.compellingEvidence?.linkingEvidence || null,
        behavioralMatch: responseData.compellingEvidence?.behavioralMatch || null
      },
      guestDetails: {
        name: responseData.guestDetails?.name,
        email: responseData.guestDetails?.email,
        phone: responseData.guestDetails?.phone,
        loyaltyNumber: responseData.guestDetails?.loyaltyNumber || null
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
      evidenceIds: responseData.evidenceIds || [],
      merchantNarrative: responseData.narrative || '',
      idempotencyKey: this._generateIdempotencyKey('response')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/submit`, payload)
    );

    logger.info(`[Riskified] Response submitted for chargeback ${disputeId}`);

    return {
      responseId: response.data.responseId || response.data.id,
      status: response.data.status || 'submitted',
      message: response.data.message || 'Response submitted successfully',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Accept liability on a chargeback (do not fight it).
   *
   * @param {string} disputeId - Riskified chargeback identifier
   * @returns {Promise<Object>} { accepted, disputeId, responseId, message }
   */
  async acceptDispute(disputeId) {
    const payload = {
      chargebackId: disputeId,
      shopDomain: this.shopDomain,
      action: 'accept_liability',
      reason: 'Merchant accepts liability',
      idempotencyKey: this._generateIdempotencyKey('accept')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/submit`, payload)
    );

    logger.info(`[Riskified] Chargeback ${disputeId} accepted (liability acknowledged)`);

    return {
      accepted: true,
      disputeId,
      responseId: response.data.responseId || response.data.id,
      message: response.data.message || 'Chargeback accepted'
    };
  }

  // ===========================================================================
  // ORDER DECISIONS AND LINKING
  // ===========================================================================

  /**
   * Get the fraud decision for a specific order from Riskified.
   * Decisions are made in real-time when an order is submitted for screening.
   *
   * @param {string} orderId - Order identifier
   * @returns {Promise<Object>} Decision details with linking and behavioral data
   */
  async getOrderDecision(orderId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/decisions`, {
        params: { orderId, shopDomain: this.shopDomain }
      })
    );

    const data = response.data;

    return {
      orderId,
      decision: data.decision || data.status || null,
      score: data.score || 0,
      reasons: data.reasons || [],
      linkingData: {
        linkedOrders: data.linkingData?.linkedOrders || [],
        linkedDevices: data.linkingData?.linkedDevices || [],
        linkedAccounts: data.linkingData?.linkedAccounts || [],
        linkingScore: data.linkingData?.linkingScore || 0
      },
      behavioralAnalytics: {
        sessionRiskScore: data.behavioralAnalytics?.sessionRiskScore || null,
        navigationPatterns: data.behavioralAnalytics?.navigationPatterns || null,
        typingAnalysis: data.behavioralAnalytics?.typingAnalysis || null,
        botProbability: data.behavioralAnalytics?.botProbability || null
      },
      deviceFingerprint: {
        id: data.deviceFingerprint?.id || null,
        type: data.deviceFingerprint?.type || null,
        os: data.deviceFingerprint?.os || null,
        browser: data.deviceFingerprint?.browser || null,
        trustLevel: data.deviceFingerprint?.trustLevel || null
      },
      guaranteeEligible: data.guaranteeEligible || false,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Get order linking analysis showing connections between orders across
   * devices, accounts, and payment methods.
   *
   * @param {string} orderId - Order identifier
   * @returns {Promise<Object>} Linking analysis data
   */
  async getOrderLinking(orderId) {
    const response = await this._withRetry(() =>
      this.httpClient.get(`/decisions/${orderId}/linking`, {
        params: { shopDomain: this.shopDomain }
      })
    );

    const data = response.data;

    return {
      orderId,
      linkedOrders: data.linkedOrders || [],
      linkedDevices: data.linkedDevices || [],
      linkedPaymentMethods: data.linkedPaymentMethods || [],
      linkedEmails: data.linkedEmails || [],
      linkedPhones: data.linkedPhones || [],
      networkGraph: data.networkGraph || null,
      riskSignals: data.riskSignals || [],
      overallLinkingScore: data.overallLinkingScore || 0
    };
  }

  // ===========================================================================
  // GUARANTEE MANAGEMENT
  // ===========================================================================

  /**
   * Get the chargeback guarantee status for an order.
   * When guarantee is active and order was approved, Riskified covers
   * fraud chargebacks at 100% of the transaction amount.
   *
   * @param {string} orderId - Order identifier
   * @returns {Promise<Object>} Guarantee status and coverage details
   */
  async getGuaranteeStatus(orderId) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/guarantees', {
        params: { orderId, shopDomain: this.shopDomain }
      })
    );

    const data = response.data;

    return {
      orderId,
      guaranteeId: data.guaranteeId || data.id || null,
      status: data.status || data.disposition || 'UNKNOWN',
      covered: data.status === 'approved' || data.disposition === 'approved',
      coverageAmount: data.coverageAmount || null,
      claimStatus: data.claimStatus || null,
      claimAmount: data.claimAmount || null,
      expiresAt: data.expiresAt || null,
      createdAt: data.createdAt || null
    };
  }

  /**
   * Submit a guarantee claim for a chargeback on a guaranteed order.
   *
   * @param {Object} claimData
   * @param {string} claimData.orderId - Order identifier
   * @param {string} claimData.chargebackId - Chargeback identifier
   * @param {number} claimData.amount - Chargeback amount to claim
   * @param {string} claimData.reasonCode - Chargeback reason code
   * @returns {Promise<Object>} Claim submission result
   */
  async submitGuaranteeClaim(claimData) {
    const payload = {
      orderId: claimData.orderId,
      chargebackId: claimData.chargebackId,
      shopDomain: this.shopDomain,
      amount: claimData.amount,
      currency: claimData.currency || 'USD',
      reasonCode: claimData.reasonCode,
      chargebackDate: claimData.chargebackDate || new Date().toISOString(),
      supportingDocuments: claimData.documents || [],
      idempotencyKey: this._generateIdempotencyKey('claim')
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/guarantees/claims', payload)
    );

    logger.info(`[Riskified] Guarantee claim submitted for order ${claimData.orderId}`);

    return {
      claimId: response.data.claimId || response.data.id,
      status: response.data.status || 'submitted',
      estimatedPayout: response.data.estimatedPayout || claimData.amount,
      message: response.data.message || 'Guarantee claim submitted',
      timestamp: response.data.timestamp || new Date().toISOString()
    };
  }

  // ===========================================================================
  // ANALYTICS AND WIN RATE TRACKING
  // ===========================================================================

  /**
   * Fetch analytics from Riskified including decision accuracy, guarantee
   * utilization, chargeback recovery rates, and behavioral insights.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date (ISO format)
   * @param {string} params.endDate - End date (ISO format)
   * @param {string} [params.groupBy] - 'day', 'week', or 'month'
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalytics(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          groupBy: params.groupBy || 'month',
          shopDomain: this.shopDomain
        }
      })
    );

    const data = response.data;

    return {
      summary: {
        totalChargebacks: data.totalChargebacks || 0,
        totalRecovered: data.totalRecovered || 0,
        totalGuaranteeClaimed: data.totalGuaranteeClaimed || 0,
        totalGuaranteePaid: data.totalGuaranteePaid || 0,
        winRate: data.winRate || 0,
        guaranteeCoverageRate: data.guaranteeCoverageRate || 0,
        avgDecisionScore: data.avgDecisionScore || 0,
        approvalRate: data.approvalRate || 0,
        falseDeclineRate: data.falseDeclineRate || 0
      },
      decisionBreakdown: data.decisionBreakdown || [],
      reasonCodeBreakdown: data.reasonCodeBreakdown || [],
      monthlyTrend: data.monthlyTrend || [],
      guaranteeMetrics: {
        totalGuaranteed: data.guaranteeMetrics?.totalGuaranteed || 0,
        totalClaims: data.guaranteeMetrics?.totalClaims || 0,
        claimApprovalRate: data.guaranteeMetrics?.claimApprovalRate || 0,
        avgClaimResolutionDays: data.guaranteeMetrics?.avgClaimResolutionDays || 0
      },
      linkingMetrics: {
        ordersLinked: data.linkingMetrics?.ordersLinked || 0,
        fraudRingsDetected: data.linkingMetrics?.fraudRingsDetected || 0,
        crossDeviceMatches: data.linkingMetrics?.crossDeviceMatches || 0
      },
      abuseMetrics: this.abusePreventionEnabled ? {
        policyAbuseDetected: data.abuseMetrics?.policyAbuseDetected || 0,
        returnAbuseRate: data.abuseMetrics?.returnAbuseRate || 0,
        promoAbuseRate: data.abuseMetrics?.promoAbuseRate || 0
      } : null,
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  /**
   * Get win rate statistics segmented by decision type.
   *
   * @param {Object} params
   * @param {string} params.startDate - Start date
   * @param {string} params.endDate - End date
   * @returns {Promise<Object>} Win rates by decision
   */
  async getWinRatesByDecision(params = {}) {
    const response = await this._withRetry(() =>
      this.httpClient.get('/analytics/win-rates', {
        params: {
          startDate: params.startDate,
          endDate: params.endDate,
          shopDomain: this.shopDomain,
          groupBy: 'decision'
        }
      })
    );

    return {
      winRates: response.data.winRates || response.data.data || [],
      overallWinRate: response.data.overallWinRate || 0,
      period: { startDate: params.startDate, endDate: params.endDate }
    };
  }

  // ===========================================================================
  // AUTO-REPRESENTMENT TEMPLATES
  // ===========================================================================

  /**
   * Generate an auto-representment template leveraging Riskified's decision
   * data, order linking analysis, and behavioral analytics.
   *
   * @param {string} disputeId - Riskified chargeback identifier
   * @param {Object} [context] - Additional context
   * @returns {Promise<Object>} Template with evidence checklist and win probability
   */
  async generateRepresentmentTemplate(disputeId, context = {}) {
    const payload = {
      chargebackId: disputeId,
      shopDomain: this.shopDomain,
      additionalContext: {
        guestName: context.guestName || null,
        confirmationNumber: context.confirmationNumber || null,
        stayDetails: context.stayDetails || null,
        availableEvidence: context.availableEvidence || [],
        orderId: context.orderId || null,
        includeDecisionData: context.includeDecisionData !== false,
        includeLinkingData: context.includeLinkingData !== false,
        includeBehavioralData: context.includeBehavioralData !== false
      }
    };

    const response = await this._withRetry(() =>
      this.httpClient.post(`/chargebacks/${disputeId}/auto-template`, payload)
    );

    const data = response.data;

    return {
      template: data.template || null,
      requiredFields: data.requiredFields || [],
      optionalFields: data.optionalFields || [],
      winProbability: data.winProbability || 0,
      narrative: data.narrative || '',
      evidenceChecklist: data.evidenceChecklist || [],
      decisionDataIncluded: data.decisionDataIncluded || false,
      linkingEvidenceIncluded: data.linkingEvidenceIncluded || false,
      behavioralDataIncluded: data.behavioralDataIncluded || false,
      guaranteeContext: data.guaranteeContext || null,
      reasonCodeGuidance: data.reasonCodeGuidance || ''
    };
  }

  // ===========================================================================
  // WEBHOOK MANAGEMENT
  // ===========================================================================

  /**
   * Parse a raw Riskified webhook payload into a structured event object.
   * Riskified signs webhooks using HMAC-SHA256 with the shop's API key.
   *
   * @param {Object} headers - Request headers
   * @param {string|Buffer|Object} body - Raw request body
   * @returns {Object} { event, data, timestamp, webhookId, rawData }
   */
  parseWebhookPayload(headers, body) {
    let parsed;

    if (typeof body === 'string') {
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        logger.error('[Riskified] Failed to parse webhook payload as JSON:', err.message);
        throw new Error('Invalid Riskified webhook payload: not valid JSON');
      }
    } else if (Buffer.isBuffer(body)) {
      try {
        parsed = JSON.parse(body.toString('utf-8'));
      } catch (err) {
        logger.error('[Riskified] Failed to parse webhook buffer as JSON:', err.message);
        throw new Error('Invalid Riskified webhook payload: not valid JSON');
      }
    } else {
      parsed = body;
    }

    // Verify HMAC signature
    const signature = headers['x-riskified-hmac-sha256'] || headers['x-riskified-signature'];
    if (this.webhookSecret && signature) {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(parsed);
      const isValid = this._verifySignature(rawBody, signature, this.webhookSecret);
      if (!isValid) {
        logger.warn('[Riskified] Webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    return {
      event: parsed.event || parsed.eventType || headers['x-riskified-topic'],
      data: parsed.data || parsed.payload || parsed,
      timestamp: parsed.timestamp || headers['x-riskified-timestamp'] || new Date().toISOString(),
      webhookId: parsed.webhookId || headers['x-riskified-webhook-id'] || null,
      rawData: parsed
    };
  }

  /**
   * Register a webhook callback URL with Riskified.
   *
   * @param {Object} config
   * @param {string} config.callbackUrl - Endpoint URL for Riskified to POST to
   * @param {string[]} [config.events] - Event types to subscribe to
   * @returns {Promise<Object>} { webhookId, callbackUrl, events, active, secret }
   */
  async registerWebhook(config) {
    const events = config.events || WEBHOOK_EVENTS;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const payload = {
      shopDomain: this.shopDomain,
      url: config.callbackUrl,
      events,
      active: true,
      secret: webhookSecret,
      format: 'json',
      version: 'v2'
    };

    const response = await this._withRetry(() =>
      this.httpClient.post('/webhooks', payload)
    );

    logger.info(`[Riskified] Webhook registered: ${config.callbackUrl} for events: ${events.join(', ')}`);

    return {
      webhookId: response.data.webhookId || response.data.id,
      callbackUrl: config.callbackUrl,
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
   * Normalize a Riskified chargeback into AccuDefend's standard format.
   *
   * @param {Object} portalData - Raw chargeback data from Riskified
   * @returns {Object} Normalized dispute object
   */
  normalizeDispute(portalData) {
    const id = portalData.chargebackId || portalData.id;
    const caseNumber = portalData.caseNumber || portalData.referenceNumber || null;
    const amount = parseFloat(portalData.amount || portalData.transactionAmount || portalData.chargebackAmount || 0);
    const reasonCode = portalData.reasonCode || portalData.chargebackReason || '';
    const reasonInfo = this.normalizeReasonCode(reasonCode);

    return {
      disputeId: id,
      caseNumber,
      amount,
      currency: portalData.currency || portalData.transactionCurrency || 'USD',
      cardLastFour: portalData.cardLastFour || portalData.cardLast4 || '',
      cardBrand: portalData.cardBrand || portalData.cardNetwork || 'UNKNOWN',
      guestName: portalData.cardholderName || portalData.guestName || '',
      reasonCode: reasonInfo.code,
      reasonCategory: reasonInfo.category,
      reasonDescription: reasonInfo.description,
      disputeDate: portalData.chargebackDate || portalData.createdAt,
      dueDate: portalData.responseDeadline || portalData.dueDate || null,
      status: this.normalizeDisputeStatus(portalData.status),
      portalStatus: portalData.status,
      decision: portalData.decision || null,
      decisionScore: portalData.decisionScore || null,
      guaranteeStatus: portalData.guaranteeStatus || null,
      guaranteeCovered: portalData.guaranteeCovered || false,
      orderLinking: portalData.orderLinking || null,
      transactionId: portalData.transactionId || portalData.orderId || '',
      transactionDate: portalData.transactionDate || null,
      merchantDescriptor: portalData.merchantDescriptor || '',
      portalType: 'RISKIFIED',
      rawData: portalData
    };
  }

  /**
   * Map a Riskified status string to AccuDefend internal status.
   *
   * @param {string} portalStatus - Status value from Riskified
   * @returns {string} AccuDefend status
   */
  normalizeDisputeStatus(portalStatus) {
    if (!portalStatus) return 'PENDING';
    return STATUS_MAP_FROM_RISKIFIED[portalStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Map a Riskified reason code to a structured object.
   *
   * @param {string} portalCode - Reason code from Riskified
   * @returns {Object} { code, category, description }
   */
  normalizeReasonCode(portalCode) {
    if (!portalCode) {
      return { code: 'UNKNOWN', category: 'UNKNOWN', description: 'Unknown reason code' };
    }

    const normalized = String(portalCode).trim().toUpperCase().replace(/\s+/g, '_');
    const known = RISKIFIED_REASON_CODES[normalized];

    if (known) {
      return { code: known.code, category: known.category, description: known.description };
    }

    const upper = normalized.toUpperCase();
    if (upper.includes('FRAUD') || upper.includes('UNAUTHORIZED') || upper.includes('TAKEOVER')) {
      return { code: normalized, category: 'FRAUD', description: `Fraud - ${portalCode}` };
    }
    if (upper.includes('ITEM') || upper.includes('SERVICE') || upper.includes('CANCEL') || upper.includes('CREDIT')) {
      return { code: normalized, category: 'CONSUMER_DISPUTE', description: `Consumer Dispute - ${portalCode}` };
    }
    if (upper.includes('DUPLICATE') || upper.includes('PROCESSING')) {
      return { code: normalized, category: 'PROCESSING_ERROR', description: `Processing Error - ${portalCode}` };
    }
    if (upper.includes('ABUSE') || upper.includes('POLICY')) {
      return { code: normalized, category: 'ABUSE', description: `Policy Abuse - ${portalCode}` };
    }

    return { code: normalized, category: 'UNKNOWN', description: `Riskified Code: ${portalCode}` };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Verify connectivity and authentication with the Riskified API.
   *
   * @returns {Promise<Object>} { healthy, latencyMs, message, details }
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/health', { timeout: 10000 });
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        message: 'Riskified API is reachable',
        details: {
          portalType: 'RISKIFIED',
          shopDomain: this.shopDomain,
          guaranteeEnabled: this.guaranteeEnabled,
          abusePreventionEnabled: this.abusePreventionEnabled,
          apiVersion: 'v2',
          responseStatus: response.status
        }
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        healthy: false,
        latencyMs,
        message: `Riskified API health check failed: ${this._extractErrorMessage(error)}`,
        details: {
          portalType: 'RISKIFIED',
          shopDomain: this.shopDomain,
          errorStatus: error.response?.status,
          errorMessage: this._extractErrorMessage(error)
        }
      };
    }
  }
}

module.exports = RiskifiedAdapter;
