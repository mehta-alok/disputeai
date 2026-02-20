/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * HTTP Client Factory
 *
 * Creates resilient axios HTTP clients with:
 *  - Circuit breaker pattern (opens after N consecutive failures)
 *  - Exponential backoff retry (on 429 / 5xx)
 *  - Token-bucket rate limiting
 *  - Request / response logging
 *  - Automatic 401 token refresh callback
 */

'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/**
 * Simple state-machine circuit breaker.
 *
 * States:
 *  CLOSED    - requests pass through normally
 *  OPEN      - requests are rejected immediately
 *  HALF_OPEN - one probe request is allowed to test recovery
 */
class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} [options.failureThreshold=5]  - Failures before opening.
   * @param {number} [options.resetTimeout=30000]  - Millis before HALF_OPEN.
   * @param {string} [options.name='default']      - Label for logging.
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.name = options.name || 'default';
  }

  /**
   * Wrap an async function with circuit breaker logic.
   * @param {Function} fn - Async function to execute.
   * @returns {Promise<*>}
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
      } else {
        const err = new Error(
          `Circuit breaker is OPEN for ${this.name}. Try again in ` +
          `${Math.ceil((this.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000)}s.`
        );
        err.code = 'CIRCUIT_OPEN';
        throw err;
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  /** @private */
  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info(`[CircuitBreaker:${this.name}] Circuit CLOSED (recovered)`);
    }
  }

  /** @private */
  _onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold && this.state !== 'OPEN') {
      this.state = 'OPEN';
      logger.warn(
        `[CircuitBreaker:${this.name}] Circuit OPEN after ${this.failureCount} consecutive failures. ` +
        `Last error: ${error.message}`
      );
    }
  }

  /**
   * Get current breaker state plus counters.
   * @returns {{ state: string, failureCount: number, successCount: number }}
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }

  /**
   * Manually reset the breaker to CLOSED.
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    logger.info(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
  }
}

// ---------------------------------------------------------------------------
// Rate Limiter (Token Bucket)
// ---------------------------------------------------------------------------

/**
 * Token-bucket rate limiter.
 * Tokens refill steadily over time. Each request consumes one token.
 * If no tokens remain, the caller must wait.
 */
class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} [options.maxTokens=60]   - Bucket size (burst capacity).
   * @param {number} [options.refillRate=60]   - Tokens added per interval.
   * @param {number} [options.intervalMs=60000] - Refill interval in ms (default 60 s).
   * @param {string} [options.name='default']
   */
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 60;
    this.refillRate = options.refillRate || options.maxTokens || 60;
    this.intervalMs = options.intervalMs || 60000;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.name = options.name || 'default';
    this.waitQueue = [];
  }

  /**
   * Refill tokens based on elapsed time since last refill.
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor((elapsed / this.intervalMs) * this.refillRate);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Acquire a token. Resolves immediately if available, otherwise waits.
   * @returns {Promise<void>}
   */
  async acquire() {
    this._refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Calculate wait time until next token is available
    const tokensNeeded = 1 - this.tokens; // always 1 since tokens is 0
    const waitMs = Math.ceil((tokensNeeded / this.refillRate) * this.intervalMs);

    logger.debug(
      `[RateLimiter:${this.name}] Rate limited. Waiting ${waitMs}ms for token.`
    );

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._refill();
        this.tokens = Math.max(0, this.tokens - 1);
        resolve();
      }, waitMs);

      // Store reference for cleanup
      this.waitQueue.push(timer);
    });
  }

  /**
   * Get current state.
   * @returns {{ tokens: number, maxTokens: number }}
   */
  getState() {
    this._refill();
    return { tokens: this.tokens, maxTokens: this.maxTokens };
  }

  /**
   * Clean up pending timers.
   */
  destroy() {
    this.waitQueue.forEach(t => clearTimeout(t));
    this.waitQueue = [];
  }
}

// ---------------------------------------------------------------------------
// HTTP Client Factory
// ---------------------------------------------------------------------------

/** HTTP status codes that are safe to retry */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Sleep helper with optional jitter.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  const jitter = Math.random() * ms * 0.1; // up to 10 % jitter
  return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

/**
 * Create a resilient HTTP client (axios instance) with retry, circuit breaker,
 * and rate limiting built in.
 *
 * @param {Object} config
 * @param {string}   config.baseURL           - Base URL for the PMS API.
 * @param {Object}   [config.headers={}]      - Default headers.
 * @param {number}   [config.timeout=30000]   - Request timeout in ms.
 * @param {number}   [config.maxRetries=3]    - Maximum retry attempts.
 * @param {number}   [config.retryDelay=1000] - Base retry delay in ms (doubled each attempt).
 * @param {Object}   [config.circuitBreaker]  - CircuitBreaker options ({ failureThreshold, resetTimeout }).
 * @param {Object}   [config.rateLimit]       - RateLimiter options ({ maxTokens, refillRate, intervalMs }).
 * @param {Function} [config.onAuthFailure]   - Async callback invoked on 401. Should refresh tokens
 *                                              and return new headers, or throw to abort.
 * @param {string}   [config.name='http']     - Label for logging.
 * @returns {{ client: import('axios').AxiosInstance, circuitBreaker: CircuitBreaker, rateLimiter: RateLimiter, destroy: Function }}
 */
