/**
 * DisputeAI - Reservations Routes
 * Supports multiple PMS sources with AutoClerk PMS Emulator as default
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { autoclerk } = require('../services/autoclerkEmulator');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// Demo reservations for non-AutoClerk PMS systems
// ============================================================

const DEMO_PMS_RESERVATIONS = {
  mews: {
    system: 'Mews',
    propertyName: 'Oceanview Resort',
    version: '3.12.1',
    status: 'Active',
    reservationsCount: 8,
    reservations: [
      { id: 'MW-1001', guestName: 'Sarah Mitchell', guestEmail: 's.mitchell@email.com', confirmationNumber: 'MW-20260201', roomNumber: '410', roomType: 'Ocean Suite', checkIn: '2026-02-18', checkOut: '2026-02-22', status: 'Checked-Out', cardLast4: '7721', totalCharges: 1580.00, paymentMethod: 'Visa', bookingSource: 'Direct', adults: 2, children: 0, ratePerNight: 395.00, guestPhone: '+1 (555) 321-9876', loyaltyNumber: null, specialRequests: 'High floor, ocean view' },
      { id: 'MW-1002', guestName: 'Thomas Reed', guestEmail: 'treed@corp.com', confirmationNumber: 'MW-20260202', roomNumber: '215', roomType: 'Deluxe King', checkIn: '2026-02-20', checkOut: '2026-02-24', status: 'Checked-In', cardLast4: '3344', totalCharges: 1120.00, paymentMethod: 'Mastercard', bookingSource: 'Expedia', adults: 1, children: 0, ratePerNight: 280.00, guestPhone: '+1 (555) 432-1098', loyaltyNumber: 'MW-GOLD-445566', specialRequests: null },
      { id: 'MW-1003', guestName: 'Anna Kowalski', guestEmail: 'anna.k@travel.com', confirmationNumber: 'MW-20260203', roomNumber: '312', roomType: 'Standard Queen', checkIn: '2026-02-22', checkOut: '2026-02-25', status: 'Confirmed', cardLast4: '5588', totalCharges: 690.00, paymentMethod: 'Visa', bookingSource: 'Booking.com', adults: 2, children: 1, ratePerNight: 230.00, guestPhone: '+1 (555) 543-2109', loyaltyNumber: null, specialRequests: 'Late check-in, crib needed' },
      { id: 'MW-1004', guestName: 'Marcus Johnson', guestEmail: 'mjohnson@biz.com', confirmationNumber: 'MW-20260204', roomNumber: '501', roomType: 'Presidential Suite', checkIn: '2026-02-15', checkOut: '2026-02-18', status: 'Checked-Out', cardLast4: '9901', totalCharges: 4200.00, paymentMethod: 'Amex', bookingSource: 'Direct', adults: 2, children: 0, ratePerNight: 1400.00, guestPhone: '+1 (555) 654-3210', loyaltyNumber: 'MW-PLAT-223344', specialRequests: 'Champagne on arrival' },
      { id: 'MW-1005', guestName: 'Patricia Gomez', guestEmail: 'pgomez@mail.com', confirmationNumber: 'MW-20260205', roomNumber: '118', roomType: 'Garden View', checkIn: '2026-02-19', checkOut: '2026-02-21', status: 'Checked-Out', cardLast4: '6677', totalCharges: 460.00, paymentMethod: 'Visa', bookingSource: 'Hotels.com', adults: 1, children: 0, ratePerNight: 230.00, guestPhone: '+1 (555) 765-4321', loyaltyNumber: null, specialRequests: null },
      { id: 'MW-1006', guestName: 'James Wright', guestEmail: 'jwright@company.net', confirmationNumber: 'MW-20260206', roomNumber: '305', roomType: 'Deluxe King', checkIn: '2026-02-23', checkOut: '2026-02-27', status: 'Confirmed', cardLast4: '2233', totalCharges: 1120.00, paymentMethod: 'Mastercard', bookingSource: 'Airbnb', adults: 2, children: 2, ratePerNight: 280.00, guestPhone: '+1 (555) 876-5430', loyaltyNumber: 'MW-SILVER-998877', specialRequests: 'Connecting rooms if possible' },
      { id: 'MW-1007', guestName: 'Diana Patel', guestEmail: 'dpatel@outlook.com', confirmationNumber: 'MW-20260207', roomNumber: '422', roomType: 'Ocean Suite', checkIn: '2026-02-24', checkOut: '2026-02-28', status: 'Confirmed', cardLast4: '4455', totalCharges: 1580.00, paymentMethod: 'Visa', bookingSource: 'Direct', adults: 2, children: 0, ratePerNight: 395.00, guestPhone: '+1 (555) 987-6543', loyaltyNumber: 'MW-GOLD-112233', specialRequests: 'Anniversary celebration' },
      { id: 'MW-1008', guestName: 'Kevin O\'Brien', guestEmail: 'kobrien@mail.com', confirmationNumber: 'MW-20260208', roomNumber: '201', roomType: 'Standard Queen', checkIn: '2026-02-16', checkOut: '2026-02-19', status: 'Checked-Out', cardLast4: '8899', totalCharges: 690.00, paymentMethod: 'Discover', bookingSource: 'Priceline', adults: 1, children: 0, ratePerNight: 230.00, guestPhone: '+1 (555) 098-7654', loyaltyNumber: null, specialRequests: 'Early check-in' },
    ]
  },
  'opera-cloud': {
    system: 'Opera Cloud',
    propertyName: 'Downtown Business Hotel',
    version: '22.5.3',
    status: 'Active',
    reservationsCount: 15,
    reservations: [
      { id: 'OP-2001', guestName: 'William Chen', guestEmail: 'wchen@enterprise.com', confirmationNumber: 'OP-20260301', roomNumber: '1204', roomType: 'Executive Suite', checkIn: '2026-02-17', checkOut: '2026-02-21', status: 'Checked-Out', cardLast4: '1122', totalCharges: 2400.00, paymentMethod: 'Amex', bookingSource: 'Corporate', adults: 1, children: 0, ratePerNight: 600.00, guestPhone: '+1 (555) 111-2233', loyaltyNumber: 'ORA-DIAMOND-001', specialRequests: 'Conference room access' },
      { id: 'OP-2002', guestName: 'Maria Santos', guestEmail: 'msantos@travel.net', confirmationNumber: 'OP-20260302', roomNumber: '805', roomType: 'Deluxe Double', checkIn: '2026-02-19', checkOut: '2026-02-22', status: 'Checked-Out', cardLast4: '3344', totalCharges: 1050.00, paymentMethod: 'Visa', bookingSource: 'Expedia', adults: 2, children: 0, ratePerNight: 350.00, guestPhone: '+1 (555) 222-3344', loyaltyNumber: null, specialRequests: 'Non-smoking room' },
      { id: 'OP-2003', guestName: 'Richard Taylor', guestEmail: 'rtaylor@firm.com', confirmationNumber: 'OP-20260303', roomNumber: '1502', roomType: 'Penthouse Suite', checkIn: '2026-02-20', checkOut: '2026-02-25', status: 'Checked-In', cardLast4: '5566', totalCharges: 7500.00, paymentMethod: 'Amex', bookingSource: 'Direct', adults: 2, children: 0, ratePerNight: 1500.00, guestPhone: '+1 (555) 333-4455', loyaltyNumber: 'ORA-DIAMOND-002', specialRequests: 'Butler service, airport transfer' },
      { id: 'OP-2004', guestName: 'Catherine Nguyen', guestEmail: 'cnguyen@startup.io', confirmationNumber: 'OP-20260304', roomNumber: '610', roomType: 'Business King', checkIn: '2026-02-21', checkOut: '2026-02-23', status: 'Checked-In', cardLast4: '7788', totalCharges: 700.00, paymentMethod: 'Mastercard', bookingSource: 'Booking.com', adults: 1, children: 0, ratePerNight: 350.00, guestPhone: '+1 (555) 444-5566', loyaltyNumber: 'ORA-GOLD-003', specialRequests: 'Extra pillows' },
      { id: 'OP-2005', guestName: 'Steven Park', guestEmail: 'spark@global.com', confirmationNumber: 'OP-20260305', roomNumber: '903', roomType: 'Executive Suite', checkIn: '2026-02-23', checkOut: '2026-02-27', status: 'Confirmed', cardLast4: '9900', totalCharges: 2400.00, paymentMethod: 'Visa', bookingSource: 'Corporate', adults: 1, children: 0, ratePerNight: 600.00, guestPhone: '+1 (555) 555-6677', loyaltyNumber: 'ORA-PLAT-004', specialRequests: 'Late checkout if possible' },
      { id: 'OP-2006', guestName: 'Laura Fischer', guestEmail: 'lfischer@mail.de', confirmationNumber: 'OP-20260306', roomNumber: '702', roomType: 'Deluxe Double', checkIn: '2026-02-22', checkOut: '2026-02-24', status: 'Checked-In', cardLast4: '1133', totalCharges: 700.00, paymentMethod: 'Visa', bookingSource: 'Hotels.com', adults: 2, children: 1, ratePerNight: 350.00, guestPhone: '+49 (151) 123-4567', loyaltyNumber: null, specialRequests: 'Baby cot needed' },
      { id: 'OP-2007', guestName: 'Michael Brooks', guestEmail: 'mbrooks@law.com', confirmationNumber: 'OP-20260307', roomNumber: '1101', roomType: 'Business King', checkIn: '2026-02-24', checkOut: '2026-02-28', status: 'Confirmed', cardLast4: '2244', totalCharges: 1400.00, paymentMethod: 'Amex', bookingSource: 'Direct', adults: 1, children: 0, ratePerNight: 350.00, guestPhone: '+1 (555) 777-8899', loyaltyNumber: 'ORA-GOLD-005', specialRequests: null },
      { id: 'OP-2008', guestName: 'Sophia Martinez', guestEmail: 'smartinez@hotel.com', confirmationNumber: 'OP-20260308', roomNumber: '415', roomType: 'Standard Queen', checkIn: '2026-02-14', checkOut: '2026-02-17', status: 'Checked-Out', cardLast4: '6655', totalCharges: 750.00, paymentMethod: 'Mastercard', bookingSource: 'Priceline', adults: 2, children: 0, ratePerNight: 250.00, guestPhone: '+1 (555) 888-9900', loyaltyNumber: null, specialRequests: 'Quiet room, away from elevator' },
      { id: 'OP-2009', guestName: 'Daniel Kim', guestEmail: 'dkim@consulting.com', confirmationNumber: 'OP-20260309', roomNumber: '1308', roomType: 'Executive Suite', checkIn: '2026-02-25', checkOut: '2026-03-01', status: 'Confirmed', cardLast4: '8877', totalCharges: 2400.00, paymentMethod: 'Visa', bookingSource: 'Corporate', adults: 1, children: 0, ratePerNight: 600.00, guestPhone: '+1 (555) 999-0011', loyaltyNumber: 'ORA-DIAMOND-006', specialRequests: 'Meeting room for 8 people' },
      { id: 'OP-2010', guestName: 'Emma Wilson', guestEmail: 'ewilson@bank.com', confirmationNumber: 'OP-20260310', roomNumber: '520', roomType: 'Business King', checkIn: '2026-02-16', checkOut: '2026-02-19', status: 'Checked-Out', cardLast4: '4422', totalCharges: 1050.00, paymentMethod: 'Amex', bookingSource: 'Direct', adults: 1, children: 0, ratePerNight: 350.00, guestPhone: '+1 (555) 000-1122', loyaltyNumber: 'ORA-PLAT-007', specialRequests: null },
    ]
  }
};

/**
 * Helper: Get reservations from the appropriate PMS source
 */
