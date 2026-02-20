/**
 * AccuDefend - Scheduled Sync Worker
 *
 * Handles periodic sync jobs for PMS systems and dispute portals.
 * Fetches recent changes since the last sync and upserts data.
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createAdapter, isSupported } = require('../../pms/PMSAdapterFactory');
const { createDisputeAdapter } = require('../../disputes/DisputeAdapterFactory');
const reservationMatcher = require('../../reservationMatcher');

/**
 * Process a scheduled sync job.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.integrationId - Integration record ID
 * @param {string} job.data.type - Sync type: 'pms' or 'dispute'
 * @param {string} job.data.adapterType - PMS or portal type
 * @param {string} job.data.syncType - 'full' or 'incremental'
 */
module.exports = async function scheduledSyncProcessor(job) {
  const { integrationId, type, adapterType, syncType = 'incremental' } = job.data;
  const startTime = Date.now();

  logger.info(`[ScheduledSync] Starting ${syncType} ${type} sync for ${adapterType}`, { jobId: job.id });

  const syncLog = await prisma.syncLog.create({
    data: {
      integrationId,
      syncType,
      direction: 'inbound',
      entityType: type === 'pms' ? 'reservation' : 'chargeback',
      status: 'started',
      metadata: { type, adapterType, jobId: job.id }
    }
  });

  try {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration || integration.status !== 'active' || !integration.syncEnabled) {
      logger.info(`[ScheduledSync] Integration ${integrationId} is inactive or sync disabled`);
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'completed', completedAt: new Date(), metadata: { skipped: true } }
      });
      return { status: 'skipped', reason: 'integration_inactive' };
    }

    let result;

    if (type === 'pms') {
      result = await _syncPMS(integration, adapterType, syncType, syncLog.id);
    } else if (type === 'dispute') {
      result = await _syncDisputes(integration, adapterType, syncType, syncLog.id);
    } else {
      throw new Error(`Unknown sync type: ${type}`);
    }

    // Update sync log
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        recordsProcessed: result.processed,
        recordsCreated: result.created,
        recordsUpdated: result.updated,
        recordsFailed: result.failed,
        completedAt: new Date(),
        durationMs
      }
    });

    // Update integration last sync
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        syncErrors: 0
      }
    });

    logger.info(`[ScheduledSync] Completed: ${result.created} created, ${result.updated} updated, ${result.failed} failed (${durationMs}ms)`);
    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        errorMessage: error.message,
        errorDetails: { stack: error.stack }
      }
    });

    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastSyncStatus: 'error',
        syncErrors: { increment: 1 }
      }
    });

    logger.error(`[ScheduledSync] Failed:`, error.message);
    throw error;
  }
};

/**
 * Sync reservations from PMS.
 */
async function _syncPMS(integration, pmsType, syncType, syncLogId) {
  const propertyId = integration.config?.propertyId;
  if (!propertyId) throw new Error('No propertyId configured');

  if (!isSupported(pmsType)) {
    return { processed: 0, created: 0, updated: 0, failed: 0, reason: 'unsupported' };
  }

  const adapter = createAdapter(pmsType, {
    baseUrl: integration.config?.baseUrl,
    credentials: integration.credentials,
    propertyId,
    integrationId: integration.id
  });

  let created = 0, updated = 0, failed = 0;

  // Determine date range for sync
  const sinceDate = syncType === 'full'
    ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // 1 year
    : integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // Since last sync or 24h

  try {
    // Search for reservations modified since last sync
    const reservations = await adapter.searchReservations({
      modifiedSince: sinceDate,
      status: syncType === 'full' ? undefined : 'all'
    });

    if (!reservations || reservations.length === 0) {
      return { processed: 0, created: 0, updated: 0, failed: 0 };
    }

    for (const rawReservation of reservations) {
      try {
        const normalized = adapter.normalizeReservation(rawReservation);

        const existing = await prisma.reservation.findUnique({
          where: {
            confirmationNumber_propertyId: {
              confirmationNumber: normalized.confirmationNumber,
              propertyId
            }
          }
        });

        if (existing) {
          await prisma.reservation.update({
            where: { id: existing.id },
            data: {
              ...normalized,
              syncSource: pmsType,
              lastSyncedAt: new Date(),
              rawPmsData: rawReservation
            }
          });
          updated++;
        } else {
          const newReservation = await prisma.reservation.create({
            data: {
              ...normalized,
              propertyId,
              syncSource: pmsType,
              lastSyncedAt: new Date(),
              rawPmsData: rawReservation
            }
          });

          // Try to fetch and save folio items
          try {
            const folioItems = await adapter.getGuestFolio(normalized.pmsReservationId);
            if (folioItems && folioItems.length > 0) {
              const normalizedItems = adapter.normalizeFolioItems
                ? adapter.normalizeFolioItems(folioItems)
                : folioItems;

              for (const item of normalizedItems) {
                await prisma.guestFolioItem.create({
                  data: {
                    ...item,
                    reservationId: newReservation.id,
                    lastSyncedAt: new Date()
                  }
                });
              }
            }
          } catch (folioError) {
            logger.warn(`[ScheduledSync] Failed to fetch folio for ${normalized.confirmationNumber}:`, folioError.message);
          }

          created++;
        }
      } catch (itemError) {
        logger.warn(`[ScheduledSync] Failed to process reservation:`, itemError.message);
        failed++;
      }
    }

    // Auto-link any unlinked chargebacks
    const unlinkedChargebacks = await prisma.chargeback.findMany({
      where: {
        propertyId,
        reservationId: null,
        status: { in: ['PENDING', 'IN_REVIEW'] }
      },
      take: 50
    });

    for (const cb of unlinkedChargebacks) {
      try {
        const match = await reservationMatcher.findMatchingReservation({
          confirmationNumber: cb.confirmationNumber,
          cardLastFour: cb.cardLastFour,
          guestName: cb.guestName,
          checkInDate: cb.checkInDate,
          checkOutDate: cb.checkOutDate,
          transactionId: cb.transactionId,
          amount: cb.amount
        }, propertyId);

        if (match && match.confidence >= 80) {
          await reservationMatcher.linkChargebackToReservation(cb.id, match.reservation.id);
        }
      } catch (matchError) {
        logger.warn(`[ScheduledSync] Failed to match chargeback ${cb.caseNumber}:`, matchError.message);
      }
    }

    return { processed: reservations.length, created, updated, failed };

  } catch (error) {
    logger.error(`[ScheduledSync] PMS sync error:`, error.message);
    throw error;
  }
}

