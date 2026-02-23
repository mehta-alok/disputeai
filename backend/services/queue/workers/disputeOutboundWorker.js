/**
 * DisputeAI - Dispute Outbound Worker
 *
 * Sends evidence packages, representment responses, and status
 * updates TO dispute portals (Verifi, Ethoca, Merlink).
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createDisputeAdapter } = require('../../disputes/DisputeAdapterFactory');
const { getPresignedDownloadUrl: getPresignedUrl } = require('../../../config/s3');

/**
 * Process an outbound dispute portal event.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.portalType - Dispute portal type
 * @param {string} job.data.integrationId - Integration record ID
 * @param {string} job.data.action - Action type (SUBMIT_EVIDENCE, PUSH_RESPONSE, UPDATE_STATUS, ACCEPT_DISPUTE)
 * @param {Object} job.data.data - Action payload
 */
module.exports = async function disputeOutboundProcessor(job) {
  const { portalType, integrationId, action, data } = job.data;
  const startTime = Date.now();

  logger.info(`[Dispute:Outbound] Processing ${action} for ${portalType}`, { jobId: job.id });

  const syncLog = await prisma.syncLog.create({
    data: {
      integrationId: integrationId || 'unknown',
      syncType: 'manual',
      direction: 'outbound',
      entityType: 'evidence',
      status: 'started',
      metadata: { portalType, action, jobId: job.id }
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
    const adapter = createDisputeAdapter(portalType, {
      baseUrl: integration.config?.baseUrl,
      credentials: integration.credentials,
      integrationId
    });

    if (!adapter) {
      throw new Error(`No adapter available for portal type: ${portalType}`);
    }

    let result;

    switch (action) {
      case 'SUBMIT_EVIDENCE': {
        const { disputeId, chargebackId, evidenceIds } = data;

        // Get evidence records from DB
        const evidenceRecords = await prisma.evidence.findMany({
          where: { id: { in: evidenceIds } },
          include: { chargeback: true }
        });

        // Build evidence package with file data from S3
        const files = [];
        for (const record of evidenceRecords) {
          try {
            // Get presigned URL for the file
            const url = await getPresignedUrl(record.s3Key);
            files.push({
              type: record.type,
              fileName: record.fileName,
              mimeType: record.mimeType,
              url, // Presigned S3 URL
              description: record.description
            });
          } catch (err) {
            logger.warn(`[Dispute:Outbound] Could not get presigned URL for evidence ${record.id}:`, err.message);
          }
        }

        // Get chargeback for metadata
        const chargeback = await prisma.chargeback.findUnique({
          where: { id: chargebackId },
          include: { reservation: true }
        });

        const evidencePackage = {
          files,
          metadata: {
            caseNumber: chargeback?.caseNumber,
            guestName: chargeback?.guestName,
            confirmationNumber: chargeback?.confirmationNumber,
            checkInDate: chargeback?.checkInDate,
            checkOutDate: chargeback?.checkOutDate,
            amount: chargeback?.amount,
            roomNumber: chargeback?.roomNumber
          }
        };

        result = await adapter.submitEvidence(disputeId, evidencePackage);

        // Record the submission
        await prisma.disputeSubmission.create({
          data: {
            chargebackId,
            status: result.status || 'pending',
            requestJson: { action, disputeId, evidenceCount: files.length },
            responseJson: result
          }
        });

        // Timeline event
        if (chargeback) {
          await prisma.timelineEvent.create({
            data: {
              chargebackId,
              eventType: 'SUCCESS',
              title: `Evidence submitted to ${portalType}`,
              description: `${files.length} evidence files submitted`,
              metadata: { submissionId: result.submissionId, portalType }
            }
          });
        }
        break;
      }

      case 'PUSH_RESPONSE': {
        const { disputeId, chargebackId, responseData } = data;

        result = await adapter.pushResponse(disputeId, responseData);

        // Record submission
        await prisma.disputeSubmission.create({
          data: {
            chargebackId,
            status: result.status || 'pending',
            requestJson: { action, disputeId, responseData },
            responseJson: result
          }
        });

        // Update chargeback status
        await prisma.chargeback.update({
          where: { id: chargebackId },
          data: { status: 'SUBMITTED' }
        });

        // Timeline event
        await prisma.timelineEvent.create({
          data: {
            chargebackId,
            eventType: 'SUCCESS',
            title: `Representment submitted to ${portalType}`,
            description: `Response package sent for dispute ${disputeId}`,
            metadata: { responseId: result.responseId, portalType }
          }
        });
        break;
      }

      case 'UPDATE_STATUS': {
        const { disputeId, status, notes } = data;
        result = await adapter.updateCaseStatus(disputeId, status, notes);
        break;
      }

      case 'ACCEPT_DISPUTE': {
        const { disputeId, chargebackId } = data;
        result = await adapter.acceptDispute(disputeId);

        if (chargebackId) {
          await prisma.chargeback.update({
            where: { id: chargebackId },
            data: { status: 'LOST', resolvedAt: new Date() }
          });

          await prisma.timelineEvent.create({
            data: {
              chargebackId,
              eventType: 'LOST',
              title: `Dispute accepted (liability accepted)`,
              description: `Dispute ${disputeId} accepted via ${portalType}`,
              metadata: { portalType }
            }
          });
        }
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log integration event
    await prisma.integrationEvent.create({
      data: {
        integrationId,
        eventType: action,
        direction: 'outbound',
        payload: data,
        processed: true,
        processedAt: new Date(),
        response: result
      }
    });

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

    logger.info(`[Dispute:Outbound] ${action} completed for ${portalType} (${durationMs}ms)`);
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

    logger.error(`[Dispute:Outbound] ${action} failed for ${portalType}:`, error.message);
    throw error;
  }
};
