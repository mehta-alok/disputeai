/**
 * DisputeAI - Fraud Detection & Confidence Scoring Service
 * Rule-based scoring engine for demo mode (no AI API required).
 * Analyzes collected evidence and reservation data to calculate
 * a confidence score and recommendation for chargeback defense.
 */

const { autoclerk } = require('./autoclerkEmulator');
const logger = require('../utils/logger');

// ============================================================================
// SCORING RULES — Evidence-based point system
// ============================================================================

const SCORING_RULES = {
  // Positive evidence factors (increase confidence)
  VALID_ID_SCAN:        { points: 15, type: 'positive', label: 'Valid Government ID on File',        description: 'Guest presented a valid government-issued photo ID at check-in' },
  SIGNED_REGISTRATION:  { points: 15, type: 'positive', label: 'Signed Registration Card',           description: 'Guest signed the registration card with terms acknowledgment' },
  PAYMENT_RECEIPT:      { points: 10, type: 'positive', label: 'Payment Authorization Proof',        description: 'Credit card authorization and payment receipt on file' },
  GUEST_FOLIO:          { points: 10, type: 'positive', label: 'Guest Folio — Balance Settled',      description: 'Complete guest folio showing all charges and zero balance' },
  AUDIT_TRAIL:          { points: 10, type: 'positive', label: 'Audit Trail Confirms Stay',          description: 'System audit trail shows booking through checkout activity' },
  RESERVATION_CONFIRM:  { points: 10, type: 'positive', label: 'Reservation Confirmation',           description: 'Original reservation with terms acceptance timestamp' },
  GUEST_SIGNATURE:      { points: 8,  type: 'positive', label: 'Digital Signature Verified',         description: 'Digital signature captured on tablet at check-in' },
  KEY_CARD_ACCESS:      { points: 8,  type: 'positive', label: 'Key Card Access Logs',               description: 'Room key card access logs confirm guest presence' },
  LOYALTY_MEMBER:       { points: 5,  type: 'positive', label: 'Loyalty Program Member',             description: 'Guest is an active loyalty program member' },
  RETURN_GUEST:         { points: 5,  type: 'positive', label: 'Return Guest',                       description: 'Guest has stayed at the property before' },
  DIRECT_BOOKING:       { points: 5,  type: 'positive', label: 'Direct Booking',                     description: 'Reservation was booked directly (not OTA)' },
  FULL_STAY:            { points: 5,  type: 'positive', label: 'Full Stay Completed',                description: 'Guest completed all booked nights' },
  CHIP_TRANSACTION:     { points: 5,  type: 'positive', label: 'EMV Chip Transaction',               description: 'Payment processed via EMV chip (no liability shift)' },
  MATCHING_ADDRESS:     { points: 3,  type: 'positive', label: 'Address Matches Card',               description: 'Guest address on file matches billing address' },
  WIFI_CONNECTED:       { points: 2,  type: 'positive', label: 'WiFi Connection Logged',             description: 'Guest device connected to hotel WiFi during stay' },

  // Negative factors (decrease confidence)
  NO_ID_SCAN:           { points: -15, type: 'negative', label: 'No ID Scan on File',                description: 'No government-issued photo ID was collected at check-in' },
  NO_SIGNATURE:         { points: -15, type: 'negative', label: 'No Registration Signature',         description: 'No signed registration card on file' },
  SWIPED_NOT_CHIP:      { points: -10, type: 'negative', label: 'Magnetic Stripe Used',              description: 'Card was swiped (not chip) — EMV liability shift to merchant' },
  HIGH_AMOUNT:          { points: -8,  type: 'negative', label: 'High Transaction Amount',           description: 'Transaction amount exceeds typical threshold (>$2,000)' },
  FIRST_TIME_GUEST:     { points: -5,  type: 'negative', label: 'First-Time Guest',                  description: 'No prior stay history at this property' },
  MISMATCH_ADDRESS:     { points: -5,  type: 'negative', label: 'Address Mismatch',                  description: 'Guest address does not match card billing address' },
  EARLY_CHECKOUT:       { points: -5,  type: 'negative', label: 'Early Checkout',                    description: 'Guest checked out before the scheduled date' },
  DISPUTED_BEFORE:      { points: -8,  type: 'negative', label: 'Previous Dispute History',          description: 'Cardholder has filed disputes before' },
  OTA_BOOKING:          { points: -3,  type: 'negative', label: 'OTA Booking',                       description: 'Reservation was booked via OTA (less direct evidence)' },
  NO_RESERVATION_MATCH: { points: -20, type: 'negative', label: 'No Reservation Match Found',        description: 'Could not match chargeback to any PMS reservation' },
};

