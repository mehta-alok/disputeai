/**
 * AccuDefend - PMS Inbound Worker
 *
 * Processes inbound webhook events from PMS systems.
 * Normalizes data and upserts into Reservation, GuestFolioItem,
 * and GuestProfile tables. Auto-links to existing chargebacks.
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createAdapter } = require('../../pms/PMSAdapterFactory');
const reservationMatcher = require('../../reservationMatcher');

/**
 * Process a PMS inbound webhook event.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.pmsType - PMS system type (OPERA_CLOUD, MEWS, etc.)
 * @param {Object} job.data.payload - Raw webhook payload
 * @param {Object} job.data.headers - Request headers (for signature verification)
 * @param {string} job.data.integrationId - Integration record ID
 * @param {string} job.data.receivedAt - ISO timestamp of receipt
 */
module.exports = async function pmsInboundProcessor(job) {
  const { pmsType, payload, headers, integrationId, receivedAt } = job.data;
  const startTime = Date.now();

  logger.info(`[PMS:Inbound] Processing ${pmsType} webhook event`, { jobId: job.id });

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      integrationId: integrationId || 'unknown',
      syncType: 'webhook',
      direction: 'inbound',
      entityType: 'reservation',
      status: 'started',
      metadata: { pmsType, jobId: job.id }
    }
  });

  try {
    // Get integration record for credentials
    const integration = integrationId ? await prisma.integration.findUnique({
      where: { id: integrationId }
    }) : null;

    // Create adapter and parse the webhook
    const adapter = createAdapter(pmsType, {
      baseUrl: integration?.config?.baseUrl,
      credentials: integration?.credentials,
      propertyId: integration?.config?.propertyId,
      integrationId
    });

    // Verify webhook signature if we have a secret
    if (integration?.webhookSecret && headers) {
      const signature = headers['x-webhook-signature'] || headers['x-pms-signature'];
      if (signature) {
        const isValid = adapter.verifyWebhookSignature(payload, signature, integration.webhookSecret);
        if (!isValid) {
          throw new Error('Webhook signature verification failed');
        }
      }
    }

    // Parse the webhook payload into a normalized event
    const event = adapter.parseWebhookPayload(payload, headers);

    let recordsCreated = 0;
    let recordsUpdated = 0;

    // Handle different event types
    switch (event.type) {
      case 'reservation.created':
      case 'reservation.updated': {
        const normalized = adapter.normalizeReservation(event.data);
        const propertyId = integration?.config?.propertyId;

        if (!propertyId) {
          throw new Error('No propertyId configured for this integration');
        }

        // Upsert reservation
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
              propertyId,
              syncSource: pmsType,
              lastSyncedAt: new Date(),
              rawPmsData: event.data
            }
          });
          recordsUpdated++;
        } else {
          await prisma.reservation.create({
            data: {
              ...normalized,
              propertyId,
              syncSource: pmsType,
              lastSyncedAt: new Date(),
              rawPmsData: event.data
            }
          });
          recordsCreated++;
        }

        // Auto-link to any unlinked chargebacks
        await _autoLinkChargebacks(normalized, propertyId);
        break;
      }

      case 'reservation.cancelled': {
        const normalized = adapter.normalizeReservation(event.data);
        const propertyId = integration?.config?.propertyId;

        await prisma.reservation.updateMany({
          where: {
            confirmationNumber: normalized.confirmationNumber,
            propertyId
          },
          data: {
            status: 'cancelled',
            lastSyncedAt: new Date(),
            rawPmsData: event.data
          }
        });
        recordsUpdated++;
        break;
      }

      case 'guest.checked_in':
      case 'guest.checked_out': {
        const normalized = adapter.normalizeReservation(event.data);
        const propertyId = integration?.config?.propertyId;
        const status = event.type === 'guest.checked_in' ? 'checked_in' : 'checked_out';

        await prisma.reservation.updateMany({
          where: {
            confirmationNumber: normalized.confirmationNumber,
            propertyId
          },
          data: {
            status,
            ...(status === 'checked_in' ? { actualCheckIn: new Date() } : { actualCheckOut: new Date() }),
            lastSyncedAt: new Date()
          }
        });
        recordsUpdated++;
        break;
      }

      case 'folio.updated':
      case 'payment.received':
      case 'payment.refunded': {
        const folioItems = adapter.normalizeFolioItems(event.data);
        const propertyId = integration?.config?.propertyId;

        // Find the reservation this folio belongs to
        const reservation = await prisma.reservation.findFirst({
          where: {
            pmsReservationId: event.data.reservationId || event.data.reservation_id,
            propertyId
          }
        });

        if (reservation) {
          for (const item of folioItems) {
            const existing = await prisma.guestFolioItem.findFirst({
              where: {
                pmsFolioId: item.pmsFolioId,
                reservationId: reservation.id
              }
            });

            if (existing) {
              await prisma.guestFolioItem.update({
                where: { id: existing.id },
                data: { ...item, lastSyncedAt: new Date() }
              });
              recordsUpdated++;
            } else {
              await prisma.guestFolioItem.create({
                data: {
                  ...item,
                  reservationId: reservation.id,
                  lastSyncedAt: new Date()
                }
              });
              recordsCreated++;
            }
          }
        }
        break;
      }

      case 'guest.updated': {
        const normalized = adapter.normalizeGuestProfile(event.data);
        const pmsGuestId = event.data.guestId || event.data.guest_id || event.data.profileId;

        if (pmsGuestId) {
          await prisma.guestProfile.upsert({
            where: {
              id: (await prisma.guestProfile.findFirst({
                where: { pmsGuestId, syncSource: pmsType }
              }))?.id || 'new'
            },
            update: {
              ...normalized,
              lastSyncedAt: new Date()
            },
            create: {
              ...normalized,
              pmsGuestId,
              syncSource: pmsType,
              lastSyncedAt: new Date()
            }
          });
          recordsUpdated++;
        }
        break;
      }

      default:
        logger.info(`[PMS:Inbound] Unhandled event type: ${event.type}`, { pmsType });
    }

    // Log the integration event
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
        recordsProcessed: recordsCreated + recordsUpdated,
        recordsCreated,
        recordsUpdated,
        completedAt: new Date(),
        durationMs
      }
    });

    // Update integration last sync
    if (integrationId) {
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          syncErrors: 0
        }
      });
    }

    logger.info(`[PMS:Inbound] Completed: ${recordsCreated} created, ${recordsUpdated} updated (${durationMs}ms)`);

    return { recordsCreated, recordsUpdated, durationMs };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Update sync log with error
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

    // Increment integration error count
    if (integrationId) {
      await prisma.integration.update({
        where: { id: integrationId },
        data: {
          lastSyncStatus: 'error',
          syncErrors: { increment: 1 }
        }
      });
    }

    logger.error(`[PMS:Inbound] Failed:`, error.message);
    throw error; // Let BullMQ handle retry
  }
};

/**
 * Auto-link unlinked chargebacks to the newly synced reservation.
 */
async function _autoLinkChargebacks(reservationData, propertyId) {
  try {
    // Find chargebacks without a reservation link that might match
    const unlinkedChargebacks = await prisma.chargeback.findMany({
      where: {
        propertyId,
        reservationId: null,
        status: { in: ['PENDING', 'IN_REVIEW'] }
      },
      take: 20
    });

    for (const cb of unlinkedChargebacks) {
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
        logger.info(`[PMS:Inbound] Auto-linked chargeback ${cb.caseNumber} to reservation ${match.reservation.confirmationNumber} (confidence: ${match.confidence}%)`);
      }
    }
  } catch (error) {
    logger.error('[PMS:Inbound] Error auto-linking chargebacks:', error.message);
    // Non-fatal — don't throw
  }
}
