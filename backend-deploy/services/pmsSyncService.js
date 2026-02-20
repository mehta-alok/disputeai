/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Two-Way PMS Sync Service
 * Bi-directional synchronization with Property Management Systems
 * Supports real-time webhooks, scheduled polling, and event-driven updates
 */

const crypto = require('crypto');
const EventEmitter = require('events');

// Sync direction types
const SYNC_DIRECTION = {
  PMS_TO_ACCUDEFEND: 'pms_to_accudefend',
  ACCUDEFEND_TO_PMS: 'accudefend_to_pms',
  BIDIRECTIONAL: 'bidirectional'
};

// Sync event types
const SYNC_EVENTS = {
  // Inbound from PMS
  RESERVATION_CREATED: 'reservation.created',
  RESERVATION_UPDATED: 'reservation.updated',
  RESERVATION_CANCELLED: 'reservation.cancelled',
  GUEST_CHECKED_IN: 'guest.checked_in',
  GUEST_CHECKED_OUT: 'guest.checked_out',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_REFUNDED: 'payment.refunded',
  FOLIO_UPDATED: 'folio.updated',
  DOCUMENT_UPLOADED: 'document.uploaded',

  // Outbound to PMS
  CHARGEBACK_RECEIVED: 'chargeback.received',
  EVIDENCE_REQUESTED: 'evidence.requested',
  CASE_RESOLVED: 'case.resolved',
  DISPUTE_WON: 'dispute.won',
  DISPUTE_LOST: 'dispute.lost',
  GUEST_FLAGGED: 'guest.flagged'
};

// PMS-specific adapters for two-way sync
const PMS_ADAPTERS = {
  AUTOCLERK: {
    name: 'AutoClerk',
    webhookPath: '/webhooks/autoclerk',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      documents: { read: true, write: true },
      notes: { read: true, write: true },
      flags: { read: true, write: true }
    },
    endpoints: {
      reservations: '/api/v2/reservations',
      guests: '/api/v2/guests',
      folios: '/api/v2/folios',
      payments: '/api/v2/payments',
      documents: '/api/v2/documents',
      notes: '/api/v2/notes',
      webhooks: '/api/v2/webhooks'
    }
  },
  OPERA_CLOUD: {
    name: 'Oracle Opera Cloud',
    webhookPath: '/webhooks/opera',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      documents: { read: true, write: true },
      notes: { read: true, write: true },
      flags: { read: true, write: true }
    },
    endpoints: {
      reservations: '/rsv/v1/hotels/{hotelId}/reservations',
      guests: '/crm/v1/hotels/{hotelId}/profiles',
      folios: '/csh/v1/hotels/{hotelId}/folios',
      payments: '/csh/v1/hotels/{hotelId}/payments',
      documents: '/dms/v1/hotels/{hotelId}/documents',
      webhooks: '/int/v1/webhooks'
    }
  },
  MEWS: {
    name: 'Mews Systems',
    webhookPath: '/webhooks/mews',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      documents: { read: true, write: true },
      notes: { read: true, write: true }
    },
    endpoints: {
      reservations: '/api/connector/v1/reservations/getAll',
      guests: '/api/connector/v1/customers/getAll',
      folios: '/api/connector/v1/bills/getAll',
      payments: '/api/connector/v1/payments/getAll',
      webhooks: '/api/connector/v1/webhooks'
    }
  },
  CLOUDBEDS: {
    name: 'Cloudbeds',
    webhookPath: '/webhooks/cloudbeds',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      notes: { read: true, write: true }
    },
    endpoints: {
      reservations: '/api/v1.1/getReservations',
      guests: '/api/v1.1/getGuests',
      folios: '/api/v1.1/getTransactions',
      payments: '/api/v1.1/getPayments',
      webhooks: '/api/v1.1/postWebhook'
    }
  },
  PROTEL: {
    name: 'protel PMS',
    webhookPath: '/webhooks/protel',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      notes: { read: true, write: true }
    }
  },
  STAYNTOUCH: {
    name: 'StayNTouch',
    webhookPath: '/webhooks/stayntouch',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      documents: { read: true, write: true },
      notes: { read: true, write: true }
    }
  },
  APALEO: {
    name: 'Apaleo',
    webhookPath: '/webhooks/apaleo',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false },
      notes: { read: true, write: true }
    }
  },
  INNROAD: {
    name: 'innRoad',
    webhookPath: '/webhooks/innroad',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false }
    }
  },
  WEBREZPRO: {
    name: 'WebRezPro',
    webhookPath: '/webhooks/webrezpro',
    supportsWebhooks: true,
    supportsPush: false,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: false },
      folios: { read: true, write: false },
      payments: { read: true, write: false }
    }
  },
  ROOMMASTER: {
    name: 'RoomMaster',
    webhookPath: '/webhooks/roommaster',
    supportsWebhooks: false,
    supportsPush: false,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: false },
      folios: { read: true, write: false },
      payments: { read: true, write: false }
    }
  },
  LITTLE_HOTELIER: {
    name: 'Little Hotelier',
    webhookPath: '/webhooks/littlehotelier',
    supportsWebhooks: true,
    supportsPush: false,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: false },
      folios: { read: true, write: false },
      payments: { read: true, write: false }
    }
  },
  ROOMKEY: {
    name: 'RoomKeyPMS',
    webhookPath: '/webhooks/roomkey',
    supportsWebhooks: true,
    supportsPush: true,
    syncCapabilities: {
      reservations: { read: true, write: false },
      guests: { read: true, write: true },
      folios: { read: true, write: false },
      payments: { read: true, write: false }
    }
  }
};