// Base score (start here, add/subtract)
const BASE_SCORE = 50;

// Recommendation thresholds
const THRESHOLDS = {
  AUTO_SUBMIT: 85,
  REVIEW: 70,
  GATHER_MORE_EVIDENCE: 50,
  // Below 50 → UNLIKELY_TO_WIN
};

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze a chargeback case and produce a confidence score.
 * Works entirely in demo mode using AutoClerk emulator data.
 *
 * @param {string|Object} caseIdOrData - Case ID (matches demo case) or case data object
 * @returns {Object} Analysis result
 */
async function analyzeChargeback(caseIdOrData) {
  try {
    let caseData;

    if (typeof caseIdOrData === 'string') {
      // Look up from demo case data
      caseData = _getDemoCaseData(caseIdOrData);
      if (!caseData) {
        logger.warn(`analyzeChargeback: no demo case found for ${caseIdOrData}`);
        return _fallbackAnalysis(caseIdOrData);
      }
    } else {
      caseData = caseIdOrData;
    }

    // Get evidence collected for this case
    const caseId = caseData.id || caseIdOrData;
    const evidence = autoclerk.getCaseEvidence(caseId);
    const evidenceTypes = evidence.map(e => e.type);

    // Get reservation match if available
    let reservation = null;
    if (caseData.confirmationNumber) {
      const res = autoclerk.getReservation(caseData.confirmationNumber);
      if (res) reservation = res;
    }

    // Calculate score
    const { score, positiveSignals, negativeSignals, appliedRules } = _calculateScore(
      caseData,
      evidence,
      evidenceTypes,
      reservation
    );

    // Clamp to 0-100
    const confidenceScore = Math.max(0, Math.min(100, score));

    // Determine recommendation
    let recommendation;
    if (confidenceScore >= THRESHOLDS.AUTO_SUBMIT) {
      recommendation = 'AUTO_SUBMIT';
    } else if (confidenceScore >= THRESHOLDS.REVIEW) {
      recommendation = 'REVIEW_RECOMMENDED';
    } else if (confidenceScore >= THRESHOLDS.GATHER_MORE_EVIDENCE) {
      recommendation = 'GATHER_MORE_EVIDENCE';
    } else {
      recommendation = 'UNLIKELY_TO_WIN';
    }

    // Determine missing evidence
    const allEvidenceTypes = ['folio', 'registration_card', 'payment_receipt', 'guest_signature', 'id_scan', 'reservation', 'audit_trail'];
    const missingEvidence = allEvidenceTypes.filter(t => !evidenceTypes.includes(t));

    // Generate strategy
    const strategy = _generateStrategy(caseData, recommendation, positiveSignals, negativeSignals, missingEvidence);

    const result = {
      confidenceScore,
      recommendation,
      fraudIndicators: {
        positive: positiveSignals.map(s => s.label),
        negative: negativeSignals.map(s => s.label),
        positiveSignals: positiveSignals.map(s => ({ ...SCORING_RULES[s.rule], rule: s.rule })),
        negativeSignals: negativeSignals.map(s => ({ ...SCORING_RULES[s.rule], rule: s.rule })),
      },
      missingEvidence,
      evidenceCompleteness: Math.min(100, Math.round((evidenceTypes.length / 7) * 100)),
      strategy,
      reasoning: _generateReasoning(confidenceScore, recommendation, positiveSignals, negativeSignals, caseData),
      appliedRules,
      analyzedAt: new Date().toISOString(),
      isDemo: true
    };

    logger.info(`Fraud analysis for ${caseId}: score=${confidenceScore}, rec=${recommendation}, evidence=${evidenceTypes.length}/7`);

    return result;

  } catch (error) {
    logger.warn('analyzeChargeback error:', error.message);
    return _fallbackAnalysis(typeof caseIdOrData === 'string' ? caseIdOrData : 'unknown');
  }
}