function createHttpClient(config = {}) {
  const {
    baseURL,
    headers = {},
    timeout = 30000,
    maxRetries = 3,
    retryDelay = 1000,
    circuitBreaker: cbOpts = {},
    rateLimit: rlOpts = {},
    onAuthFailure,
    name = 'http',
  } = config;

  // Create sub-components
  const breaker = new CircuitBreaker({ ...cbOpts, name: `${name}-cb` });
  const limiter = new RateLimiter({ ...rlOpts, name: `${name}-rl` });

  // Create the base axios instance
  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    timeout,
  });

  // ---- Request interceptor: logging ----
  client.interceptors.request.use(
    (reqConfig) => {
      reqConfig._startTime = Date.now();
      reqConfig._retryCount = reqConfig._retryCount || 0;
      logger.debug(
        `[HTTP:${name}] ${reqConfig.method?.toUpperCase()} ${reqConfig.baseURL || ''}${reqConfig.url}` +
        (reqConfig._retryCount > 0 ? ` (retry ${reqConfig._retryCount})` : '')
      );
      return reqConfig;
    },
    (error) => {
      logger.error(`[HTTP:${name}] Request setup error: ${error.message}`);
      return Promise.reject(error);
    }
  );

  // ---- Response interceptor: logging ----
  client.interceptors.response.use(
    (response) => {
      const duration = Date.now() - (response.config._startTime || Date.now());
      logger.debug(
        `[HTTP:${name}] ${response.config.method?.toUpperCase()} ` +
        `${response.config.url} -> ${response.status} (${duration}ms)`
      );
      return response;
    },
    (error) => {
      const cfg = error.config || {};
      const duration = Date.now() - (cfg._startTime || Date.now());
      const status = error.response?.status || 'NETWORK';
      logger.warn(
        `[HTTP:${name}] ${cfg.method?.toUpperCase() || '?'} ${cfg.url || '?'} -> ${status} (${duration}ms): ${error.message}`
      );
      return Promise.reject(error);
    }
  );

  /**
   * Internal: perform a single request through rate limiter + circuit breaker,
   * with retry logic wrapped around the outside.
   *
   * @param {Object} requestConfig - Axios request config.
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async function executeWithResilience(requestConfig) {
    let lastError;
    let authRetried = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Rate limit
      await limiter.acquire();

      try {
        // Circuit breaker wraps the actual network call
        const response = await breaker.execute(() => client.request({
          ...requestConfig,
          _retryCount: attempt,
        }));
        return response;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;

        // 401 Unauthorized: attempt token refresh once
        if (status === 401 && !authRetried && typeof onAuthFailure === 'function') {
          authRetried = true;
          try {
            logger.info(`[HTTP:${name}] 401 received, attempting token refresh...`);
            const newHeaders = await onAuthFailure(error);
            if (newHeaders && typeof newHeaders === 'object') {
              // Merge new auth headers into the request
              requestConfig.headers = {
                ...(requestConfig.headers || {}),
                ...newHeaders,
              };
              // Also update default headers on the client for future requests
              Object.assign(client.defaults.headers.common, newHeaders);
            }
            // Retry immediately (don't count as a retry attempt)
            attempt--;
            continue;
          } catch (refreshError) {
            logger.error(`[HTTP:${name}] Token refresh failed: ${refreshError.message}`);
            throw error; // Throw original 401
          }
        }

        // Circuit breaker open -- don't retry
        if (error.code === 'CIRCUIT_OPEN') {
          throw error;
        }

        // Determine if we should retry
        const isRetryable = (
          RETRYABLE_STATUS_CODES.has(status) ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ENOTFOUND'
        );

        if (!isRetryable || attempt >= maxRetries) {
          throw error;
        }

        // Respect Retry-After header from 429 responses
        let delay;
        const retryAfter = error.response?.headers?.['retry-after'];
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          delay = isNaN(parsed) ? retryDelay * Math.pow(2, attempt) : parsed * 1000;
        } else {
          delay = retryDelay * Math.pow(2, attempt); // 1s, 2s, 4s
        }

        logger.info(
          `[HTTP:${name}] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}, status=${status || 'network'})`
        );
        await sleep(delay);
      }
    }

    throw lastError;
  }

  // Return a wrapper that exposes the same interface as axios plus extras
  return {
    /**
     * The raw axios instance (use for direct calls without retry/breaker).
     */
    client,

    /**
     * Make a resilient request (rate limited + circuit breaker + retry).
     * Same signature as axios.request(config).
     *
     * @param {Object} requestConfig - Axios request config.
     * @returns {Promise<import('axios').AxiosResponse>}
     */
    request: executeWithResilience,

    /** Convenience: GET with resilience. */
    get: (url, config = {}) => executeWithResilience({ ...config, method: 'GET', url }),

    /** Convenience: POST with resilience. */
    post: (url, data, config = {}) => executeWithResilience({ ...config, method: 'POST', url, data }),

    /** Convenience: PUT with resilience. */
    put: (url, data, config = {}) => executeWithResilience({ ...config, method: 'PUT', url, data }),

    /** Convenience: PATCH with resilience. */
    patch: (url, data, config = {}) => executeWithResilience({ ...config, method: 'PATCH', url, data }),

    /** Convenience: DELETE with resilience. */
    delete: (url, config = {}) => executeWithResilience({ ...config, method: 'DELETE', url }),

    /** Update default headers (e.g. after token refresh). */
    setHeader: (key, value) => {
      client.defaults.headers.common[key] = value;
    },

    /** Remove a default header. */
    removeHeader: (key) => {
      delete client.defaults.headers.common[key];
    },

    /** The circuit breaker instance. */
    circuitBreaker: breaker,

    /** The rate limiter instance. */
    rateLimiter: limiter,

    /** Clean up timers. */
    destroy: () => {
      limiter.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createHttpClient, CircuitBreaker, RateLimiter };
