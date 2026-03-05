/**
 * DisputeAI - Reservation Matcher Service
 * Matches chargeback cases to PMS reservations using multiple strategies.
 * Works in demo mode using the AutoClerk emulator (no DB required).
 */

const { autoclerk } = require('./autoclerkEmulator');
const logger = require('../utils/logger');

// In-memory linkage map: chargebackId → reservationId
const chargebackReservationLinks = new Map();

/**
 * Matching strategies in priority order:
 * 1. Exact confirmationNumber match → 100% confidence
 * 2. cardLastFour + date range overlap → 90% confidence
 * 3. guestName fuzzy + date range → 75% confidence
 * 4. cardLastFour alone → 60% confidence
 * 5. guestName fuzzy alone → 50% confidence
 */

/**
 * Match a chargeback to a single best reservation.
 * @param {Object} chargebackData - Chargeback fields to match against
 * @param {string} [chargebackData.confirmationNumber] - Reservation confirmation number
 * @param {string} [chargebackData.cardLastFour] - Last 4 digits of card
 * @param {string} [chargebackData.guestName] - Guest full name
 * @param {string} [chargebackData.checkInDate] - Check-in date (ISO)
 * @param {string} [chargebackData.checkOutDate] - Check-out date (ISO)
 * @param {string} [chargebackData.transactionId] - Transaction ID
 * @returns {Object|null} Best match: { reservation, confidence, strategy }
 */
async function matchReservation(chargebackData) {
  try {
    const matches = await findPotentialMatches(chargebackData);
    if (matches.length === 0) return null;

    // Return highest confidence match
    return matches[0];
  } catch (error) {
    logger.warn('Reservation matcher error:', error.message);
    return null;
  }
}

/**
 * Find all potential reservation matches sorted by confidence.
 * @param {Object} criteria - Search criteria (same as matchReservation)
 * @returns {Array} Matches sorted by confidence descending
 */
