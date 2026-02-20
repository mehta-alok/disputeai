/**
 * AccuDefend - AutoClerk PMS Emulator
 * Local emulator that simulates the AutoClerk PMS API
 * Provides realistic hotel reservation data, folios, signatures, IDs, and audit trails
 */

const crypto = require('crypto');

// ============================================================================
// GUEST DATABASE - Realistic hotel guests tied to chargeback cases
// ============================================================================

const GUESTS = [
  {
    id: 'G-001',
    firstName: 'John', lastName: 'Martinez',
    email: 'j.martinez@email.com', phone: '+1 (555) 234-5678',
    address: '742 Evergreen Terrace, Springfield, IL 62704',
    idType: 'Drivers License', idState: 'Illinois', idNumber: 'M621-8834-7890', idExpiry: '2028-09-15',
    loyaltyNumber: 'GOLD-456789', loyaltyTier: 'Gold',
    cardLast4: '4532', cardBrand: 'Visa'
  },
  {
    id: 'G-002',
    firstName: 'Emily', lastName: 'Watson',
    email: 'ewatson@company.com', phone: '+1 (555) 876-5432',
    address: '1600 Pennsylvania Ave NW, Washington, DC 20500',
    idType: 'Passport', idState: 'US', idNumber: '****5521', idExpiry: '2030-03-22',
    loyaltyNumber: 'PLAT-112233', loyaltyTier: 'Platinum',
    cardLast4: '8891', cardBrand: 'Mastercard'
  },
  {
    id: 'G-003',
    firstName: 'Robert', lastName: 'Kim',
    email: 'rkim.personal@gmail.com', phone: '+1 (555) 345-6789',
    address: '350 Fifth Avenue, New York, NY 10118',
    idType: 'Drivers License', idState: 'New York', idNumber: 'K295-4467-1234', idExpiry: '2027-06-10',
    loyaltyNumber: 'GOLD-789456', loyaltyTier: 'Gold',
    cardLast4: '1234', cardBrand: 'Visa'
  },
  {
    id: 'G-004',
    firstName: 'Lisa', lastName: 'Thompson',
    email: 'lisa.t@outlook.com', phone: '+1 (555) 456-7890',
    address: '221B Baker Street, Boston, MA 02101',
    idType: 'Drivers License', idState: 'Massachusetts', idNumber: 'T443-2216-5678', idExpiry: '2026-11-30',
    loyaltyNumber: null, loyaltyTier: 'Member',
    cardLast4: '5678', cardBrand: 'Visa'
  },
  {
    id: 'G-005',
    firstName: 'David', lastName: 'Brown',
    email: 'dbrown@techcorp.io', phone: '+1 (555) 567-8901',
    address: '1 Infinite Loop, Cupertino, CA 95014',
    idType: 'Drivers License', idState: 'California', idNumber: 'B887-3345-9012', idExpiry: '2029-02-28',
    loyaltyNumber: 'PLAT-334455', loyaltyTier: 'Platinum',
    cardLast4: '9012', cardBrand: 'Amex'
  },
  {
    id: 'G-006',
    firstName: 'Amanda', lastName: 'Garcia',
    email: 'agarcia@email.com', phone: '+1 (555) 678-9012',
    address: '456 Oak Drive, Austin, TX 78701',
    idType: 'Drivers License', idState: 'Texas', idNumber: 'G556-7789-3456', idExpiry: '2028-07-20',
    loyaltyNumber: 'GOLD-556677', loyaltyTier: 'Gold',
    cardLast4: '3456', cardBrand: 'Visa'
  },
  {
    id: 'G-007',
    firstName: 'Chris', lastName: 'Anderson',
    email: 'canderson@work.com', phone: '+1 (555) 789-0123',
    address: '789 Pine Street, Seattle, WA 98101',
    idType: 'Drivers License', idState: 'Washington', idNumber: 'A223-5567-7890', idExpiry: '2027-12-05',
    loyaltyNumber: 'SILV-778899', loyaltyTier: 'Silver',
    cardLast4: '7890', cardBrand: 'Mastercard'
  },
  {
    id: 'G-008',
    firstName: 'Jennifer', lastName: 'Lee',
    email: 'jlee@personal.com', phone: '+1 (555) 890-1234',
    address: '123 Maple Avenue, Denver, CO 80202',
    idType: 'Drivers License', idState: 'Colorado', idNumber: 'L998-1123-4567', idExpiry: '2029-04-18',
    loyaltyNumber: 'GOLD-990011', loyaltyTier: 'Gold',
    cardLast4: '4567', cardBrand: 'Visa'
  },
  {
    id: 'G-009',
    firstName: 'James', lastName: 'Wilson',
    email: 'james.wilson@gmail.com', phone: '+1 (555) 901-2345',
    address: '567 Elm Court, Chicago, IL 60601',
    idType: 'Drivers License', idState: 'Illinois', idNumber: 'W445-6678-2345', idExpiry: '2028-01-25',
    loyaltyNumber: 'GOLD-112244', loyaltyTier: 'Gold',
    cardLast4: '2345', cardBrand: 'Visa'
  },
  {
    id: 'G-010',
    firstName: 'Sarah', lastName: 'Chen',
    email: 'sarah.chen@outlook.com', phone: '+1 (555) 012-3456',
    address: '890 Birch Lane, San Francisco, CA 94102',
    idType: 'Passport', idState: 'US', idNumber: '****8834', idExpiry: '2031-08-12',
    loyaltyNumber: 'SILV-334466', loyaltyTier: 'Silver',
    cardLast4: '6789', cardBrand: 'Mastercard'
  }
];

