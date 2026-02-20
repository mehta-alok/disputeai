/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * PMS Integration Service
 * Connects to Property Management Systems to fetch evidence directly
 */

const crypto = require('crypto');

// Supported PMS Systems
const PMS_SYSTEMS = {
  OPERA_CLOUD: {
    name: 'Oracle Opera Cloud',
    logo: '/pms/opera.png',
    authType: 'oauth2',
    baseUrl: 'https://api.oracle.com/opera/v1',
    scopes: ['reservations.read', 'guests.read', 'folios.read', 'payments.read'],
    evidenceTypes: ['folio', 'registration_card', 'payment_receipt', 'guest_signature', 'id_scan']
  },
  MEWS: {
    name: 'Mews Systems',
    logo: '/pms/mews.png',
    authType: 'api_key',
    baseUrl: 'https://api.mews.com/api/connector/v1',
    scopes: ['reservations', 'customers', 'payments', 'bills'],
    evidenceTypes: ['bill', 'registration', 'payment', 'customer_profile']
  },
  CLOUDBEDS: {
    name: 'Cloudbeds',
    logo: '/pms/cloudbeds.png',
    authType: 'oauth2',
    baseUrl: 'https://api.cloudbeds.com/api/v1.1',
    scopes: ['read:reservation', 'read:guest', 'read:payment'],
    evidenceTypes: ['reservation', 'guest_info', 'payment_info', 'invoice']
  },
  PROTEL: {
    name: 'protel PMS',
    logo: '/pms/protel.png',
    authType: 'basic',
    baseUrl: 'https://api.protel.net/v2',
    scopes: ['bookings', 'guests', 'invoices'],
    evidenceTypes: ['booking_confirmation', 'invoice', 'guest_registration', 'payment_log']
  },
  STAYNTOUCH: {
    name: 'StayNTouch',
    logo: '/pms/stayntouch.png',
    authType: 'oauth2',
    baseUrl: 'https://api.stayntouch.com/v1',
    scopes: ['reservations', 'guests', 'payments', 'folios'],
    evidenceTypes: ['folio', 'reservation', 'payment_record', 'guest_signature']
  },
  APALEO: {
    name: 'Apaleo',
    logo: '/pms/apaleo.png',
    authType: 'oauth2',
    baseUrl: 'https://api.apaleo.com',
    scopes: ['reservations.read', 'folios.read', 'finance.read'],
    evidenceTypes: ['reservation', 'folio', 'invoice', 'payment']
  },
  ROOMKEY: {
    name: 'RoomKeyPMS',
    logo: '/pms/roomkey.png',
    authType: 'api_key',
    baseUrl: 'https://api.roomkeypms.com/v1',
    scopes: ['reservations', 'guests', 'billing'],
    evidenceTypes: ['reservation', 'guest_card', 'billing_statement']
  },
  LITTLE_HOTELIER: {
    name: 'Little Hotelier',
    logo: '/pms/littlehotelier.png',
    authType: 'api_key',
    baseUrl: 'https://api.littlehotelier.com/v1',
    scopes: ['bookings', 'guests', 'payments'],
    evidenceTypes: ['booking', 'payment_receipt', 'guest_info']
  },
  AUTOCLERK: {
    name: 'AutoClerk PMS',
    logo: '/pms/autoclerk.png',
    authType: 'api_key',
    baseUrl: 'https://api.autoclerk.com/v2',
    scopes: ['reservations', 'guests', 'folios', 'payments', 'documents'],
    evidenceTypes: ['folio', 'registration_card', 'payment_receipt', 'guest_signature', 'id_scan', 'reservation', 'audit_trail'],
    features: ['real_time_sync', 'auto_evidence_fetch', 'signature_capture', 'id_verification']
  },
  INNROAD: {
    name: 'innRoad',
    logo: '/pms/innroad.png',
    authType: 'oauth2',
    baseUrl: 'https://api.innroad.com/v1',
    scopes: ['reservations', 'guests', 'payments', 'reports'],
    evidenceTypes: ['reservation', 'folio', 'payment_receipt', 'guest_info']
  },
  WEBREZPRO: {
    name: 'WebRezPro',
    logo: '/pms/webrezpro.png',
    authType: 'api_key',
    baseUrl: 'https://api.webrezpro.com/v2',
    scopes: ['bookings', 'guests', 'billing', 'documents'],
    evidenceTypes: ['booking', 'folio', 'payment_receipt', 'registration']
  },
  ROOMMASTER: {
    name: 'RoomMaster',
    logo: '/pms/roommaster.png',
    authType: 'basic',
    baseUrl: 'https://api.roommaster.com/v1',
    scopes: ['reservations', 'guests', 'folios', 'payments'],
    evidenceTypes: ['folio', 'registration_card', 'payment_receipt', 'reservation']
  }
};

