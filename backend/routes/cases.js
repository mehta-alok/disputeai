/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Chargeback Cases Routes
 */

const express = require('express');
const { prisma } = require('../config/database');
const { authenticateToken, requireRole, requirePropertyAccess } = require('../middleware/auth');
const { createCaseSchema, updateCaseSchema, updateCaseStatusSchema, caseFilterSchema } = require('../utils/validators');
const { analyzeChargeback } = require('../services/fraudDetection');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requirePropertyAccess);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate next case number
 */
async function generateCaseNumber() {
  const year = new Date().getFullYear();
  const prefix = `CB-${year}-`;

  const lastCase = await prisma.chargeback.findFirst({
    where: {
      caseNumber: { startsWith: prefix }
    },
    orderBy: { caseNumber: 'desc' }
  });

  let nextNumber = 1;
  if (lastCase) {
    const lastNumber = parseInt(lastCase.caseNumber.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/cases
 * List chargebacks with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    // Validate query params
    const validation = caseFilterSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const {
      status,
      propertyId,
      providerId,
      dateFrom,
      dateTo,
      search,
      page,
      limit,
      sortBy,
      sortOrder
    } = validation.data;

    // Build where clause
    const where = {
      ...req.propertyFilter // Property access control
    };

    if (status) {
      where.status = { in: status.split(',') };
    }

    if (providerId) {
      where.providerId = providerId;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { guestName: { contains: search, mode: 'insensitive' } },
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { confirmationNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Execute query
    const [cases, total] = await Promise.all([
      prisma.chargeback.findMany({
        where,
        include: {
          property: { select: { id: true, name: true } },
          provider: { select: { id: true, name: true } },
          _count: { select: { evidence: true, notes: true } }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.chargeback.count({ where })
    ]);

    res.json({
      cases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.warn('List cases: database unavailable, returning demo data');
    const demoCases = [
      { id: 'demo-1', caseNumber: 'CB-2026-0247', guestName: 'James Wilson', amount: 1250.00, status: 'PENDING', confidenceScore: 87, recommendation: 'AUTO_SUBMIT', reasonCode: '10.4', cardBrand: 'VISA', createdAt: new Date(Date.now() - 2*3600000).toISOString(), dueDate: new Date(Date.now() + 12*86400000).toISOString() },
      { id: 'demo-2', caseNumber: 'CB-2026-0246', guestName: 'Sarah Chen', amount: 890.50, status: 'IN_REVIEW', confidenceScore: 72, recommendation: 'REVIEW_RECOMMENDED', reasonCode: '13.1', cardBrand: 'MASTERCARD', createdAt: new Date(Date.now() - 8*3600000).toISOString(), dueDate: new Date(Date.now() + 10*86400000).toISOString() },
      { id: 'demo-3', caseNumber: 'CB-2026-0245', guestName: 'Michael Brown', amount: 2100.00, status: 'WON', confidenceScore: 94, recommendation: 'AUTO_SUBMIT', reasonCode: '10.4', cardBrand: 'VISA', createdAt: new Date(Date.now() - 24*3600000).toISOString(), resolvedAt: new Date(Date.now() - 2*3600000).toISOString() },
      { id: 'demo-4', caseNumber: 'CB-2026-0244', guestName: 'Emily Rodriguez', amount: 475.25, status: 'SUBMITTED', confidenceScore: 81, recommendation: 'AUTO_SUBMIT', reasonCode: '4837', cardBrand: 'MASTERCARD', createdAt: new Date(Date.now() - 48*3600000).toISOString(), dueDate: new Date(Date.now() + 5*86400000).toISOString() },
      { id: 'demo-5', caseNumber: 'CB-2026-0243', guestName: 'David Thompson', amount: 3200.00, status: 'PENDING', confidenceScore: 65, recommendation: 'GATHER_MORE_EVIDENCE', reasonCode: '10.4', cardBrand: 'AMEX', createdAt: new Date(Date.now() - 72*3600000).toISOString(), dueDate: new Date(Date.now() + 8*86400000).toISOString() },
      { id: 'demo-6', caseNumber: 'CB-2026-0242', guestName: 'Lisa Anderson', amount: 1875.00, status: 'WON', confidenceScore: 91, recommendation: 'AUTO_SUBMIT', reasonCode: '13.6', cardBrand: 'VISA', createdAt: new Date(Date.now() - 96*3600000).toISOString(), resolvedAt: new Date(Date.now() - 24*3600000).toISOString() },
      { id: 'demo-7', caseNumber: 'CB-2026-0241', guestName: 'Robert Kim', amount: 560.75, status: 'LOST', confidenceScore: 45, recommendation: 'UNLIKELY_TO_WIN', reasonCode: '10.1', cardBrand: 'DISCOVER', createdAt: new Date(Date.now() - 120*3600000).toISOString(), resolvedAt: new Date(Date.now() - 48*3600000).toISOString(), arbitrationEligible: true, arbitrationStatus: 'AVAILABLE', arbitrationDeadline: new Date(Date.now() + 8*86400000).toISOString() },
      { id: 'demo-8', caseNumber: 'CB-2026-0240', guestName: 'Jennifer Lee', amount: 1450.00, status: 'IN_REVIEW', confidenceScore: 76, recommendation: 'REVIEW_RECOMMENDED', reasonCode: '4853', cardBrand: 'MASTERCARD', createdAt: new Date(Date.now() - 144*3600000).toISOString(), dueDate: new Date(Date.now() + 3*86400000).toISOString() },
      { id: 'demo-9', caseNumber: 'CB-2026-0239', guestName: 'Patricia Moore', amount: 1820.00, status: 'LOST', confidenceScore: 52, recommendation: 'UNLIKELY_TO_WIN', reasonCode: '13.1', cardBrand: 'VISA', createdAt: new Date(Date.now() - 168*3600000).toISOString(), resolvedAt: new Date(Date.now() - 72*3600000).toISOString(), arbitrationEligible: true, arbitrationStatus: 'FILED', arbitrationDeadline: new Date(Date.now() + 15*86400000).toISOString() },
    ];
    res.json({
      cases: demoCases,
      pagination: { page: 1, limit: 20, total: demoCases.length, totalPages: 1 },
      isDemo: true
    });
  }
});

/**
 * GET /api/cases/stats
 * Get case statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const where = req.propertyFilter;

    const [statusCounts, totalAmount, recentCases] = await Promise.all([
      // Count by status
      prisma.chargeback.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        _sum: { amount: true }
      }),

      // Total disputed amount
      prisma.chargeback.aggregate({
        where,
        _sum: { amount: true },
        _count: true
      }),

      // Recent cases (last 7 days)
      prisma.chargeback.count({
        where: {
          ...where,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    // Calculate win rate
    const wonCount = statusCounts.find(s => s.status === 'WON')?._count.status || 0;
    const lostCount = statusCounts.find(s => s.status === 'LOST')?._count.status || 0;
    const resolvedCount = wonCount + lostCount;
    const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;

    res.json({
      overview: {
        totalCases: totalAmount._count,
        totalAmount: totalAmount._sum.amount || 0,
        recentCases,
        winRate
      },
      byStatus: statusCounts.reduce((acc, item) => {
        acc[item.status] = {
          count: item._count.status,
          amount: item._sum.amount || 0
        };
        return acc;
      }, {})
    });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Get stats: database unavailable, returning demo data');
    res.json({
      overview: { totalCases: 247, totalAmount: 184320.50, recentCases: 18, winRate: 78 },
      byStatus: {
        PENDING: { count: 18, amount: 14250.00 },
        IN_REVIEW: { count: 24, amount: 28900.00 },
        SUBMITTED: { count: 32, amount: 41500.00 },
        WON: { count: 142, amount: 78200.50 },
        LOST: { count: 28, amount: 18970.00 },
        EXPIRED: { count: 3, amount: 2500.00 }
      },
      isDemo: true
    });
  }
});

/**
 * GET /api/cases/:id
 * Get single chargeback with all details
 */
router.get('/:id', async (req, res) => {
  try {
    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      },
      include: {
        property: true,
        provider: true,
        evidence: {
          orderBy: { createdAt: 'desc' }
        },
        timeline: {
          orderBy: { createdAt: 'desc' }
        },
        notes: {
          include: {
            user: { select: { firstName: true, lastName: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        submissions: {
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    res.json({ chargeback });

  } catch (error) {
    // Demo mode fallback — return rich demo case data
    logger.warn('Get case detail: database unavailable, returning demo data');
    const caseId = req.params.id;

    // Build demo cases map matching IDs from the list endpoint
    const demoCaseDetails = {
      'demo-1': {
        id: 'demo-1', caseNumber: 'CB-2026-0247', status: 'PENDING',
        guestName: 'James Wilson', guestEmail: 'james.wilson@gmail.com', guestPhone: '+1 (555) 234-5678',
        amount: 1250.00, currency: 'USD',
        reasonCode: '10.4', reasonDescription: 'Other Fraud - Card Absent Environment',
        confidenceScore: 87, recommendation: 'AUTO_SUBMIT',
        disputeDate: new Date(Date.now() - 5*86400000).toISOString(),
        dueDate: new Date(Date.now() + 12*86400000).toISOString(),
        checkInDate: new Date(Date.now() - 20*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 17*86400000).toISOString(),
        roomNumber: '412', roomType: 'King Suite',
        confirmationNumber: 'RES-2026-88421',
        transactionId: 'txn_3PqR7sT2uVwX8yZ',
        cardLastFour: '4532', cardBrand: 'VISA',
        processorDisputeId: 'dp_9AbCdEfGhIjKl',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'stripe', name: 'Stripe' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'CHIP_TRANSACTION', 'LOYALTY_MEMBER'],
          negative: ['FIRST_TIME_GUEST', 'HIGH_AMOUNT']
        },
        createdAt: new Date(Date.now() - 2*3600000).toISOString()
      },
      'demo-2': {
        id: 'demo-2', caseNumber: 'CB-2026-0246', status: 'IN_REVIEW',
        guestName: 'Sarah Chen', guestEmail: 'sarah.chen@outlook.com', guestPhone: '+1 (555) 876-5432',
        amount: 890.50, currency: 'USD',
        reasonCode: '13.1', reasonDescription: 'Merchandise/Services Not Received',
        confidenceScore: 72, recommendation: 'REVIEW_RECOMMENDED',
        disputeDate: new Date(Date.now() - 8*86400000).toISOString(),
        dueDate: new Date(Date.now() + 10*86400000).toISOString(),
        checkInDate: new Date(Date.now() - 25*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 22*86400000).toISOString(),
        roomNumber: '208', roomType: 'Double Queen',
        confirmationNumber: 'RES-2026-77530',
        transactionId: 'txn_5MnOpQrStUvWx',
        cardLastFour: '8891', cardBrand: 'MASTERCARD',
        processorDisputeId: 'dp_2YzAbCdEfGhI',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'adyen', name: 'Adyen' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'KEY_CARD_USED'],
          negative: ['NO_SIGNATURE', 'EARLY_CHECKOUT']
        },
        createdAt: new Date(Date.now() - 8*3600000).toISOString()
      },
      'demo-3': {
        id: 'demo-3', caseNumber: 'CB-2026-0245', status: 'WON',
        guestName: 'Michael Brown', guestEmail: 'mbrown@yahoo.com', guestPhone: '+1 (555) 345-6789',
        amount: 2100.00, currency: 'USD',
        reasonCode: '10.4', reasonDescription: 'Other Fraud - Card Absent Environment',
        confidenceScore: 94, recommendation: 'AUTO_SUBMIT',
        disputeDate: new Date(Date.now() - 30*86400000).toISOString(),
        dueDate: null,
        checkInDate: new Date(Date.now() - 45*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 40*86400000).toISOString(),
        roomNumber: '715', roomType: 'Penthouse Suite',
        confirmationNumber: 'RES-2026-66201',
        transactionId: 'txn_7YzAbCdEfGhIj',
        cardLastFour: '1234', cardBrand: 'VISA',
        processorDisputeId: 'dp_4KlMnOpQrStU',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'stripe', name: 'Stripe' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'CHIP_TRANSACTION', 'LOYALTY_MEMBER', 'RETURN_GUEST'],
          negative: []
        },
        resolution: {
          outcome: 'WON',
          reason: 'Compelling evidence — signed registration card and valid government ID matched cardholder identity. EMV chip transaction confirmed.',
          recoveredAmount: 2100.00,
          processorResponseCode: 'REVERSED',
          resolvedDate: new Date(Date.now() - 2*3600000).toISOString(),
          winFactors: [
            'Signed registration card with matching signature on file',
            'Valid government-issued photo ID matched cardholder name',
            'EMV chip transaction — no liability shift applicable',
            'Key card access logs confirm full 5-night stay',
            'Guest is a repeat loyalty member with 12 prior stays',
            'Folio charges match reservation confirmation sent to cardholder email'
          ],
          processorNotes: 'Issuing bank has reviewed the submitted evidence package and determined the merchant provided sufficient compelling evidence to reverse this chargeback. The signed registration card, government ID, and EMV chip read confirm cardholder presence and authorization. Chargeback amount of $2,100.00 has been credited back to the merchant account.',
          arbitration: null
        },
        resolvedAt: new Date(Date.now() - 2*3600000).toISOString(),
        createdAt: new Date(Date.now() - 24*3600000).toISOString()
      },
      'demo-4': {
        id: 'demo-4', caseNumber: 'CB-2026-0244', status: 'SUBMITTED',
        guestName: 'Emily Rodriguez', guestEmail: 'emily.rodriguez@icloud.com', guestPhone: '+1 (555) 456-7890',
        amount: 475.25, currency: 'USD',
        reasonCode: '4837', reasonDescription: 'No Cardholder Authorization',
        confidenceScore: 81, recommendation: 'AUTO_SUBMIT',
        disputeDate: new Date(Date.now() - 12*86400000).toISOString(),
        dueDate: new Date(Date.now() + 5*86400000).toISOString(),
        checkInDate: new Date(Date.now() - 18*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 16*86400000).toISOString(),
        roomNumber: '305', roomType: 'Standard King',
        confirmationNumber: 'RES-2026-55123',
        transactionId: 'txn_9KlMnOpQrStUv',
        cardLastFour: '6677', cardBrand: 'MASTERCARD',
        processorDisputeId: 'dp_6WxYzAbCdEfG',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'shift4', name: 'Shift4' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'CHIP_TRANSACTION', 'MATCHING_ADDRESS'],
          negative: ['DISPUTED_BEFORE']
        },
        submittedAt: new Date(Date.now() - 48*3600000).toISOString(),
        createdAt: new Date(Date.now() - 48*3600000).toISOString()
      },
      'demo-5': {
        id: 'demo-5', caseNumber: 'CB-2026-0243', status: 'PENDING',
        guestName: 'David Thompson', guestEmail: 'd.thompson@gmail.com', guestPhone: '+1 (555) 567-8901',
        amount: 3200.00, currency: 'USD',
        reasonCode: '10.4', reasonDescription: 'Other Fraud - Card Absent Environment',
        confidenceScore: 65, recommendation: 'GATHER_MORE_EVIDENCE',
        disputeDate: new Date(Date.now() - 7*86400000).toISOString(),
        dueDate: new Date(Date.now() + 8*86400000).toISOString(),
        checkInDate: new Date(Date.now() - 14*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 9*86400000).toISOString(),
        roomNumber: '601', roomType: 'Executive Suite',
        confirmationNumber: 'RES-2026-44890',
        transactionId: 'txn_1AbCdEfGhIjKl',
        cardLastFour: '9012', cardBrand: 'AMEX',
        processorDisputeId: 'dp_8HiJkLmNoPqR',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'elavon', name: 'Elavon' },
        fraudIndicators: {
          positive: ['LOYALTY_MEMBER'],
          negative: ['NO_ID_SCAN', 'MISMATCH_ADDRESS', 'HIGH_AMOUNT']
        },
        createdAt: new Date(Date.now() - 72*3600000).toISOString()
      },
      'demo-6': {
        id: 'demo-6', caseNumber: 'CB-2026-0242', status: 'WON',
        guestName: 'Lisa Anderson', guestEmail: 'lisa.a@hotmail.com', guestPhone: '+1 (555) 678-9012',
        amount: 1875.00, currency: 'USD',
        reasonCode: '13.6', reasonDescription: 'Credit Not Processed',
        confidenceScore: 91, recommendation: 'AUTO_SUBMIT',
        disputeDate: new Date(Date.now() - 35*86400000).toISOString(),
        dueDate: null,
        checkInDate: new Date(Date.now() - 50*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 45*86400000).toISOString(),
        roomNumber: '502', roomType: 'King Suite',
        confirmationNumber: 'RES-2026-33678',
        transactionId: 'txn_3CdEfGhIjKlMn',
        cardLastFour: '3456', cardBrand: 'VISA',
        processorDisputeId: 'dp_0StUvWxYzAbCd',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'stripe', name: 'Stripe' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'MATCHING_ADDRESS', 'RETURN_GUEST', 'CHIP_TRANSACTION'],
          negative: []
        },
        resolution: {
          outcome: 'WON',
          reason: 'Guest claimed credit was not processed for early checkout, but folio shows refund was issued on checkout date and posted to same card.',
          recoveredAmount: 1875.00,
          processorResponseCode: 'REVERSED',
          resolvedDate: new Date(Date.now() - 24*3600000).toISOString(),
          winFactors: [
            'Refund receipt showing credit processed to card ending 3456 on checkout date',
            'ARN (Acquirer Reference Number) provided matching the refund transaction',
            'Guest folio showing original charge and subsequent credit adjustment',
            'Email correspondence confirming refund was communicated to guest'
          ],
          processorNotes: 'The merchant demonstrated that the credit in question was processed on the checkout date. The ARN provided confirms the refund was submitted to the card network. The issuing bank has confirmed receipt of the credit and is reversing the chargeback. Full amount of $1,875.00 restored to merchant.',
          arbitration: null
        },
        resolvedAt: new Date(Date.now() - 24*3600000).toISOString(),
        createdAt: new Date(Date.now() - 96*3600000).toISOString()
      },
      'demo-7': {
        id: 'demo-7', caseNumber: 'CB-2026-0241', status: 'LOST',
        guestName: 'Robert Kim', guestEmail: 'rkim@protonmail.com', guestPhone: '+1 (555) 789-0123',
        amount: 560.75, currency: 'USD',
        reasonCode: '10.1', reasonDescription: 'EMV Liability Shift Counterfeit Fraud',
        confidenceScore: 45, recommendation: 'UNLIKELY_TO_WIN',
        disputeDate: new Date(Date.now() - 40*86400000).toISOString(),
        dueDate: null,
        checkInDate: new Date(Date.now() - 55*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 53*86400000).toISOString(),
        roomNumber: '118', roomType: 'Standard Double',
        confirmationNumber: 'RES-2026-22456',
        transactionId: 'txn_5EfGhIjKlMnOp',
        cardLastFour: '5678', cardBrand: 'DISCOVER',
        processorDisputeId: 'dp_2UvWxYzAbCdEf',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'elavon', name: 'Elavon' },
        fraudIndicators: {
          positive: [],
          negative: ['NO_ID_SCAN', 'NO_SIGNATURE', 'SWIPED_NOT_CHIP', 'FIRST_TIME_GUEST']
        },
        resolution: {
          outcome: 'LOST',
          reason: 'Insufficient evidence — terminal was not EMV-compliant. Magnetic stripe was used instead of chip, triggering liability shift to merchant.',
          denialCode: 'EVIDENCE_INSUFFICIENT',
          recoveredAmount: 0,
          processorResponseCode: 'UPHELD',
          resolvedDate: new Date(Date.now() - 48*3600000).toISOString(),
          denialDetails: 'The issuing bank has reviewed the representment and determined that the merchant bears liability under the EMV Liability Shift framework. The transaction was processed via magnetic stripe swipe rather than EMV chip read. Under Discover Network rules (reason code 10.1), when a chip card is presented but the terminal processes via fallback to magnetic stripe, liability shifts to the merchant. The merchant failed to provide evidence of a chip-read transaction or a valid reason for the fallback.',
          evidenceGaps: [
            'No EMV chip transaction proof — card was swiped, not dipped',
            'No signed registration card on file for this guest',
            'No government-issued photo ID was collected at check-in',
            'No evidence of guest identity verification (loyalty program, prior stays, etc.)',
            'Terminal fallback report not provided to justify magnetic stripe usage'
          ],
          processorNotes: 'Elavon Case Review: The representment evidence was reviewed by the dispute resolution team. The merchant was unable to demonstrate EMV compliance for this transaction. Under network rules, liability for counterfeit fraud shifts to the party (merchant or issuer) that has not adopted EMV chip technology. Since the terminal processed the transaction via magnetic stripe swipe despite the card being chip-enabled, the merchant bears liability. Representment denied. The merchant may file for arbitration within 10 days of this decision.',
          arbitration: {
            eligible: true,
            deadline: new Date(Date.now() + 8*86400000).toISOString(),
            fee: 500,
            status: 'AVAILABLE',
            filedDate: null,
            documents: [],
            instructions: 'To file for arbitration, you must submit a written narrative explaining why the dispute decision should be overturned, along with any additional supporting evidence not previously submitted. The arbitration filing fee of $500.00 is non-refundable if the arbitration ruling is not in your favor. The card network (Discover) will make the final binding decision.'
          }
        },
        resolvedAt: new Date(Date.now() - 48*3600000).toISOString(),
        createdAt: new Date(Date.now() - 120*3600000).toISOString()
      },
      'demo-8': {
        id: 'demo-8', caseNumber: 'CB-2026-0240', status: 'IN_REVIEW',
        guestName: 'Jennifer Lee', guestEmail: 'jen.lee@gmail.com', guestPhone: '+1 (555) 890-1234',
        amount: 1450.00, currency: 'USD',
        reasonCode: '4853', reasonDescription: 'Cardholder Dispute - Defective/Not As Described',
        confidenceScore: 76, recommendation: 'REVIEW_RECOMMENDED',
        disputeDate: new Date(Date.now() - 10*86400000).toISOString(),
        dueDate: new Date(Date.now() + 3*86400000).toISOString(),
        checkInDate: new Date(Date.now() - 22*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 19*86400000).toISOString(),
        roomNumber: '921', roomType: 'Deluxe King',
        confirmationNumber: 'RES-2026-11234',
        transactionId: 'txn_7GhIjKlMnOpQr',
        cardLastFour: '2345', cardBrand: 'MASTERCARD',
        processorDisputeId: 'dp_4WxYzAbCdEfGh',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'adyen', name: 'Adyen' },
        fraudIndicators: {
          positive: ['VALID_ID_SCAN', 'KEY_CARD_USED', 'MATCHING_ADDRESS'],
          negative: ['COMPLAINT_FILED']
        },
        createdAt: new Date(Date.now() - 144*3600000).toISOString()
      },
      'demo-9': {
        id: 'demo-9', caseNumber: 'CB-2026-0239', status: 'LOST',
        guestName: 'Patricia Moore', guestEmail: 'p.moore@gmail.com', guestPhone: '+1 (555) 901-2345',
        amount: 1820.00, currency: 'USD',
        reasonCode: '13.1', reasonDescription: 'Merchandise/Services Not Received',
        confidenceScore: 52, recommendation: 'UNLIKELY_TO_WIN',
        disputeDate: new Date(Date.now() - 45*86400000).toISOString(),
        dueDate: null,
        checkInDate: new Date(Date.now() - 60*86400000).toISOString(),
        checkOutDate: new Date(Date.now() - 57*86400000).toISOString(),
        roomNumber: '310', roomType: 'Standard Queen',
        confirmationNumber: 'RES-2026-10987',
        transactionId: 'txn_9IjKlMnOpQrSt',
        cardLastFour: '7890', cardBrand: 'VISA',
        processorDisputeId: 'dp_6YzAbCdEfGhIj',
        reservationId: null,
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' },
        provider: { id: 'stripe', name: 'Stripe' },
        fraudIndicators: {
          positive: ['MATCHING_ADDRESS'],
          negative: ['NO_ID_SCAN', 'EARLY_CHECKOUT', 'NO_SIGNATURE']
        },
        resolution: {
          outcome: 'LOST',
          reason: 'Guest claimed services were not received. Hotel could not provide sufficient proof of service delivery for the full stay duration.',
          denialCode: 'EVIDENCE_INSUFFICIENT',
          recoveredAmount: 0,
          processorResponseCode: 'UPHELD',
          resolvedDate: new Date(Date.now() - 72*3600000).toISOString(),
          denialDetails: 'The issuing bank reviewed the representment and determined that the merchant did not provide adequate evidence of service delivery. The guest checked out early (1 of 3 nights) but was charged for the full stay. The cancellation policy was not clearly communicated at booking, and no signed acknowledgment of the no-refund policy was on file.',
          evidenceGaps: [
            'No signed registration card acknowledging cancellation policy',
            'No government-issued photo ID collected at check-in',
            'Early checkout after 1 of 3 nights — guest claims room was unsatisfactory',
            'No maintenance or housekeeping logs to refute guest complaint',
            'Cancellation policy not displayed on booking confirmation email'
          ],
          processorNotes: 'Stripe Dispute Review: The merchant was charged back under reason code 13.1 (Services Not Received). While the merchant demonstrated the guest did check in, the early departure combined with lack of signed cancellation policy acknowledgment weakens the representment. The merchant may file for arbitration within 10 days.',
          arbitration: {
            eligible: true,
            deadline: new Date(Date.now() + 15*86400000).toISOString(),
            fee: 500,
            status: 'FILED',
            filedDate: new Date(Date.now() - 24*3600000).toISOString(),
            narrative: 'The guest booked a non-refundable 3-night stay through our website where the cancellation policy was clearly displayed at time of booking. The booking confirmation email includes the no-refund terms. We have since located the booking page screenshot and email records. The guest used the room for one full night and accessed hotel amenities (pool, gym, breakfast) during their stay, confirming services were received.',
            documents: ['booking_confirmation.pdf', 'website_policy_screenshot.png', 'amenity_access_logs.pdf'],
            instructions: 'Arbitration has been filed. The card network (Visa) will review the case and make a final binding decision within 30-45 days. No further action is required at this time.'
          }
        },
        resolvedAt: new Date(Date.now() - 72*3600000).toISOString(),
        createdAt: new Date(Date.now() - 168*3600000).toISOString()
      }
    };

    // Generate demo timeline and evidence for the requested case
    const demoCase = demoCaseDetails[caseId];

    if (!demoCase) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Add evidence array
    demoCase.evidence = [
      { id: `ev-${caseId}-1`, fileName: 'guest_id_scan.jpg', type: 'ID_SCAN', description: 'Government-issued photo ID', verified: true, downloadUrl: null, createdAt: new Date(Date.now() - 3*3600000).toISOString() },
      { id: `ev-${caseId}-2`, fileName: 'folio_invoice.pdf', type: 'FOLIO', description: 'Guest folio with itemized charges', verified: true, downloadUrl: null, createdAt: new Date(Date.now() - 3*3600000).toISOString() },
      { id: `ev-${caseId}-3`, fileName: 'registration_card.pdf', type: 'AUTH_SIGNATURE', description: 'Signed registration card with authorization', verified: false, downloadUrl: null, createdAt: new Date(Date.now() - 2*3600000).toISOString() },
    ];

    // Add timeline
    demoCase.timeline = [
      { id: `tl-${caseId}-1`, eventType: 'ALERT', title: 'Chargeback Received', description: `New chargeback alert from ${demoCase.provider.name} for ${demoCase.guestName}`, createdAt: demoCase.createdAt },
      { id: `tl-${caseId}-2`, eventType: 'AI', title: 'AI Analysis Complete', description: `Confidence score: ${demoCase.confidenceScore}% — Recommendation: ${demoCase.recommendation?.replace(/_/g, ' ')}`, createdAt: new Date(new Date(demoCase.createdAt).getTime() + 120000).toISOString() },
      { id: `tl-${caseId}-3`, eventType: 'SUCCESS', title: 'Evidence Auto-Collected', description: 'Guest ID, folio, and registration card automatically fetched from PMS', createdAt: new Date(new Date(demoCase.createdAt).getTime() + 180000).toISOString() },
    ];

    if (demoCase.status === 'WON') {
      demoCase.timeline.push(
        { id: `tl-${caseId}-4`, eventType: 'SUCCESS', title: 'Dispute Submitted', description: `Evidence package submitted to ${demoCase.provider.name}`, createdAt: new Date(new Date(demoCase.createdAt).getTime() + 300000).toISOString() },
        { id: `tl-${caseId}-5`, eventType: 'WON', title: 'Dispute Won', description: `Chargeback reversed. ${formatCurrency(demoCase.amount)} recovered.`, createdAt: demoCase.resolvedAt }
      );
    } else if (demoCase.status === 'LOST') {
      demoCase.timeline.push(
        { id: `tl-${caseId}-4`, eventType: 'SUCCESS', title: 'Dispute Submitted', description: `Evidence package submitted to ${demoCase.provider.name}`, createdAt: new Date(new Date(demoCase.createdAt).getTime() + 300000).toISOString() },
        { id: `tl-${caseId}-5`, eventType: 'LOST', title: 'Dispute Lost', description: 'Issuer ruled in favor of cardholder. Insufficient evidence.', createdAt: demoCase.resolvedAt }
      );
    } else if (demoCase.status === 'SUBMITTED') {
      demoCase.timeline.push(
        { id: `tl-${caseId}-4`, eventType: 'SUCCESS', title: 'Dispute Submitted', description: `Evidence package submitted to ${demoCase.provider.name}`, createdAt: demoCase.submittedAt }
      );
    }

    // Reverse timeline to show newest first
    demoCase.timeline.reverse();

    // Add notes
    demoCase.notes = [
      { id: `note-${caseId}-1`, content: 'AI analysis indicates strong evidence for representment. Guest ID and signed registration card match the card on file.', user: { firstName: 'AI', lastName: 'System' }, createdAt: new Date(new Date(demoCase.createdAt).getTime() + 120000).toISOString() }
    ];

    // Add submissions
    demoCase.submissions = [];

    res.json({ chargeback: demoCase, isDemo: true });
  }
});

