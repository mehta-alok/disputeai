/**
 * AccuDefend - Dispute Inbound Worker
 *
 * Processes inbound webhook events from dispute portals
 * (Verifi, Ethoca, Merlink, etc.). Creates/updates chargebacks
 * and triggers auto-evidence collection.
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createDisputeAdapter } = require('../../disputes/DisputeAdapterFactory');
const { getQueue } = require('../queueManager');

/**
 * Process an inbound dispute portal webhook event.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.portalType - Dispute portal type (VERIFI, ETHOCA, MERLINK)
 * @param {Object} job.data.payload - Raw webhook payload
 * @param {Object} job.data.headers - Request headers
 * @param {string} job.data.integrationId - Integration record ID
 */
module.exports = async function disputeInboundProcessor(job) {
  const { portalType, payload, headers, integrationId } = job.data;
  const startTime = Date.now();

  logger.info(`[Dispute:Inbound] Processing ${portalType} webhook`, { jobId: job.id });

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      integrationId: integrationId || 'unknown',
      syncType: 'webhook',
      direction: 'inbound',
      entityType: 'chargeback',
      status: 'started',
      metadata: { portalType, jobId: job.id }
    }
  });

  try {
    // Get integration record
    const integration = integrationId ? await prisma.integration.findUnique({
      where: { id: integrationId }
    }) : null;

    // Create adapter
    const adapter = createDisputeAdapter(portalType, {
      baseUrl: integration?.config?.baseUrl,
      credentials: integration?.credentials,
      integrationId
    });

    // Parse and verify the webhook
    let event;
    if (adapter) {
      // Verify signature if we have a secret
      if (integration?.webhookSecret && headers) {
        const signature = headers['x-webhook-signature'] ||
                          headers['x-verifi-signature'] ||
                          headers['x-ethoca-signature'] ||
                          headers['x-merlink-signature'];
        if (signature) {
          const isValid = adapter.verifyWebhookSignature(payload, signature, integration.webhookSecret);
          if (!isValid) {
            throw new Error('Webhook signature verification failed');
          }
        }
      }
      event = adapter.parseWebhookPayload(payload, headers);
    } else {
      // Generic webhook parsing for unsupported portals
      event = _parseGenericWebhook(payload, portalType);
    }

    let result = { action: 'none' };

    switch (event.type) {
      case 'dispute.created':
      case 'alert.created':
      case 'alert.new': {
        // Create a new chargeback from the dispute
        const normalized = adapter ? adapter.normalizeDispute(event.data) : event.data;

        // Check for duplicate (idempotency)
        const existingCase = await prisma.chargeback.findFirst({
          where: { processorDisputeId: normalized.disputeId }
        });

        if (existingCase) {
          logger.info(`[Dispute:Inbound] Duplicate dispute ${normalized.disputeId}, skipping`);
          result = { action: 'skipped', reason: 'duplicate', caseNumber: existingCase.caseNumber };
          break;
        }

        // Generate case number
        const caseCount = await prisma.chargeback.count();
        const caseNumber = `CB-${new Date().getFullYear()}-${String(caseCount + 1).padStart(4, '0')}`;

        // Find or create provider record for this portal
        let provider = await prisma.provider.findFirst({
          where: { name: portalType, type: 'PAYMENT_PROCESSOR' }
        });
        if (!provider) {
          provider = await prisma.provider.create({
            data: {
              name: portalType,
              type: 'PAYMENT_PROCESSOR',
              enabled: true
            }
          });
        }

        // Determine property from integration config
        const propertyId = integration?.config?.propertyId;
        if (!propertyId) {
          // Try to find default property
          const defaultProperty = await prisma.property.findFirst({ where: { isActive: true } });
          if (!defaultProperty) throw new Error('No property configured for this integration');
          var resolvedPropertyId = defaultProperty.id;
        } else {
          var resolvedPropertyId = propertyId;
        }

        // Create the chargeback
        const chargeback = await prisma.chargeback.create({
          data: {
            caseNumber,
            status: 'PENDING',
            guestName: normalized.guestName || 'Unknown Guest',
            guestEmail: normalized.guestEmail,
            amount: normalized.amount,
            currency: normalized.currency || 'USD',
            transactionId: normalized.transactionId || `TXN-${Date.now()}`,
            cardLastFour: normalized.cardLastFour,
            cardBrand: normalized.cardBrand,
            reasonCode: normalized.reasonCode || 'UNKNOWN',
            reasonDescription: normalized.reasonDescription,
            disputeDate: normalized.disputeDate ? new Date(normalized.disputeDate) : new Date(),
            dueDate: normalized.dueDate ? new Date(normalized.dueDate) : null,
            processorDisputeId: normalized.disputeId,
            checkInDate: normalized.checkInDate ? new Date(normalized.checkInDate) : new Date(),
            checkOutDate: normalized.checkOutDate ? new Date(normalized.checkOutDate) : new Date(),
            roomNumber: normalized.roomNumber,
            confirmationNumber: normalized.confirmationNumber,
            propertyId: resolvedPropertyId,
            providerId: provider.id
          }
        });

        // Create timeline event
        await prisma.timelineEvent.create({
          data: {
            chargebackId: chargeback.id,
            eventType: 'ALERT',
            title: `Dispute received from ${portalType}`,
            description: `New ${normalized.reasonCode} dispute for $${normalized.amount}`,
            metadata: { source: portalType, disputeId: normalized.disputeId }
          }
        });

        // Notify admin users
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN', isActive: true }
        });
        for (const admin of admins) {
          await prisma.notification.create({
            data: {
              userId: admin.id,
              type: 'NEW_CHARGEBACK',
              priority: 'HIGH',
              title: `New Dispute: ${caseNumber}`,
              message: `${portalType} dispute for $${normalized.amount} (${normalized.reasonCode})`,
              link: `/cases/${chargeback.id}`,
              metadata: { caseId: chargeback.id, amount: normalized.amount }
            }
          });
        }

        // Queue auto-evidence collection
        const evidenceQueue = getQueue('evidence-collection');
        await evidenceQueue.add('auto-collect', {
          chargebackId: chargeback.id,
          caseNumber,
          cardLastFour: normalized.cardLastFour,
          confirmationNumber: normalized.confirmationNumber,
          guestName: normalized.guestName,
          checkInDate: normalized.checkInDate,
          checkOutDate: normalized.checkOutDate,
          transactionId: normalized.transactionId,
          propertyId: resolvedPropertyId
        }, { priority: 1 });

        result = { action: 'created', caseNumber, chargebackId: chargeback.id };
        break;
      }

      case 'dispute.updated':
      case 'alert.updated': {
        const normalized = adapter ? adapter.normalizeDispute(event.data) : event.data;
        const existingCase = await prisma.chargeback.findFirst({
          where: { processorDisputeId: normalized.disputeId }
        });

        if (existingCase) {
          await prisma.timelineEvent.create({
            data: {
              chargebackId: existingCase.id,
              eventType: 'INFO',
              title: `Dispute updated by ${portalType}`,
              description: normalized.statusMessage || `Status: ${normalized.status}`,
              metadata: event.data
            }
          });
          result = { action: 'updated', caseNumber: existingCase.caseNumber };
        }
        break;
      }

      case 'dispute.resolved':
      case 'dispute.closed': {
        const normalized = adapter ? adapter.normalizeDispute(event.data) : event.data;
        const existingCase = await prisma.chargeback.findFirst({
          where: { processorDisputeId: normalized.disputeId }
        });

        if (existingCase) {
          const outcome = normalized.outcome === 'won' || normalized.outcome === 'WON' ? 'WON' : 'LOST';
          await prisma.chargeback.update({
            where: { id: existingCase.id },
            data: {
              status: outcome,
              resolvedAt: new Date()
            }
          });

          await prisma.timelineEvent.create({
            data: {
              chargebackId: existingCase.id,
              eventType: outcome,
              title: `Dispute ${outcome}`,
              description: `Case resolved as ${outcome} by ${portalType}`,
              metadata: event.data
            }
          });

          // Notify users
          const admins = await prisma.user.findMany({
            where: { role: 'ADMIN', isActive: true }
          });
          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                userId: admin.id,
                type: 'SUBMISSION_RESULT',
                priority: outcome === 'WON' ? 'MEDIUM' : 'HIGH',
                title: `Case ${outcome}: ${existingCase.caseNumber}`,
                message: `$${existingCase.amount} dispute ${outcome.toLowerCase()} via ${portalType}`,
                link: `/cases/${existingCase.id}`
              }
            });
          }

          // Push outcome to PMS (queue outbound)
          if (existingCase.reservationId) {
            const pmsOutboundQueue = getQueue('pms-outbound');
            // Find PMS integration for this property
            const pmsIntegration = await prisma.integration.findFirst({
              where: {
                type: { contains: 'pms' },
                status: 'active',
                config: { path: ['propertyId'], equals: existingCase.propertyId }
              }
            });
            if (pmsIntegration) {
              await pmsOutboundQueue.add('case-resolved', {
                pmsType: pmsIntegration.type.replace('pms_', '').toUpperCase(),
                integrationId: pmsIntegration.id,
                eventType: 'CASE_RESOLVED',
                data: {
                  reservationId: existingCase.reservationId,
                  caseNumber: existingCase.caseNumber,
                  outcome,
                  amount: existingCase.amount,
                  resolvedDate: new Date().toISOString()
                }
              });
            }
          }

          result = { action: 'resolved', caseNumber: existingCase.caseNumber, outcome };
        }
        break;
      }

      case 'evidence.requested': {
        const normalized = adapter ? adapter.normalizeDispute(event.data) : event.data;
        const existingCase = await prisma.chargeback.findFirst({
          where: { processorDisputeId: normalized.disputeId }
        });

        if (existingCase) {
          await prisma.timelineEvent.create({
            data: {
              chargebackId: existingCase.id,
              eventType: 'WARNING',
              title: `Evidence requested by ${portalType}`,
              description: `Required: ${(normalized.requiredTypes || []).join(', ')}`,
              metadata: event.data
            }
          });

          // Urgent notification
          const admins = await prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true }
          });
          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                userId: admin.id,
                type: 'CASE_UPDATE',
                priority: 'URGENT',
                title: `Evidence Needed: ${existingCase.caseNumber}`,
                message: `${portalType} requires additional evidence for $${existingCase.amount} dispute`,
                link: `/cases/${existingCase.id}`
              }
            });
          }

          result = { action: 'evidence_requested', caseNumber: existingCase.caseNumber };
        }
        break;
      }

      default:
        logger.info(`[Dispute:Inbound] Unhandled event type: ${event.type}`, { portalType });
        result = { action: 'skipped', reason: `Unknown event type: ${event.type}` };
    }

    // Log integration event
    if (integrationId) {
      await prisma.integrationEvent.create({
        data: {
          integrationId,
          eventType: event.type,
          direction: 'inbound',
          payload: event.data,
          processed: true,
          processedAt: new Date()
        }
      });
    }

    // Update sync log
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        recordsProcessed: 1,
        recordsCreated: result.action === 'created' ? 1 : 0,
        recordsUpdated: ['updated', 'resolved'].includes(result.action) ? 1 : 0,
        completedAt: new Date(),
        durationMs
      }
    });

    logger.info(`[Dispute:Inbound] ${event.type} processed: ${result.action} (${durationMs}ms)`);
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

    logger.error(`[Dispute:Inbound] Failed:`, error.message);
    throw error;
  }
};

/**
 * Generic webhook parser for unsupported dispute portals.
 */
function _parseGenericWebhook(payload, portalType) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  return {
    type: data.event || data.eventType || data.type || 'dispute.created',
    data: data.data || data.dispute || data
  };
}