function getReservationsForPms(pmsSource, searchParams) {
  if (!pmsSource || pmsSource === 'autoclerk') {
    // Use the AutoClerk emulator (default)
    return {
      reservations: autoclerk.searchReservations(searchParams),
      source: 'AutoClerk PMS',
    };
  }

  const demoData = DEMO_PMS_RESERVATIONS[pmsSource];
  if (!demoData) {
    return { reservations: [], source: pmsSource };
  }

  let results = [...demoData.reservations];

  // Apply global search filter for demo PMS data
  if (searchParams.globalSearch) {
    const q = searchParams.globalSearch.toLowerCase();
    results = results.filter(r =>
      (r.guestName || '').toLowerCase().includes(q) ||
      (r.guestEmail || '').toLowerCase().includes(q) ||
      (r.confirmationNumber || '').toLowerCase().includes(q) ||
      (r.roomNumber || '').toLowerCase().includes(q) ||
      (r.cardLast4 || '').includes(q) ||
      (r.roomType || '').toLowerCase().includes(q) ||
      (r.bookingSource || '').toLowerCase().includes(q) ||
      (r.loyaltyNumber || '').toLowerCase().includes(q)
    );
  }

  return { reservations: results, source: `${demoData.system} PMS` };
}

/**
 * GET /api/reservations/pms/status
 * Get PMS connection status for the selected PMS
 * Accepts optional ?pmsSource= query parameter
 * Note: Must be defined before /:id to avoid conflict
 */