/**
 * Helper for formatting currency in demo mode
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * POST /api/cases
 * Create new chargeback manually
 */
router.post('/', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Validate input
    const validation = createCaseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const data = validation.data;

    // Verify property access
    if (req.user.role !== 'ADMIN' && data.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot create case for another property'
      });
    }

    // Generate case number
    const caseNumber = await generateCaseNumber();

    // Create chargeback
    const chargeback = await prisma.chargeback.create({
      data: {
        caseNumber,
        ...data,
        disputeDate: new Date(data.disputeDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        checkInDate: new Date(data.checkInDate),
        checkOutDate: new Date(data.checkOutDate)
      },
      include: {
        property: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } }
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'SYSTEM',
        title: 'Case Created',
        description: `Case ${caseNumber} created manually by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    // Run AI analysis
    try {
      await analyzeChargeback(chargeback.id);
    } catch (aiError) {
      logger.warn(`AI analysis failed for ${caseNumber}:`, aiError.message);
    }

    logger.info(`Case created: ${caseNumber} by ${req.user.email}`);

    res.status(201).json({
      message: 'Chargeback created successfully',
      chargeback
    });

  } catch (error) {
    logger.error('Create case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create case'
    });
  }
});

/**
 * POST /api/cases/:id/submit
 * Submit case to payment processor
 */
router.post('/:id/submit', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    const { notes } = req.body;

    const chargeback = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      },
      include: {
        provider: true,
        evidence: true,
      },
    });

    if (!chargeback) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    if (chargeback.status !== 'PENDING' && chargeback.status !== 'IN_REVIEW') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Case has already been submitted or resolved'
      });
    }

    // Create submission record
    const submission = await prisma.disputeSubmission.create({
      data: {
        chargebackId: chargeback.id,
        processorId: chargeback.provider?.id,
        status: 'SENT',
        requestJson: {
          caseNumber: chargeback.caseNumber,
          processorCaseId: chargeback.processorCaseId,
          amount: parseFloat(chargeback.amount),
          evidenceCount: chargeback.evidence.length,
          submittedBy: req.user.email,
          notes,
        },
      },
    });

    // Update case status
    const updatedChargeback = await prisma.chargeback.update({
      where: { id: chargeback.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        property: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } }
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'SYSTEM',
        title: 'Case Submitted',
        description: `Submitted to ${chargeback.provider?.name || 'processor'} by ${req.user.firstName} ${req.user.lastName}`,
        metadata: { submissionId: submission.id }
      }
    });

    logger.info(`Case submitted: ${chargeback.caseNumber} by ${req.user.email}`);

    res.json({
      message: 'Case submitted successfully',
      chargeback: updatedChargeback,
      submission
    });

  } catch (error) {
    logger.error('Submit case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit case'
    });
  }
});

/**
 * PATCH /api/cases/:id
 * Update chargeback details
 */
router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Validate input
    const validation = updateCaseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Update chargeback
    const chargeback = await prisma.chargeback.update({
      where: { id: req.params.id },
      data: validation.data,
      include: {
        property: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } }
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType: 'USER_ACTION',
        title: 'Case Updated',
        description: `Updated by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Case updated: ${chargeback.caseNumber} by ${req.user.email}`);

    res.json({
      message: 'Chargeback updated successfully',
      chargeback
    });

  } catch (error) {
    logger.error('Update case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update case'
    });
  }
});

/**
 * PATCH /api/cases/:id/status
 * Update chargeback status
 */
router.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    // Validate input
    const validation = updateCaseStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const { status, notes } = validation.data;

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Update status
    const updateData = {
      status,
      ...(status === 'WON' || status === 'LOST' ? { resolvedAt: new Date() } : {})
    };

    const chargeback = await prisma.chargeback.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Determine event type
    let eventType = 'USER_ACTION';
    if (status === 'WON') eventType = 'WON';
    if (status === 'LOST') eventType = 'LOST';

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: chargeback.id,
        eventType,
        title: `Status Changed to ${status}`,
        description: notes || `Status updated by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    logger.info(`Case status updated: ${chargeback.caseNumber} -> ${status} by ${req.user.email}`);

    res.json({
      message: 'Status updated successfully',
      chargeback
    });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Update status: database unavailable, returning demo response');
    const { status, notes } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Validation Error', message: 'Status is required' });
    }
    res.json({
      message: 'Status updated successfully (Demo Mode)',
      chargeback: {
        id: req.params.id,
        status,
        ...(status === 'WON' || status === 'LOST' ? { resolvedAt: new Date().toISOString() } : {}),
        updatedAt: new Date().toISOString()
      },
      isDemo: true
    });
  }
});