// Evidence type mappings
const EVIDENCE_CATEGORIES = {
  folio: { label: 'Guest Folio', icon: 'FileText', priority: 1 },
  registration_card: { label: 'Registration Card', icon: 'ClipboardList', priority: 2 },
  payment_receipt: { label: 'Payment Receipt', icon: 'Receipt', priority: 3 },
  guest_signature: { label: 'Guest Signature', icon: 'PenTool', priority: 4 },
  id_scan: { label: 'ID Scan', icon: 'CreditCard', priority: 5 },
  bill: { label: 'Bill/Invoice', icon: 'FileText', priority: 1 },
  registration: { label: 'Registration', icon: 'ClipboardList', priority: 2 },
  payment: { label: 'Payment Record', icon: 'DollarSign', priority: 3 },
  customer_profile: { label: 'Customer Profile', icon: 'User', priority: 6 },
  reservation: { label: 'Reservation Details', icon: 'Calendar', priority: 1 },
  guest_info: { label: 'Guest Information', icon: 'User', priority: 2 },
  payment_info: { label: 'Payment Information', icon: 'CreditCard', priority: 3 },
  invoice: { label: 'Invoice', icon: 'FileText', priority: 1 },
  booking_confirmation: { label: 'Booking Confirmation', icon: 'CheckCircle', priority: 1 },
  payment_log: { label: 'Payment Log', icon: 'List', priority: 4 },
  guest_registration: { label: 'Guest Registration', icon: 'UserCheck', priority: 2 },
  payment_record: { label: 'Payment Record', icon: 'Receipt', priority: 3 },
  billing_statement: { label: 'Billing Statement', icon: 'FileText', priority: 1 },
  guest_card: { label: 'Guest Card', icon: 'CreditCard', priority: 5 },
  booking: { label: 'Booking Details', icon: 'Calendar', priority: 1 },
  audit_trail: { label: 'Audit Trail', icon: 'History', priority: 7 }
};

