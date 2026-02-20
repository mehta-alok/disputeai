/**
 * AccuDefend - PMS Outbound Worker
 *
 * Sends data TO PMS systems: chargeback alerts, guest flags,
 * dispute outcomes, and notes.
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createAdapter } = require('../../pms/PMSAdapterFactory');

/**
 * Process an outbound PMS event.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.pmsType - PMS system type
 * @param {string} job.data.integrationId - Integration record ID
 * @param {string} job.data.eventType - Event type (CHARGEBACK_RECEIVED, GUEST_FLAGGED, etc.)
 * @param {Object} job.data.data - Event payload
 */
module.exports = async function pmsOutboundProcessor(job) {
  const { pmsType, integrationId, eventType, data } = job.data;
  const startTime = Date.now();

  logger.info(`[PMS:Outbound] Processing ${eventType} for ${pmsType}`, { jobId: job.id });

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      integrationId: integrationId || 'unknown',
      syncType: 'webhook',
      direction: 'outbound',
      entityType: _getEntityType(eventType),
      status: 'started',
      metadata: { pmsType, eventType, jobId: job.id }
    }
  });

  try {
    // Get integration record
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration || integration.status !== 'active') {
      throw new Error(`Integration ${integrationId} not found or not active`);
    }

    // Create adapter
    const adapter = createAdapter(pmsType, {
      baseUrl: integration.config?.baseUrl,
      credentials: integration.credentials,
      propertyId: integration.config?.propertyId,
      integrationId
    });

    let result;

    switch (eventType) {
      case 'CHARGEBACK_RECEIVED': {
        // Push chargeback alert to PMS
        const { reservationId, caseNumber, amount, reasonCode, disputeDate, status } = data;
        result = await adapter.pushChargebackAlert(reservationId, {
          caseNumber,
          amount,
          reasonCode,
          disputeDate,
          status
        });

        // Also push a note to the guest profile
        if (data.guestId) {
          await adapter.pushNote(data.guestId, {
            title: `Chargeback Alert: ${caseNumber}`,
            content: `A chargeback of $${amount} has been filed (${reasonCode}). Case: ${caseNumber}`,
            priority: 'high',
            category: 'chargeback'
          });
        }
        break;
      }

      case 'GUEST_FLAGGED': {
        // Flag a guest in PMS for chargeback history
        const { guestId, reason, severity, chargebackId, amount } = data;
        result = await adapter.pushFlag(guestId, {
          reason,
          severity,
          chargebackId,
          amount
        });
        break;
      }

      case 'CASE_RESOLVED': {
        // Push dispute outcome to PMS
        const { reservationId, caseNumber, outcome, amount, resolvedDate } = data;
        result = await adapter.pushDisputeOutcome(reservationId, {
          caseNumber,
          outcome, // WON or LOST
          amount,
          resolvedDate
        });

        // Add resolution note
        if (data.guestId) {
          await adapter.pushNote(data.guestId, {
            title: `Dispute ${outcome}: ${caseNumber}`,
            content: `Chargeback case ${caseNumber} for $${amount} has been ${outcome.toLowerCase()}. Resolved: ${resolvedDate}`,
            priority: outcome === 'LOST' ? 'high' : 'medium',
            category: 'chargeback_resolution'
          });
        }
        break;
      }

      case 'NOTE_ADDED': {
        // Push a note to guest profile in PMS
        const { guestId, title, content, priority, category } = data;
        result = await adapter.pushNote(guestId, {
          title,
          content,
          priority: priority || 'medium',
          category: category || 'chargeback'
        });
        break;
      }

      default:
        logger.warn(`[PMS:Outbound] Unhandled event type: ${eventType}`);
        result = { skipped: true, reason: `Unknown event type: ${eventType}` };
    }

    // Log integration event
    await prisma.integrationEvent.create({
      data: {
        integrationId,
        eventType,
        direction: 'outbound',
        payload: data,
        processed: true,
        processedAt: new Date(),
        response: result || null
      }
    });

    // Update sync log
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        recordsProcessed: 1,
        completedAt: new Date(),
        durationMs
      }
    });

    logger.info(`[PMS:Outbound] ${eventType} completed for ${pmsType} (${durationMs}ms)`);
    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        errorMessage: error.message
      }
    });

    // Log failed event
    if (integrationId) {
      await prisma.integrationEvent.create({
        data: {
          integrationId,
          eventType,
          direction: 'outbound',
          payload: data,
          processed: false,
          errorMessage: error.message,
          retryCount: job.attemptsMade
        }
      });
    }

    logger.error(`[PMS:Outbound] ${eventType} failed for ${pmsType}:`, error.message);
    throw error;
  }
};

function _getEntityType(eventType) {
  switch (eventType) {
    case 'CHARGEBACK_RECEIVED':
    case 'CASE_RESOLVED':
      return 'chargeback';
    case 'GUEST_FLAGGED':
      return 'guest';
    case 'NOTE_ADDED':
      return 'note';
    default:
      return 'unknown';
  }
}
