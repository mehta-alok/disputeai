/**
 * AccuDefend - Conflict Resolver
 *
 * Handles data conflicts between PMS/dispute portal data
 * and local AccuDefend data during two-way sync.
 *
 * Authority rules:
 *   - PMS is authoritative for: reservation data, folio data, guest profiles, rates
 *   - AccuDefend is authoritative for: dispute status, evidence, AI analysis, notes
 *   - Conflicts on shared fields are logged for human review
 */

const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class ConflictResolver {
  /**
   * Resolve a reservation data conflict.
   * PMS is authoritative — incoming data wins, but we log the conflict.
   *
   * @param {Object} localData - Current local record
   * @param {Object} incomingData - Incoming PMS data
   * @param {string} integrationId - Integration that sent the data
   * @returns {Object} { resolved, conflicts, mergedData }
   */
  async resolveReservation(localData, incomingData, integrationId) {
    const conflicts = [];
    const mergedData = { ...localData };

    // PMS-authoritative fields — incoming always wins
    const pmsFields = [
      'guestName', 'guestEmail', 'guestPhone',
      'checkInDate', 'checkOutDate', 'actualCheckIn', 'actualCheckOut',
      'roomNumber', 'roomType', 'adults', 'children',
      'totalAmount', 'currency', 'rateCode', 'rateAmount',
      'cardLastFour', 'cardBrand', 'paymentMethod',
      'bookingDate', 'bookingSource', 'specialRequests', 'loyaltyNumber',
      'status'
    ];

    for (const field of pmsFields) {
      if (incomingData[field] !== undefined && incomingData[field] !== null) {
        if (localData[field] !== undefined && String(localData[field]) !== String(incomingData[field])) {
          conflicts.push({
            field,
            localValue: localData[field],
            incomingValue: incomingData[field],
            resolution: 'incoming_wins',
            authority: 'PMS'
          });
        }
        mergedData[field] = incomingData[field];
      }
    }

    // Log conflicts if any
    if (conflicts.length > 0) {
      await this._logConflicts('reservation', localData.id, conflicts, integrationId);
    }

    return {
      resolved: true,
      conflicts,
      mergedData,
      hasConflicts: conflicts.length > 0
    };
  }

  /**
   * Resolve a chargeback/dispute data conflict.
   * AccuDefend is authoritative for most fields.
   *
   * @param {Object} localData - Current chargeback record
   * @param {Object} incomingData - Incoming dispute portal data
   * @param {string} integrationId - Integration that sent the data
   * @returns {Object} { resolved, conflicts, mergedData }
   */
  async resolveChargeback(localData, incomingData, integrationId) {
    const conflicts = [];
    const mergedData = { ...localData };

    // Portal-authoritative fields — only status and resolution from portals
    const portalFields = ['processorDisputeId', 'dueDate'];

    // Status has special handling
    if (incomingData.status) {
      const incomingStatus = incomingData.status.toUpperCase();
      const localStatus = localData.status;

      // Only update status if it's a progression (not a regression)
      const statusOrder = ['PENDING', 'IN_REVIEW', 'SUBMITTED', 'WON', 'LOST', 'EXPIRED', 'CANCELLED'];
      const localIndex = statusOrder.indexOf(localStatus);
      const incomingIndex = statusOrder.indexOf(incomingStatus);

      if (incomingIndex > localIndex) {
        mergedData.status = incomingStatus;
        if (incomingStatus === 'WON' || incomingStatus === 'LOST') {
          mergedData.resolvedAt = new Date();
        }
      } else if (incomingIndex < localIndex && incomingIndex >= 0) {
        conflicts.push({
          field: 'status',
          localValue: localStatus,
          incomingValue: incomingStatus,
          resolution: 'local_wins',
          authority: 'AccuDefend',
          reason: 'Status regression prevented'
        });
      }
    }

    // AccuDefend-authoritative fields — local always wins
    const accudefendFields = [
      'confidenceScore', 'fraudIndicators', 'recommendation', 'aiAnalysis',
      'reservationId' // Our reservation link
    ];

    for (const field of accudefendFields) {
      if (incomingData[field] !== undefined && localData[field] !== undefined) {
        if (String(localData[field]) !== String(incomingData[field])) {
          conflicts.push({
            field,
            localValue: localData[field],
            incomingValue: incomingData[field],
            resolution: 'local_wins',
            authority: 'AccuDefend'
          });
        }
        // Keep local value
      }
    }

    // Portal-authoritative fields
    for (const field of portalFields) {
      if (incomingData[field] !== undefined && incomingData[field] !== null) {
        if (localData[field] !== undefined && String(localData[field]) !== String(incomingData[field])) {
          conflicts.push({
            field,
            localValue: localData[field],
            incomingValue: incomingData[field],
            resolution: 'incoming_wins',
            authority: 'portal'
          });
        }
        mergedData[field] = incomingData[field];
      }
    }

    if (conflicts.length > 0) {
      await this._logConflicts('chargeback', localData.id, conflicts, integrationId);
    }

    return {
      resolved: true,
      conflicts,
      mergedData,
      hasConflicts: conflicts.length > 0
    };
  }

  /**
   * Resolve a guest profile conflict.
   * PMS is authoritative for personal info; AccuDefend is authoritative for flags.
   */
  async resolveGuestProfile(localData, incomingData, integrationId) {
    const conflicts = [];
    const mergedData = { ...localData };

    // PMS-authoritative
    const pmsFields = [
      'firstName', 'lastName', 'email', 'phone',
      'address', 'city', 'state', 'country', 'postalCode',
      'loyaltyNumber', 'loyaltyTier', 'isVip',
      'idType', 'idVerified'
    ];

    for (const field of pmsFields) {
      if (incomingData[field] !== undefined && incomingData[field] !== null) {
        mergedData[field] = incomingData[field];
      }
    }

    // AccuDefend-authoritative (chargeback flags)
    const accuFields = ['isFlagged', 'flagReason', 'flaggedAt', 'chargebackCount', 'totalDisputeAmount'];
    for (const field of accuFields) {
      if (incomingData[field] !== undefined && localData[field] !== undefined) {
        if (String(localData[field]) !== String(incomingData[field])) {
          conflicts.push({
            field,
            localValue: localData[field],
            incomingValue: incomingData[field],
            resolution: 'local_wins',
            authority: 'AccuDefend'
          });
        }
      }
    }

    if (conflicts.length > 0) {
      await this._logConflicts('guest_profile', localData.id, conflicts, integrationId);
    }

    return { resolved: true, conflicts, mergedData, hasConflicts: conflicts.length > 0 };
  }

  /**
   * Log conflicts to SyncLog for admin review.
   */
  async _logConflicts(entityType, entityId, conflicts, integrationId) {
    logger.warn(`[ConflictResolver] ${conflicts.length} conflicts on ${entityType} ${entityId}`, {
      conflicts: conflicts.map(c => `${c.field}: ${c.localValue} vs ${c.incomingValue} (${c.resolution})`)
    });

    await prisma.syncLog.create({
      data: {
        integrationId: integrationId || 'unknown',
        syncType: 'conflict',
        direction: 'inbound',
        entityType,
        status: 'completed',
        metadata: {
          entityId,
          conflictCount: conflicts.length,
          conflicts
        },
        completedAt: new Date()
      }
    });

    // Notify admins of critical conflicts (e.g., reservation deleted in PMS while chargeback pending)
    const criticalConflicts = conflicts.filter(c =>
      c.field === 'status' && c.reason
    );

    if (criticalConflicts.length > 0) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true }
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'SYNC_ERROR',
            priority: 'HIGH',
            title: `Data Conflict: ${entityType}`,
            message: `${criticalConflicts.length} critical data conflicts detected during sync. Review required.`,
            metadata: { entityType, entityId, conflicts: criticalConflicts }
          }
        });
      }
    }
  }
}

module.exports = new ConflictResolver();
