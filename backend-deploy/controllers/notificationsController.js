/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Notifications Controller - User Notifications Management
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Get all notifications for the current user
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, unreadOnly = false, offset = 0 } = req.query;

    const where = {
      userId,
      ...(unreadOnly === 'true' && { isRead: false })
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, isRead: false }
      })
    ]);

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        priority: n.priority,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: n.isRead,
        readAt: n.readAt,
        metadata: n.metadata,
        createdAt: n.createdAt
      })),
      total,
      unreadCount
    });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Notifications: database unavailable, returning demo data');
    const demoNotifications = [
      { id: 'notif-1', type: 'CHARGEBACK_ALERT', priority: 'HIGH', title: 'New Chargeback Alert', message: 'A new chargeback for $1,250.00 has been received from Visa ending in 4532.', link: '/cases/demo-1', isRead: false, readAt: null, metadata: { caseId: 'demo-1', amount: 1250 }, createdAt: new Date(Date.now() - 2*3600000).toISOString() },
      { id: 'notif-2', type: 'AI_ANALYSIS', priority: 'MEDIUM', title: 'AI Analysis Complete', message: 'Case CB-2026-0247 analyzed with 87% confidence score. Recommendation: AUTO_SUBMIT', link: '/cases/demo-1', isRead: false, readAt: null, metadata: { caseId: 'demo-1', score: 87 }, createdAt: new Date(Date.now() - 1.5*3600000).toISOString() },
      { id: 'notif-3', type: 'CASE_WON', priority: 'LOW', title: 'Dispute Won!', message: 'Case CB-2026-0245 has been resolved in your favor. $2,100.00 recovered.', link: '/cases/demo-3', isRead: true, readAt: new Date(Date.now() - 1*3600000).toISOString(), metadata: { caseId: 'demo-3', amount: 2100 }, createdAt: new Date(Date.now() - 3*3600000).toISOString() },
      { id: 'notif-4', type: 'DEADLINE_WARNING', priority: 'HIGH', title: 'Response Deadline Approaching', message: 'Case CB-2026-0244 deadline is in 5 days. Submit evidence before it expires.', link: '/cases/demo-4', isRead: false, readAt: null, metadata: { caseId: 'demo-4', daysLeft: 5 }, createdAt: new Date(Date.now() - 6*3600000).toISOString() },
      { id: 'notif-5', type: 'EVIDENCE_COLLECTED', priority: 'MEDIUM', title: 'Evidence Auto-Collected', message: 'Guest ID, folio, and registration card collected from PMS for case CB-2026-0246.', link: '/cases/demo-2', isRead: true, readAt: new Date(Date.now() - 4*3600000).toISOString(), metadata: { caseId: 'demo-2' }, createdAt: new Date(Date.now() - 8*3600000).toISOString() },
    ];
    res.json({
      success: true,
      notifications: demoNotifications,
      total: demoNotifications.length,
      unreadCount: demoNotifications.filter(n => !n.isRead).length,
      isDemo: true
    });
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await prisma.notification.count({
      where: { userId, isRead: false }
    });

    res.json({ success: true, count });
  } catch (error) {
    // Demo mode fallback
    logger.warn('Unread count: database unavailable, returning demo data');
    res.json({ success: true, count: 3, isDemo: true });
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() }
    });

    res.json({
      success: true,
      notification: {
        id: updated.id,
        isRead: updated.isRead,
        readAt: updated.readAt
      }
    });
  } catch (error) {
    logger.error('Failed to mark notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Failed to mark all notifications as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    await prisma.notification.delete({ where: { id } });

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('Failed to delete notification:', error);
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};

/**
 * Clear all notifications
 */
const clearAll = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.notification.deleteMany({ where: { userId } });

    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    logger.error('Failed to clear notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to clear notifications' });
  }
};

/**
 * Create a notification (internal use)
 */
const createNotification = async (userId, data) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        id: uuidv4(),
        userId,
        type: data.type,
        priority: data.priority || 'MEDIUM',
        title: data.title,
        message: data.message,
        link: data.link || null,
        metadata: data.metadata || null,
        expiresAt: data.expiresAt || null
      }
    });

    logger.info(`Notification created for user ${userId}: ${data.title}`);
    return notification;
  } catch (error) {
    logger.error('Failed to create notification:', error);
    throw error;
  }
};

/**
 * Create notifications for multiple users
 */
const createBulkNotifications = async (userIds, data) => {
  try {
    const notifications = await prisma.notification.createMany({
      data: userIds.map(userId => ({
        id: uuidv4(),
        userId,
        type: data.type,
        priority: data.priority || 'MEDIUM',
        title: data.title,
        message: data.message,
        link: data.link || null,
        metadata: data.metadata || null,
        expiresAt: data.expiresAt || null
      }))
    });

    logger.info(`Bulk notifications created for ${userIds.length} users: ${data.title}`);
    return notifications;
  } catch (error) {
    logger.error('Failed to create bulk notifications:', error);
    throw error;
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll,
  createNotification,
  createBulkNotifications
};