async function findPotentialMatches(criteria) {
  const {
    confirmationNumber,
    cardLastFour,
    cardLast4,
    guestName,
    checkInDate,
    checkOutDate,
    guestEmail
  } = criteria;

  const card4 = cardLastFour || cardLast4;
  const matches = [];

  try {
    // Strategy 1: Exact confirmation number match
    if (confirmationNumber) {
      const results = autoclerk.searchReservations({ confirmationNumber });
      if (results.length > 0) {
        const reservation = results[0];
        matches.push({
          reservation,
          confidence: 100,
          strategy: 'confirmation_number_exact',
          description: `Exact confirmation number match: ${confirmationNumber}`
        });
        // If we have an exact confirmation match, return immediately
        return matches;
      }
    }

    // Strategy 2: Card last 4 + date range overlap
    if (card4 && (checkInDate || checkOutDate)) {
      const results = autoclerk.searchReservations({ cardLast4: card4 });
      for (const res of results) {
        if (_datesOverlap(res.checkIn, res.checkOut, checkInDate, checkOutDate)) {
          // Check if already matched by confirmation number
          if (!matches.some(m => m.reservation.id === res.id)) {
            matches.push({
              reservation: res,
              confidence: 90,
              strategy: 'card_and_dates',
              description: `Card ****${card4} matched with overlapping dates`
            });
          }
        }
      }
    }

    // Strategy 3: Guest name fuzzy + date range
    if (guestName && (checkInDate || checkOutDate)) {
      const results = autoclerk.searchReservations({ guestName });
      for (const res of results) {
        if (_datesOverlap(res.checkIn, res.checkOut, checkInDate, checkOutDate)) {
          if (!matches.some(m => m.reservation.id === res.id)) {
            const nameScore = _fuzzyNameScore(guestName, res.guestName);
            if (nameScore >= 0.6) {
              matches.push({
                reservation: res,
                confidence: Math.round(60 + nameScore * 15), // 69-75%
                strategy: 'name_and_dates',
                description: `Guest name "${guestName}" matched "${res.guestName}" with overlapping dates (${Math.round(nameScore * 100)}% name similarity)`
              });
            }
          }
        }
      }
    }

    // Strategy 4: Card last 4 alone
    if (card4 && matches.length === 0) {
      const results = autoclerk.searchReservations({ cardLast4: card4 });
      for (const res of results) {
        if (!matches.some(m => m.reservation.id === res.id)) {
          matches.push({
            reservation: res,
            confidence: 60,
            strategy: 'card_only',
            description: `Card ****${card4} matched (no date verification)`
          });
        }
      }
    }

    // Strategy 5: Guest name alone (fuzzy)
    if (guestName && matches.length === 0) {
      const results = autoclerk.searchReservations({ guestName });
      for (const res of results) {
        if (!matches.some(m => m.reservation.id === res.id)) {
          const nameScore = _fuzzyNameScore(guestName, res.guestName);
          if (nameScore >= 0.7) {
            matches.push({
              reservation: res,
              confidence: Math.round(40 + nameScore * 15), // 50-55%
              strategy: 'name_only',
              description: `Guest name "${guestName}" matched "${res.guestName}" (${Math.round(nameScore * 100)}% similarity)`
            });
          }
        }
      }
    }

    // Strategy 6: Guest email
    if (guestEmail && matches.length === 0) {
      const results = autoclerk.searchReservations({ guestEmail });
      for (const res of results) {
        if (!matches.some(m => m.reservation.id === res.id)) {
          matches.push({
            reservation: res,
            confidence: 70,
            strategy: 'email_match',
            description: `Guest email "${guestEmail}" matched`
          });
        }
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;

  } catch (error) {
    logger.warn('Find potential matches error:', error.message);
    return [];
  }
}

/**
 * Alias used by evidenceCollectionWorker.js
 */
async function findMatchingReservation(criteria, propertyId) {
  return matchReservation(criteria);
}

/**
 * Link a chargeback to a reservation (in-memory).
 */
async function linkChargebackToReservation(chargebackId, reservationId) {
  chargebackReservationLinks.set(chargebackId, reservationId);
  logger.info(`Linked chargeback ${chargebackId} → reservation ${reservationId}`);
}

/**
 * Get linked reservation for a chargeback.
 */
function getLinkedReservation(chargebackId) {
  return chargebackReservationLinks.get(chargebackId) || null;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Check if two date ranges overlap.
 */
function _datesOverlap(resCheckIn, resCheckOut, cbCheckIn, cbCheckOut) {
  if (!resCheckIn || !resCheckOut) return false;

  const rIn = new Date(resCheckIn);
  const rOut = new Date(resCheckOut);

  if (cbCheckIn && cbCheckOut) {
    const cIn = new Date(cbCheckIn);
    const cOut = new Date(cbCheckOut);
    // Overlap: rIn <= cOut && cIn <= rOut
    return rIn <= cOut && cIn <= rOut;
  }

  if (cbCheckIn) {
    const cIn = new Date(cbCheckIn);
    // Check-in is within or close to the reservation period
    const dayBefore = new Date(rIn);
    dayBefore.setDate(dayBefore.getDate() - 2);
    const dayAfter = new Date(rOut);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return cIn >= dayBefore && cIn <= dayAfter;
  }

  if (cbCheckOut) {
    const cOut = new Date(cbCheckOut);
    const dayBefore = new Date(rIn);
    dayBefore.setDate(dayBefore.getDate() - 2);
    const dayAfter = new Date(rOut);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return cOut >= dayBefore && cOut <= dayAfter;
  }

  return false;
}

/**
 * Fuzzy name similarity score (0-1).
 * Uses normalized Levenshtein-like comparison.
 */
function _fuzzyNameScore(name1, name2) {
  if (!name1 || !name2) return 0;

  const a = name1.toLowerCase().trim();
  const b = name2.toLowerCase().trim();

  // Exact match
  if (a === b) return 1.0;

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return 0.9;

  // Split into words and check overlap
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);

  let matchCount = 0;
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      if (wordA === wordB) {
        matchCount++;
        break;
      }
      // Partial match (first 3 chars)
      if (wordA.length >= 3 && wordB.length >= 3 && wordA.substring(0, 3) === wordB.substring(0, 3)) {
        matchCount += 0.5;
        break;
      }
    }
  }

  const totalWords = Math.max(wordsA.length, wordsB.length);
  return matchCount / totalWords;
}

module.exports = {
  matchReservation,
  findPotentialMatches,
  findMatchingReservation,
  linkChargebackToReservation,
  getLinkedReservation
};