class PMSSyncService extends EventEmitter {
  constructor() {
    super();
    this.syncJobs = new Map();
    this.webhookSecrets = new Map();
    this.syncQueue = [];
    this.isProcessing = false;
  }

  /**
   * Register webhook endpoint for a PMS connection
   */
  async registerWebhook(connectionId, pmsType, callbackUrl) {
    const adapter = PMS_ADAPTERS[pmsType];
    if (!adapter || !adapter.supportsWebhooks) {
      throw new Error(`${pmsType} does not support webhooks`);
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex');
    this.webhookSecrets.set(connectionId, webhookSecret);

    // Simulated webhook registration
    const webhookConfig = {
      id: crypto.randomUUID(),
      connectionId,
      pmsType,
      callbackUrl,
      secret: webhookSecret,
      events: Object.values(SYNC_EVENTS).filter(e => e.startsWith('reservation') || e.startsWith('guest') || e.startsWith('payment')),
      status: 'active',
      createdAt: new Date().toISOString()
    };

    return webhookConfig;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(connectionId, payload, signature, timestamp) {
    const secret = this.webhookSecrets.get(connectionId);
    if (!secret) return false;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(payload)}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process incoming webhook from PMS
   */
  async processInboundWebhook(pmsType, payload, headers) {
    const eventType = payload.event || payload.type;
    const data = payload.data || payload;

    console.log(`[PMS Sync] Received ${eventType} from ${pmsType}`);

    // Transform PMS-specific payload to standard format
    const standardizedEvent = this.transformInboundEvent(pmsType, eventType, data);

    // Emit event for handlers
    this.emit('pms:event', standardizedEvent);

    // Process based on event type
    switch (standardizedEvent.type) {
      case SYNC_EVENTS.RESERVATION_CREATED:
      case SYNC_EVENTS.RESERVATION_UPDATED:
        await this.handleReservationUpdate(standardizedEvent);
        break;

      case SYNC_EVENTS.GUEST_CHECKED_IN:
      case SYNC_EVENTS.GUEST_CHECKED_OUT:
        await this.handleGuestStatusChange(standardizedEvent);
        break;

      case SYNC_EVENTS.PAYMENT_RECEIVED:
      case SYNC_EVENTS.PAYMENT_REFUNDED:
        await this.handlePaymentEvent(standardizedEvent);
        break;

      case SYNC_EVENTS.DOCUMENT_UPLOADED:
        await this.handleDocumentUpload(standardizedEvent);
        break;

      default:
        console.log(`[PMS Sync] Unhandled event type: ${standardizedEvent.type}`);
    }

    return { success: true, processedAt: new Date().toISOString() };
  }

  /**
   * Push event to PMS (outbound sync)
   */
  async pushToPMS(connectionId, pmsType, eventType, data) {
    const adapter = PMS_ADAPTERS[pmsType];
    if (!adapter || !adapter.supportsPush) {
      throw new Error(`${pmsType} does not support outbound push`);
    }

    console.log(`[PMS Sync] Pushing ${eventType} to ${pmsType}`);

    // Transform AccuDefend data to PMS-specific format
    const pmsPayload = this.transformOutboundEvent(pmsType, eventType, data);

    // Simulate API call to PMS
    await this.simulateApiCall();

    return {
      success: true,
      eventType,
      pmsType,
      sentAt: new Date().toISOString(),
      pmsResponse: {
        status: 'accepted',
        referenceId: crypto.randomUUID()
      }
    };
  }

  /**
   * Sync chargeback notification to PMS
   */
  async syncChargebackToPMS(connectionId, pmsType, chargebackData) {
    const adapter = PMS_ADAPTERS[pmsType];

    const syncPayload = {
      eventType: SYNC_EVENTS.CHARGEBACK_RECEIVED,
      reservationId: chargebackData.confirmationNumber,
      guestId: chargebackData.guestId,
      amount: chargebackData.amount,
      reason: chargebackData.reason,
      caseId: chargebackData.caseId,
      receivedAt: chargebackData.receivedAt,
      responseDeadline: chargebackData.responseDeadline,
      notes: `Chargeback received - Case #${chargebackData.caseId}. Reason: ${chargebackData.reason}`
    };

    // Add note to guest profile if supported
    if (adapter.syncCapabilities.notes?.write) {
      await this.addGuestNote(connectionId, pmsType, chargebackData.guestId, {
        type: 'chargeback_alert',
        title: 'Chargeback Received',
        content: syncPayload.notes,
        priority: 'high',
        createdBy: 'AccuDefend System'
      });
    }

    // Flag guest if supported
    if (adapter.syncCapabilities.flags?.write) {
      await this.flagGuest(connectionId, pmsType, chargebackData.guestId, {
        flagType: 'chargeback_history',
        reason: `Chargeback filed for reservation ${chargebackData.confirmationNumber}`,
        caseId: chargebackData.caseId
      });
    }

    return this.pushToPMS(connectionId, pmsType, SYNC_EVENTS.CHARGEBACK_RECEIVED, syncPayload);
  }

  /**
   * Sync dispute resolution to PMS
   */
  async syncDisputeResolutionToPMS(connectionId, pmsType, resolutionData) {
    const eventType = resolutionData.won ? SYNC_EVENTS.DISPUTE_WON : SYNC_EVENTS.DISPUTE_LOST;

    const syncPayload = {
      eventType,
      caseId: resolutionData.caseId,
      reservationId: resolutionData.confirmationNumber,
      guestId: resolutionData.guestId,
      amount: resolutionData.amount,
      outcome: resolutionData.won ? 'WON' : 'LOST',
      resolvedAt: resolutionData.resolvedAt,
      notes: `Dispute ${resolutionData.won ? 'WON' : 'LOST'} - ${resolutionData.won ? 'Amount recovered' : 'Amount lost'}: $${resolutionData.amount}`
    };

    return this.pushToPMS(connectionId, pmsType, eventType, syncPayload);
  }

  /**
   * Request evidence from PMS
   */
  async requestEvidenceFromPMS(connectionId, pmsType, confirmationNumber, evidenceTypes) {
    console.log(`[PMS Sync] Requesting evidence for ${confirmationNumber} from ${pmsType}`);

    // Simulate fetching evidence
    await this.simulateApiCall();

    const evidence = [];

    for (const type of evidenceTypes) {
      evidence.push({
        id: crypto.randomUUID(),
        type,
        confirmationNumber,
        status: 'fetched',
        fetchedAt: new Date().toISOString(),
        data: this.generateMockEvidence(type, confirmationNumber)
      });
    }

    return {
      success: true,
      confirmationNumber,
      evidenceCount: evidence.length,
      evidence
    };
  }

  /**
   * Add note to guest profile in PMS
   */
  async addGuestNote(connectionId, pmsType, guestId, note) {
    const adapter = PMS_ADAPTERS[pmsType];
    if (!adapter.syncCapabilities.notes?.write) {
      throw new Error(`${pmsType} does not support writing guest notes`);
    }

    await this.simulateApiCall();

    return {
      success: true,
      noteId: crypto.randomUUID(),
      guestId,
      addedAt: new Date().toISOString()
    };
  }

  /**
   * Flag guest in PMS
   */
  async flagGuest(connectionId, pmsType, guestId, flagData) {
    const adapter = PMS_ADAPTERS[pmsType];
    if (!adapter.syncCapabilities.flags?.write) {
      throw new Error(`${pmsType} does not support guest flags`);
    }

    await this.simulateApiCall();

    return {
      success: true,
      flagId: crypto.randomUUID(),
      guestId,
      flagType: flagData.flagType,
      flaggedAt: new Date().toISOString()
    };
  }

  /**
   * Upload document to PMS
   */
  async uploadDocumentToPMS(connectionId, pmsType, guestId, document) {
    const adapter = PMS_ADAPTERS[pmsType];
    if (!adapter.syncCapabilities.documents?.write) {
      throw new Error(`${pmsType} does not support document uploads`);
    }

    await this.simulateApiCall();

    return {
      success: true,
      documentId: crypto.randomUUID(),
      guestId,
      fileName: document.fileName,
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * Schedule periodic sync job
   */
  scheduleSyncJob(connectionId, pmsType, intervalMinutes = 15) {
    const jobId = `${connectionId}_sync`;

    if (this.syncJobs.has(jobId)) {
      clearInterval(this.syncJobs.get(jobId));
    }

    const job = setInterval(async () => {
      await this.performScheduledSync(connectionId, pmsType);
    }, intervalMinutes * 60 * 1000);

    this.syncJobs.set(jobId, job);

    return {
      jobId,
      intervalMinutes,
      nextRunAt: new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString()
    };
  }

  /**
   * Perform scheduled sync
   */
  async performScheduledSync(connectionId, pmsType) {
    console.log(`[PMS Sync] Running scheduled sync for ${connectionId}`);

    try {
      // Fetch recent reservations
      const reservations = await this.fetchRecentReservations(connectionId, pmsType);

      // Check for any pending chargebacks that need evidence
      const pendingCases = await this.getPendingCasesNeedingEvidence();

      // Auto-fetch evidence for pending cases
      for (const caseItem of pendingCases) {
        if (reservations.find(r => r.confirmationNumber === caseItem.confirmationNumber)) {
          await this.requestEvidenceFromPMS(
            connectionId,
            pmsType,
            caseItem.confirmationNumber,
            ['folio', 'registration_card', 'payment_receipt']
          );
        }
      }

      return {
        success: true,
        syncedAt: new Date().toISOString(),
        reservationsChecked: reservations.length,
        casesProcessed: pendingCases.length
      };
    } catch (error) {
      console.error(`[PMS Sync] Scheduled sync failed:`, error);
      throw error;
    }
  }

  /**
   * Get sync status for a connection
   */
  getSyncStatus(connectionId) {
    const jobId = `${connectionId}_sync`;
    const hasJob = this.syncJobs.has(jobId);

    return {
      connectionId,
      syncEnabled: hasJob,
      lastSyncAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      nextSyncAt: hasJob ? new Date(Date.now() + 900000).toISOString() : null,
      webhooksActive: this.webhookSecrets.has(connectionId),
      queuedEvents: this.syncQueue.filter(e => e.connectionId === connectionId).length
    };
  }

  // Helper methods
  transformInboundEvent(pmsType, eventType, data) {
    // Transform PMS-specific event to standard format
    return {
      type: this.mapPMSEventType(pmsType, eventType),
      source: pmsType,
      timestamp: new Date().toISOString(),
      data: this.normalizeEventData(pmsType, data)
    };
  }

  transformOutboundEvent(pmsType, eventType, data) {
    // Transform standard event to PMS-specific format
    const transforms = {
      AUTOCLERK: (type, d) => ({
        action: type,
        reservation_number: d.confirmationNumber,
        guest_id: d.guestId,
        details: d
      }),
      OPERA_CLOUD: (type, d) => ({
        eventType: type,
        reservationId: d.confirmationNumber,
        profileId: d.guestId,
        payload: d
      }),
      MEWS: (type, d) => ({
        Type: type,
        ReservationId: d.confirmationNumber,
        CustomerId: d.guestId,
        Data: d
      })
    };

    const transformer = transforms[pmsType] || ((type, d) => ({ type, ...d }));
    return transformer(eventType, data);
  }

  mapPMSEventType(pmsType, eventType) {
    const mappings = {
      'reservation.created': SYNC_EVENTS.RESERVATION_CREATED,
      'reservation.updated': SYNC_EVENTS.RESERVATION_UPDATED,
      'reservation.cancelled': SYNC_EVENTS.RESERVATION_CANCELLED,
      'checkin': SYNC_EVENTS.GUEST_CHECKED_IN,
      'checkout': SYNC_EVENTS.GUEST_CHECKED_OUT,
      'payment.created': SYNC_EVENTS.PAYMENT_RECEIVED,
      'payment.refund': SYNC_EVENTS.PAYMENT_REFUNDED,
      'document.created': SYNC_EVENTS.DOCUMENT_UPLOADED
    };

    return mappings[eventType] || eventType;
  }

  normalizeEventData(pmsType, data) {
    // Normalize different PMS data formats to standard format
    return {
      confirmationNumber: data.confirmation_number || data.reservationId || data.ReservationId || data.confirmationNumber,
      guestName: data.guest_name || data.guestName || data.GuestName,
      guestEmail: data.guest_email || data.email || data.Email,
      checkIn: data.check_in || data.checkIn || data.CheckInDate,
      checkOut: data.check_out || data.checkOut || data.CheckOutDate,
      amount: data.amount || data.totalAmount || data.Amount,
      status: data.status || data.Status,
      raw: data
    };
  }

  async handleReservationUpdate(event) {
    this.emit('reservation:updated', event);
    console.log(`[PMS Sync] Reservation updated: ${event.data.confirmationNumber}`);
  }

  async handleGuestStatusChange(event) {
    this.emit('guest:status_changed', event);
    console.log(`[PMS Sync] Guest status changed: ${event.type}`);
  }

  async handlePaymentEvent(event) {
    this.emit('payment:event', event);
    console.log(`[PMS Sync] Payment event: ${event.type}`);
  }

  async handleDocumentUpload(event) {
    this.emit('document:uploaded', event);
    console.log(`[PMS Sync] Document uploaded`);
  }

  async fetchRecentReservations(connectionId, pmsType) {
    await this.simulateApiCall();
    return [
      { confirmationNumber: 'RES-2024-001', guestName: 'John Doe', status: 'checked_out' },
      { confirmationNumber: 'RES-2024-002', guestName: 'Jane Smith', status: 'in_house' }
    ];
  }

  async getPendingCasesNeedingEvidence() {
    return [
      { id: 1, confirmationNumber: 'RES-2024-001', status: 'pending_evidence' }
    ];
  }

  generateMockEvidence(type, confirmationNumber) {
    return {
      type,
      confirmationNumber,
      content: `Mock ${type} evidence for ${confirmationNumber}`,
      generatedAt: new Date().toISOString()
    };
  }

  async simulateApiCall() {
    return new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
  }
}

module.exports = {
  PMSSyncService,
  PMS_ADAPTERS,
  SYNC_EVENTS,
  SYNC_DIRECTION
};