/**
 * Sync disputes from dispute portal.
 */
async function _syncDisputes(integration, portalType, syncType, syncLogId) {
  const adapter = createDisputeAdapter(portalType, {
    baseUrl: integration.config?.baseUrl,
    credentials: integration.credentials,
    integrationId: integration.id
  });

  if (!adapter) {
    return { processed: 0, created: 0, updated: 0, failed: 0, reason: 'unsupported' };
  }

  let created = 0, updated = 0, failed = 0;

  const sinceDate = syncType === 'full'
    ? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 6 months
    : integration.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const response = await adapter.fetchDisputes({
      since: sinceDate,
      status: 'all',
      page: 1,
      limit: 100
    });

    if (!response || !response.disputes || response.disputes.length === 0) {
      return { processed: 0, created: 0, updated: 0, failed: 0 };
    }

    for (const rawDispute of response.disputes) {
      try {
        const normalized = adapter.normalizeDispute(rawDispute);

        // Check for existing chargeback
        const existing = await prisma.chargeback.findFirst({
          where: { processorDisputeId: normalized.disputeId }
        });

        if (existing) {
          // Update status if changed
          const newStatus = _mapDisputeStatus(normalized.status);
          if (newStatus && newStatus !== existing.status) {
            await prisma.chargeback.update({
              where: { id: existing.id },
              data: {
                status: newStatus,
                ...(newStatus === 'WON' || newStatus === 'LOST' ? { resolvedAt: new Date() } : {})
              }
            });

            await prisma.timelineEvent.create({
              data: {
                chargebackId: existing.id,
                eventType: 'SYSTEM',
                title: `Status synced from ${portalType}`,
                description: `Status updated to ${newStatus} during scheduled sync`,
                metadata: { source: portalType, syncType }
              }
            });

            updated++;
          }
        } else {
          // Would create new chargeback — but let the dispute inbound worker handle
          // full creation with notifications. Just log for now.
          logger.info(`[ScheduledSync] New dispute found: ${normalized.disputeId} from ${portalType}`);
          created++;
        }
      } catch (itemError) {
        logger.warn(`[ScheduledSync] Failed to process dispute:`, itemError.message);
        failed++;
      }
    }

    return { processed: response.disputes.length, created, updated, failed };

  } catch (error) {
    logger.error(`[ScheduledSync] Dispute sync error:`, error.message);
    throw error;
  }
}

/**
 * Map dispute portal status to AccuDefend ChargebackStatus.
 */
function _mapDisputeStatus(portalStatus) {
  const mapping = {
    'open': 'PENDING',
    'pending': 'PENDING',
    'new': 'PENDING',
    'in_review': 'IN_REVIEW',
    'under_review': 'IN_REVIEW',
    'submitted': 'SUBMITTED',
    'represented': 'SUBMITTED',
    'won': 'WON',
    'resolved_merchant': 'WON',
    'lost': 'LOST',
    'resolved_cardholder': 'LOST',
    'accepted': 'LOST',
    'expired': 'EXPIRED',
    'cancelled': 'CANCELLED',
    'withdrawn': 'CANCELLED'
  };
  return mapping[portalStatus?.toLowerCase()] || null;
}