class PMSIntegrationService {
  constructor() {
    this.connections = new Map();
    this.encryptionKey = process.env.PMS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get all supported PMS systems
   */
  getSupportedSystems() {
    return Object.entries(PMS_SYSTEMS).map(([key, system]) => ({
      id: key,
      name: system.name,
      logo: system.logo,
      authType: system.authType,
      evidenceTypes: system.evidenceTypes.map(type => ({
        type,
        ...EVIDENCE_CATEGORIES[type]
      }))
    }));
  }

  /**
   * Initialize OAuth2 connection
   */
  async initiateOAuth(pmsType, propertyId, redirectUri) {
    const pms = PMS_SYSTEMS[pmsType];
    if (!pms) throw new Error(`Unsupported PMS: ${pmsType}`);
    if (pms.authType !== 'oauth2') throw new Error(`${pms.name} does not use OAuth2`);

    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Store state for verification
    this.connections.set(state, {
      pmsType,
      propertyId,
      codeVerifier,
      createdAt: new Date()
    });

    // Build authorization URL
    const authUrls = {
      OPERA_CLOUD: 'https://login.oracle.com/oauth2/authorize',
      CLOUDBEDS: 'https://hotels.cloudbeds.com/oauth',
      STAYNTOUCH: 'https://auth.stayntouch.com/oauth/authorize',
      APALEO: 'https://identity.apaleo.com/connect/authorize'
    };

    const authUrl = new URL(authUrls[pmsType] || `${pms.baseUrl}/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env[`${pmsType}_CLIENT_ID`] || 'demo_client');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', pms.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return {
      authorizationUrl: authUrl.toString(),
      state
    };
  }

  /**
   * Complete OAuth2 flow
   */
  async completeOAuth(code, state) {
    const pendingConnection = this.connections.get(state);
    if (!pendingConnection) throw new Error('Invalid or expired state');

    const { pmsType, propertyId, codeVerifier } = pendingConnection;
    const pms = PMS_SYSTEMS[pmsType];

    // Exchange code for tokens (simulated for POC)
    const tokens = await this.exchangeCodeForTokens(pmsType, code, codeVerifier);

    // Store encrypted credentials
    const connection = {
      id: crypto.randomUUID(),
      pmsType,
      propertyId,
      pmsName: pms.name,
      status: 'connected',
      accessToken: this.encrypt(tokens.access_token),
      refreshToken: this.encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      connectedAt: new Date(),
      lastSyncAt: null,
      evidenceTypes: pms.evidenceTypes
    };

    this.connections.delete(state);
    return connection;
  }

  /**
   * Connect with API Key
   */
  async connectWithApiKey(pmsType, propertyId, apiKey, apiSecret = null) {
    const pms = PMS_SYSTEMS[pmsType];
    if (!pms) throw new Error(`Unsupported PMS: ${pmsType}`);

    // Validate API key (simulated for POC)
    const isValid = await this.validateApiKey(pmsType, apiKey, apiSecret);
    if (!isValid) throw new Error('Invalid API credentials');

    return {
      id: crypto.randomUUID(),
      pmsType,
      propertyId,
      pmsName: pms.name,
      status: 'connected',
      apiKey: this.encrypt(apiKey),
      apiSecret: apiSecret ? this.encrypt(apiSecret) : null,
      connectedAt: new Date(),
      lastSyncAt: null,
      evidenceTypes: pms.evidenceTypes
    };
  }

  /**
   * Connect with Basic Auth
   */
  async connectWithBasicAuth(pmsType, propertyId, username, password, hotelCode) {
    const pms = PMS_SYSTEMS[pmsType];
    if (!pms) throw new Error(`Unsupported PMS: ${pmsType}`);

    // Validate credentials (simulated for POC)
    const isValid = await this.validateBasicAuth(pmsType, username, password, hotelCode);
    if (!isValid) throw new Error('Invalid credentials');

    return {
      id: crypto.randomUUID(),
      pmsType,
      propertyId,
      pmsName: pms.name,
      status: 'connected',
      username: this.encrypt(username),
      password: this.encrypt(password),
      hotelCode,
      connectedAt: new Date(),
      lastSyncAt: null,
      evidenceTypes: pms.evidenceTypes
    };
  }

  /**
   * Search for reservation in PMS
   */
  async searchReservation(connectionId, searchParams) {
    // Simulated PMS search for POC
    const { confirmationNumber, guestName, checkInDate, checkOutDate, cardLast4 } = searchParams;

    // Simulate API call delay
    await this.simulateApiDelay();

    // Return mock reservation data
    return {
      found: true,
      reservation: {
        confirmationNumber: confirmationNumber || 'RES-2024-78542',
        guestName: guestName || 'John Smith',
        email: 'john.smith@email.com',
        phone: '+1 (555) 123-4567',
        checkIn: checkInDate || '2024-01-15',
        checkOut: checkOutDate || '2024-01-18',
        roomNumber: '405',
        roomType: 'Deluxe King',
        rateCode: 'BAR',
        totalAmount: 847.50,
        paymentMethod: `Card ending ${cardLast4 || '4242'}`,
        status: 'checked_out',
        createdAt: '2024-01-10T14:30:00Z',
        specialRequests: 'Late checkout requested',
        loyaltyNumber: 'GOLD-789456'
      }
    };
  }

  /**
   * Fetch evidence from PMS for a reservation
   */
  async fetchEvidence(connectionId, confirmationNumber, evidenceTypes = []) {
    // Simulated evidence fetch for POC
    await this.simulateApiDelay();

    const allEvidence = [
      {
        id: crypto.randomUUID(),
        type: 'folio',
        label: 'Guest Folio',
        description: 'Complete guest folio with all charges',
        fileName: `folio_${confirmationNumber}.pdf`,
        fileSize: 245760,
        mimeType: 'application/pdf',
        generatedAt: new Date().toISOString(),
        preview: {
          totalCharges: 847.50,
          roomCharges: 675.00,
          taxesAndFees: 87.50,
          incidentals: 85.00,
          payments: [
            { method: 'Credit Card ****4242', amount: 847.50, date: '2024-01-18' }
          ]
        }
      },
      {
        id: crypto.randomUUID(),
        type: 'registration_card',
        label: 'Registration Card',
        description: 'Signed guest registration card',
        fileName: `reg_card_${confirmationNumber}.pdf`,
        fileSize: 156432,
        mimeType: 'application/pdf',
        generatedAt: new Date().toISOString(),
        preview: {
          guestName: 'John Smith',
          address: '123 Main St, New York, NY 10001',
          idType: 'Drivers License',
          idNumber: '****7890',
          signaturePresent: true,
          signedAt: '2024-01-15T15:45:00Z'
        }
      },
      {
        id: crypto.randomUUID(),
        type: 'payment_receipt',
        label: 'Payment Receipt',
        description: 'Credit card authorization and payment receipt',
        fileName: `payment_${confirmationNumber}.pdf`,
        fileSize: 98304,
        mimeType: 'application/pdf',
        generatedAt: new Date().toISOString(),
        preview: {
          transactionId: 'TXN-2024-456789',
          cardType: 'Visa',
          cardLast4: '4242',
          amount: 847.50,
          authCode: 'AUTH123456',
          timestamp: '2024-01-18T11:30:00Z',
          status: 'approved'
        }
      },
      {
        id: crypto.randomUUID(),
        type: 'guest_signature',
        label: 'Guest Signature',
        description: 'Digital signature capture from check-in',
        fileName: `signature_${confirmationNumber}.png`,
        fileSize: 45056,
        mimeType: 'image/png',
        generatedAt: new Date().toISOString(),
        preview: {
          capturedAt: '2024-01-15T15:45:00Z',
          captureDevice: 'Front Desk Terminal #2',
          signatureType: 'digital',
          verified: true
        }
      },
      {
        id: crypto.randomUUID(),
        type: 'id_scan',
        label: 'ID Document Scan',
        description: 'Scanned identification document',
        fileName: `id_scan_${confirmationNumber}.pdf`,
        fileSize: 512000,
        mimeType: 'application/pdf',
        generatedAt: new Date().toISOString(),
        preview: {
          documentType: 'Drivers License',
          issuingState: 'New York',
          expirationDate: '2027-06-15',
          matchesReservation: true,
          scannedAt: '2024-01-15T15:42:00Z'
        }
      },
      {
        id: crypto.randomUUID(),
        type: 'reservation',
        label: 'Reservation Confirmation',
        description: 'Original booking confirmation details',
        fileName: `reservation_${confirmationNumber}.pdf`,
        fileSize: 125440,
        mimeType: 'application/pdf',
        generatedAt: new Date().toISOString(),
        preview: {
          bookingSource: 'Direct Website',
          bookingDate: '2024-01-10T14:30:00Z',
          ipAddress: '192.168.1.xxx',
          deviceType: 'Desktop - Chrome',
          termsAccepted: true
        }
      }
    ];

    // Filter by requested evidence types if specified
    const filteredEvidence = evidenceTypes.length > 0
      ? allEvidence.filter(e => evidenceTypes.includes(e.type))
      : allEvidence;

    return {
      confirmationNumber,
      evidenceCount: filteredEvidence.length,
      evidence: filteredEvidence,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Download specific evidence document
   */
  async downloadEvidence(connectionId, evidenceId) {
    await this.simulateApiDelay();

    // In production, this would fetch the actual file from the PMS
    return {
      evidenceId,
      downloadUrl: `/api/pms/evidence/${evidenceId}/download`,
      expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
    };
  }

  /**
   * Attach evidence to a chargeback case
   */
  async attachEvidenceToCase(caseId, evidenceIds, connectionId) {
    await this.simulateApiDelay();

    return {
      caseId,
      attachedEvidence: evidenceIds.map(id => ({
        evidenceId: id,
        attachedAt: new Date().toISOString(),
        status: 'attached'
      })),
      message: `Successfully attached ${evidenceIds.length} evidence document(s) to case`
    };
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(connectionId) {
    return {
      connectionId,
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
      nextSyncAt: new Date(Date.now() + 3600000).toISOString(),
      health: {
        apiReachable: true,
        authValid: true,
        lastError: null
      }
    };
  }

  /**
   * Disconnect PMS
   */
  async disconnect(connectionId) {
    // In production, revoke tokens and clean up
    return {
      connectionId,
      status: 'disconnected',
      disconnectedAt: new Date().toISOString()
    };
  }

  // Helper methods
  async exchangeCodeForTokens(pmsType, code, codeVerifier) {
    // Simulated token exchange for POC
    return {
      access_token: crypto.randomBytes(32).toString('hex'),
      refresh_token: crypto.randomBytes(32).toString('hex'),
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }

  async validateApiKey(pmsType, apiKey, apiSecret) {
    // Simulated validation for POC
    return apiKey && apiKey.length >= 10;
  }

  async validateBasicAuth(pmsType, username, password, hotelCode) {
    // Simulated validation for POC
    return username && password && hotelCode;
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex').slice(0, 32), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedText) {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex').slice(0, 32), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async simulateApiDelay() {
    return new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
  }
}

module.exports = { PMSIntegrationService, PMS_SYSTEMS, EVIDENCE_CATEGORIES };
