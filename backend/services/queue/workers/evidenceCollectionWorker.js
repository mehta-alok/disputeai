/**
 * AccuDefend - Auto Evidence Collection Worker
 *
 * The core business logic feature: When a new chargeback comes in,
 * automatically search PMS for the matching reservation, fetch
 * folio + registration card + payment receipt, upload to S3,
 * attach as evidence, and trigger AI analysis.
 */

const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { createAdapter, isSupported } = require('../../pms/PMSAdapterFactory');
const reservationMatcher = require('../../reservationMatcher');
const { uploadFile } = require('../../../config/storage');

/**
 * Auto-collect evidence from PMS for a new chargeback.
 *
 * @param {Object} job - BullMQ job
 * @param {string} job.data.chargebackId - Chargeback record ID
 * @param {string} job.data.caseNumber - Case number
 * @param {string} job.data.cardLastFour - Card last 4 digits
 * @param {string} job.data.confirmationNumber - Reservation confirmation number
 * @param {string} job.data.guestName - Guest name
 * @param {string} job.data.checkInDate - Check-in date
 * @param {string} job.data.checkOutDate - Check-out date
 * @param {string} job.data.transactionId - Transaction ID
 * @param {string} job.data.propertyId - Property ID
 */
module.exports = async function evidenceCollectionProcessor(job) {
  const {
    chargebackId, caseNumber, cardLastFour, confirmationNumber,
    guestName, checkInDate, checkOutDate, transactionId, propertyId
  } = job.data;
  const startTime = Date.now();

  logger.info(`[EvidenceCollector] Starting auto-collection for ${caseNumber}`, { jobId: job.id });

  try {
    // Step 1: Find active PMS integration for this property
    const pmsIntegration = await _findPmsIntegration(propertyId);
    if (!pmsIntegration) {
      logger.info(`[EvidenceCollector] No active PMS integration for property ${propertyId}`);
      return { status: 'skipped', reason: 'no_pms_integration' };
    }

    const pmsType = _extractPmsType(pmsIntegration.type);
    if (!isSupported(pmsType)) {
      logger.info(`[EvidenceCollector] PMS type ${pmsType} not supported for auto-evidence`);
      return { status: 'skipped', reason: 'unsupported_pms' };
    }

    // Create adapter
    const adapter = createAdapter(pmsType, {
      baseUrl: pmsIntegration.config?.baseUrl,
      credentials: pmsIntegration.credentials,
      propertyId,
      integrationId: pmsIntegration.id
    });

    // Step 2: Match chargeback to reservation
    let reservation = null;
    const matchResult = await reservationMatcher.findMatchingReservation({
      confirmationNumber, cardLastFour, guestName,
      checkInDate, checkOutDate, transactionId
    }, propertyId);

    if (matchResult) {
      reservation = matchResult.reservation;
      logger.info(`[EvidenceCollector] Matched reservation ${reservation.confirmationNumber} (${matchResult.confidence}% via ${matchResult.strategy})`);

      // Link chargeback to reservation
      if (matchResult.confidence >= 60) {
        await reservationMatcher.linkChargebackToReservation(chargebackId, reservation.id);
      }
    } else {
      // Try live PMS search if no local match
      logger.info(`[EvidenceCollector] No local match, searching PMS directly...`);
      try {
        const searchResults = await adapter.searchReservations({
          confirmationNumber,
          guestName,
          cardLastFour,
          checkInDate,
          checkOutDate
        });

        if (searchResults && searchResults.length > 0) {
          // Normalize and save the first result
          const normalized = adapter.normalizeReservation(searchResults[0]);
          reservation = await prisma.reservation.create({
            data: {
              ...normalized,
              propertyId,
              syncSource: pmsType,
              lastSyncedAt: new Date(),
              rawPmsData: searchResults[0]
            }
          });

          // Link to chargeback
          await reservationMatcher.linkChargebackToReservation(chargebackId, reservation.id);
          logger.info(`[EvidenceCollector] Found and linked PMS reservation: ${normalized.confirmationNumber}`);
        }
      } catch (searchError) {
        logger.warn(`[EvidenceCollector] PMS search failed:`, searchError.message);
      }
    }

    if (!reservation) {
      // No reservation found — notify user
      await _notifyNoReservationFound(chargebackId, caseNumber, propertyId);
      return { status: 'partial', reason: 'no_reservation_found', evidenceCollected: 0 };
    }

    // Step 3: Fetch evidence documents from PMS
    let evidenceCollected = 0;
    const evidenceTypes = ['FOLIO', 'RESERVATION_CONFIRMATION', 'AUTH_SIGNATURE', 'ID_SCAN'];
    const pmsReservationId = reservation.pmsReservationId || reservation.confirmationNumber;

    for (const evidenceType of evidenceTypes) {
      try {
        // Check if evidence of this type already exists for this chargeback
        const existingEvidence = await prisma.evidence.findFirst({
          where: { chargebackId, type: evidenceType }
        });
        if (existingEvidence) {
          logger.info(`[EvidenceCollector] ${evidenceType} already exists, skipping`);
          continue;
        }

        let documents;
        switch (evidenceType) {
          case 'FOLIO':
            // Fetch guest folio from PMS
            const folioData = await adapter.getGuestFolio(pmsReservationId);
            if (folioData && folioData.length > 0) {
              // Save folio items to DB
              for (const item of folioData) {
                const normalizedItem = adapter.normalizeFolioItems ?
                  adapter.normalizeFolioItems([item])[0] : item;

                await prisma.guestFolioItem.upsert({
                  where: {
                    id: (await prisma.guestFolioItem.findFirst({
                      where: { pmsFolioId: normalizedItem.pmsFolioId, reservationId: reservation.id }
                    }))?.id || 'new'
                  },
                  update: { ...normalizedItem, lastSyncedAt: new Date() },
                  create: {
                    ...normalizedItem,
                    reservationId: reservation.id,
                    lastSyncedAt: new Date()
                  }
                });
              }

              // Generate folio PDF summary as evidence
              const folioSummary = _generateFolioSummary(reservation, folioData);
              const s3Key = `evidence/${caseNumber}/folio_${Date.now()}.json`;
              await uploadFile(s3Key, JSON.stringify(folioSummary), 'application/json');

              await prisma.evidence.create({
                data: {
                  chargebackId,
                  type: 'FOLIO',
                  fileName: `Guest_Folio_${reservation.confirmationNumber}.json`,
                  s3Key,
                  mimeType: 'application/json',
                  fileSize: JSON.stringify(folioSummary).length,
                  description: `Auto-collected guest folio from ${pmsType} PMS`,
                  extractedText: `Guest: ${reservation.guestName}, Total: $${reservation.totalAmount}, Room: ${reservation.roomNumber}`
                }
              });
              evidenceCollected++;
            }
            break;

          case 'RESERVATION_CONFIRMATION':
          case 'AUTH_SIGNATURE':
          case 'ID_SCAN':
            // Fetch documents from PMS
            documents = await adapter.getReservationDocuments(pmsReservationId);
            if (documents) {
              const matchingDocs = documents.filter(d =>
                _mapDocTypeToEvidenceType(d.type) === evidenceType
              );

              for (const doc of matchingDocs) {
                const s3Key = `evidence/${caseNumber}/${evidenceType.toLowerCase()}_${Date.now()}_${doc.fileName}`;

                if (doc.data) {
                  await uploadFile(s3Key, doc.data, doc.mimeType);
                }

                await prisma.evidence.create({
                  data: {
                    chargebackId,
                    type: evidenceType,
                    fileName: doc.fileName,
                    s3Key,
                    mimeType: doc.mimeType || 'application/pdf',
                    fileSize: doc.data ? doc.data.length : 0,
                    description: `Auto-collected ${doc.description || evidenceType} from ${pmsType} PMS`
                  }
                });
                evidenceCollected++;
              }
            }
            break;
        }
      } catch (docError) {
        logger.warn(`[EvidenceCollector] Failed to fetch ${evidenceType}:`, docError.message);
        // Continue with other evidence types
      }
    }

    // Step 4: Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId,
        eventType: 'AI',
        title: 'Auto-evidence collection complete',
        description: `${evidenceCollected} evidence items collected from ${pmsType} PMS (reservation: ${reservation.confirmationNumber})`,
        metadata: {
          pmsType,
          reservationId: reservation.id,
          confirmationNumber: reservation.confirmationNumber,
          evidenceCollected
        }
      }
    });

    // Step 5: Notify users
    if (evidenceCollected > 0) {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'MANAGER'] },
          isActive: true,
          OR: [{ propertyId }, { role: 'ADMIN' }]
        }
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'EVIDENCE_AUTO_COLLECTED',
            priority: 'MEDIUM',
            title: `Evidence Auto-Collected: ${caseNumber}`,
            message: `${evidenceCollected} evidence items fetched from ${pmsType} PMS for $${reservation.totalAmount} stay`,
            link: `/cases/${chargebackId}`,
            metadata: { caseNumber, evidenceCollected, pmsType }
          }
        });
      }
    }

    // Step 6: Trigger AI analysis with enriched data
    try {
      const { analyzeChargeback } = require('../../fraudDetection');
      await analyzeChargeback(chargebackId);
      logger.info(`[EvidenceCollector] AI analysis triggered for ${caseNumber}`);
    } catch (aiError) {
      logger.warn(`[EvidenceCollector] AI analysis failed:`, aiError.message);
    }

    const durationMs = Date.now() - startTime;
    logger.info(`[EvidenceCollector] Completed for ${caseNumber}: ${evidenceCollected} items (${durationMs}ms)`);

    return {
      status: 'completed',
      caseNumber,
      reservationConfirmation: reservation.confirmationNumber,
      evidenceCollected,
      durationMs
    };

  } catch (error) {
    logger.error(`[EvidenceCollector] Failed for ${caseNumber}:`, error.message);

    // Timeline event for failure
    await prisma.timelineEvent.create({
      data: {
        chargebackId,
        eventType: 'WARNING',
        title: 'Auto-evidence collection failed',
        description: `Error: ${error.message}`,
        metadata: { error: error.message }
      }
    });

    throw error;
  }
};