router.get('/pms/status', authenticateToken, async (req, res) => {
  try {
    const { pmsSource } = req.query;

    if (!pmsSource || pmsSource === 'autoclerk') {
      const status = autoclerk.getStatus();
      return res.json({ success: true, ...status });
    }

    const demoData = DEMO_PMS_RESERVATIONS[pmsSource];
    if (demoData) {
      return res.json({
        success: true,
        system: demoData.system,
        propertyName: demoData.propertyName,
        version: demoData.version,
        status: demoData.status,
        reservationsCount: demoData.reservationsCount,
        source: pmsSource,
      });
    }

    res.json({
      success: true,
      system: pmsSource,
      propertyName: 'Unknown Property',
      status: 'Not Connected',
      reservationsCount: 0,
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('PMS status: error, returning demo status');
    res.json({
      success: true,
      system: req.query.pmsSource || 'autoclerk',
      propertyName: 'DisputeAI Demo Hotel',
      status: 'Connected',
      reservationsCount: 12,
      isDemo: true
    });
  }
});

/**
 * GET /api/reservations
 * List/search reservations from the selected PMS
 * Accepts optional ?pmsSource= query parameter
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search, confirmationNumber, guestName, guestEmail, checkIn, checkOut, cardLast4, roomNumber, status, page = 1, limit = 20, pmsSource } = req.query;

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

    const { reservations: results, source } = getReservationsForPms(pmsSource, searchParams);

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
      source
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Reservations list: error, returning empty list');
    res.json({
      success: true,
      reservations: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
      source: 'Demo PMS',
      isDemo: true
    });
  }
});

/**
 * GET /api/reservations/:id
 * Get full reservation detail with guest info
 * Accepts optional ?pmsSource= query parameter
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { pmsSource } = req.query;

    if (!pmsSource || pmsSource === 'autoclerk') {
      const reservation = autoclerk.getReservation(req.params.id);
      if (!reservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      return res.json({ success: true, reservation, source: 'AutoClerk PMS' });
    }

    // Look up in demo PMS data
    const demoData = DEMO_PMS_RESERVATIONS[pmsSource];
    if (demoData) {
      const reservation = demoData.reservations.find(r => r.id === req.params.id || r.confirmationNumber === req.params.id);
      if (reservation) {
        return res.json({ success: true, reservation, source: `${demoData.system} PMS` });
      }
    }

    return res.status(404).json({ error: 'Reservation not found' });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Reservation detail: error, returning demo fallback');
    res.json({
      success: true,
      reservation: {
        id: req.params.id,
        confirmationNumber: 'DEMO-' + req.params.id.substring(0, 6).toUpperCase(),
        guestName: 'Demo Guest',
        checkIn: new Date(Date.now() - 2 * 86400000).toISOString(),
        checkOut: new Date(Date.now() + 1 * 86400000).toISOString(),
        roomNumber: '101',
        roomType: 'King Suite',
        status: 'CHECKED_IN',
        totalAmount: 599.99,
        paymentMethod: 'Visa ending in 4532'
      },
      source: 'Demo PMS',
      isDemo: true
    });
  }
});

/**
 * GET /api/reservations/:id/evidence
 * Fetch all available evidence for a reservation
 * Accepts optional ?pmsSource= query parameter
 */
router.get('/:id/evidence', authenticateToken, async (req, res) => {
  try {
    const { types, pmsSource } = req.query;
    const evidenceTypes = types ? types.split(',') : [];

    if (!pmsSource || pmsSource === 'autoclerk') {
      const result = autoclerk.fetchEvidence(req.params.id, evidenceTypes);
      if (result.error) {
        return res.status(404).json({ error: result.error });
      }
      return res.json({ success: true, ...result, source: 'AutoClerk PMS' });
    }

    // For non-AutoClerk PMS systems, return simulated evidence
    const demoData = DEMO_PMS_RESERVATIONS[pmsSource];
    if (demoData) {
      const reservation = demoData.reservations.find(r => r.id === req.params.id || r.confirmationNumber === req.params.id);
      if (reservation) {
        const demoEvidence = [
          { type: 'folio', data: { guestName: reservation.guestName, roomNumber: reservation.roomNumber, checkIn: reservation.checkIn, checkOut: reservation.checkOut, totalCharges: reservation.totalCharges, items: [{ description: 'Room Charges', amount: reservation.totalCharges * 0.85 }, { description: 'Tax', amount: reservation.totalCharges * 0.12 }, { description: 'Resort Fee', amount: reservation.totalCharges * 0.03 }] } },
          { type: 'registration_card', data: { guestName: reservation.guestName, checkIn: reservation.checkIn, signature: 'On file', idPresented: true } },
          { type: 'key_card_log', data: { roomNumber: reservation.roomNumber, entries: [{ action: 'Key Issued', timestamp: `${reservation.checkIn}T15:02:00Z` }, { action: 'Room Access', timestamp: `${reservation.checkIn}T15:15:00Z` }] } },
        ];
        return res.json({ success: true, evidence: demoEvidence, reservationId: req.params.id, source: `${demoData.system} PMS` });
      }
    }

    return res.status(404).json({ error: 'Reservation not found in selected PMS' });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Reservation evidence: error, returning demo evidence');
    res.json({
      success: true,
      evidence: [
        { type: 'folio', data: { guestName: 'Demo Guest', roomNumber: '101', checkIn: new Date(Date.now() - 2 * 86400000).toISOString(), checkOut: new Date(Date.now() + 1 * 86400000).toISOString(), totalCharges: 599.99, items: [{ description: 'Room Charges', amount: 509.99 }, { description: 'Tax', amount: 72.00 }, { description: 'Resort Fee', amount: 18.00 }] } },
        { type: 'registration_card', data: { guestName: 'Demo Guest', checkIn: new Date(Date.now() - 2 * 86400000).toISOString(), signature: 'On file', idPresented: true } },
      ],
      reservationId: req.params.id,
      source: 'Demo PMS',
      isDemo: true
    });
  }
});

/**
 * POST /api/reservations/:id/evidence/collect
 * Collect and store evidence from PMS for a case
 * Accepts optional pmsSource in request body
 */
router.post('/:id/evidence/collect', authenticateToken, async (req, res) => {
  try {
    const { caseId, evidenceTypes, pmsSource } = req.body;

    if (!caseId) {
      return res.status(400).json({ error: 'caseId is required' });
    }

    if (!pmsSource || pmsSource === 'autoclerk') {
      const result = autoclerk.fetchEvidence(req.params.id, evidenceTypes || []);
      if (result.error) {
        return res.status(404).json({ error: result.error });
      }
      const stored = autoclerk.storeEvidence(caseId, result.evidence);
      return res.json({
        success: true,
        message: `Collected ${stored.length} evidence documents from AutoClerk PMS`,
        caseId,
        evidence: stored,
        source: 'AutoClerk PMS'
      });
    }

    // For non-AutoClerk PMS, simulate evidence collection
    const demoData = DEMO_PMS_RESERVATIONS[pmsSource];
    const sourceName = demoData ? demoData.system : pmsSource;
    return res.json({
      success: true,
      message: `Collected 3 evidence documents from ${sourceName} PMS`,
      caseId,
      evidence: [
        { type: 'folio', status: 'collected' },
        { type: 'registration_card', status: 'collected' },
        { type: 'key_card_log', status: 'collected' },
      ],
      source: `${sourceName} PMS`
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Evidence collection: error, returning demo collected evidence');
    res.json({
      success: true,
      message: 'Collected 3 evidence documents from Demo PMS',
      caseId: req.body.caseId || req.params.id,
      evidence: [
        { type: 'folio', status: 'collected' },
        { type: 'registration_card', status: 'collected' },
        { type: 'key_card_log', status: 'collected' },
      ],
      source: 'Demo PMS',
      isDemo: true
    });
  }
});

module.exports = router;
