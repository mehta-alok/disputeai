/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Escapia (HomeAway/Vrbo) PMS Adapter
 *
 * Integrates with the Escapia REST API (v1).
 *
 * Authentication: API Key + Account ID sent via headers.
 *   - X-API-Key:    required
 *   - X-Account-Id: required
 *
 * Escapia is a vacation rental property management system originally
 * developed by HomeAway (now Vrbo/Expedia Group). It is widely used by
 * professional vacation rental managers. It provides:
 *   - Reservation management with Vrbo/Expedia distribution
 *   - Trust accounting and financial management
 *   - Owner statements and reporting
 *   - Guest management and communication
 *   - Rate and availability management
 *   - Housekeeping and maintenance scheduling
 *   - Webhook event notifications
 *
 * API style: Standard REST (GET for reads, POST for creates, PUT for updates).
 *
 * Reference: https://developer.escapia.com/api/v1/
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

const DEFAULT_BASE_URL = 'https://api.escapia.com/api/v1';

class EscapiaAdapter extends BasePMSAdapter {
  /**
   * @param {Object} config
   * @param {Object} config.credentials
   * @param {string} config.credentials.apiKey       - Escapia API key.
   * @param {string} config.credentials.accountId    - Escapia account / company ID.
   * @param {string} [config.credentials.baseUrl]    - Override API base URL.
   */
  constructor(config) {
    super({
      ...config,
      pmsType: config.pmsType || 'ESCAPIA',
      baseUrl: config.credentials?.baseUrl || config.baseUrl || DEFAULT_BASE_URL,
    });
    this.apiKey = this.credentials.apiKey;
    this.escAccountId = this.credentials.accountId || this.propertyId;
  }

  // =========================================================================
  //  Authentication
  // =========================================================================

