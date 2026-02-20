/**
 * AccuDefend - Reservations Routes
 * Powered by AutoClerk PMS Emulator
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { autoclerk } = require('../services/autoclerkEmulator');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/reservations/pms/status
 * Get AutoClerk PMS connection status
 * Note: Must be defined before /:id to avoid conflict
 */
router.get('/pms/status', authenticateToken, async (req, res) => {
  try {
    const status = autoclerk.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    logger.error('PMS status error:', error);
    res.status(500).json({ error: 'Failed to get PMS status' });
  }
});

/**
 * GET /api/reservations
 * List/search reservations from AutoClerk PMS
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, confirmationNumber, guestName, guestEmail, checkIn, checkOut, cardLast4, roomNumber, status, page = 1, limit = 20 } = req.query;

    const searchParams = {};
    if (search) searchParams.globalSearch = search;
    if (confirmationNumber) searchParams.confirmationNumber = confirmationNumber;
    if (guestName) searchParams.guestName = guestName;
    if (guestEmail) searchParams.guestEmail = guestEmail;
    if (checkIn) searchParams.checkIn = checkIn;
    if (checkOut) searchParams.checkOut = checkOut;
    if (cardLast4) searchParams.cardLast4 = cardLast4;
    if (roomNumber) searchParams.roomNumber = roomNumber;
    if (status) searchParams.status = status;

    let results = autoclerk.searchReservations(searchParams);

    // Sort by check-in date descending
    results.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

    // Paginate
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const total = results.length;
    const paginated = results.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      success: true,
      reservations: paginated,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      source: 'AutoClerk PMS'
    });
  } catch (error) {
    logger.error('Reservations list error:', error);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

/**
 * GET /api/reservations/:id
 * Get full reservation detail with guest info
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const reservation = autoclerk.getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.json({
      success: true,
      reservation,
      source: 'AutoClerk PMS'
    });
  } catch (error) {
    logger.error('Reservation detail error:', error);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

/**
 * GET /api/reservations/:id/evidence
 * Fetch all available evidence for a reservation from AutoClerk
 */
router.get('/:id/evidence', authenticateToken, async (req, res) => {
  try {
    const { types } = req.query;
    const evidenceTypes = types ? types.split(',') : [];

    const result = autoclerk.fetchEvidence(req.params.id, evidenceTypes);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({
      success: true,
      ...result,
      source: 'AutoClerk PMS'
    });
  } catch (error) {
    logger.error('Reservation evidence error:', error);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

/**
 * POST /api/reservations/:id/evidence/collect
 * Collect and store evidence from AutoClerk for a case
 */
router.post('/:id/evidence/collect', authenticateToken, async (req, res) => {
  try {
    const { caseId, evidenceTypes } = req.body;

    if (!caseId) {
      return res.status(400).json({ error: 'caseId is required' });
    }

    const result = autoclerk.fetchEvidence(req.params.id, evidenceTypes || []);
    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    // Store evidence attached to the case
    const stored = autoclerk.storeEvidence(caseId, result.evidence);

    res.json({
      success: true,
      message: `Collected ${stored.length} evidence documents from AutoClerk PMS`,
      caseId,
      evidence: stored,
      source: 'AutoClerk PMS'
    });
  } catch (error) {
    logger.error('Evidence collection error:', error);
    res.status(500).json({ error: 'Failed to collect evidence' });
  }
});

module.exports = router;