// ============================================================================
// RESERVATIONS - Tied to mock chargeback cases in mockData.js
// ============================================================================

const RESERVATIONS = [
  {
    id: 'RES-78234',
    confirmationNumber: 'RES-78234',
    guestId: 'G-001',
    checkIn: '2026-01-10',
    checkOut: '2026-01-13',
    roomNumber: '412',
    roomType: 'Deluxe King Suite',
    rateCode: 'BAR',
    ratePerNight: 249.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Direct Website',
    bookingDate: '2026-01-02T10:15:00Z',
    bookingIP: '73.162.xxx.xxx',
    bookingDevice: 'Desktop - Chrome 121',
    specialRequests: 'High floor, extra pillows',
    cancellationPolicy: 'Free cancellation until 24h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-02T10:14:30Z'
  },
  {
    id: 'RES-78456',
    confirmationNumber: 'RES-78456',
    guestId: 'G-002',
    checkIn: '2026-01-05',
    checkOut: '2026-01-08',
    roomNumber: '215',
    roomType: 'Standard Double',
    rateCode: 'CORP',
    ratePerNight: 379.00,
    adults: 2, children: 0,
    status: 'checked_out',
    bookingSource: 'Booking.com',
    bookingDate: '2025-12-28T14:30:00Z',
    bookingIP: '198.51.xxx.xxx',
    bookingDevice: 'Mobile - Safari iOS 18',
    specialRequests: 'Late checkout if available',
    cancellationPolicy: 'Non-refundable rate',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2025-12-28T14:29:45Z'
  },
  {
    id: 'RES-77892',
    confirmationNumber: 'RES-77892',
    guestId: 'G-003',
    checkIn: '2025-12-20',
    checkOut: '2025-12-23',
    roomNumber: '308',
    roomType: 'Executive Suite',
    rateCode: 'AAA',
    ratePerNight: 169.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Phone Reservation',
    bookingDate: '2025-12-15T09:20:00Z',
    bookingIP: null,
    bookingDevice: 'Phone call - Agent: Maria',
    specialRequests: 'Near elevator, early check-in',
    cancellationPolicy: 'Free cancellation until 48h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2025-12-15T09:22:00Z'
  },
  {
    id: 'RES-78123',
    confirmationNumber: 'RES-78123',
    guestId: 'G-004',
    checkIn: '2025-12-28',
    checkOut: '2025-12-30',
    roomNumber: '105',
    roomType: 'Standard King',
    rateCode: 'BAR',
    ratePerNight: 179.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Expedia',
    bookingDate: '2025-12-20T18:45:00Z',
    bookingIP: '203.0.xxx.xxx',
    bookingDevice: 'Mobile - Android Chrome',
    specialRequests: null,
    cancellationPolicy: 'Free cancellation until 24h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2025-12-20T18:44:15Z'
  },
  {
    id: 'RES-78567',
    confirmationNumber: 'RES-78567',
    guestId: 'G-005',
    checkIn: '2026-01-18',
    checkOut: '2026-01-22',
    roomNumber: '501',
    roomType: 'Presidential Suite',
    rateCode: 'RACK',
    ratePerNight: 499.00,
    adults: 2, children: 1,
    status: 'checked_out',
    bookingSource: 'Direct Website',
    bookingDate: '2026-01-10T11:00:00Z',
    bookingIP: '172.16.xxx.xxx',
    bookingDevice: 'Desktop - Firefox 122',
    specialRequests: 'Crib in room, champagne on arrival',
    cancellationPolicy: 'Non-refundable suite rate',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-10T10:58:30Z'
  },
  {
    id: 'RES-78890',
    confirmationNumber: 'RES-78890',
    guestId: 'G-006',
    checkIn: '2026-01-12',
    checkOut: '2026-01-15',
    roomNumber: '224',
    roomType: 'Deluxe Double',
    rateCode: 'GOV',
    ratePerNight: 219.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Direct Website',
    bookingDate: '2026-01-05T16:20:00Z',
    bookingIP: '10.0.xxx.xxx',
    bookingDevice: 'Desktop - Edge 121',
    specialRequests: 'Quiet room away from elevator',
    cancellationPolicy: 'Free cancellation until 72h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-05T16:19:00Z'
  },
  {
    id: 'RES-78234B',
    confirmationNumber: 'RES-78234B',
    guestId: 'G-007',
    checkIn: '2025-12-15',
    checkOut: '2025-12-17',
    roomNumber: '318',
    roomType: 'Standard King',
    rateCode: 'BAR',
    ratePerNight: 209.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Hotels.com',
    bookingDate: '2025-12-08T20:10:00Z',
    bookingIP: '192.168.xxx.xxx',
    bookingDevice: 'Mobile - Safari iOS 18',
    specialRequests: null,
    cancellationPolicy: 'Free cancellation until 24h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2025-12-08T20:09:30Z'
  },
  {
    id: 'RES-79001',
    confirmationNumber: 'RES-79001',
    guestId: 'G-008',
    checkIn: '2026-01-20',
    checkOut: '2026-01-24',
    roomNumber: '410',
    roomType: 'Junior Suite',
    rateCode: 'LOYALTY',
    ratePerNight: 249.00,
    adults: 2, children: 0,
    status: 'checked_out',
    bookingSource: 'Loyalty Portal',
    bookingDate: '2026-01-14T13:45:00Z',
    bookingIP: '68.45.xxx.xxx',
    bookingDevice: 'Desktop - Chrome 121',
    specialRequests: 'Anniversary - flowers in room',
    cancellationPolicy: 'Loyalty flexible rate - free cancellation',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-14T13:44:00Z'
  },
  {
    id: 'RES-2026-88421',
    confirmationNumber: 'RES-2026-88421',
    guestId: 'G-009',
    checkIn: '2026-01-27',
    checkOut: '2026-01-30',
    roomNumber: '412',
    roomType: 'King Suite',
    rateCode: 'BAR',
    ratePerNight: 389.00,
    adults: 1, children: 0,
    status: 'checked_out',
    bookingSource: 'Direct Website',
    bookingDate: '2026-01-20T08:30:00Z',
    bookingIP: '73.162.xxx.xxx',
    bookingDevice: 'Desktop - Chrome 121',
    specialRequests: 'Extra towels',
    cancellationPolicy: 'Free cancellation until 24h before check-in',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-20T08:29:15Z'
  },
  {
    id: 'RES-2026-77530',
    confirmationNumber: 'RES-2026-77530',
    guestId: 'G-010',
    checkIn: '2026-01-22',
    checkOut: '2026-01-25',
    roomNumber: '208',
    roomType: 'Double Queen',
    rateCode: 'CORP',
    ratePerNight: 269.00,
    adults: 2, children: 0,
    status: 'checked_out',
    bookingSource: 'Corporate Portal',
    bookingDate: '2026-01-15T11:00:00Z',
    bookingIP: '198.51.xxx.xxx',
    bookingDevice: 'Desktop - Safari macOS',
    specialRequests: 'Adjoining rooms if possible',
    cancellationPolicy: 'Corporate flex rate - 24h cancellation',
    guaranteeType: 'corporate_billing',
    termsAccepted: true,
    termsAcceptedAt: '2026-01-15T10:58:00Z'
  },
  {
    id: 'RES-79100',
    confirmationNumber: 'RES-79100',
    guestId: 'G-001',
    checkIn: '2026-02-15',
    checkOut: '2026-02-18',
    roomNumber: '520',
    roomType: 'Ocean View Suite',
    rateCode: 'LOYALTY',
    ratePerNight: 329.00,
    adults: 2, children: 0,
    status: 'confirmed',
    bookingSource: 'Loyalty Portal',
    bookingDate: '2026-02-01T14:20:00Z',
    bookingIP: '73.162.xxx.xxx',
    bookingDevice: 'Mobile - Chrome Android',
    specialRequests: 'Ocean view preferred',
    cancellationPolicy: 'Loyalty flexible rate - free cancellation',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-02-01T14:19:30Z'
  },
  {
    id: 'RES-79200',
    confirmationNumber: 'RES-79200',
    guestId: 'G-005',
    checkIn: '2026-02-10',
    checkOut: '2026-02-14',
    roomNumber: '601',
    roomType: 'Executive Suite',
    rateCode: 'RACK',
    ratePerNight: 459.00,
    adults: 1, children: 0,
    status: 'checked_in',
    bookingSource: 'Direct Website',
    bookingDate: '2026-02-03T09:15:00Z',
    bookingIP: '172.16.xxx.xxx',
    bookingDevice: 'Desktop - Firefox 122',
    specialRequests: 'Extra workspace, fast WiFi',
    cancellationPolicy: 'Non-refundable rate',
    guaranteeType: 'credit_card',
    termsAccepted: true,
    termsAcceptedAt: '2026-02-03T09:14:00Z'
  }
];