/**
 * Find the active PMS integration for a property.
 */
async function _findPmsIntegration(propertyId) {
  // Look for active PMS integrations
  const integrations = await prisma.integration.findMany({
    where: {
      status: 'active',
      syncEnabled: true,
      OR: [
        { type: { contains: 'pms' } },
        { type: { in: ['OPERA_CLOUD', 'MEWS', 'CLOUDBEDS', 'AUTOCLERK', 'opera_cloud', 'mews', 'cloudbeds', 'autoclerk'] } }
      ]
    }
  });

  // Filter by property ID in config
  return integrations.find(i =>
    i.config?.propertyId === propertyId
  ) || integrations[0] || null;
}

/**
 * Extract PMS type from integration type string.
 */
function _extractPmsType(type) {
  return type.replace(/^pms_/i, '').toUpperCase();
}

/**
 * Map PMS document types to AccuDefend evidence types.
 */
function _mapDocTypeToEvidenceType(docType) {
  const mapping = {
    'registration_card': 'AUTH_SIGNATURE',
    'registration': 'AUTH_SIGNATURE',
    'reg_card': 'AUTH_SIGNATURE',
    'signature': 'AUTH_SIGNATURE',
    'guest_signature': 'AUTH_SIGNATURE',
    'id_scan': 'ID_SCAN',
    'id_document': 'ID_SCAN',
    'identification': 'ID_SCAN',
    'passport': 'ID_SCAN',
    'drivers_license': 'ID_SCAN',
    'folio': 'FOLIO',
    'bill': 'FOLIO',
    'invoice': 'FOLIO',
    'confirmation': 'RESERVATION_CONFIRMATION',
    'booking_confirmation': 'RESERVATION_CONFIRMATION',
    'reservation': 'RESERVATION_CONFIRMATION',
    'payment_receipt': 'FOLIO',
    'receipt': 'FOLIO'
  };
  return mapping[docType?.toLowerCase()] || 'OTHER';
}

