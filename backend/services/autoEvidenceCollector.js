/**
 * DisputeAI - Auto Evidence Collector
 * Demo-mode orchestrator that runs the complete evidence pipeline
 * synchronously (no BullMQ/Redis required).
 *
 * Pipeline: Match Reservation → Collect Evidence → Score Confidence → Return Results
 */

const { autoclerk } = require('./autoclerkEmulator');
const { matchReservation, linkChargebackToReservation } = require('./reservationMatcher');
const { analyzeChargeback } = require('./fraudDetection');
const { addDemoNotification } = require('../controllers/notificationsController');
const logger = require('../utils/logger');

/**
 * Run the complete auto-evidence collection pipeline for a case.
 *
 * @param {Object} caseData - Case data containing matching fields
 * @param {string} caseData.id - Case ID
 * @param {string} [caseData.confirmationNumber] - Reservation confirmation number
 * @param {string} [caseData.cardLastFour] - Card last 4 digits
 * @param {string} [caseData.guestName] - Guest name
 * @param {string} [caseData.guestEmail] - Guest email
 * @param {string} [caseData.checkInDate] - Check-in date
 * @param {string} [caseData.checkOutDate] - Check-out date
 * @param {number} [caseData.amount] - Disputed amount
 * @param {string} [caseData.caseNumber] - Case number for logging
 * @returns {Object} Pipeline results
 */