// ============================================================================
// FOLIO GENERATOR - Creates realistic itemized hotel folios
// ============================================================================

function generateFolio(reservation, guest) {
  const checkIn = new Date(reservation.checkIn);
  const checkOut = new Date(reservation.checkOut);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const roomTotal = reservation.ratePerNight * nights;

  const charges = [];
  let lineNum = 1;

  // Room charges per night
  for (let i = 0; i < nights; i++) {
    const date = new Date(checkIn);
    date.setDate(date.getDate() + i);
    charges.push({
      lineNumber: lineNum++,
      date: date.toISOString().split('T')[0],
      description: `Room Charge - ${reservation.roomType} (${reservation.rateCode})`,
      category: 'room',
      amount: reservation.ratePerNight,
      tax: Math.round(reservation.ratePerNight * 0.12 * 100) / 100
    });
  }

  // Incidentals based on guest/reservation
  const incidentals = [];
  if (reservation.ratePerNight > 300) {
    incidentals.push({ desc: 'Room Service - Dinner', amount: 68.50, date: 0 });
    incidentals.push({ desc: 'Mini Bar', amount: 24.00, date: 1 });
    incidentals.push({ desc: 'Spa - Swedish Massage', amount: 145.00, date: 1 });
  }
  if (nights >= 3) {
    incidentals.push({ desc: 'Parking - Self (Daily)', amount: 25.00, date: 0 });
    incidentals.push({ desc: 'Parking - Self (Daily)', amount: 25.00, date: 1 });
    incidentals.push({ desc: 'Parking - Self (Daily)', amount: 25.00, date: 2 });
  }
  if (reservation.specialRequests?.includes('champagne')) {
    incidentals.push({ desc: 'In-Room Amenity - Champagne', amount: 85.00, date: 0 });
  }
  incidentals.push({ desc: 'Resort Fee', amount: 35.00 * nights, date: 0 });

  incidentals.forEach(inc => {
    const date = new Date(checkIn);
    date.setDate(date.getDate() + (inc.date || 0));
    charges.push({
      lineNumber: lineNum++,
      date: date.toISOString().split('T')[0],
      description: inc.desc,
      category: 'incidental',
      amount: inc.amount,
      tax: Math.round(inc.amount * 0.08 * 100) / 100
    });
  });

  const subtotal = charges.reduce((sum, c) => sum + c.amount, 0);
  const totalTax = charges.reduce((sum, c) => sum + c.tax, 0);
  const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

  const payments = [
    {
      date: reservation.checkOut,
      method: `${guest.cardBrand} ****${guest.cardLast4}`,
      type: 'credit_card',
      amount: grandTotal,
      authCode: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      transactionId: `TXN-${Date.now().toString(36).toUpperCase()}`
    }
  ];

  return {
    folioNumber: `FOL-${reservation.confirmationNumber}`,
    reservationId: reservation.id,
    guestName: `${guest.firstName} ${guest.lastName}`,
    roomNumber: reservation.roomNumber,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    nights,
    charges,
    subtotal: Math.round(subtotal * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    grandTotal,
    payments,
    balance: 0.00,
    status: 'settled',
    generatedAt: new Date().toISOString()
  };
}

// ============================================================================
// KEY CARD ACCESS LOG GENERATOR
// ============================================================================

function generateKeyCardLog(reservation) {
  const checkIn = new Date(reservation.checkIn);
  const checkOut = new Date(reservation.checkOut);
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const logs = [];

  // Check-in access
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(15, Math.floor(Math.random() * 30) + 10);
  logs.push({
    timestamp: checkInTime.toISOString(),
    room: reservation.roomNumber,
    action: 'KEY_CARD_ISSUED',
    device: 'Front Desk Terminal #1',
    cardNumber: 1
  });
  logs.push({
    timestamp: new Date(checkInTime.getTime() + 300000).toISOString(),
    room: reservation.roomNumber,
    action: 'ROOM_ENTRY',
    device: `Door Lock - Room ${reservation.roomNumber}`,
    cardNumber: 1
  });

  // Daily entries/exits
  for (let i = 0; i < nights; i++) {
    const day = new Date(checkIn);
    day.setDate(day.getDate() + i);

    // Morning exit
    const exitTime = new Date(day);
    exitTime.setHours(8 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
    if (i > 0 || exitTime > checkInTime) {
      logs.push({
        timestamp: exitTime.toISOString(),
        room: reservation.roomNumber,
        action: 'ROOM_ENTRY',
        device: `Door Lock - Room ${reservation.roomNumber}`,
        cardNumber: 1
      });
    }

    // Afternoon return
    const returnTime = new Date(day);
    returnTime.setHours(14 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));
    logs.push({
      timestamp: returnTime.toISOString(),
      room: reservation.roomNumber,
      action: 'ROOM_ENTRY',
      device: `Door Lock - Room ${reservation.roomNumber}`,
      cardNumber: 1
    });

    // Evening out/in
    if (Math.random() > 0.4) {
      const eveningOut = new Date(day);
      eveningOut.setHours(18 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
      logs.push({
        timestamp: eveningOut.toISOString(),
        room: reservation.roomNumber,
        action: 'ROOM_ENTRY',
        device: `Door Lock - Room ${reservation.roomNumber}`,
        cardNumber: 1
      });

      const eveningReturn = new Date(day);
      eveningReturn.setHours(21 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60));
      logs.push({
        timestamp: eveningReturn.toISOString(),
        room: reservation.roomNumber,
        action: 'ROOM_ENTRY',
        device: `Door Lock - Room ${reservation.roomNumber}`,
        cardNumber: 1
      });
    }
  }

  // Checkout
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(10, Math.floor(Math.random() * 50) + 5);
  logs.push({
    timestamp: checkOutTime.toISOString(),
    room: reservation.roomNumber,
    action: 'ROOM_ENTRY',
    device: `Door Lock - Room ${reservation.roomNumber}`,
    cardNumber: 1
  });
  logs.push({
    timestamp: new Date(checkOutTime.getTime() + 600000).toISOString(),
    room: reservation.roomNumber,
    action: 'KEY_CARD_DEACTIVATED',
    device: 'Front Desk Terminal #1',
    cardNumber: 1
  });

  return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// ============================================================================
// AUDIT TRAIL GENERATOR
// ============================================================================

function generateAuditTrail(reservation, guest) {
  const checkIn = new Date(reservation.checkIn);
  const bookingDate = new Date(reservation.bookingDate);
  const checkOut = new Date(reservation.checkOut);

  const trail = [
    {
      timestamp: reservation.bookingDate,
      action: 'RESERVATION_CREATED',
      user: reservation.bookingSource === 'Phone Reservation' ? 'Maria Torres (Agent)' : 'Online System',
      details: `Reservation ${reservation.confirmationNumber} created via ${reservation.bookingSource}`,
      module: 'Reservations'
    },
    {
      timestamp: reservation.termsAcceptedAt,
      action: 'TERMS_ACCEPTED',
      user: `${guest.firstName} ${guest.lastName}`,
      details: `Terms and conditions accepted. Cancellation policy: ${reservation.cancellationPolicy}`,
      module: 'Booking Engine'
    },
    {
      timestamp: new Date(bookingDate.getTime() + 60000).toISOString(),
      action: 'CARD_AUTHORIZED',
      user: 'Payment Gateway',
      details: `${guest.cardBrand} ending ${guest.cardLast4} authorized for guarantee. Auth code: PRE${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      module: 'Payments'
    },
    {
      timestamp: new Date(bookingDate.getTime() + 120000).toISOString(),
      action: 'CONFIRMATION_SENT',
      user: 'System',
      details: `Confirmation email sent to ${guest.email}`,
      module: 'Communications'
    }
  ];

  // Check-in events
  const checkInTime = new Date(checkIn);
  checkInTime.setHours(15, 15);

  trail.push({
    timestamp: new Date(checkInTime.getTime() - 300000).toISOString(),
    action: 'ID_SCANNED',
    user: 'Front Desk - Agent: Jessica Park',
    details: `${guest.idType} scanned and verified. ID: ${guest.idNumber}, State: ${guest.idState}`,
    module: 'Front Desk'
  });
  trail.push({
    timestamp: new Date(checkInTime.getTime() - 120000).toISOString(),
    action: 'REGISTRATION_SIGNED',
    user: `${guest.firstName} ${guest.lastName}`,
    details: 'Digital registration card signed on tablet. IP: Front Desk Terminal #2',
    module: 'Front Desk'
  });
  trail.push({
    timestamp: checkInTime.toISOString(),
    action: 'CHECKED_IN',
    user: 'Front Desk - Agent: Jessica Park',
    details: `Guest checked into room ${reservation.roomNumber}. Key card #1 issued.`,
    module: 'Front Desk'
  });

  // During stay
  trail.push({
    timestamp: new Date(checkInTime.getTime() + 3600000 * 3).toISOString(),
    action: 'WIFI_CONNECTED',
    user: 'System',
    details: `Guest connected to hotel WiFi. Device: ${guest.firstName}'s iPhone`,
    module: 'Network'
  });

  // Check-out events
  const checkOutTime = new Date(checkOut);
  checkOutTime.setHours(10, 30);

  trail.push({
    timestamp: new Date(checkOutTime.getTime() - 600000).toISOString(),
    action: 'CHECKOUT_INITIATED',
    user: `${guest.firstName} ${guest.lastName}`,
    details: 'Express checkout via in-room TV',
    module: 'Front Desk'
  });
  trail.push({
    timestamp: checkOutTime.toISOString(),
    action: 'CHECKED_OUT',
    user: 'System',
    details: `Guest checked out. Final folio settled to ${guest.cardBrand} ****${guest.cardLast4}`,
    module: 'Front Desk'
  });
  trail.push({
    timestamp: new Date(checkOutTime.getTime() + 60000).toISOString(),
    action: 'PAYMENT_POSTED',
    user: 'Payment Gateway',
    details: `Final payment captured on ${guest.cardBrand} ****${guest.cardLast4}`,
    module: 'Payments'
  });
  trail.push({
    timestamp: new Date(checkOutTime.getTime() + 120000).toISOString(),
    action: 'FOLIO_EMAILED',
    user: 'System',
    details: `Final folio emailed to ${guest.email}`,
    module: 'Communications'
  });

  return trail.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// ============================================================================
// AUTOCLERK EMULATOR CLASS
// ============================================================================

class AutoClerkEmulator {
  constructor() {
    this.guests = GUESTS;
    this.reservations = RESERVATIONS;
    this.evidenceStore = new Map(); // caseId -> [evidence]
  }

  /**
   * Search reservations by various criteria
   * globalSearch searches across ALL fields with OR logic
   */
  searchReservations({ globalSearch, confirmationNumber, guestName, guestEmail, checkIn, checkOut, cardLast4, roomNumber, status }) {
    let results = [...this.reservations];

    // Global search: match ANY field (OR logic)
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      results = results.filter(r => {
        const guest = this.guests.find(g => g.id === r.guestId);
        const fullName = `${guest.firstName} ${guest.lastName}`.toLowerCase();
        return (
          r.confirmationNumber.toLowerCase().includes(q) ||
          fullName.includes(q) ||
          guest.email.toLowerCase().includes(q) ||
          guest.phone.includes(q) ||
          r.roomNumber === globalSearch ||
          guest.cardLast4 === globalSearch ||
          (guest.loyaltyNumber && guest.loyaltyNumber.toLowerCase().includes(q)) ||
          r.roomType.toLowerCase().includes(q) ||
          r.bookingSource.toLowerCase().includes(q)
        );
      });
    }

    // Specific field filters (AND logic, applied after global search)
    if (confirmationNumber) {
      results = results.filter(r =>
        r.confirmationNumber.toLowerCase().includes(confirmationNumber.toLowerCase())
      );
    }
    if (guestName) {
      results = results.filter(r => {
        const guest = this.guests.find(g => g.id === r.guestId);
        const fullName = `${guest.firstName} ${guest.lastName}`.toLowerCase();
        return fullName.includes(guestName.toLowerCase());
      });
    }
    if (guestEmail) {
      results = results.filter(r => {
        const guest = this.guests.find(g => g.id === r.guestId);
        return guest.email.toLowerCase().includes(guestEmail.toLowerCase());
      });
    }
    if (checkIn) {
      results = results.filter(r => r.checkIn >= checkIn);
    }
    if (checkOut) {
      results = results.filter(r => r.checkOut <= checkOut);
    }
    if (cardLast4) {
      results = results.filter(r => {
        const guest = this.guests.find(g => g.id === r.guestId);
        return guest.cardLast4 === cardLast4;
      });
    }
    if (roomNumber) {
      results = results.filter(r => r.roomNumber === roomNumber);
    }
    if (status) {
      results = results.filter(r => r.status === status);
    }

    // Enrich with guest data
    return results.map(r => {
      const guest = this.guests.find(g => g.id === r.guestId);
      return {
        ...r,
        guestName: `${guest.firstName} ${guest.lastName}`,
        guestEmail: guest.email,
        guestPhone: guest.phone,
        cardLast4: guest.cardLast4,
        cardBrand: guest.cardBrand,
        loyaltyNumber: guest.loyaltyNumber,
        loyaltyTier: guest.loyaltyTier
      };
    });
  }

  /**
   * Get full reservation detail with guest info
   */
  getReservation(reservationId) {
    const reservation = this.reservations.find(r => r.id === reservationId || r.confirmationNumber === reservationId);
    if (!reservation) return null;

    const guest = this.guests.find(g => g.id === reservation.guestId);
    return {
      ...reservation,
      guestName: `${guest.firstName} ${guest.lastName}`,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      cardLast4: guest.cardLast4,
      cardBrand: guest.cardBrand,
      loyaltyNumber: guest.loyaltyNumber,
      loyaltyTier: guest.loyaltyTier,
      guest: {
        ...guest,
        fullName: `${guest.firstName} ${guest.lastName}`
      }
    };
  }

  /**
   * Fetch all evidence types for a reservation
   */
  fetchEvidence(confirmationNumber, evidenceTypes = []) {
    const reservation = this.reservations.find(
      r => r.confirmationNumber === confirmationNumber || r.id === confirmationNumber
    );
    if (!reservation) return { error: 'Reservation not found', evidence: [] };

    const guest = this.guests.find(g => g.id === reservation.guestId);
    const folio = generateFolio(reservation, guest);
    const keyCardLog = generateKeyCardLog(reservation);
    const auditTrail = generateAuditTrail(reservation, guest);

    const allEvidence = [
      {
        id: `ev-folio-${reservation.id}`,
        type: 'folio',
        label: 'Guest Folio',
        description: `Complete guest folio for ${guest.firstName} ${guest.lastName} - ${folio.nights} night stay`,
        fileName: `folio_${confirmationNumber}.pdf`,
        fileSize: 245760,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: folio
      },
      {
        id: `ev-regcard-${reservation.id}`,
        type: 'registration_card',
        label: 'Registration Card',
        description: 'Signed guest registration card with terms acceptance',
        fileName: `reg_card_${confirmationNumber}.pdf`,
        fileSize: 156432,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          guestName: `${guest.firstName} ${guest.lastName}`,
          address: guest.address,
          email: guest.email,
          phone: guest.phone,
          idType: guest.idType,
          idNumber: guest.idNumber,
          idState: guest.idState,
          roomNumber: reservation.roomNumber,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          ratePerNight: reservation.ratePerNight,
          signaturePresent: true,
          signedAt: new Date(new Date(reservation.checkIn).getTime() + 15 * 3600000 + 12 * 60000).toISOString(),
          signatureDevice: 'Front Desk Tablet #2',
          termsAccepted: true,
          cancellationPolicy: reservation.cancellationPolicy
        }
      },
      {
        id: `ev-payment-${reservation.id}`,
        type: 'payment_receipt',
        label: 'Payment Receipt',
        description: 'Credit card authorization and final payment receipt',
        fileName: `payment_${confirmationNumber}.pdf`,
        fileSize: 98304,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          transactionId: folio.payments[0]?.transactionId,
          cardType: guest.cardBrand,
          cardLast4: guest.cardLast4,
          amount: folio.grandTotal,
          authCode: folio.payments[0]?.authCode,
          authDate: reservation.bookingDate,
          captureDate: reservation.checkOut,
          status: 'captured',
          merchantId: 'ACCUDEF-HOTEL-001',
          terminalId: 'POS-FD-01'
        }
      },
      {
        id: `ev-signature-${reservation.id}`,
        type: 'guest_signature',
        label: 'Guest Signature',
        description: 'Digital signature captured at check-in',
        fileName: `signature_${confirmationNumber}.png`,
        fileSize: 45056,
        mimeType: 'image/png',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          capturedAt: new Date(new Date(reservation.checkIn).getTime() + 15 * 3600000 + 12 * 60000).toISOString(),
          captureDevice: 'Front Desk Tablet #2',
          signatureType: 'digital_ink',
          verified: true,
          matchesId: true,
          penPressureData: true
        }
      },
      {
        id: `ev-idscan-${reservation.id}`,
        type: 'id_scan',
        label: 'ID Document Scan',
        description: `Scanned ${guest.idType} - verified at check-in`,
        fileName: `id_scan_${confirmationNumber}.pdf`,
        fileSize: 512000,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          documentType: guest.idType,
          issuingAuthority: guest.idState,
          documentNumber: guest.idNumber,
          expirationDate: guest.idExpiry,
          holderName: `${guest.firstName} ${guest.lastName}`,
          matchesReservation: true,
          scannedAt: new Date(new Date(reservation.checkIn).getTime() + 15 * 3600000 + 10 * 60000).toISOString(),
          scannedBy: 'Front Desk - Agent: Jessica Park',
          verificationStatus: 'VERIFIED'
        }
      },
      {
        id: `ev-reservation-${reservation.id}`,
        type: 'reservation',
        label: 'Reservation Confirmation',
        description: 'Original booking confirmation and terms',
        fileName: `reservation_${confirmationNumber}.pdf`,
        fileSize: 125440,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          confirmationNumber: reservation.confirmationNumber,
          bookingSource: reservation.bookingSource,
          bookingDate: reservation.bookingDate,
          ipAddress: reservation.bookingIP,
          deviceType: reservation.bookingDevice,
          guestName: `${guest.firstName} ${guest.lastName}`,
          guestEmail: guest.email,
          roomType: reservation.roomType,
          rateCode: reservation.rateCode,
          ratePerNight: reservation.ratePerNight,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          specialRequests: reservation.specialRequests,
          cancellationPolicy: reservation.cancellationPolicy,
          termsAccepted: reservation.termsAccepted,
          termsAcceptedAt: reservation.termsAcceptedAt
        }
      },
      {
        id: `ev-audit-${reservation.id}`,
        type: 'audit_trail',
        label: 'Audit Trail',
        description: 'Complete activity log from booking to checkout',
        fileName: `audit_trail_${confirmationNumber}.pdf`,
        fileSize: 189440,
        mimeType: 'application/pdf',
        source: 'AutoClerk PMS',
        generatedAt: new Date().toISOString(),
        data: {
          entries: auditTrail,
          keyCardLog,
          totalEvents: auditTrail.length + keyCardLog.length
        }
      }
    ];

    const filtered = evidenceTypes.length > 0
      ? allEvidence.filter(e => evidenceTypes.includes(e.type))
      : allEvidence;

    return {
      confirmationNumber: reservation.confirmationNumber,
      guestName: `${guest.firstName} ${guest.lastName}`,
      evidenceCount: filtered.length,
      evidence: filtered,
      fetchedAt: new Date().toISOString()
    };
  }

  /**
   * Store evidence attached to a case
   */
  storeEvidence(caseId, evidence) {
    const existing = this.evidenceStore.get(caseId) || [];
    const newEvidence = evidence.map(e => ({
      ...e,
      caseId,
      attachedAt: new Date().toISOString(),
      status: 'attached'
    }));
    this.evidenceStore.set(caseId, [...existing, ...newEvidence]);
    return newEvidence;
  }

  /**
   * Get evidence stored for a case
   */
  getCaseEvidence(caseId) {
    return this.evidenceStore.get(caseId) || [];
  }

  /**
   * Get all stored evidence across all cases
   */
  getAllEvidence() {
    const all = [];
    for (const [caseId, evidence] of this.evidenceStore) {
      evidence.forEach(e => all.push({ ...e, caseId }));
    }
    return all;
  }

  /**
   * Get connection status (emulated)
   */
  getStatus() {
    return {
      system: 'AutoClerk PMS',
      status: 'connected',
      version: 'v2.4.1',
      propertyName: 'AccuDefend Demo Hotel',
      propertyCode: 'ACDF-001',
      lastSync: new Date(Date.now() - 300000).toISOString(),
      nextSync: new Date(Date.now() + 3300000).toISOString(),
      reservationsCount: this.reservations.length,
      guestsCount: this.guests.length,
      evidenceTypesAvailable: ['folio', 'registration_card', 'payment_receipt', 'guest_signature', 'id_scan', 'reservation', 'audit_trail'],
      features: ['real_time_sync', 'auto_evidence_fetch', 'signature_capture', 'id_verification'],
      health: { apiReachable: true, authValid: true, lastError: null }
    };
  }
}

// Singleton instance
const autoclerk = new AutoClerkEmulator();

module.exports = { AutoClerkEmulator, autoclerk };
