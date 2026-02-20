/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * PMS Data Normalization Utilities
 *
 * Shared normalization functions used across all PMS adapters to convert
 * PMS-specific data formats into canonical AccuDefend shapes.
 */

'use strict';

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

/**
 * Parse a wide variety of date formats into an ISO-8601 UTC string.
 * Handles ISO, epoch (ms and s), MM/DD/YYYY, DD-MMM-YY, YYYY/MM/DD, etc.
 *
 * @param {string|number|Date} value - The raw date value from the PMS.
 * @returns {string|null} ISO-8601 date string, or null if unparseable.
 */
function normalizeDate(value) {
  if (value == null || value === '') return null;

  // Already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }

  // Numeric epoch (seconds if < 1e12, otherwise milliseconds)
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  // Numeric string epoch
  if (/^\d{10,13}$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD-MMM-YY or DD-MMM-YYYY  (e.g. "15-JAN-24" or "15-JAN-2024")
  const monthMap = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const ddMmmYy = trimmed.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
  if (ddMmmYy) {
    const day = parseInt(ddMmmYy[1], 10);
    const mon = monthMap[ddMmmYy[2].toUpperCase()];
    let year = parseInt(ddMmmYy[3], 10);
    if (mon !== undefined) {
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, mon, day));
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mmddyyyy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mmddyyyy) {
    const month = parseInt(mmddyyyy[1], 10) - 1;
    const day = parseInt(mmddyyyy[2], 10);
    const year = parseInt(mmddyyyy[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // YYYY/MM/DD
  const yyyymmdd = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yyyymmdd) {
    const d = new Date(Date.UTC(
      parseInt(yyyymmdd[1], 10),
      parseInt(yyyymmdd[2], 10) - 1,
      parseInt(yyyymmdd[3], 10)
    ));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Fallback: let the Date constructor try
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

// ---------------------------------------------------------------------------
// Currency normalization
// ---------------------------------------------------------------------------

/**
 * Map ISO-4217 numeric codes and common abbreviations to a standard
 * three-letter uppercase currency code.
 *
 * @param {string|number} value - e.g. "USD", "usd", 840, "978"
 * @returns {string} Uppercase three-letter currency code, defaults to "USD".
 */
function normalizeCurrency(value) {
  if (value == null || value === '') return 'USD';

  const numericToCode = {
    840: 'USD', 978: 'EUR', 826: 'GBP', 124: 'CAD', 36: 'AUD',
    392: 'JPY', 756: 'CHF', 484: 'MXN', 986: 'BRL', 156: 'CNY',
    356: 'INR', 702: 'SGD', 344: 'HKD', 554: 'NZD', 752: 'SEK',
    578: 'NOK', 208: 'DKK', 710: 'ZAR', 682: 'SAR', 784: 'AED',
    764: 'THB', 410: 'KRW',
  };

  if (typeof value === 'number') {
    return numericToCode[value] || 'USD';
  }

  const str = String(value).trim().toUpperCase();

  // Numeric string
  const asNum = parseInt(str, 10);
  if (!isNaN(asNum) && numericToCode[asNum]) {
    return numericToCode[asNum];
  }

  // Already a 3-letter code
  if (/^[A-Z]{3}$/.test(str)) return str;

  // Common aliases
  const aliases = {
    DOLLAR: 'USD', DOLLARS: 'USD', US: 'USD',
    EURO: 'EUR', EUROS: 'EUR',
    POUND: 'GBP', POUNDS: 'GBP', STERLING: 'GBP',
    YEN: 'JPY', FRANC: 'CHF',
  };

  return aliases[str] || 'USD';
}

// ---------------------------------------------------------------------------
// Amount normalization
// ---------------------------------------------------------------------------

/**
 * Convert a monetary amount from various PMS formats into a standard
 * JavaScript number representing the value in the major currency unit (dollars).
 *
 * Handles: strings with symbols ("$1,234.56"), cents/subunit integers,
 * European comma notation ("1.234,56"), negative values, etc.
 *
 * @param {string|number} value - The raw amount.
 * @param {Object} [options]
 * @param {boolean} [options.isCents=false] - If true, value is in cents / subunits.
 * @returns {number} Amount in major currency unit, or 0 if unparseable.
 */
function normalizeAmount(value, options = {}) {
  if (value == null || value === '') return 0;

  if (typeof value === 'number') {
    return options.isCents ? Math.round(value) / 100 : Math.round(value * 100) / 100;
  }

  let str = String(value).trim();

  // Detect negativity
  const isNegative = str.startsWith('-') || str.startsWith('(');
  str = str.replace(/^[(-]+|[)]+$/g, '');

  // Strip currency symbols
  str = str.replace(/[^0-9.,]/g, '');

  if (str === '') return 0;

  // Detect European notation: "1.234,56" (dot as thousands, comma as decimal)
  // vs standard: "1,234.56" (comma as thousands, dot as decimal)
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');

  let normalized;
  if (lastComma > lastDot) {
    // European: comma is the decimal separator
    normalized = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard: dot is the decimal separator (or no ambiguity)
    normalized = str.replace(/,/g, '');
  }

  let num = parseFloat(normalized);
  if (isNaN(num)) return 0;

  if (options.isCents) {
    num = Math.round(num) / 100;
  }

  num = Math.round(num * 100) / 100;
  return isNegative ? -num : num;
}

// ---------------------------------------------------------------------------
// Card brand normalization
// ---------------------------------------------------------------------------

/**
 * Normalize card brand identifiers from various PMS formats to a standard name.
 *
 * @param {string|number} value - e.g. "VI", "Visa", "visa", "4", "MC", "AX"
 * @returns {string} Canonical card brand name.
 */
function normalizeCardBrand(value) {
  if (value == null || value === '') return 'Unknown';

  const str = String(value).trim().toUpperCase();

  const brandMap = {
    // Visa
    VI: 'Visa', VISA: 'Visa', VS: 'Visa', '4': 'Visa', VISD: 'Visa',
    // Mastercard
    MC: 'Mastercard', MASTERCARD: 'Mastercard', MASTER: 'Mastercard',
    MAST: 'Mastercard', '5': 'Mastercard', '2': 'Mastercard',
    MASTER_CARD: 'Mastercard', MSCD: 'Mastercard',
    // American Express
    AX: 'American Express', AMEX: 'American Express',
    AMERICAN_EXPRESS: 'American Express', AMERICANEXPRESS: 'American Express',
    '3': 'American Express', AXPS: 'American Express',
    // Discover
    DS: 'Discover', DISCOVER: 'Discover', DISC: 'Discover',
    '6': 'Discover', DCVR: 'Discover',
    // Diners Club
    DC: 'Diners Club', DINERS: 'Diners Club', DINERS_CLUB: 'Diners Club',
    DINERSCLUB: 'Diners Club',
    // JCB
    JC: 'JCB', JCB: 'JCB',
    // UnionPay
    UP: 'UnionPay', UNIONPAY: 'UnionPay', CUP: 'UnionPay',
    CHINA_UNIONPAY: 'UnionPay',
    // Debit
    DB: 'Debit', DEBIT: 'Debit',
    // Cash
    CA: 'Cash', CASH: 'Cash',
  };

  // Direct match
  if (brandMap[str]) return brandMap[str];

  // Partial / contains match
  if (str.includes('VISA')) return 'Visa';
  if (str.includes('MASTER')) return 'Mastercard';
  if (str.includes('AMEX') || str.includes('AMERICAN')) return 'American Express';
  if (str.includes('DISCOVER')) return 'Discover';
  if (str.includes('DINER')) return 'Diners Club';
  if (str.includes('JCB')) return 'JCB';
  if (str.includes('UNION')) return 'UnionPay';

  return 'Unknown';
}

// ---------------------------------------------------------------------------
// Reservation status normalization
// ---------------------------------------------------------------------------

/**
 * Map PMS-specific reservation statuses to canonical AccuDefend statuses.
 *
 * @param {string} value - PMS status string.
 * @returns {string} One of: confirmed, checked_in, checked_out, cancelled, no_show, reserved, pending.
 */
function normalizeReservationStatus(value) {
  if (value == null || value === '') return 'unknown';

  const str = String(value).trim().toUpperCase().replace(/[_\-\s]+/g, '_');

  const statusMap = {
    // Confirmed
    CONFIRMED: 'confirmed', CONFIRM: 'confirmed', CNF: 'confirmed',
    RESERVED: 'confirmed', DEFINITE: 'confirmed', DEF: 'confirmed',
    BOOKED: 'confirmed', GUARANTEED: 'confirmed',
    // Checked in
    CHECKED_IN: 'checked_in', CHECKEDIN: 'checked_in', IN_HOUSE: 'checked_in',
    INHOUSE: 'checked_in', ARRIVED: 'checked_in', CI: 'checked_in',
    STAY: 'checked_in', STAYING: 'checked_in', STARTED: 'checked_in',
    // Checked out
    CHECKED_OUT: 'checked_out', CHECKEDOUT: 'checked_out', DEPARTED: 'checked_out',
    CO: 'checked_out', COMPLETED: 'checked_out', FINISHED: 'checked_out',
    // Cancelled
    CANCELLED: 'cancelled', CANCELED: 'cancelled', CANCEL: 'cancelled',
    CXL: 'cancelled', CAN: 'cancelled', VOID: 'cancelled',
    // No show
    NO_SHOW: 'no_show', NOSHOW: 'no_show', NS: 'no_show',
    // Pending / tentative
    PENDING: 'pending', TENTATIVE: 'pending', TENT: 'pending',
    WAITLIST: 'pending', WAITLISTED: 'pending', OPTIONAL: 'pending',
    REQUESTED: 'pending', INQUIRY: 'pending',
  };

  if (statusMap[str]) return statusMap[str];

  // Partial match fallback
  if (str.includes('CHECK') && str.includes('IN')) return 'checked_in';
  if (str.includes('CHECK') && str.includes('OUT')) return 'checked_out';
  if (str.includes('CANCEL')) return 'cancelled';
  if (str.includes('NO') && str.includes('SHOW')) return 'no_show';
  if (str.includes('CONFIRM') || str.includes('RESERV')) return 'confirmed';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Guest name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize guest name from various formats into { firstName, lastName, fullName }.
 *
 * Handles:
 *  - "Last, First"
 *  - "First Last"
 *  - "First Middle Last"
 *  - { firstName, lastName }
 *  - { first_name, last_name }
 *  - { givenName, surname }
 *  - { nameFirst, nameLast }
 *  - { GuestName: "..." }
 *
 * @param {string|Object} value
 * @returns {{ firstName: string, lastName: string, fullName: string }}
 */
function normalizeGuestName(value) {
  const empty = { firstName: '', lastName: '', fullName: '' };

  if (value == null) return empty;

  // Object with name parts
  if (typeof value === 'object' && !(value instanceof Array)) {
    const first = value.firstName || value.first_name || value.givenName
      || value.nameFirst || value.FirstName || value.GivenName || '';
    const last = value.lastName || value.last_name || value.surname
      || value.nameLast || value.LastName || value.Surname || value.FamilyName || '';

    // If we have parts, use them
    if (first || last) {
      const fn = String(first).trim();
      const ln = String(last).trim();
      return {
        firstName: fn,
        lastName: ln,
        fullName: [fn, ln].filter(Boolean).join(' '),
      };
    }

    // Fallback to a string field
    const nameStr = value.fullName || value.full_name || value.name
      || value.Name || value.GuestName || value.guestName || '';
    if (nameStr) {
      return normalizeGuestName(String(nameStr));
    }

    return empty;
  }

  // String
  if (typeof value !== 'string') return empty;
  const str = value.trim();
  if (!str) return empty;

  // "Last, First" or "Last, First Middle"
  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim());
    const lastName = parts[0] || '';
    const firstName = parts.slice(1).join(' ').trim() || '';
    return {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
    };
  }

  // "First Last" or "First Middle Last"
  const words = str.split(/\s+/);
  if (words.length === 1) {
    return { firstName: words[0], lastName: '', fullName: words[0] };
  }

  const firstName = words[0];
  const lastName = words[words.length - 1];
  return {
    firstName,
    lastName,
    fullName: str,
  };
}

// ---------------------------------------------------------------------------
// Folio category normalization
// ---------------------------------------------------------------------------

/**
 * Map PMS-specific folio/transaction categories into canonical categories.
 *
 * @param {string} value - PMS category or transaction code.
 * @returns {string} One of: room, tax, incidental, food_beverage, payment, adjustment, fee, other.
 */
function normalizeFolioCategory(value) {
  if (value == null || value === '') return 'other';

  const str = String(value).trim().toUpperCase().replace(/[_\-\s]+/g, '_');

  const categoryMap = {
    // Room charges
    ROOM: 'room', ROOM_CHARGE: 'room', ROOM_REVENUE: 'room',
    ACCOMMODATION: 'room', LODGING: 'room', ROOM_RATE: 'room',
    NIGHT_AUDIT: 'room', RATE: 'room', NIGHTLY_RATE: 'room',
    ROOM_AND_TAX: 'room',
    // Tax
    TAX: 'tax', TAXES: 'tax', TAX_CHARGE: 'tax', VAT: 'tax',
    CITY_TAX: 'tax', STATE_TAX: 'tax', OCCUPANCY_TAX: 'tax',
    TOURISM_TAX: 'tax', SALES_TAX: 'tax', GST: 'tax',
    // Incidentals
    INCIDENTAL: 'incidental', MINIBAR: 'incidental', TELEPHONE: 'incidental',
    LAUNDRY: 'incidental', DRY_CLEANING: 'incidental', SPA: 'incidental',
    PARKING: 'incidental', INTERNET: 'incidental', WIFI: 'incidental',
    MOVIE: 'incidental', IN_ROOM: 'incidental', GIFT_SHOP: 'incidental',
    MISCELLANEOUS: 'incidental', MISC: 'incidental', SUNDRY: 'incidental',
    OTHER_REVENUE: 'incidental', VALET: 'incidental', BUSINESS_CENTER: 'incidental',
    GYM: 'incidental', FITNESS: 'incidental', POOL: 'incidental',
    // Food & beverage
    FOOD: 'food_beverage', BEVERAGE: 'food_beverage', FB: 'food_beverage',
    F_B: 'food_beverage', FOOD_BEVERAGE: 'food_beverage',
    RESTAURANT: 'food_beverage', BAR: 'food_beverage', DINING: 'food_beverage',
    ROOM_SERVICE: 'food_beverage', BREAKFAST: 'food_beverage',
    LUNCH: 'food_beverage', DINNER: 'food_beverage', CATERING: 'food_beverage',
    BANQUET: 'food_beverage',
    // Payments
    PAYMENT: 'payment', CASH: 'payment', CREDIT_CARD: 'payment',
    CC: 'payment', CHECK: 'payment', WIRE: 'payment', DEPOSIT: 'payment',
    ADVANCE_DEPOSIT: 'payment', PREPAYMENT: 'payment', ONLINE_PAYMENT: 'payment',
    DIRECT_BILL: 'payment', AR: 'payment', ACCOUNTS_RECEIVABLE: 'payment',
    // Adjustments
    ADJUSTMENT: 'adjustment', ADJ: 'adjustment', REBATE: 'adjustment',
    DISCOUNT: 'adjustment', ALLOWANCE: 'adjustment', CORRECTION: 'adjustment',
    REFUND: 'adjustment', COMP: 'adjustment', COMPLIMENTARY: 'adjustment',
    CREDIT: 'adjustment', WRITE_OFF: 'adjustment',
    // Fees
    FEE: 'fee', RESORT_FEE: 'fee', SERVICE_FEE: 'fee',
    EARLY_DEPARTURE: 'fee', LATE_CHECKOUT: 'fee', CANCELLATION_FEE: 'fee',
    NO_SHOW_FEE: 'fee', PET_FEE: 'fee', EXTRA_PERSON: 'fee',
    DAMAGE: 'fee', SMOKING_FEE: 'fee',
  };

  if (categoryMap[str]) return categoryMap[str];

  // Partial matching
  if (str.includes('ROOM') && !str.includes('SERVICE')) return 'room';
  if (str.includes('TAX') || str.includes('VAT')) return 'tax';
  if (str.includes('FOOD') || str.includes('BEVERAGE') || str.includes('RESTAURANT')) return 'food_beverage';
  if (str.includes('PAYMENT') || str.includes('CREDIT_CARD') || str.includes('DEPOSIT')) return 'payment';
  if (str.includes('ADJ') || str.includes('REFUND') || str.includes('DISCOUNT')) return 'adjustment';
  if (str.includes('FEE') || str.includes('CHARGE') || str.includes('SURCHARGE')) return 'fee';

  return 'other';
}

// ---------------------------------------------------------------------------
// PII sanitization
// ---------------------------------------------------------------------------

/**
 * Deep-clone a data object and mask sensitive PII fields before storage or logging.
 * Recognizes common PII field names and masks their values.
 *
 * @param {Object} data - Raw PMS data object.
 * @returns {Object} Sanitized copy with PII masked.
 */
function sanitizePII(data) {
  if (data == null) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(item => sanitizePII(item));

  // Fields that should be fully masked
  const fullyMasked = new Set([
    'ssn', 'social_security', 'socialSecurityNumber', 'SSN',
    'passport', 'passportNumber', 'passport_number',
    'driverLicense', 'driver_license', 'driversLicense',
    'password', 'secret', 'token', 'accessToken', 'refreshToken',
    'access_token', 'refresh_token', 'apiKey', 'api_key',
    'creditCardNumber', 'credit_card_number', 'cardNumber', 'card_number',
    'cvv', 'cvc', 'securityCode', 'security_code',
    'pin', 'PIN',
  ]);

  // Fields that should be partially masked (show last 4 chars)
  const partiallyMasked = new Set([
    'email', 'Email', 'emailAddress', 'email_address',
    'phone', 'Phone', 'phoneNumber', 'phone_number', 'mobile', 'cellPhone',
    'cardLast4', 'card_last_four', 'cardLastFour',
    'accountNumber', 'account_number',
    'idNumber', 'id_number',
    'taxId', 'tax_id',
  ]);

  const result = {};

  for (const [key, val] of Object.entries(data)) {
    if (fullyMasked.has(key)) {
      result[key] = '***REDACTED***';
    } else if (partiallyMasked.has(key)) {
      result[key] = maskPartial(val);
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizePII(val);
    } else {
      result[key] = val;
    }
  }

  return result;
}

/**
 * Mask a string value, showing only the last 4 characters.
 * @param {*} value
 * @returns {string}
 */
function maskPartial(value) {
  if (value == null) return '***';
  const str = String(value);
  if (str.length <= 4) return '***';
  return '***' + str.slice(-4);
}

// ---------------------------------------------------------------------------
// Additional utility: phone normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a phone number to E.164-ish format for consistent storage.
 * Not a full E.164 library -- just strips non-digits and ensures a leading +.
 *
 * @param {string} value
 * @returns {string|null}
 */
function normalizePhone(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/[^\d+]/g, '');
  if (digits.length < 7) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits; // Assume US
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

// ---------------------------------------------------------------------------
// Additional utility: address normalization
// ---------------------------------------------------------------------------

/**
 * Normalize address from various PMS formats into a canonical shape.
 *
 * @param {string|Object} value
 * @returns {{ line1: string, line2: string, city: string, state: string, postalCode: string, country: string }}
 */
function normalizeAddress(value) {
  const empty = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };

  if (value == null) return empty;

  if (typeof value === 'string') {
    return { ...empty, line1: value.trim() };
  }

  if (typeof value === 'object') {
    return {
      line1: value.line1 || value.addressLine1 || value.address1
        || value.Address1 || value.street || value.Street || '',
      line2: value.line2 || value.addressLine2 || value.address2
        || value.Address2 || '',
      city: value.city || value.City || value.cityName || '',
      state: value.state || value.State || value.stateProvince
        || value.stateProv || value.region || '',
      postalCode: value.postalCode || value.postal_code || value.zip
        || value.zipCode || value.PostalCode || value.Zip || '',
      country: value.country || value.Country || value.countryCode
        || value.CountryCode || '',
    };
  }

  return empty;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  normalizeDate,
  normalizeCurrency,
  normalizeAmount,
  normalizeCardBrand,
  normalizeReservationStatus,
  normalizeGuestName,
  normalizeFolioCategory,
  sanitizePII,
  maskPartial,
  normalizePhone,
  normalizeAddress,
};