/**
 * Legacy API — analyze fraud from raw data.
 */
async function analyzeFraud(data) {
  const result = await analyzeChargeback(data);
  return {
    score: result.confidenceScore,
    indicators: [
      ...result.fraudIndicators.positive.map(label => ({ type: 'positive', label })),
      ...result.fraudIndicators.negative.map(label => ({ type: 'negative', label })),
    ],
    recommendation: result.recommendation
  };
}

/**
 * Get all available fraud indicator definitions.
 */
async function getFraudIndicators() {
  return Object.entries(SCORING_RULES).map(([key, rule]) => ({
    id: key,
    ...rule
  }));
}

// ============================================================================
// SCORING ENGINE
// ============================================================================

function _calculateScore(caseData, evidence, evidenceTypes, reservation) {
  let score = BASE_SCORE;
  const positiveSignals = [];
  const negativeSignals = [];
  const appliedRules = [];

  // Extract case-level fraud indicator flags (set before evidence collection)
  const caseNegFlags = (caseData.fraudIndicators?.negative || []);
  const casePosFlags = (caseData.fraudIndicators?.positive || []);

  // --- POSITIVE: Evidence-based scoring ---
  // Note: Case-level negative flags override evidence presence
  // (e.g., if case says NO_ID_SCAN, don't credit evidence even if AutoClerk generates it)

  if (evidenceTypes.includes('id_scan') && !caseNegFlags.includes('NO_ID_SCAN')) {
    _applyRule('VALID_ID_SCAN', score, positiveSignals, appliedRules);
    score += SCORING_RULES.VALID_ID_SCAN.points;
  }

  if (evidenceTypes.includes('registration_card') && !caseNegFlags.includes('NO_SIGNATURE')) {
    _applyRule('SIGNED_REGISTRATION', score, positiveSignals, appliedRules);
    score += SCORING_RULES.SIGNED_REGISTRATION.points;
  }

  if (evidenceTypes.includes('payment_receipt')) {
    _applyRule('PAYMENT_RECEIPT', score, positiveSignals, appliedRules);
    score += SCORING_RULES.PAYMENT_RECEIPT.points;
  }

  if (evidenceTypes.includes('folio')) {
    _applyRule('GUEST_FOLIO', score, positiveSignals, appliedRules);
    score += SCORING_RULES.GUEST_FOLIO.points;
  }

  if (evidenceTypes.includes('audit_trail')) {
    _applyRule('AUDIT_TRAIL', score, positiveSignals, appliedRules);
    score += SCORING_RULES.AUDIT_TRAIL.points;
  }

  if (evidenceTypes.includes('reservation')) {
    _applyRule('RESERVATION_CONFIRM', score, positiveSignals, appliedRules);
    score += SCORING_RULES.RESERVATION_CONFIRM.points;
  }

  if (evidenceTypes.includes('guest_signature') && !caseNegFlags.includes('NO_SIGNATURE')) {
    _applyRule('GUEST_SIGNATURE', score, positiveSignals, appliedRules);
    score += SCORING_RULES.GUEST_SIGNATURE.points;
  }

  // --- POSITIVE: Reservation-based scoring ---

  if (reservation) {
    // Key card access (audit trail includes key card data)
    if (evidenceTypes.includes('audit_trail')) {
      _applyRule('KEY_CARD_ACCESS', score, positiveSignals, appliedRules);
      score += SCORING_RULES.KEY_CARD_ACCESS.points;
    }

    // Loyalty member
    if (reservation.loyaltyNumber || reservation.loyaltyTier) {
      if (reservation.loyaltyTier && reservation.loyaltyTier !== 'Member') {
        _applyRule('LOYALTY_MEMBER', score, positiveSignals, appliedRules);
        score += SCORING_RULES.LOYALTY_MEMBER.points;
      }
    }

    // Direct booking
    const directSources = ['Direct Website', 'Phone Reservation', 'Loyalty Portal', 'Corporate Portal', 'Walk-In'];
    if (directSources.includes(reservation.bookingSource)) {
      _applyRule('DIRECT_BOOKING', score, positiveSignals, appliedRules);
      score += SCORING_RULES.DIRECT_BOOKING.points;
    }

    // Full stay completed
    if (reservation.status === 'checked_out') {
      _applyRule('FULL_STAY', score, positiveSignals, appliedRules);
      score += SCORING_RULES.FULL_STAY.points;
    }

    // Address matching (assume match if ID is on file)
    if (evidenceTypes.includes('id_scan')) {
      _applyRule('MATCHING_ADDRESS', score, positiveSignals, appliedRules);
      score += SCORING_RULES.MATCHING_ADDRESS.points;
    }

    // WiFi (audit trail shows WiFi connection)
    if (evidenceTypes.includes('audit_trail')) {
      _applyRule('WIFI_CONNECTED', score, positiveSignals, appliedRules);
      score += SCORING_RULES.WIFI_CONNECTED.points;
    }

    // EMV chip (assume chip unless caseData says otherwise)
    const fraudIndicators = caseData.fraudIndicators || {};
    const negativeFlags = fraudIndicators.negative || [];
    if (!negativeFlags.includes('SWIPED_NOT_CHIP')) {
      _applyRule('CHIP_TRANSACTION', score, positiveSignals, appliedRules);
      score += SCORING_RULES.CHIP_TRANSACTION.points;
    }
  }

  // --- NEGATIVE: Missing evidence penalties ---

  if (!evidenceTypes.includes('id_scan') && evidence.length > 0) {
    // Only penalize if we tried to collect but don't have ID
    _applyRule('NO_ID_SCAN', score, negativeSignals, appliedRules);
    score += SCORING_RULES.NO_ID_SCAN.points;
  }

  if (!evidenceTypes.includes('registration_card') && !evidenceTypes.includes('guest_signature') && evidence.length > 0) {
    _applyRule('NO_SIGNATURE', score, negativeSignals, appliedRules);
    score += SCORING_RULES.NO_SIGNATURE.points;
  }

  // --- NEGATIVE: Case-based penalties ---

  const amount = parseFloat(caseData.amount) || 0;
  if (amount > 2000) {
    _applyRule('HIGH_AMOUNT', score, negativeSignals, appliedRules);
    score += SCORING_RULES.HIGH_AMOUNT.points;
  }

  // First-time guest check
  const fraudIndicators = caseData.fraudIndicators || {};
  const positiveFlags = fraudIndicators.positive || [];
  const negativeFlags = fraudIndicators.negative || [];

  if (negativeFlags.includes('FIRST_TIME_GUEST') || (!positiveFlags.includes('RETURN_GUEST') && !positiveFlags.includes('LOYALTY_MEMBER'))) {
    if (!reservation || !reservation.loyaltyNumber) {
      _applyRule('FIRST_TIME_GUEST', score, negativeSignals, appliedRules);
      score += SCORING_RULES.FIRST_TIME_GUEST.points;
    }
  }

  // Swiped not chip
  if (negativeFlags.includes('SWIPED_NOT_CHIP')) {
    _applyRule('SWIPED_NOT_CHIP', score, negativeSignals, appliedRules);
    score += SCORING_RULES.SWIPED_NOT_CHIP.points;
  }

  // Early checkout
  if (negativeFlags.includes('EARLY_CHECKOUT')) {
    _applyRule('EARLY_CHECKOUT', score, negativeSignals, appliedRules);
    score += SCORING_RULES.EARLY_CHECKOUT.points;
  }

  // Address mismatch
  if (negativeFlags.includes('MISMATCH_ADDRESS')) {
    _applyRule('MISMATCH_ADDRESS', score, negativeSignals, appliedRules);
    score += SCORING_RULES.MISMATCH_ADDRESS.points;
  }

  // Previous dispute history
  if (negativeFlags.includes('DISPUTED_BEFORE')) {
    _applyRule('DISPUTED_BEFORE', score, negativeSignals, appliedRules);
    score += SCORING_RULES.DISPUTED_BEFORE.points;
  }

  // OTA booking
  if (reservation) {
    const otaSources = ['Booking.com', 'Expedia', 'Hotels.com', 'Priceline', 'Agoda', 'Airbnb'];
    if (otaSources.includes(reservation.bookingSource)) {
      _applyRule('OTA_BOOKING', score, negativeSignals, appliedRules);
      score += SCORING_RULES.OTA_BOOKING.points;
    }
  }

  // No reservation match
  if (!reservation && evidence.length === 0) {
    _applyRule('NO_RESERVATION_MATCH', score, negativeSignals, appliedRules);
    score += SCORING_RULES.NO_RESERVATION_MATCH.points;
  }

  return { score, positiveSignals, negativeSignals, appliedRules };
}