async function collectEvidenceForCase(caseData) {
  const startTime = Date.now();
  const caseId = caseData.id;
  const caseNumber = caseData.caseNumber || caseId;

  logger.info(`[AutoCollect] Starting pipeline for ${caseNumber}`);

  const result = {
    success: true,
    caseId,
    caseNumber,
    pipeline: {
      matching: { completed: false },
      evidenceCollection: { completed: false },
      analysis: { completed: false },
    },
    matched: false,
    reservation: null,
    matchConfidence: 0,
    matchStrategy: null,
    evidenceCollected: 0,
    evidenceTypes: [],
    evidence: [],
    analysis: null,
    timeline: [],
    durationMs: 0,
    isDemo: true
  };

  try {
    // ========================================================================
    // STEP 1: Match chargeback to PMS reservation
    // ========================================================================
    logger.info(`[AutoCollect] Step 1: Matching reservation for ${caseNumber}`);

    const matchResult = await matchReservation({
      confirmationNumber: caseData.confirmationNumber,
      cardLastFour: caseData.cardLastFour || caseData.cardLast4,
      guestName: caseData.guestName,
      guestEmail: caseData.guestEmail,
      checkInDate: caseData.checkInDate,
      checkOutDate: caseData.checkOutDate,
    });

    result.pipeline.matching.completed = true;

    if (matchResult) {
      result.matched = true;
      result.reservation = {
        id: matchResult.reservation.id,
        confirmationNumber: matchResult.reservation.confirmationNumber,
        guestName: matchResult.reservation.guestName,
        roomNumber: matchResult.reservation.roomNumber,
        roomType: matchResult.reservation.roomType,
        checkIn: matchResult.reservation.checkIn,
        checkOut: matchResult.reservation.checkOut,
        status: matchResult.reservation.status,
        bookingSource: matchResult.reservation.bookingSource,
        cardLast4: matchResult.reservation.cardLast4,
        loyaltyTier: matchResult.reservation.loyaltyTier,
      };
      result.matchConfidence = matchResult.confidence;
      result.matchStrategy = matchResult.strategy;
      result.pipeline.matching.strategy = matchResult.strategy;
      result.pipeline.matching.confidence = matchResult.confidence;
      result.pipeline.matching.description = matchResult.description;

      // Link the chargeback to the reservation
      await linkChargebackToReservation(caseId, matchResult.reservation.id);

      result.timeline.push({
        eventType: 'SUCCESS',
        title: 'Reservation Matched',
        description: `${matchResult.description} (${matchResult.confidence}% confidence)`,
        timestamp: new Date().toISOString()
      });

      logger.info(`[AutoCollect] Matched: ${matchResult.reservation.confirmationNumber} (${matchResult.confidence}% via ${matchResult.strategy})`);
    } else {
      result.timeline.push({
        eventType: 'WARNING',
        title: 'No Reservation Match Found',
        description: 'Could not match chargeback to any PMS reservation. Manual evidence collection may be required.',
        timestamp: new Date().toISOString()
      });
      logger.info(`[AutoCollect] No reservation match found for ${caseNumber}`);
    }

    // ========================================================================
    // STEP 2: Collect evidence from PMS
    // ========================================================================
    logger.info(`[AutoCollect] Step 2: Collecting evidence for ${caseNumber}`);

    if (result.matched) {
      const confirmNum = matchResult.reservation.confirmationNumber;

      // Check if evidence already collected for this case
      const existingEvidence = autoclerk.getCaseEvidence(caseId);
      if (existingEvidence.length > 0) {
        logger.info(`[AutoCollect] Evidence already collected for ${caseId}: ${existingEvidence.length} items`);
        result.evidenceCollected = existingEvidence.length;
        result.evidenceTypes = [...new Set(existingEvidence.map(e => e.type))];
        result.evidence = existingEvidence;
        result.pipeline.evidenceCollection.completed = true;
        result.pipeline.evidenceCollection.source = 'cache';
      } else {
        // Fetch all evidence from AutoClerk emulator
        const evidenceResult = autoclerk.fetchEvidence(confirmNum);

        if (evidenceResult.error) {
          logger.warn(`[AutoCollect] Evidence fetch error: ${evidenceResult.error}`);
          result.timeline.push({
            eventType: 'WARNING',
            title: 'Evidence Fetch Failed',
            description: `Could not fetch evidence: ${evidenceResult.error}`,
            timestamp: new Date().toISOString()
          });
        } else {
          // Store evidence attached to the case
          const stored = autoclerk.storeEvidence(caseId, evidenceResult.evidence);

          result.evidenceCollected = stored.length;
          result.evidenceTypes = stored.map(e => e.type);
          result.evidence = stored;
          result.pipeline.evidenceCollection.completed = true;
          result.pipeline.evidenceCollection.source = 'AutoClerk PMS';
          result.pipeline.evidenceCollection.count = stored.length;

          result.timeline.push({
            eventType: 'SUCCESS',
            title: 'Evidence Auto-Collected',
            description: `${stored.length} evidence documents collected from AutoClerk PMS: ${result.evidenceTypes.join(', ')}`,
            timestamp: new Date().toISOString()
          });

          logger.info(`[AutoCollect] Collected ${stored.length} evidence items for ${caseNumber}`);
        }
      }
    } else {
      result.pipeline.evidenceCollection.completed = true;
      result.pipeline.evidenceCollection.source = 'none';
      result.pipeline.evidenceCollection.count = 0;
    }

    // ========================================================================
    // STEP 3: Run fraud analysis / confidence scoring
    // ========================================================================
    logger.info(`[AutoCollect] Step 3: Analyzing confidence for ${caseNumber}`);

    const analysis = await analyzeChargeback(caseData);
    result.analysis = analysis;
    result.pipeline.analysis.completed = true;
    result.pipeline.analysis.confidenceScore = analysis.confidenceScore;
    result.pipeline.analysis.recommendation = analysis.recommendation;

    result.timeline.push({
      eventType: 'AI',
      title: 'AI Analysis Complete',
      description: `Confidence: ${analysis.confidenceScore}% | Recommendation: ${analysis.recommendation.replace(/_/g, ' ')} | Evidence completeness: ${analysis.evidenceCompleteness}%`,
      timestamp: new Date().toISOString()
    });

    // If AUTO_SUBMIT, add a special timeline event
    if (analysis.recommendation === 'AUTO_SUBMIT') {
      result.timeline.push({
        eventType: 'SUCCESS',
        title: 'Ready for Auto-Submit',
        description: `Case meets auto-submit threshold (${analysis.confidenceScore}% confidence). ${analysis.evidenceCompleteness}% evidence completeness. ${result.evidenceCollected} documents attached.`,
        timestamp: new Date().toISOString()
      });
    }

    // ========================================================================
    // STEP 4: Send notification
    // ========================================================================
    try {
      addDemoNotification({
        type: 'EVIDENCE_AUTO_COLLECTED',
        priority: analysis.recommendation === 'AUTO_SUBMIT' ? 'HIGH' : 'MEDIUM',
        title: `Evidence Auto-Collected: ${caseNumber}`,
        message: result.matched
          ? `${result.evidenceCollected} documents collected. Confidence: ${analysis.confidenceScore}% (${analysis.recommendation.replace(/_/g, ' ')})`
          : `No reservation match found. Manual evidence collection needed.`,
        link: `/cases/${caseId}`,
        metadata: { caseId, caseNumber, evidenceCollected: result.evidenceCollected, recommendation: analysis.recommendation }
      });
    } catch (notifErr) {
      logger.warn('[AutoCollect] Notification error:', notifErr.message);
    }

  } catch (error) {
    logger.error(`[AutoCollect] Pipeline error for ${caseNumber}:`, error.message);
    result.success = false;
    result.error = error.message;
    result.timeline.push({
      eventType: 'ERROR',
      title: 'Pipeline Error',
      description: `Auto-evidence collection failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }

  result.durationMs = Date.now() - startTime;
  logger.info(`[AutoCollect] Pipeline complete for ${caseNumber}: ${result.evidenceCollected} items, ${result.analysis?.confidenceScore || 0}% confidence (${result.durationMs}ms)`);

  return result;
}

module.exports = { collectEvidenceForCase };