  /**
   * Authenticate with Escapia by validating the API key against the
   * account endpoint.
   * @returns {Promise<void>}
   */
  async authenticate() {
    this._buildAuthenticatedClient();

    try {
      const response = await this.httpClient.get('/account/info');

      const data = response.data;
      if (data?.account || data?.company || response.status === 200) {
        logger.info(
          `[PMS:${this.pmsType}] Authenticated. Account: ${this.escAccountId}`
        );
      }
    } catch (error) {
      this._logApiError('GET', '/account/info', error);
      throw new Error(`Escapia authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh authentication. API keys are static so no refresh is needed.
   * @returns {Promise<void>}
   */
  async refreshAuth() {
    logger.info(`[PMS:${this.pmsType}] Token refresh not applicable (static API key).`);
  }

  /** @private */
  _buildAuthenticatedClient() {
    this._buildHttpClient(this._getAuthHeaders(), {
      rateLimit: { maxTokens: 80, refillRate: 80, intervalMs: 60000 },
    });
  }

  /** @override */
  _getAuthHeaders() {
    return {
      'X-API-Key': this.apiKey,
      'X-Account-Id': this.escAccountId,
    };
  }

  // =========================================================================
  //  Inbound: Receive FROM PMS
  // =========================================================================

  /**
   * Fetch a single reservation by confirmation number.
   * @param {string} confirmationNumber
   * @returns {Promise<Object|null>} Normalized reservation object.
   */
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

  /**
   * Search reservations by multiple criteria.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized reservations.
   */
  async searchReservations(params) {
    this._ensureAuthenticated();

    const queryParams = {};
    if (params.confirmationNumber) queryParams.confirmation_code = params.confirmationNumber;
    if (params.guestName) queryParams.guest_last_name = params.guestName;
    if (params.checkInDate) queryParams.check_in_from = params.checkInDate;
    if (params.checkOutDate) queryParams.check_out_to = params.checkOutDate;
    if (params.cardLastFour) queryParams.card_last_four = params.cardLastFour;
    if (params.status) queryParams.status = this._mapStatusToEscapia(params.status);
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

  /**
   * Fetch the guest folio (financial data) for a reservation.
   * @param {string} reservationId
   * @returns {Promise<Object[]>} Array of normalized folio items.
   */
  async getGuestFolio(reservationId) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get(
        `/reservations/${encodeURIComponent(reservationId)}/ledger`
      );
      return response.data;
    });

    this._logApiCall('GET', `/reservations/${reservationId}/ledger`, 200, durationMs);

    return this.normalizeFolioItems(result);
  }

  /**
   * Fetch a guest profile by guest ID.
   * @param {string} guestId
   * @returns {Promise<Object|null>} Normalized guest profile.
   */
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

  /**
   * Fetch rate/pricing information for units.
   * @param {Object} params
   * @returns {Promise<Object[]>} Array of normalized rate objects.
   */
  async getRates(params = {}) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.get('/units/rates', {
        params: { ...params },
      });
      return response.data;
    });

    this._logApiCall('GET', '/units/rates', 200, durationMs);

    return this.normalizeRates(result);
  }

  // =========================================================================
  //  Outbound: Send TO PMS
  // =========================================================================

  /**
   * Push a textual note to a guest profile.
   * @param {string} guestId
   * @param {Object} note
   * @returns {Promise<Object>}
   */
  async pushNote(guestId, note) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/notes`,
        {
          subject: note.title,
          body: note.content,
          priority: note.priority || 'medium',
          note_type: note.category || 'chargeback',
          source: 'AccuDefend',
          is_internal: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/notes`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a guest flag / alert.
   * @param {string} guestId
   * @param {Object} flagData
   * @returns {Promise<Object>}
   */
  async pushFlag(guestId, flagData) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/guests/${encodeURIComponent(guestId)}/flags`,
        {
          reason: flagData.reason,
          severity: flagData.severity || 'high',
          flag_type: 'chargeback_risk',
          source: 'AccuDefend',
          chargeback_id: flagData.chargebackId || null,
          amount: flagData.amount || null,
          is_active: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/guests/${guestId}/flags`, 201, durationMs);

    return {
      success: true,
      flagId: result?.flag?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      severity: flagData.severity,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a chargeback alert to a reservation.
   * @param {string} reservationId
   * @param {Object} alertData
   * @returns {Promise<Object>}
   */
  async pushChargebackAlert(reservationId, alertData) {
    this._ensureAuthenticated();

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Chargeback Alert - Case ${alertData.caseNumber}`,
          body: [
            '=== CHARGEBACK ALERT ===',
            `Case #: ${alertData.caseNumber}`,
            `Amount: $${alertData.amount}`,
            `Reason Code: ${alertData.reasonCode}`,
            `Dispute Date: ${alertData.disputeDate}`,
            `Status: ${alertData.status}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: 'high',
          note_type: 'chargeback_alert',
          source: 'AccuDefend',
          is_internal: true,
          notify_owner: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (chargeback)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      caseNumber: alertData.caseNumber,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Push a dispute outcome notification.
   * @param {string} reservationId
   * @param {Object} outcomeData
   * @returns {Promise<Object>}
   */
  async pushDisputeOutcome(reservationId, outcomeData) {
    this._ensureAuthenticated();

    const won = outcomeData.outcome === 'WON';

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post(
        `/reservations/${encodeURIComponent(reservationId)}/notes`,
        {
          subject: `Dispute ${outcomeData.outcome} - Case ${outcomeData.caseNumber}`,
          body: [
            `=== DISPUTE ${outcomeData.outcome} ===`,
            `Case #: ${outcomeData.caseNumber}`,
            `Outcome: ${outcomeData.outcome}`,
            `Amount: $${outcomeData.amount} ${won ? '(recovered)' : '(lost)'}`,
            `Resolved: ${outcomeData.resolvedDate}`,
            '--- Generated by AccuDefend Chargeback Defense System ---',
          ].join('\n'),
          priority: won ? 'medium' : 'high',
          note_type: 'dispute_outcome',
          source: 'AccuDefend',
          is_internal: true,
          notify_owner: true,
        }
      );
      return response.data;
    });

    this._logApiCall('POST', `/reservations/${reservationId}/notes (dispute)`, 201, durationMs);

    return {
      success: true,
      noteId: result?.note?.id || result?.id || result?.data?.id,
      pmsType: this.pmsType,
      outcome: outcomeData.outcome,
      createdAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  //  Webhook Management
  // =========================================================================

  /**
   * Register a webhook callback URL with Escapia.
   * @param {Object} config
   * @param {string} config.callbackUrl
   * @param {string[]} config.events
   * @returns {Promise<Object>}
   */
  async registerWebhook(config) {
    this._ensureAuthenticated();

    const secret = crypto.randomBytes(32).toString('hex');

    const { result, durationMs } = await this._timed(async () => {
      const response = await this.httpClient.post('/webhooks', {
        callback_url: config.callbackUrl,
        event_types: (config.events || []).map(e => this._mapEventToEscapia(e)),
        signing_secret: secret,
        active: true,
        description: 'AccuDefend Chargeback Defense Integration',
      });
      return response.data;
    });

    this._logApiCall('POST', '/webhooks', 201, durationMs);

    return {
      webhookId: result?.webhook?.id || result?.id || result?.data?.id,
      callbackUrl: config.callbackUrl,
      events: config.events,
      secret,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Parse an incoming raw webhook payload.
   * @param {Object} headers
   * @param {Object|string} body
   * @returns {Object} Normalized event.
   */
  parseWebhookPayload(headers, body) {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;

    const eventType = payload.event_type || payload.event || payload.type;
    const data = payload.data || payload.reservation || payload.unit || {};

    return {
      eventType: this._mapEscapiaEventToCanonical(eventType),
      timestamp: payload.timestamp || payload.occurred_at || new Date().toISOString(),
      data: {
        reservationId: data.reservation_id || data.id || data.confirmation_code,
        guestId: data.guest_id || data.guest?.id,
        unitId: data.unit_id || data.unit?.id,
        accountId: data.account_id || this.escAccountId,
        ownerId: data.owner_id || '',
        ...data,
      },
      raw: payload,
    };
  }

  // =========================================================================
  //  Health Check
  // =========================================================================

  /**
   * Verify API reachability and credential validity.
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: Object }>}
   */
  async healthCheck() {
    const startMs = Date.now();

    try {
      this._ensureAuthenticated();

      const response = await this.httpClient.get('/account/info');

      return {
        healthy: true,
        latencyMs: Date.now() - startMs,
        details: {
          pmsType: this.pmsType,
          accountId: this.escAccountId,
          apiVersion: 'v1',
          companyName: response.data?.account?.company_name || response.data?.company?.name || '',
          features: {
            realTimeSync: true,
            trustAccounting: true,
            ownerStatements: true,
            guestFlags: true,
            ledgerAccess: true,
            housekeeping: true,
            vrboDistribution: true,
            webhooks: true,
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
          accountId: this.escAccountId,
          error: error.message,
          circuitBreaker: this.httpClient?.circuitBreaker?.getState(),
        },
      };
    }
  }

  // =========================================================================
  //  Normalization
  // =========================================================================

  /** @override */
  normalizeReservation(pmsData) {
    if (!pmsData) return null;

    const guest = pmsData.guest || pmsData.primary_guest || {};

    return {
      confirmationNumber: String(
        pmsData.confirmation_code || pmsData.booking_id || pmsData.id || ''
      ),
      pmsReservationId: String(pmsData.id || pmsData.reservation_id || ''),
      status: normalizeReservationStatus(pmsData.status || pmsData.reservation_status),
      guestProfileId: String(guest.id || guest.guest_id || pmsData.guest_id || ''),
      guestName: normalizeGuestName({
        firstName: guest.first_name || guest.given_name || '',
        lastName: guest.last_name || guest.family_name || '',
      }),
      email: guest.email || pmsData.guest_email || '',
      phone: normalizePhone(guest.phone || guest.home_phone || guest.cell_phone),
      address: normalizeAddress({
        line1: guest.address_1 || guest.street || '',
        line2: guest.address_2 || '',
        city: guest.city || '',
        state: guest.state || guest.province || '',
        postalCode: guest.zip || guest.postal_code || '',
        country: guest.country || guest.country_code || '',
      }),
      checkInDate: normalizeDate(pmsData.check_in_date || pmsData.arrival_date),
      checkOutDate: normalizeDate(pmsData.check_out_date || pmsData.departure_date),
      roomNumber: pmsData.unit_name || pmsData.unit_code || '',
      roomType: pmsData.unit_type || pmsData.property_type || '',
      rateCode: pmsData.rate_id || pmsData.rate_plan_id || '',
      ratePlanDescription: pmsData.rate_name || pmsData.rate_plan_name || '',
      totalAmount: normalizeAmount(pmsData.total || pmsData.total_amount || pmsData.grand_total),
      currency: normalizeCurrency(pmsData.currency || 'USD'),
      numberOfGuests: pmsData.guest_count || (pmsData.adults || 0) + (pmsData.children || 0) || 1,
      numberOfNights: pmsData.nights || this._calculateNights(
        pmsData.check_in_date || pmsData.arrival_date,
        pmsData.check_out_date || pmsData.departure_date
      ),
      paymentMethod: {
        cardBrand: normalizeCardBrand(pmsData.card_type || pmsData.payment_method || ''),
        cardLastFour: pmsData.card_last_four || pmsData.card_last4 || '',
        authCode: pmsData.auth_code || pmsData.authorization_code || '',
      },
      bookingSource: pmsData.source || pmsData.channel || pmsData.booking_channel || '',
      createdAt: normalizeDate(pmsData.created_at || pmsData.booked_date),
      updatedAt: normalizeDate(pmsData.updated_at || pmsData.modified_date),
      specialRequests: pmsData.special_requests || pmsData.guest_notes || pmsData.comments || '',
      loyaltyNumber: '',
      // Escapia-specific
      unitId: pmsData.unit_id || '',
      unitName: pmsData.unit_name || pmsData.unit_code || '',
      ownerId: pmsData.owner_id || '',
      ownerName: pmsData.owner_name || '',
      rentalAgreementSigned: pmsData.agreement_signed === true || pmsData.rental_agreement_signed === true,
      travelInsurance: pmsData.travel_insurance === true || pmsData.has_insurance === true,
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeFolioItems(pmsData) {
    const ledger = pmsData?.ledger || pmsData?.data || pmsData;
    const items = ledger?.entries || ledger?.items || ledger?.transactions || [];

    if (Array.isArray(ledger) && !items.length) {
      return ledger.map(item => this._normalizeSingleFolioItem(item));
    }

    return (Array.isArray(items) ? items : []).map(item => this._normalizeSingleFolioItem(item));
  }

  /** @private */
  _normalizeSingleFolioItem(item) {
    return {
      folioId: item.ledger_id || item.folio_id || item.invoice_id || '',
      transactionId: String(item.id || item.entry_id || item.transaction_id || ''),
      transactionCode: item.charge_code || item.ledger_code || item.type || '',
      category: normalizeFolioCategory(
        item.category || item.charge_type || item.ledger_type || item.description
      ),
      description: item.description || item.charge_name || item.memo || '',
      amount: normalizeAmount(item.amount || item.charge_amount),
      currency: normalizeCurrency(item.currency),
      postDate: normalizeDate(item.posted_date || item.entry_date || item.date),
      cardLastFour: item.card_last_four || item.card_last4 || '',
      authCode: item.auth_code || '',
      reference: item.reference || item.check_number || item.receipt || '',
      reversalFlag: item.voided === true || item.reversed === true || item.is_refund === true,
      quantity: item.quantity || 1,
      postedBy: item.posted_by || item.entered_by || item.user || '',
      department: item.department || item.gl_account || '',
      // Escapia-specific: trust accounting fields
      ownerPortion: normalizeAmount(item.owner_portion || item.owner_amount || 0),
      managerPortion: normalizeAmount(item.manager_portion || item.manager_amount || 0),
    };
  }

  /** @override */
  normalizeGuestProfile(pmsData) {
    if (!pmsData) return null;

    return {
      guestId: String(pmsData.id || pmsData.guest_id || ''),
      name: normalizeGuestName({
        firstName: pmsData.first_name || pmsData.given_name || '',
        lastName: pmsData.last_name || pmsData.family_name || '',
      }),
      email: pmsData.email || pmsData.primary_email || '',
      phone: normalizePhone(pmsData.phone || pmsData.home_phone || pmsData.cell_phone),
      address: normalizeAddress({
        line1: pmsData.address_1 || pmsData.street || '',
        line2: pmsData.address_2 || '',
        city: pmsData.city || '',
        state: pmsData.state || pmsData.province || '',
        postalCode: pmsData.zip || pmsData.postal_code || '',
        country: pmsData.country || pmsData.country_code || '',
      }),
      vipCode: pmsData.guest_type || pmsData.vip_status || '',
      loyaltyNumber: '',
      loyaltyLevel: '',
      nationality: pmsData.nationality || pmsData.country || '',
      language: pmsData.language || pmsData.preferred_language || '',
      dateOfBirth: normalizeDate(pmsData.date_of_birth || pmsData.dob),
      companyName: pmsData.company || pmsData.organization || '',
      totalStays: pmsData.reservation_count || pmsData.total_stays || 0,
      totalRevenue: normalizeAmount(pmsData.lifetime_revenue || pmsData.total_spend || 0),
      lastStayDate: normalizeDate(pmsData.last_departure || pmsData.last_checkout),
      createdAt: normalizeDate(pmsData.created_at),
      pmsRaw: sanitizePII(pmsData),
    };
  }

  /** @override */
  normalizeRates(pmsData) {
    const rates = pmsData?.rates || pmsData?.data || pmsData;
    if (!Array.isArray(rates)) return [];

    return rates.map(rate => ({
      rateCode: String(rate.id || rate.rate_id || rate.rate_plan_id || ''),
      name: rate.name || rate.rate_name || rate.unit_name || '',
      description: rate.description || rate.details || '',
      category: rate.category || rate.rate_type || rate.unit_type || 'vacation_rental',
      baseAmount: normalizeAmount(rate.base_rate || rate.nightly_rate || rate.amount || 0),
      currency: normalizeCurrency(rate.currency),
      startDate: normalizeDate(rate.start_date || rate.effective_from),
      endDate: normalizeDate(rate.end_date || rate.effective_to),
      isActive: rate.active !== false && rate.status !== 'inactive',
      roomTypes: [rate.unit_type || rate.property_type || ''],
      inclusions: rate.inclusions || [],
      cancellationPolicy: rate.cancellation_policy || rate.cancel_terms || '',
      minNights: rate.min_nights || rate.minimum_stay || 0,
      maxNights: rate.max_nights || rate.maximum_stay || 0,
      commissionable: rate.commissionable === true,
      // Escapia-specific
      ownerSplit: rate.owner_split_pct || rate.owner_percentage || null,
      managerSplit: rate.manager_split_pct || rate.manager_percentage || null,
    }));
  }

  // =========================================================================
  //  Private Helpers
  // =========================================================================

  /** @private */
  _calculateNights(arrival, departure) {
    const s = normalizeDate(arrival);
    const e = normalizeDate(departure);
    if (!s || !e) return 0;
    const diff = new Date(e) - new Date(s);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  /** @private */
  _mapStatusToEscapia(status) {
    const map = {
      confirmed: 'confirmed',
      checked_in: 'arrived',
      checked_out: 'departed',
      cancelled: 'cancelled',
      no_show: 'no_show',
      pending: 'tentative',
    };
    return map[status] || status;
  }

  /** @private */
  _mapEventToEscapia(event) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.updated': 'reservation.modified',
      'reservation.cancelled': 'reservation.cancelled',
      'guest.checked_in': 'reservation.arrived',
      'guest.checked_out': 'reservation.departed',
      'payment.received': 'payment.received',
      'folio.updated': 'ledger.updated',
    };
    return map[event] || event;
  }

  /** @private */
  _mapEscapiaEventToCanonical(escEvent) {
    const map = {
      'reservation.created': 'reservation.created',
      'reservation.modified': 'reservation.updated',
      'reservation.cancelled': 'reservation.cancelled',
      'reservation.arrived': 'guest.checked_in',
      'reservation.departed': 'guest.checked_out',
      'payment.received': 'payment.received',
      'ledger.updated': 'folio.updated',
      'guest.created': 'guest.created',
      'guest.updated': 'guest.updated',
      'owner.statement': 'owner.statement',
    };
    return map[escEvent] || escEvent;
  }
}

module.exports = EscapiaAdapter;