function _applyRule(ruleName, currentScore, signals, appliedRules) {
  const rule = SCORING_RULES[ruleName];
  if (!rule) return;

  signals.push({ rule: ruleName, label: rule.label, points: rule.points });
  appliedRules.push({ rule: ruleName, label: rule.label, points: rule.points, type: rule.type });
}

// ============================================================================
// STRATEGY & REASONING GENERATION
// ============================================================================

function _generateStrategy(caseData, recommendation, positiveSignals, negativeSignals, missingEvidence) {
  const strategies = {
    AUTO_SUBMIT: `Strong evidence supports automatic submission. ${positiveSignals.length} positive indicators confirm guest identity and authorized stay. Submit with full evidence package including ID verification, signed registration, and folio.`,
    REVIEW_RECOMMENDED: `Good evidence but some gaps exist. Review ${missingEvidence.length > 0 ? `missing evidence (${missingEvidence.join(', ')})` : 'negative indicators'} before submitting. Consider collecting additional documentation.`,
    GATHER_MORE_EVIDENCE: `Insufficient evidence for confident submission. ${missingEvidence.length} evidence types missing. Prioritize collecting: ${missingEvidence.slice(0, 3).join(', ')}. ${negativeSignals.length} risk factors identified.`,
    UNLIKELY_TO_WIN: `Weak evidence and significant risk factors (${negativeSignals.length} negative indicators). ${missingEvidence.length} critical evidence types missing. Consider accepting the chargeback loss unless additional evidence can be obtained.`
  };

  return strategies[recommendation] || strategies.REVIEW_RECOMMENDED;
}

