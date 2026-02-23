/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Dispute Companies Integration Service
 *
 * Manages connections with hotel dispute management companies including:
 * - Merlink (2-way integration)
 * - Chargebacks911
 * - CAVU
 * - Verifi (Visa)
 * - Ethoca (Mastercard)
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');
const axios = require('axios');

// =============================================================================
// DISPUTE COMPANY CONFIGURATIONS
// =============================================================================

const DISPUTE_COMPANIES = {
  // =========================================================================
  // HOSPITALITY-FOCUSED DISPUTE MANAGEMENT
  // =========================================================================
  MERLINK: {
    name: 'Merlink',
    fullName: 'Merlink Dispute Management',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🔗',
    portalUrl: 'https://www.merlinkdrs.com/Default.aspx',
    features: [
      'Real-time Dispute Alerts',
      'Two-Way Case Sync',
      'Evidence Submission',
      'Automated Response',
      'Analytics Dashboard',
      'Hotel Portfolio Support',
      'Custom Rules Engine',
      'PMS Integration Bridge'
    ],
    requiredConfig: ['apiKey', 'apiSecret', 'merchantId', 'hotelId'],
    optionalConfig: ['webhookUrl', 'autoSubmit', 'portfolioId'],
    webhookEndpoint: '/api/webhooks/merlink',
    apiBaseUrl: process.env.MERLINK_API_URL || 'https://api.merlink.com/v2',
    description: 'Industry-leading dispute management platform for hotels with full 2-way integration'
  },
  STAYSETTLE: {
    name: 'StaySettle',
    fullName: 'StaySettle',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🏨',
    portalUrl: 'https://app.staysettle.com',
    features: [
      'Autopilot Dispute Resolution',
      'PMS Integration (Cloudbeds, Oracle, Mews)',
      'Automatic Evidence Gathering',
      'Smart Response Generation',
      'Hotel-Specific Workflows'
    ],
    requiredConfig: ['apiKey', 'propertyId'],
    optionalConfig: ['pmsType', 'autoRespond'],
    webhookEndpoint: '/api/webhooks/staysettle',
    apiBaseUrl: process.env.STAYSETTLE_API_URL || 'https://api.staysettle.com/v1',
    description: 'Automated dispute resolution built for hotels; integrates with PMS for autopilot chargeback handling'
  },
  WIN_CHARGEBACKS: {
    name: 'Win Chargebacks',
    fullName: 'Win Chargebacks',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🏆',
    portalUrl: 'https://portal.winchargebacks.com',
    features: [
      'AI-Powered Platform',
      'Booking System Integration',
      'Automatic Evidence Dossiers',
      'Representment Filing',
      'OTA/Hotel Support'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['bookingSource', 'autoFile'],
    webhookEndpoint: '/api/webhooks/winchargebacks',
    apiBaseUrl: process.env.WINCHARGEBACKS_API_URL || 'https://api.winchargebacks.com/v1',
    description: 'AI-powered platform that connects to booking systems and payment processors for automatic dispute handling'
  },
  CHARGEBACK_GURUS: {
    name: 'Chargeback Gurus',
    fullName: 'Chargeback Gurus',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🧙',
    portalUrl: 'https://portal.chargebackgurus.com',
    features: [
      'Early Alert System',
      'Analytics Dashboard',
      'Expert Dispute Management',
      'Centralized Case Management',
      'Hospitality Specialization'
    ],
    requiredConfig: ['apiKey', 'clientId'],
    optionalConfig: ['webhookSecret', 'managedService'],
    webhookEndpoint: '/api/webhooks/chargebackgurus',
    apiBaseUrl: process.env.CBGURUS_API_URL || 'https://api.chargebackgurus.com/v1',
    description: 'Combines early alerts, analytics and expert dispute management for hospitality clients'
  },
  CHARGEBACKHELP: {
    name: 'ChargebackHelp',
    portalUrl: 'https://app.chargebackhelp.com',
    fullName: 'ChargebackHelp',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🛟',
    features: [
      'Multi-Tool Integration',
      'Verifi CDRN Integration',
      'Ethoca Alerts Integration',
      'Visa RDR Support',
      'Mastercom Integration',
      'Travel/Hospitality Focus'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['verifiId', 'ethocaId', 'rdrEnabled'],
    webhookEndpoint: '/api/webhooks/chargebackhelp',
    apiBaseUrl: process.env.CBHELP_API_URL || 'https://api.chargebackhelp.com/v1',
    description: 'Integrates multiple dispute prevention and recovery tools tailored to high-risk verticals like travel/hospitality'
  },
  CLEARVIEW: {
    name: 'Clearview',
    portalUrl: 'https://portal.clearviewmc.net',
    fullName: 'Clearview / Chargeback Shield',
    type: 'dispute_management',
    category: 'hospitality',
    twoWaySync: true,
    logo: '🛡️',
    features: [
      'Proactive Dispute Alerting',
      'Automated Evidence Collection',
      'Reservation Payment Protection',
      'Real-time Risk Monitoring'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['propertyCode'],
    webhookEndpoint: '/api/webhooks/clearview',
    apiBaseUrl: process.env.CLEARVIEW_API_URL || 'https://api.clearviewmc.net/v1',
    description: 'Hospitality payment solution with proactive dispute alerting and automated evidence collection'
  },

  // =========================================================================
  // CARD NETWORK TOOLS (VISA/MASTERCARD)
  // =========================================================================
  VERIFI: {
    name: 'Verifi',
    fullName: 'Verifi (Visa)',
    type: 'card_network',
    category: 'network',
    twoWaySync: true,
    logo: '💳',
    portalUrl: 'https://portal.verifi.com',
    features: [
      'Visa CDRN Alerts',
      'RDR (Rapid Dispute Resolution)',
      'Order Insight',
      'Pre-Dispute Resolution',
      'Network-Level Tools'
    ],
    requiredConfig: ['apiKey', 'merchantId', 'cardAcceptorId'],
    optionalConfig: ['descriptor', 'rdrEnabled'],
    webhookEndpoint: '/api/webhooks/verifi',
    apiBaseUrl: process.env.VERIFI_API_URL || 'https://api.verifi.com/v3',
    description: 'Visa-owned dispute prevention and resolution platform with pre-dispute and RDR capabilities'
  },
  ETHOCA: {
    name: 'Ethoca',
    fullName: 'Ethoca (Mastercard)',
    type: 'card_network',
    category: 'network',
    twoWaySync: true,
    logo: '🔴',
    portalUrl: 'https://portal.ethoca.com',
    features: [
      'Consumer Clarity',
      'Alerts Service',
      'Eliminator',
      'Collaboration Network',
      'Issuer Connections'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['webhookSecret', 'alertTypes'],
    webhookEndpoint: '/api/webhooks/ethoca',
    apiBaseUrl: process.env.ETHOCA_API_URL || 'https://api.ethoca.com/v2',
    description: 'Mastercard-owned collaborative fraud and dispute resolution via direct issuer connections'
  },

  // =========================================================================
  // BROADER DISPUTE PLATFORMS
  // =========================================================================
  CHARGEBACKS911: {
    name: 'Chargebacks911',
    fullName: 'Chargebacks911',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '🚨',
    portalUrl: 'https://app.chargebacks911.com',
    features: [
      'Chargeback Alerts',
      'Prevention Tools',
      'Recovery Services',
      'Analytics',
      'Merchant Education',
      'ROI Guarantee'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['webhookSecret'],
    webhookEndpoint: '/api/webhooks/chargebacks911',
    apiBaseUrl: process.env.CB911_API_URL || 'https://api.chargebacks911.com/v1',
    description: 'End-to-end chargeback management solution with comprehensive prevention and recovery'
  },
  RISKIFIED: {
    name: 'Riskified',
    fullName: 'Riskified Dispute Resolve',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '🔒',
    portalUrl: 'https://app.riskified.com',
    features: [
      'Debt Recovery',
      'Dispute Automation',
      'Evidence Compilation',
      'Automated Representments',
      'Fraud Prevention'
    ],
    requiredConfig: ['apiKey', 'shopId'],
    optionalConfig: ['autoDispute'],
    webhookEndpoint: '/api/webhooks/riskified',
    apiBaseUrl: process.env.RISKIFIED_API_URL || 'https://api.riskified.com/v2',
    description: 'Dispute automation solution within an ecommerce risk/fraud platform for auto-compiling evidence'
  },
  CHARGEBLAST: {
    name: 'Chargeblast',
    fullName: 'Chargeblast',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '💥',
    portalUrl: 'https://app.chargeblast.com',
    features: [
      'Real-time Alerts',
      'Evidence Compilation',
      'Dispute Prevention',
      'Automated Management',
      'Pre-Escalation Handling'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['alertsEnabled'],
    webhookEndpoint: '/api/webhooks/chargeblast',
    apiBaseUrl: process.env.CHARGEBLAST_API_URL || 'https://api.chargeblast.com/v1',
    description: 'Automated chargeback prevention & management with real-time alerts and evidence compilation'
  },
  MIDIGATOR: {
    name: 'Midigator',
    fullName: 'Midigator by CAVU',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '📊',
    portalUrl: 'https://portal.midigator.com',
    features: [
      'Dispute Intelligence',
      'Automated Responses',
      'Analytics & Reporting',
      'Prevention Alerts',
      'CAVU Integration'
    ],
    requiredConfig: ['apiKey', 'accountId'],
    optionalConfig: ['autoRespond'],
    webhookEndpoint: '/api/webhooks/midigator',
    apiBaseUrl: process.env.MIDIGATOR_API_URL || 'https://api.midigator.com/v1',
    description: 'Intelligent dispute management platform with comprehensive analytics'
  },
  CAVU: {
    name: 'CAVU',
    fullName: 'CAVU Payment Solutions',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '✈️',
    portalUrl: 'https://portal.cavupayments.com',
    features: [
      'Hospitality Focus',
      'Real-time Alerts',
      'Evidence Collection',
      'Response Management',
      'Payment Processing'
    ],
    requiredConfig: ['apiKey', 'clientId', 'clientSecret'],
    optionalConfig: ['propertyCode'],
    webhookEndpoint: '/api/webhooks/cavu',
    apiBaseUrl: process.env.CAVU_API_URL || 'https://api.cavupayments.com/v1',
    description: 'Hospitality-focused payment and dispute solution'
  },
  TAILOREDPAY: {
    name: 'TailoredPay',
    fullName: 'TailoredPay',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '🎯',
    portalUrl: 'https://merchant.tailoredpay.com',
    features: [
      'Fraud Prevention',
      'Chargeback Management',
      'High-Risk Support',
      'Payment Services',
      'Merchant Services'
    ],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['webhookSecret'],
    webhookEndpoint: '/api/webhooks/tailoredpay',
    apiBaseUrl: process.env.TAILOREDPAY_API_URL || 'https://api.tailoredpay.com/v1',
    description: 'Fraud prevention + chargeback management as part of high-risk merchant payment services'
  },

  // =========================================================================
  // CARD NETWORK PORTALS
  // =========================================================================
  VISA_VROL: {
    name: 'Visa VROL',
    fullName: 'Visa Resolve Online',
    type: 'card_network',
    category: 'network',
    twoWaySync: true,
    logo: '🔵',
    portalUrl: 'https://www.visaonline.com',
    features: ['Visa Resolve Online Portal', 'Dispute Case Management', 'Evidence Upload', 'Response Deadlines', 'Transaction Detail Inquiry'],
    requiredConfig: ['merchantId', 'acquirerBIN', 'username', 'password'],
    optionalConfig: ['autoNotify'],
    apiBaseUrl: 'https://api.visa.com/vrol/v1',
    description: 'Visa official dispute resolution portal for managing chargebacks and pre-arbitration cases'
  },
  MASTERCOM: {
    name: 'Mastercom',
    fullName: 'Mastercard Mastercom',
    type: 'card_network',
    category: 'network',
    twoWaySync: true,
    logo: '🔴',
    portalUrl: 'https://mastercom.mastercard.com',
    features: ['Mastercard Dispute Portal', 'Case Management', 'Evidence Submission', 'Chargeback Tracking', 'Pre-Compliance Filing'],
    requiredConfig: ['merchantId', 'acquirerICA', 'username', 'password'],
    optionalConfig: ['autoResponse'],
    apiBaseUrl: 'https://api.mastercard.com/mastercom/v1',
    description: 'Mastercard official dispute management system for chargeback representment and case tracking'
  },
  AMEX_MERCHANT: {
    name: 'Amex Merchant',
    fullName: 'American Express Merchant Portal',
    type: 'card_network',
    category: 'network',
    twoWaySync: false,
    logo: '💠',
    portalUrl: 'https://merchant.americanexpress.com',
    features: ['American Express Disputes', 'Merchant Dashboard', 'Evidence Upload', 'Inquiry Response', 'Transaction Search'],
    requiredConfig: ['merchantId', 'username', 'password'],
    optionalConfig: ['notificationEmail'],
    apiBaseUrl: 'https://api.americanexpress.com/disputes/v1',
    description: 'American Express merchant portal for dispute management and evidence submission'
  },
  DISCOVER_DISPUTE: {
    name: 'Discover Disputes',
    fullName: 'Discover Dispute Portal',
    type: 'card_network',
    category: 'network',
    twoWaySync: false,
    logo: '🟠',
    portalUrl: 'https://merchantcenter.discovernetwork.com',
    features: ['Discover Dispute Portal', 'Case Tracking', 'Response Filing', 'Evidence Management', 'Chargeback Reporting'],
    requiredConfig: ['merchantId', 'username', 'password'],
    optionalConfig: ['autoAlerts'],
    apiBaseUrl: 'https://api.discover.com/disputes/v1',
    description: 'Discover Network dispute management portal for chargeback response and tracking'
  },

  // =========================================================================
  // MERCHANT PROCESSOR PORTALS
  // =========================================================================
  CHASE_MERCHANT: {
    name: 'Chase Merchant Services',
    fullName: 'Chase Paymentech',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🏦',
    portalUrl: 'https://merchant.chase.com',
    features: ['Merchant Portal', 'Dispute Management', 'Transaction Lookup', 'Evidence Upload', 'Chargeback Alerts'],
    requiredConfig: ['merchantId', 'terminalId', 'username', 'password'],
    optionalConfig: ['autoNotify'],
    apiBaseUrl: 'https://api.chase.com/merchant/v1',
    description: 'Chase Paymentech merchant services portal for dispute management and transaction lookup'
  },
  STRIPE_DISPUTES: {
    name: 'Stripe Disputes',
    fullName: 'Stripe Dispute Management',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🟣',
    portalUrl: 'https://dashboard.stripe.com/disputes',
    features: ['Stripe Dashboard', 'Automated Evidence Submission', 'Dispute Alerts via Webhook', 'Transaction Search', 'Evidence Templates'],
    requiredConfig: ['secretKey', 'webhookSecret'],
    optionalConfig: ['autoSubmitEvidence'],
    apiBaseUrl: 'https://api.stripe.com/v1',
    description: 'Stripe integrated dispute management with automatic evidence submission and webhook alerts'
  },
  ELAVON: {
    name: 'Elavon',
    fullName: 'Elavon Merchant Services',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🔷',
    portalUrl: 'https://merchantconnect.elavon.com',
    features: ['Merchant Connect Portal', 'Dispute Management', 'Evidence Upload', 'Transaction Search', 'Chargeback Reports'],
    requiredConfig: ['merchantId', 'userId', 'pin'],
    optionalConfig: ['autoNotify'],
    apiBaseUrl: 'https://api.elavon.com/v1',
    description: 'Elavon merchant services portal for dispute management, evidence submission and reporting'
  },
  FISERV: {
    name: 'Fiserv',
    fullName: 'Fiserv Dispute Management',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🟢',
    portalUrl: 'https://merchantaccess.fiserv.com',
    features: ['ClientLine Portal', 'Dispute Tracking', 'Evidence Management', 'Transaction Search', 'Analytics'],
    requiredConfig: ['merchantId', 'apiKey'],
    optionalConfig: ['webhookUrl'],
    apiBaseUrl: 'https://api.fiserv.com/disputes/v1',
    description: 'Fiserv (First Data) dispute management via ClientLine portal with analytics and tracking'
  },
  GLOBAL_PAYMENTS: {
    name: 'Global Payments',
    fullName: 'Global Payments Dispute Center',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🌐',
    portalUrl: 'https://merchantportal.globalpayments.com',
    features: ['Merchant Portal', 'Dispute Center', 'Evidence Upload', 'Real-time Alerts', 'Reporting'],
    requiredConfig: ['merchantId', 'apiKey', 'apiSecret'],
    optionalConfig: ['webhookUrl'],
    apiBaseUrl: 'https://api.globalpayments.com/v1',
    description: 'Global Payments merchant portal for dispute center access and evidence management'
  },
  TSYS: {
    name: 'TSYS',
    fullName: 'TSYS Merchant Solutions',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🔶',
    portalUrl: 'https://merchantaccess.tsys.com',
    features: ['Merchant Access', 'Dispute Management', 'Evidence Submission', 'Transaction Lookup', 'Reporting'],
    requiredConfig: ['merchantId', 'apiKey'],
    optionalConfig: ['autoNotify'],
    apiBaseUrl: 'https://api.tsys.com/v1',
    description: 'TSYS merchant solutions portal for dispute management and transaction lookup'
  },
  SQUARE: {
    name: 'Square',
    fullName: 'Square Dispute Management',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '⬜',
    portalUrl: 'https://squareup.com/dashboard/disputes',
    features: ['Square Dashboard', 'Dispute Management', 'Evidence Upload', 'Automated Alerts', 'Transaction History'],
    requiredConfig: ['accessToken'],
    optionalConfig: ['webhookUrl', 'autoSubmit'],
    apiBaseUrl: 'https://connect.squareup.com/v2',
    description: 'Square payment processing dispute management via dashboard and API'
  },
  AUTHORIZE_NET: {
    name: 'Authorize.net',
    fullName: 'Authorize.net Dispute Center',
    type: 'processor',
    category: 'processor',
    twoWaySync: false,
    logo: '🟤',
    portalUrl: 'https://account.authorize.net',
    features: ['Merchant Interface', 'Dispute Center', 'Transaction Search', 'Evidence Upload', 'Chargeback Alerts'],
    requiredConfig: ['loginId', 'transactionKey'],
    optionalConfig: ['webhookUrl'],
    apiBaseUrl: 'https://api.authorize.net/xml/v1',
    description: 'Authorize.net merchant interface for dispute management and evidence submission'
  },
  WORLDPAY: {
    name: 'Worldpay',
    fullName: 'Worldpay Dispute Management',
    type: 'processor',
    category: 'processor',
    twoWaySync: true,
    logo: '🌍',
    portalUrl: 'https://merchantportal.worldpay.com',
    features: ['Merchant Portal', 'Dispute Tracking', 'Evidence Management', 'Real-time Alerts', 'Analytics'],
    requiredConfig: ['merchantId', 'apiKey'],
    optionalConfig: ['webhookSecret'],
    apiBaseUrl: 'https://api.worldpay.com/v1',
    description: 'Worldpay (FIS) merchant dispute management portal with real-time tracking'
  },

  // =========================================================================
  // THIRD-PARTY CHARGEBACK SERVICES
  // =========================================================================
  KOUNT: {
    name: 'Kount',
    fullName: 'Kount (Equifax)',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '🛡️',
    portalUrl: 'https://portal.kount.com',
    features: ['AI Fraud Prevention', 'Dispute Management', 'Identity Trust', 'Risk Assessment', 'Chargeback Prevention'],
    requiredConfig: ['apiKey', 'merchantId'],
    optionalConfig: ['riskThreshold'],
    apiBaseUrl: 'https://api.kount.com/v1',
    description: 'Kount (Equifax) AI-driven fraud prevention and dispute management platform'
  },
  SIGNIFYD: {
    name: 'Signifyd',
    fullName: 'Signifyd Chargeback Protection',
    type: 'dispute_management',
    category: 'general',
    twoWaySync: true,
    logo: '✅',
    portalUrl: 'https://app.signifyd.com',
    features: ['Guaranteed Fraud Protection', 'Chargeback Recovery', 'Automated Representment', 'Decision Intelligence', 'Revenue Optimization'],
    requiredConfig: ['apiKey', 'teamId'],
    optionalConfig: ['autoDecision'],
    apiBaseUrl: 'https://api.signifyd.com/v2',
    description: 'Signifyd guaranteed fraud protection with automated chargeback recovery and representment'
  }
};

// =============================================================================
// MERLINK SERVICE (FULL 2-WAY INTEGRATION)
// =============================================================================

class MerlinkService {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = DISPUTE_COMPANIES.MERLINK.apiBaseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': credentials.apiKey,
        'X-Merchant-ID': credentials.merchantId,
        'X-Hotel-ID': credentials.hotelId
      }
    });

    // Add request signing
    this.client.interceptors.request.use(config => {
      const timestamp = Date.now().toString();
      const signature = this.signRequest(config.method, config.url, timestamp);
      config.headers['X-Timestamp'] = timestamp;
      config.headers['X-Signature'] = signature;
      return config;
    });
  }

  signRequest(method, path, timestamp) {
    const payload = `${method.toUpperCase()}:${path}:${timestamp}:${this.credentials.apiSecret}`;
    return crypto.createHmac('sha256', this.credentials.apiSecret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Test connection to Merlink
   */
  async testConnection() {
    try {
      const response = await this.client.get('/ping');
      return {
        success: true,
        message: 'Merlink connection successful',
        data: response.data
      };
    } catch (error) {
      logger.error('Merlink connection test failed:', error.message);
      throw new Error(`Merlink connection failed: ${error.message}`);
    }
  }

  /**
   * Get disputes from Merlink
   */
  async getDisputes(params = {}) {
    try {
      const response = await this.client.get('/disputes', {
        params: {
          status: params.status || 'open',
          startDate: params.startDate,
          endDate: params.endDate,
          limit: params.limit || 100,
          offset: params.offset || 0
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get Merlink disputes:', error.message);
      throw error;
    }
  }

  /**
   * Get single dispute details
   */
  async getDispute(disputeId) {
    try {
      const response = await this.client.get(`/disputes/${disputeId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get Merlink dispute ${disputeId}:`, error.message);
      throw error;
    }
  }

  /**
   * Submit evidence to Merlink
   */
  async submitEvidence(disputeId, evidence) {
    try {
      const response = await this.client.post(`/disputes/${disputeId}/evidence`, {
        evidenceType: evidence.type,
        description: evidence.description,
        documents: evidence.documents,
        compellingEvidence: evidence.compellingEvidence || {},
        metadata: evidence.metadata
      });

      logger.info(`Evidence submitted to Merlink for dispute ${disputeId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to submit evidence to Merlink:`, error.message);
      throw error;
    }
  }

  /**
   * Update case status in Merlink
   */
  async updateCaseStatus(disputeId, status, notes = '') {
    try {
      const response = await this.client.patch(`/disputes/${disputeId}/status`, {
        status,
        notes,
        updatedAt: new Date().toISOString()
      });

      logger.info(`Merlink case ${disputeId} status updated to ${status}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update Merlink case status:`, error.message);
      throw error;
    }
  }

  /**
   * Send automated response through Merlink
   */
  async sendResponse(disputeId, responseData) {
    try {
      const response = await this.client.post(`/disputes/${disputeId}/respond`, {
        responseType: responseData.type,
        representmentPackage: {
          guestName: responseData.guestName,
          reservationNumber: responseData.reservationNumber,
          checkInDate: responseData.checkInDate,
          checkOutDate: responseData.checkOutDate,
          transactionAmount: responseData.amount,
          evidenceDocuments: responseData.evidenceIds,
          compellingArgument: responseData.argument
        },
        autoSubmit: responseData.autoSubmit || false
      });

      logger.info(`Response sent through Merlink for dispute ${disputeId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to send Merlink response:`, error.message);
      throw error;
    }
  }

  /**
   * Sync case data bi-directionally
   */
  async syncCase(localCase, direction = 'both') {
    try {
      if (direction === 'push' || direction === 'both') {
        // Push local data to Merlink
        await this.client.put(`/disputes/${localCase.processorDisputeId}`, {
          externalCaseId: localCase.caseNumber,
          status: this.mapStatusToMerlink(localCase.status),
          confidenceScore: localCase.confidenceScore,
          aiRecommendation: localCase.recommendation,
          lastUpdated: localCase.updatedAt
        });
      }

      if (direction === 'pull' || direction === 'both') {
        // Pull Merlink data
        const merlinkData = await this.getDispute(localCase.processorDisputeId);
        return merlinkData;
      }

      return { success: true };
    } catch (error) {
      logger.error(`Failed to sync case with Merlink:`, error.message);
      throw error;
    }
  }

  /**
   * Register webhook endpoint with Merlink
   */
  async registerWebhook(webhookUrl, events = ['all']) {
    try {
      const response = await this.client.post('/webhooks', {
        url: webhookUrl,
        events: events,
        active: true,
        secret: crypto.randomBytes(32).toString('hex')
      });

      logger.info(`Webhook registered with Merlink: ${webhookUrl}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to register Merlink webhook:`, error.message);
      throw error;
    }
  }

  mapStatusToMerlink(localStatus) {
    const statusMap = {
      'PENDING': 'pending_review',
      'IN_REVIEW': 'in_progress',
      'SUBMITTED': 'submitted',
      'WON': 'won',
      'LOST': 'lost',
      'EXPIRED': 'expired'
    };
    return statusMap[localStatus] || 'unknown';
  }

  mapStatusFromMerlink(merlinkStatus) {
    const statusMap = {
      'new': 'PENDING',
      'pending_review': 'PENDING',
      'in_progress': 'IN_REVIEW',
      'submitted': 'SUBMITTED',
      'won': 'WON',
      'lost': 'LOST',
      'expired': 'EXPIRED'
    };
    return statusMap[merlinkStatus] || 'PENDING';
  }
}

// =============================================================================
// DISPUTE COMPANY SERVICE
// =============================================================================

class DisputeCompanyService {
  /**
   * Get all available dispute companies
   */
  getAvailableCompanies() {
    return Object.entries(DISPUTE_COMPANIES).map(([key, value]) => ({
      id: key,
      ...value
    }));
  }

  /**
   * Get company details
   */
  getCompany(companyId) {
    return DISPUTE_COMPANIES[companyId.toUpperCase()] || null;
  }

  /**
   * Create integration with dispute company
   */
  async createIntegration(companyId, credentials, config = {}) {
    const company = this.getCompany(companyId);

    if (!company) {
      throw new Error(`Unknown dispute company: ${companyId}`);
    }

    // Validate required credentials
    for (const required of company.requiredConfig) {
      if (!credentials[required]) {
        throw new Error(`Missing required credential: ${required}`);
      }
    }

    // Encrypt credentials
    const encryptedCredentials = this.encryptCredentials(credentials);

    // Generate webhook URL
    const baseUrl = process.env.BASE_URL || 'https://api.disputeai.com';
    const webhookUrl = `${baseUrl}${company.webhookEndpoint}`;

    const integration = await prisma.integration.create({
      data: {
        name: company.fullName,
        type: companyId.toLowerCase(),
        status: 'inactive',
        config: {
          ...config,
          twoWaySync: company.twoWaySync,
          features: company.features
        },
        credentials: encryptedCredentials,
        webhookUrl,
        syncEnabled: true
      }
    });

    logger.info(`Dispute company integration created: ${company.name} (${integration.id})`);
    return integration;
  }

  /**
   * Test connection to dispute company
   */
  async testConnection(integrationId) {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const credentials = this.decryptCredentials(integration.credentials);
    const companyId = integration.type.toUpperCase();

    try {
      let result;

      switch (companyId) {
        case 'MERLINK':
          const merlinkService = new MerlinkService(credentials);
          result = await merlinkService.testConnection();
          break;
        // Add other company connections...
        default:
          result = { success: true, message: `${integration.name} connection test not implemented` };
      }

      if (result.success) {
        await prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'active', syncErrors: 0 }
        });
      }

      return result;
    } catch (error) {
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          status: 'error',
          syncErrors: integration.syncErrors + 1
        }
      });
      throw error;
    }
  }

  /**
   * Sync disputes from company
   */
  async syncDisputes(integrationId) {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const credentials = this.decryptCredentials(integration.credentials);
    const companyId = integration.type.toUpperCase();

    try {
      let synced = 0;
      let errors = 0;

      if (companyId === 'MERLINK') {
        const merlinkService = new MerlinkService(credentials);
        const disputes = await merlinkService.getDisputes({ status: 'open' });

        for (const dispute of disputes.data || []) {
          try {
            await this.processIncomingDispute(dispute, integration);
            synced++;
          } catch (err) {
            errors++;
            logger.error(`Error syncing dispute ${dispute.id}:`, err.message);
          }
        }
      }

      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: errors === 0 ? 'success' : 'partial',
          syncErrors: errors
        }
      });

      logger.info(`Dispute sync completed: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'failed',
          syncErrors: integration.syncErrors + 1
        }
      });
      throw error;
    }
  }

  /**
   * Process incoming dispute from company
   */
  async processIncomingDispute(dispute, integration) {
    // Check if dispute already exists
    const existing = await prisma.chargeback.findFirst({
      where: { processorDisputeId: dispute.id }
    });

    if (existing) {
      // Update existing case
      return prisma.chargeback.update({
        where: { id: existing.id },
        data: {
          status: this.mapStatus(dispute.status),
          updatedAt: new Date()
        }
      });
    }

    // Get default property
    const property = await prisma.property.findFirst({
      where: { isActive: true }
    });

    if (!property) {
      throw new Error('No active property found');
    }

    // Get provider
    const provider = await prisma.provider.findFirst({
      where: { type: 'PAYMENT_PROCESSOR' }
    });

    // Generate case number
    const year = new Date().getFullYear();
    const lastCase = await prisma.chargeback.findFirst({
      where: { caseNumber: { startsWith: `CB-${year}-` } },
      orderBy: { caseNumber: 'desc' }
    });

    const nextNumber = lastCase
      ? parseInt(lastCase.caseNumber.split('-')[2]) + 1
      : 1;
    const caseNumber = `CB-${year}-${nextNumber.toString().padStart(4, '0')}`;

    // Create new chargeback
    const chargeback = await prisma.chargeback.create({
      data: {
        caseNumber,
        status: this.mapStatus(dispute.status),
        guestName: dispute.guestName || dispute.cardholderName || 'Unknown Guest',
        guestEmail: dispute.guestEmail,
        amount: dispute.amount,
        currency: dispute.currency || 'USD',
        transactionId: dispute.transactionId,
        cardLastFour: dispute.cardLast4,
        cardBrand: dispute.cardBrand,
        reasonCode: dispute.reasonCode,
        reasonDescription: dispute.reasonDescription,
        disputeDate: new Date(dispute.disputeDate),
        dueDate: dispute.responseDeadline ? new Date(dispute.responseDeadline) : null,
        processorDisputeId: dispute.id,
        checkInDate: dispute.checkInDate ? new Date(dispute.checkInDate) : new Date(),
        checkOutDate: dispute.checkOutDate ? new Date(dispute.checkOutDate) : new Date(),
        confirmationNumber: dispute.reservationNumber,
        propertyId: property.id,
        providerId: provider?.id
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'ALERT',
        title: 'Dispute Received from ' + integration.name,
        description: `New ${dispute.reasonDescription || dispute.reasonCode} dispute`,
        metadata: {
          source: integration.type,
          originalId: dispute.id
        }
      }
    });

    // Create notification for users
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' }
    });

    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        type: 'NEW_CHARGEBACK',
        priority: 'HIGH',
        title: 'New Dispute from ' + integration.name,
        message: `A $${dispute.amount} dispute has been received. Case: ${caseNumber}`,
        link: `/cases/${chargeback.id}`,
        metadata: {
          caseId: chargeback.id,
          caseNumber,
          amount: dispute.amount
        }
      }))
    });

    logger.info(`Created case ${caseNumber} from ${integration.name} dispute`);
    return chargeback;
  }

  /**
   * Submit evidence to dispute company
   */
  async submitEvidence(integrationId, caseId, evidenceData) {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const credentials = this.decryptCredentials(integration.credentials);
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: caseId },
      include: { evidence: true }
    });

    if (!chargeback) {
      throw new Error('Case not found');
    }

    const companyId = integration.type.toUpperCase();

    if (companyId === 'MERLINK') {
      const merlinkService = new MerlinkService(credentials);
      const result = await merlinkService.submitEvidence(
        chargeback.processorDisputeId,
        evidenceData
      );

      // Log submission
      await prisma.timelineEvent.create({
        data: {
          chargebackId: caseId,
          eventType: 'SUCCESS',
          title: 'Evidence Submitted to Merlink',
          description: `Evidence package submitted through Merlink integration`,
          metadata: { submissionId: result.submissionId }
        }
      });

      return result;
    }

    throw new Error(`Evidence submission not supported for ${integration.name}`);
  }

  /**
   * Push case update to dispute company
   */
  async pushCaseUpdate(integrationId, caseId) {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration || !integration.config?.twoWaySync) {
      return null;
    }

    const credentials = this.decryptCredentials(integration.credentials);
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: caseId }
    });

    if (!chargeback?.processorDisputeId) {
      return null;
    }

    const companyId = integration.type.toUpperCase();

    if (companyId === 'MERLINK') {
      const merlinkService = new MerlinkService(credentials);
      return merlinkService.syncCase(chargeback, 'push');
    }

    return null;
  }

  mapStatus(externalStatus) {
    const statusMap = {
      'new': 'PENDING',
      'open': 'PENDING',
      'pending': 'PENDING',
      'in_progress': 'IN_REVIEW',
      'review': 'IN_REVIEW',
      'submitted': 'SUBMITTED',
      'responded': 'SUBMITTED',
      'won': 'WON',
      'lost': 'LOST',
      'expired': 'EXPIRED',
      'closed_won': 'WON',
      'closed_lost': 'LOST'
    };
    return statusMap[externalStatus?.toLowerCase()] || 'PENDING';
  }

  encryptCredentials(data) {
    const key = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(key, 'salt', 32), iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      data: encrypted
    };
  }

  decryptCredentials(encryptedObj) {
    const key = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.scryptSync(key, 'salt', 32),
      Buffer.from(encryptedObj.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}

// =============================================================================
// WEBHOOK HANDLERS FOR DISPUTE COMPANIES
// =============================================================================

const disputeWebhookHandlers = {
  /**
   * Handle Merlink webhook
   */
  async merlink(payload, signature, webhookSecret) {
    // Verify signature
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid Merlink webhook signature');
      }
    }

    logger.info(`Merlink webhook received: ${payload.event}`);

    switch (payload.event) {
      case 'dispute.created':
        return handleMerlinkDisputeCreated(payload.data);
      case 'dispute.updated':
        return handleMerlinkDisputeUpdated(payload.data);
      case 'dispute.closed':
        return handleMerlinkDisputeClosed(payload.data);
      case 'evidence.requested':
        return handleMerlinkEvidenceRequested(payload.data);
      case 'response.submitted':
        return handleMerlinkResponseSubmitted(payload.data);
      default:
        logger.info(`Unhandled Merlink event: ${payload.event}`);
    }
  },

  /**
   * Handle Chargebacks911 webhook
   */
  async chargebacks911(payload, signature) {
    logger.info('Chargebacks911 webhook received');
    // Implementation for CB911
  },

  /**
   * Handle Verifi webhook
   */
  async verifi(payload, signature) {
    logger.info('Verifi webhook received');
    // Implementation for Verifi
  },

  /**
   * Handle Ethoca webhook
   */
  async ethoca(payload, signature) {
    logger.info('Ethoca webhook received');
    // Implementation for Ethoca
  }
};

// =============================================================================
// MERLINK WEBHOOK EVENT HANDLERS
// =============================================================================

async function handleMerlinkDisputeCreated(data) {
  logger.info(`New Merlink dispute: ${data.disputeId}`);

  // Find Merlink integration
  const integration = await prisma.integration.findFirst({
    where: { type: 'merlink', status: 'active' }
  });

  if (integration) {
    const service = new DisputeCompanyService();
    await service.processIncomingDispute(data, integration);
  }
}

async function handleMerlinkDisputeUpdated(data) {
  logger.info(`Merlink dispute updated: ${data.disputeId}`);

  const chargeback = await prisma.chargeback.findFirst({
    where: { processorDisputeId: data.disputeId }
  });

  if (chargeback) {
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'INFO',
        title: 'Merlink Case Updated',
        description: `Status changed to: ${data.status}`,
        metadata: data
      }
    });
  }
}

async function handleMerlinkDisputeClosed(data) {
  logger.info(`Merlink dispute closed: ${data.disputeId}`);

  const chargeback = await prisma.chargeback.findFirst({
    where: { processorDisputeId: data.disputeId }
  });

  if (chargeback) {
    const status = data.outcome === 'won' ? 'WON' : 'LOST';

    await prisma.chargeback.update({
      where: { id: chargeback.id },
      data: {
        status,
        resolvedAt: new Date()
      }
    });

    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: status,
        title: `Dispute ${status}`,
        description: `Merlink case closed with outcome: ${data.outcome}`,
        metadata: data
      }
    });

    // Create notification
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        type: 'SUBMISSION_RESULT',
        priority: status === 'WON' ? 'MEDIUM' : 'HIGH',
        title: `Case ${chargeback.caseNumber} ${status}`,
        message: `The dispute has been closed with outcome: ${data.outcome}`,
        link: `/cases/${chargeback.id}`
      }))
    });
  }
}

async function handleMerlinkEvidenceRequested(data) {
  logger.info(`Merlink evidence requested for: ${data.disputeId}`);

  const chargeback = await prisma.chargeback.findFirst({
    where: { processorDisputeId: data.disputeId }
  });

  if (chargeback) {
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'WARNING',
        title: 'Additional Evidence Requested',
        description: `Merlink requires additional evidence: ${data.evidenceTypes?.join(', ')}`,
        metadata: data
      }
    });

    // Create urgent notification
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        type: 'CASE_UPDATE',
        priority: 'URGENT',
        title: 'Evidence Requested',
        message: `Additional evidence needed for case ${chargeback.caseNumber}`,
        link: `/cases/${chargeback.id}`
      }))
    });
  }
}

async function handleMerlinkResponseSubmitted(data) {
  logger.info(`Merlink response submitted for: ${data.disputeId}`);

  const chargeback = await prisma.chargeback.findFirst({
    where: { processorDisputeId: data.disputeId }
  });

  if (chargeback) {
    await prisma.chargeback.update({
      where: { id: chargeback.id },
      data: { status: 'SUBMITTED' }
    });

    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'SUCCESS',
        title: 'Response Submitted via Merlink',
        description: `Evidence package submitted to processor`,
        metadata: data
      }
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  DISPUTE_COMPANIES,
  DisputeCompanyService: new DisputeCompanyService(),
  MerlinkService,
  disputeWebhookHandlers
};