/**
 * Generate a structured folio summary from folio items.
 */
function _generateFolioSummary(reservation, folioItems) {
  const grouped = {
    room: [],
    tax: [],
    incidental: [],
    food_beverage: [],
    payment: [],
    adjustment: [],
    other: []
  };

  let totalCharges = 0;
  let totalPayments = 0;

  for (const item of folioItems) {
    const category = item.category?.toLowerCase() || 'other';
    const group = grouped[category] || grouped.other;
    group.push(item);

    const amount = parseFloat(item.amount) || 0;
    if (category === 'payment') {
      totalPayments += Math.abs(amount);
    } else {
      totalCharges += amount;
    }
  }

  return {
    reservation: {
      confirmationNumber: reservation.confirmationNumber,
      guestName: reservation.guestName,
      checkIn: reservation.checkInDate,
      checkOut: reservation.checkOutDate,
      roomNumber: reservation.roomNumber,
      roomType: reservation.roomType
    },
    summary: {
      totalCharges: totalCharges.toFixed(2),
      totalPayments: totalPayments.toFixed(2),
      balance: (totalCharges - totalPayments).toFixed(2),
      itemCount: folioItems.length
    },
    lineItems: grouped,
    generatedAt: new Date().toISOString(),
    source: 'PMS Auto-Collection'
  };
}

/**
 * Notify users when no matching reservation was found.
 */
async function _notifyNoReservationFound(chargebackId, caseNumber, propertyId) {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MANAGER'] },
      isActive: true
    }
  });

  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: 'CASE_UPDATE',
        priority: 'MEDIUM',
        title: `Manual Review Needed: ${caseNumber}`,
        message: `No matching PMS reservation found. Please manually search and attach evidence.`,
        link: `/cases/${chargebackId}`
      }
    });
  }
}