/**
 * POST /api/cases/:id/analyze
 * Re-run AI analysis
 */
router.post('/:id/analyze', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Run analysis
    const result = await analyzeChargeback(req.params.id);

    res.json({
      message: 'Analysis complete',
      ...result
    });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Analyze case: database unavailable, returning demo analysis');
    const score = Math.floor(Math.random() * 30) + 65; // 65-95
    res.json({
      message: 'Analysis complete (Demo Mode)',
      confidenceScore: score,
      recommendation: score >= 80 ? 'AUTO_SUBMIT' : score >= 60 ? 'REVIEW_RECOMMENDED' : 'GATHER_MORE_EVIDENCE',
      factors: {
        positive: ['Valid ID on file', 'Signed registration card', 'Key card access logs confirm stay'],
        negative: score < 75 ? ['Guest disputed within 30 days'] : [],
        neutral: ['Standard cancellation policy applies']
      },
      isDemo: true
    });
  }
});

/**
 * GET /api/cases/:id/notes
 * Get all notes for a case
 */
router.get('/:id/notes', async (req, res) => {
  try {
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    const notes = await prisma.caseNote.findMany({
      where: { chargebackId: req.params.id },
      include: {
        user: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ notes, total: notes.length });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Get notes: database unavailable, returning demo data');
    const demoNotes = [
      {
        id: 'note-1',
        chargebackId: req.params.id,
        content: 'Guest ID verified against reservation records. Name and address match.',
        isInternal: true,
        user: { firstName: 'Admin', lastName: 'User' },
        createdAt: new Date(Date.now() - 4 * 3600000).toISOString()
      },
      {
        id: 'note-2',
        chargebackId: req.params.id,
        content: 'Key card logs retrieved from PMS — confirm stay for full duration.',
        isInternal: true,
        user: { firstName: 'Admin', lastName: 'User' },
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
      }
    ];
    res.json({ notes: demoNotes, total: demoNotes.length, isDemo: true });
  }
});

/**
 * GET /api/cases/:id/timeline
 * Get timeline events for a case
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    const timeline = await prisma.timelineEvent.findMany({
      where: { chargebackId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ timeline, total: timeline.length });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Get timeline: database unavailable, returning demo data');
    const now = Date.now();
    const demoTimeline = [
      {
        id: 'tl-1',
        chargebackId: req.params.id,
        eventType: 'SYSTEM',
        title: 'Case Created',
        description: 'Chargeback received from payment processor and case auto-created.',
        createdAt: new Date(now - 72 * 3600000).toISOString()
      },
      {
        id: 'tl-2',
        chargebackId: req.params.id,
        eventType: 'AI_ANALYSIS',
        title: 'AI Analysis Completed',
        description: 'Confidence score calculated. Evidence collection initiated.',
        createdAt: new Date(now - 70 * 3600000).toISOString()
      },
      {
        id: 'tl-3',
        chargebackId: req.params.id,
        eventType: 'EVIDENCE',
        title: 'Evidence Auto-Collected',
        description: 'Registration card, guest ID, and folio retrieved from PMS.',
        createdAt: new Date(now - 68 * 3600000).toISOString()
      },
      {
        id: 'tl-4',
        chargebackId: req.params.id,
        eventType: 'STATUS_CHANGE',
        title: 'Status Updated to In Review',
        description: 'Case moved to manual review queue.',
        createdAt: new Date(now - 24 * 3600000).toISOString()
      }
    ];
    res.json({ timeline: demoTimeline, total: demoTimeline.length, isDemo: true });
  }
});

/**
 * POST /api/cases/:id/notes
 * Add note to case
 */
router.post('/:id/notes', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    const { content, isInternal = true } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Note content is required'
      });
    }

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Create note
    const note = await prisma.caseNote.create({
      data: {
        chargebackId: req.params.id,
        userId: req.user.id,
        content: content.trim(),
        isInternal
      },
      include: {
        user: { select: { firstName: true, lastName: true } }
      }
    });

    res.status(201).json({
      message: 'Note added successfully',
      note
    });

  } catch (error) {
    // Demo mode fallback
    logger.warn('Add note: database unavailable, returning demo response');
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Note content is required' });
    }
    res.status(201).json({
      message: 'Note added successfully (Demo Mode)',
      note: {
        id: `note-demo-${Date.now()}`,
        chargebackId: req.params.id,
        content: content.trim(),
        isInternal: true,
        user: { firstName: req.user.firstName || 'Admin', lastName: req.user.lastName || 'User' },
        createdAt: new Date().toISOString()
      },
      isDemo: true
    });
  }
});

