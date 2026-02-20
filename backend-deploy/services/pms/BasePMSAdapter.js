/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Base PMS Adapter (Abstract)
 *
 * Every concrete PMS adapter (Opera Cloud, Mews, Cloudbeds, AutoClerk, etc.)
 * extends this class and implements every method below.  The base class
 * provides shared utility helpers for logging, timing, and HTTP client setup.
 *
 * Design contract:
 *  - Inbound methods (get*) fetch data FROM the PMS and return it in
 *    normalized, canonical AccuDefend shapes.
 *  - Outbound methods (push*) send data TO the PMS (notes, flags, alerts).
 *  - Normalization methods convert raw PMS responses into canonical objects.
 *  - Webhook methods handle registration, deregistration, payload parsing,
 *    and signature verification.
 */

'use strict';

const logger = require('../../utils/logger');
const { createHttpClient } = require('./httpClientFactory');

class BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {string} config.pmsType         - Adapter identifier (OPERA_CLOUD, MEWS, etc.).
   * @param {string} config.baseUrl         - Root URL of the PMS API.
   * @param {Object} config.credentials     - Decrypted credentials object.
   * @param {string} config.propertyId      - AccuDefend property ID.
   * @param {string} [config.integrationId] - AccuDefend Integration row ID.
   * @param {Object} [config.httpOptions]   - Override options for httpClientFactory.
   */
  constructor(config) {
    if (new.target === BasePMSAdapter) {
      throw new Error('BasePMSAdapter is abstract and cannot be instantiated directly.');
    }

    this.pmsType = config.pmsType;
    this.baseUrl = config.baseUrl;
    this.credentials = config.credentials || {};
    this.propertyId = config.propertyId;
    this.integrationId = config.integrationId;

    // Subclasses override _buildHttpClient() to supply auth headers, etc.
    this.httpClient = null;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with the PMS and prepare the HTTP client.
   * Must be called before any API methods.
   * @returns {Promise<void>}
   */
  async authenticate() {
    throw new Error(`${this.pmsType}: authenticate() not implemented`);
  }

  /**
   * Refresh an expired or soon-to-expire authentication token.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    throw new Error(`${this.pmsType}: refreshAuth() not implemented`);
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by its PMS confirmation number.
   * @param {string} confirmationNumber
   * @returns {Promise<Object>} Normalized reservation object.
   */
  async getReservation(confirmationNumber) {
    throw new Error(`${this.pmsType}: getReservation() not implemented`);
  }

  /**
   * Search reservations by multiple criteria.
   * @param {Object} params
   * @param {string} [params.confirmationNumber]
   * @param {string} [params.guestName]
   * @param {string} [params.checkInDate]  - ISO date string.
   * @param {string} [params.checkOutDate] - ISO date string.
   * @param {string} [params.cardLastFour]
   * @param {string} [params.status]
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    throw new Error(`${this.pmsType}: searchReservations() not implemented`);
  }

  /**
   * Fetch the guest folio (itemized charges) for a reservation.
   * @param {string} reservationId - PMS reservation ID.
   * @returns {Promise<Object[]>} Array of normalized folio items:
   *   { category, description, amount, postDate, transactionCode, cardLastFour?, authCode? }
   */
  async getGuestFolio(reservationId) {
    throw new Error(`${this.pmsType}: getGuestFolio() not implemented`);
  }

  /**
   * Fetch a guest profile by guest/profile ID.
   * @param {string} guestId
   * @returns {Promise<Object>} Normalized guest profile.
   */
  async getGuestProfile(guestId) {
    throw new Error(`${this.pmsType}: getGuestProfile() not implemented`);
  }

  /**
   * Fetch rate plan information.
   * @param {Object} params - Filter parameters (dates, room types, etc.).
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params) {
    throw new Error(`${this.pmsType}: getRates() not implemented`);
  }

  /**
   * Fetch documents associated with a reservation (registration card, ID scan, etc.).
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of document descriptors:
   *   { type, fileName, mimeType, data (Buffer), description }
   */
  async getReservationDocuments(reservationId) {
    throw new Error(`${this.pmsType}: getReservationDocuments() not implemented`);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile or reservation in the PMS.
   * @param {string} guestId
   * @param {Object} note
   * @param {string} note.title
   * @param {string} note.content
   * @param {string} [note.priority]  - low | medium | high
   * @param {string} [note.category]  - e.g. "chargeback", "fraud_alert"
   * @returns {Promise<Object>} PMS-assigned note reference.
   */
  async pushNote(guestId, note) {
    throw new Error(`${this.pmsType}: pushNote() not implemented`);
  }

  /**
   * Push a guest flag / alert to the PMS.
   * @param {string} guestId
   * @param {Object} flagData
   * @param {string} flagData.reason
   * @param {string} flagData.severity   - low | medium | high | critical
   * @param {string} [flagData.chargebackId]
   * @param {number} [flagData.amount]
   * @returns {Promise<Object>} PMS-assigned flag reference.
   */
  async pushFlag(guestId, flagData) {
    throw new Error(`${this.pmsType}: pushFlag() not implemented`);
  }

  /**
   * Push a chargeback alert to a reservation.
   * @param {string} reservationId
   * @param {Object} alertData
   * @param {string} alertData.caseNumber
   * @param {number} alertData.amount
   * @param {string} alertData.reasonCode
   * @param {string} alertData.disputeDate
   * @param {string} alertData.status
   * @returns {Promise<Object>}
   */
  async pushChargebackAlert(reservationId, alertData) {
    throw new Error(`${this.pmsType}: pushChargebackAlert() not implemented`);
  }

  /**
   * Push a dispute outcome notification to the PMS.
   * @param {string} reservationId
   * @param {Object} outcomeData
   * @param {string} outcomeData.caseNumber
   * @param {string} outcomeData.outcome  - WON | LOST
   * @param {number} outcomeData.amount
   * @param {string} outcomeData.resolvedDate
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    throw new Error(`${this.pmsType}: pushDisputeOutcome() not implemented`);
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with the PMS.
   * @param {string} callbackUrl - Our endpoint URL.
   * @param {string[]} events    - Event types to subscribe to.
   * @returns {Promise<Object>}  - { webhookId, ... }
   */
  async registerWebhook(callbackUrl, events) {
    throw new Error(`${this.pmsType}: registerWebhook() not implemented`);
  }

  /**
   * Deregister / delete a previously registered webhook.
   * @param {string} webhookId
   * @returns {Promise<void>}
   */
  async deregisterWebhook(webhookId) {
    throw new Error(`${this.pmsType}: deregisterWebhook() not implemented`);
  }

  /**
   * Parse an incoming raw webhook payload into a normalized event.
   * @param {Object|string} rawPayload
   * @param {Object} headers - HTTP request headers.
   * @returns {Object} Normalized event: { eventType, timestamp, data }
   */
  parseWebhookPayload(rawPayload, headers) {
    throw new Error(`${this.pmsType}: parseWebhookPayload() not implemented`);
  }

  /**
   * Verify the HMAC / signature on an incoming webhook.
   * @param {string|Buffer} rawPayload
   * @param {string} signature
   * @param {string} secret
   * @returns {boolean}
   */
  verifyWebhookSignature(rawPayload, signature, secret) {
    throw new Error(`${this.pmsType}: verifyWebhookSignature() not implemented`);
  }

  // =========================================================================
  //  Normalization (PMS-specific -> canonical shapes)
  // =========================================================================

  /**
   * Normalize a raw PMS reservation response into the canonical shape.
   * @param {Object} pmsData
   * @returns {Object}
   */
  normalizeReservation(pmsData) {
    throw new Error(`${this.pmsType}: normalizeReservation() not implemented`);
  }

  /**
   * Normalize raw PMS folio items.
   * @param {Object} pmsData
   * @returns {Object[]}
   */
  normalizeFolioItems(pmsData) {
    throw new Error(`${this.pmsType}: normalizeFolioItems() not implemented`);
  }

  /**
   * Normalize a raw PMS guest profile.
   * @param {Object} pmsData
   * @returns {Object}
   */
  normalizeGuestProfile(pmsData) {
    throw new Error(`${this.pmsType}: normalizeGuestProfile() not implemented`);
  }

  /**
   * Normalize raw PMS rate data.
   * @param {Object} pmsData
   * @returns {Object[]}
   */
  normalizeRates(pmsData) {
    throw new Error(`${this.pmsType}: normalizeRates() not implemented`);
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify that the PMS API is reachable and credentials are valid.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    throw new Error(`${this.pmsType}: healthCheck() not implemented`);
  }

  // =========================================================================
  //  Shared Utilities
  // =========================================================================

  /**
   * Build the HTTP client. Subclasses should call this in authenticate()
   * after obtaining initial auth tokens. Provides circuit breaker, retry,
   * and rate limiting out of the box.
   *
   * @param {Object} extraHeaders - Additional default headers (e.g. Authorization).
   * @param {Object} [options]    - Override httpClientFactory options.
   * @returns {Object} The wrapped HTTP client from httpClientFactory.
   */
  _buildHttpClient(extraHeaders = {}, options = {}) {
    const self = this;

    this.httpClient = createHttpClient({
      baseURL: this.baseUrl,
      headers: extraHeaders,
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      name: this.pmsType,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 30000,
        ...(options.circuitBreaker || {}),
      },
      rateLimit: {
        maxTokens: 60,
        refillRate: 60,
        intervalMs: 60000,
        ...(options.rateLimit || {}),
      },
      onAuthFailure: async () => {
        // Delegate to the adapter's own refreshAuth(), which should update
        // this.credentials and return new headers.
        await self.refreshAuth();
        return self._getAuthHeaders();
      },
    });

    return this.httpClient;
  }

  /**
   * Return current auth headers. Subclasses override to provide
   * Authorization bearer tokens, API keys, etc.
   * Called by the HTTP client factory after a 401 + refreshAuth().
   *
   * @returns {Object} Headers object.
   */
  _getAuthHeaders() {
    return {};
  }

  /**
   * Log a successful PMS API call.
   * @param {string} method   - HTTP method.
   * @param {string} endpoint - URL or path.
   * @param {number} status   - HTTP status code.
   * @param {number} durationMs
   */
  _logApiCall(method, endpoint, status, durationMs) {
    logger.info(`[PMS:${this.pmsType}] ${method} ${endpoint} -> ${status} (${durationMs}ms)`);
  }

  /**
   * Log a failed PMS API call.
   * @param {string} method
   * @param {string} endpoint
   * @param {Error}  error
   */
  _logApiError(method, endpoint, error) {
    logger.error(`[PMS:${this.pmsType}] ${method} ${endpoint} FAILED:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }

  /**
   * Ensure the adapter is authenticated before making API calls.
   * @throws {Error} If httpClient is not initialized.
   */
  _ensureAuthenticated() {
    if (!this.httpClient) {
      throw new Error(
        `${this.pmsType}: Not authenticated. Call authenticate() before making API calls.`
      );
    }
  }

  /**
   * Convenience: measure the duration of an async operation.
   * @param {Function} fn - Async function to time.
   * @returns {Promise<{ result: *, durationMs: number }>}
   */
  async _timed(fn) {
    const start = Date.now();
    const result = await fn();
    return { result, durationMs: Date.now() - start };
  }
}

module.exports = BasePMSAdapter;