function _generateReasoning(confidenceScore, recommendation, positiveSignals, negativeSignals, caseData) {
  const parts = [];

  parts.push(`Confidence score: ${confidenceScore}% (${recommendation.replace(/_/g, ' ').toLowerCase()}).`);

  if (positiveSignals.length > 0) {
    parts.push(`Positive factors (${positiveSignals.length}): ${positiveSignals.map(s => s.label).join('; ')}.`);
  }

  if (negativeSignals.length > 0) {
    parts.push(`Risk factors (${negativeSignals.length}): ${negativeSignals.map(s => s.label).join('; ')}.`);
  }

  const amount = parseFloat(caseData.amount) || 0;
  if (amount > 0) {
    parts.push(`Disputed amount: $${amount.toFixed(2)}.`);
  }

  if (caseData.reasonCode) {
    parts.push(`Reason code: ${caseData.reasonCode}${caseData.reasonDescription ? ` (${caseData.reasonDescription})` : ''}.`);
  }

  return parts.join(' ');
}

// ============================================================================
// DEMO CASE DATA LOOKUP
// ============================================================================

function _getDemoCaseData(caseId) {
  const demoCases = {
    'demo-1': { id: 'demo-1', confirmationNumber: 'RES-2026-88421', guestName: 'James Wilson', amount: 1250.00, cardLastFour: '2345', cardBrand: 'VISA', reasonCode: '10.4', reasonDescription: 'Other Fraud - Card Absent Environment', fraudIndicators: { positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'CHIP_TRANSACTION', 'LOYALTY_MEMBER'], negative: ['FIRST_TIME_GUEST', 'HIGH_AMOUNT'] } },
    'demo-2': { id: 'demo-2', confirmationNumber: 'RES-2026-77530', guestName: 'Sarah Chen', amount: 890.50, cardLastFour: '6789', cardBrand: 'MASTERCARD', reasonCode: '13.1', reasonDescription: 'Merchandise/Services Not Received', fraudIndicators: { positive: ['VALID_ID_SCAN', 'KEY_CARD_USED'], negative: ['NO_SIGNATURE', 'EARLY_CHECKOUT'] } },
    'demo-3': { id: 'demo-3', confirmationNumber: 'RES-2026-66201', guestName: 'Michael Brown', amount: 2100.00, cardLastFour: '1234', cardBrand: 'VISA', reasonCode: '10.4', fraudIndicators: { positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'CHIP_TRANSACTION', 'LOYALTY_MEMBER', 'RETURN_GUEST'], negative: [] } },
    'demo-4': { id: 'demo-4', confirmationNumber: 'RES-2026-55123', guestName: 'Emily Rodriguez', amount: 475.25, cardLastFour: '6677', cardBrand: 'MASTERCARD', reasonCode: '4837', fraudIndicators: { positive: ['VALID_ID_SCAN', 'CHIP_TRANSACTION', 'MATCHING_ADDRESS'], negative: ['DISPUTED_BEFORE'] } },
    'demo-5': { id: 'demo-5', confirmationNumber: 'RES-2026-44890', guestName: 'David Thompson', amount: 3200.00, cardLastFour: '9012', cardBrand: 'AMEX', reasonCode: '10.4', fraudIndicators: { positive: ['LOYALTY_MEMBER'], negative: ['NO_ID_SCAN', 'MISMATCH_ADDRESS', 'HIGH_AMOUNT'] } },
    'demo-6': { id: 'demo-6', confirmationNumber: 'RES-2026-33678', guestName: 'Lisa Anderson', amount: 1875.00, cardLastFour: '3456', cardBrand: 'VISA', reasonCode: '13.6', fraudIndicators: { positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'RETURN_GUEST', 'CHIP_TRANSACTION'], negative: [] } },
    'demo-7': { id: 'demo-7', confirmationNumber: 'RES-2026-22456', guestName: 'Robert Kim', amount: 560.75, cardLastFour: '5678', cardBrand: 'DISCOVER', reasonCode: '10.1', fraudIndicators: { positive: [], negative: ['NO_ID_SCAN', 'NO_SIGNATURE', 'SWIPED_NOT_CHIP', 'FIRST_TIME_GUEST'] } },
    'demo-8': { id: 'demo-8', confirmationNumber: 'RES-2026-11234', guestName: 'Jennifer Lee', amount: 1450.00, cardLastFour: '2345', cardBrand: 'MASTERCARD', reasonCode: '4853', fraudIndicators: { positive: ['VALID_ID_SCAN', 'KEY_CARD_USED', 'MATCHING_ADDRESS'], negative: ['COMPLAINT_FILED'] } },
    'demo-9': { id: 'demo-9', confirmationNumber: 'RES-2026-10987', guestName: 'Patricia Moore', amount: 1820.00, cardLastFour: '7890', cardBrand: 'VISA', reasonCode: '13.1', fraudIndicators: { positive: ['MATCHING_ADDRESS'], negative: ['NO_ID_SCAN', 'EARLY_CHECKOUT', 'NO_SIGNATURE'] } },
  };

  return demoCases[caseId] || null;
}

function _fallbackAnalysis(caseId) {
  const score = Math.floor(Math.random() * 30) + 55; // 55-85
  return {
    confidenceScore: score,
    recommendation: score >= 85 ? 'AUTO_SUBMIT' : score >= 70 ? 'REVIEW_RECOMMENDED' : 'GATHER_MORE_EVIDENCE',
    fraudIndicators: {
      positive: ['Guest folio available'],
      negative: ['Limited evidence collected'],
      positiveSignals: [],
      negativeSignals: [],
    },
    missingEvidence: ['id_scan', 'registration_card', 'guest_signature'],
    evidenceCompleteness: 30,
    strategy: 'Additional evidence needed. Recommend collecting guest ID and signed registration card.',
    reasoning: `Confidence score: ${score}%. Limited evidence available for analysis.`,
    appliedRules: [],
    analyzedAt: new Date().toISOString(),
    isDemo: true
  };
}

module.exports = {
  analyzeChargeback,
  analyzeFraud,
  getFraudIndicators
};