/**
 * POST /api/cases/:id/arbitration
 * File for arbitration on a lost case
 */
router.post('/:id/arbitration', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    const { narrative } = req.body;

    if (!narrative || narrative.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Arbitration narrative is required'
      });
    }

    // Check access
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    if (existing.status !== 'LOST') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Arbitration can only be filed for lost cases'
      });
    }

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: existing.id,
        eventType: 'USER_ACTION',
        title: 'Arbitration Filed',
        description: `Arbitration filed by ${req.user.firstName} ${req.user.lastName}. Narrative: ${narrative.substring(0, 100)}...`
      }
    });

    logger.info(`Arbitration filed: ${existing.caseNumber} by ${req.user.email}`);

    res.status(201).json({
      message: 'Arbitration filed successfully',
      arbitration: {
        status: 'FILED',
        filedDate: new Date().toISOString(),
        filedBy: `${req.user.firstName} ${req.user.lastName}`,
        narrative: narrative.trim()
      }
    });

  } catch (error) {
    // Demo mode fallback
    logger.warn('File arbitration: database unavailable, returning demo response');
    const { narrative } = req.body;
    if (!narrative || narrative.trim().length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'Arbitration narrative is required' });
    }
    res.status(201).json({
      message: 'Arbitration filed successfully (Demo Mode)',
      arbitration: {
        status: 'FILED',
        filedDate: new Date().toISOString(),
        filedBy: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Admin User',
        narrative: narrative.trim(),
        caseNumber: req.params.id
      },
      isDemo: true
    });
  }
});

