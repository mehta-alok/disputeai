/**
 * DisputeAI - Analytics Routes
 * Dashboard data and trends
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { autoclerk } = require('../services/autoclerkEmulator');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // Get evidence stats from AutoClerk emulator
    const allEvidence = autoclerk.getAllEvidence();
    const evidenceByCase = {};
    allEvidence.forEach(e => {
      if (!evidenceByCase[e.caseId]) evidenceByCase[e.caseId] = [];
      evidenceByCase[e.caseId].push(e);
    });

    res.json({
      summary: {
        totalCases: 24,
        totalAmount: 47250.00,
        winRate: 78,
        urgentCases: 3,
        recoveredAmount: 36855.00,
        trends: { cases: 12, amount: -5 },
        evidenceCollected: allEvidence.length,
        casesWithEvidence: Object.keys(evidenceByCase).length
      },
      statusBreakdown: {
        PENDING: { count: 5, amount: 12500 },
        IN_REVIEW: { count: 4, amount: 8200 },
        SUBMITTED: { count: 3, amount: 6800 },
        WON: { count: 8, amount: 15000 },
        LOST: { count: 2, amount: 3250 },
        EXPIRED: { count: 2, amount: 1500 }
      },
      recentCases: [
        { id: 'demo-1', caseNumber: 'CB-2026-0247', guestName: 'James Wilson', amount: 1250.00, status: 'PENDING', confidenceScore: 87, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
        { id: 'demo-2', caseNumber: 'CB-2026-0246', guestName: 'Sarah Chen', amount: 890.50, status: 'IN_REVIEW', confidenceScore: 72, createdAt: new Date(Date.now() - 8 * 3600000).toISOString() },
        { id: 'demo-3', caseNumber: 'CB-2026-0245', guestName: 'Michael Brown', amount: 2100.00, status: 'WON', confidenceScore: 94, createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
        { id: 'demo-4', caseNumber: 'CB-2026-0244', guestName: 'Emily Rodriguez', amount: 475.25, status: 'SUBMITTED', confidenceScore: 81, createdAt: new Date(Date.now() - 48 * 3600000).toISOString() },
        { id: 'demo-5', caseNumber: 'CB-2026-0243', guestName: 'David Thompson', amount: 3200.00, status: 'PENDING', confidenceScore: 65, createdAt: new Date(Date.now() - 72 * 3600000).toISOString() }
      ],
      pmsStatus: autoclerk.getStatus(),
      evidenceSummary: {
        total: allEvidence.length,
        byType: allEvidence.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {}),
        casesWithEvidence: Object.keys(evidenceByCase).length
      }
    });
  } catch (error) {
    logger.error('Dashboard analytics error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/trends', authenticateToken, async (req, res) => {
  res.json({
    trends: [
      { month: 'Sep 2025', cases: 7, won: 5, lost: 2, recovered: 4560 },
      { month: 'Oct 2025', cases: 6, won: 5, lost: 1, recovered: 5230 },
      { month: 'Nov 2025', cases: 8, won: 6, lost: 2, recovered: 7890 },
      { month: 'Dec 2025', cases: 9, won: 7, lost: 2, recovered: 9450 },
      { month: 'Jan 2026', cases: 12, won: 8, lost: 1, recovered: 13090 },
      { month: 'Feb 2026', cases: 5, won: 3, lost: 0, recovered: 4635 }
    ],
    period: '6m'
  });
});

module.exports = router;