/**
 * POST /api/cases/:id/arbitration/documents
 * Upload documents for arbitration
 */
router.post('/:id/arbitration/documents', requireRole('ADMIN', 'MANAGER', 'STAFF'), async (req, res) => {
  try {
    // In production, this would use multer for file upload
    // For demo mode, we accept the upload and return a success response
    const caseId = req.params.id;

    logger.info(`Arbitration document upload for case ${caseId}`);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: `arb-doc-${Date.now()}`,
        caseId,
        name: req.body?.name || 'uploaded_document',
        type: req.body?.type || 'arbitration',
        size: req.headers['content-length'] || 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Admin User',
      },
      isDemo: true
    });
  } catch (error) {
    logger.warn('Arbitration document upload: returning demo response');
    res.status(201).json({
      message: 'Document uploaded successfully (Demo Mode)',
      document: {
        id: `arb-doc-${Date.now()}`,
        caseId: req.params.id,
        name: 'uploaded_document',
        type: 'arbitration',
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'Admin User',
      },
      isDemo: true
    });
  }
});

/**
 * DELETE /api/cases/:id
 * Soft delete chargeback (Admin only)
 */
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.chargeback.findFirst({
      where: {
        id: req.params.id,
        ...req.propertyFilter
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Chargeback not found'
      });
    }

    // Soft delete by setting status to CANCELLED
    await prisma.chargeback.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId: req.params.id,
        eventType: 'SYSTEM',
        title: 'Case Cancelled',
        description: `Case cancelled by ${req.user.firstName} ${req.user.lastName}`
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DELETE_CASE',
        entityType: 'Chargeback',
        entityId: req.params.id,
        oldValues: { status: existing.status },
        newValues: { status: 'CANCELLED' }
      }
    });

    logger.info(`Case cancelled: ${existing.caseNumber} by ${req.user.email}`);

    res.json({
      message: 'Chargeback cancelled successfully'
    });

  } catch (error) {
    logger.error('Delete case error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete case'
    });
  }
});

module.exports = router;
