/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Notifications Controller - User Notifications Management
 *
 * In demo mode, uses in-memory store seeded with sample notifications.
 * Case operations (submit, arbitration, document upload) push new
 * notifications via addDemoNotification() so the bell updates in real-time.
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// DATABASE AVAILABILITY FLAG
// Prevents Prisma from spamming internal error logs every 30s when no DB exists.
// After first failed query, all subsequent calls go straight to demo data.
// =============================================================================
let _dbAvailable = null; // null = unknown, true = connected, false = unavailable

// =============================================================================
// IN-MEMORY DEMO NOTIFICATION STORE
// =============================================================================

const SEED_NOTIFICATIONS = [
  { id: 'notif-1', type: 'CHARGEBACK_ALERT', priority: 'HIGH', title: 'New Chargeback Alert', message: 'A new chargeback for $1,250.00 has been received from Visa ending in 4532.', link: '/cases/demo-1', isRead: false, readAt: null, metadata: { caseId: 'demo-1', amount: 1250 }, createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: 'notif-2', type: 'AI_ANALYSIS', priority: 'MEDIUM', title: 'AI Analysis Complete', message: 'Case CB-2026-0247 analyzed with 87% confidence score. Recommendation: AUTO_SUBMIT', link: '/cases/demo-1', isRead: false, readAt: null, metadata: { caseId: 'demo-1', score: 87 }, createdAt: new Date(Date.now() - 1.5 * 3600000).toISOString() },
  { id: 'notif-3', type: 'CASE_WON', priority: 'LOW', title: 'Dispute Won!', message: 'Case CB-2026-0245 has been resolved in your favor. $2,100.00 recovered.', link: '/cases/demo-3', isRead: true, readAt: new Date(Date.now() - 1 * 3600000).toISOString(), metadata: { caseId: 'demo-3', amount: 2100 }, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: 'notif-4', type: 'DEADLINE_WARNING', priority: 'HIGH', title: 'Response Deadline Approaching', message: 'Case CB-2026-0244 deadline is in 5 days. Submit evidence before it expires.', link: '/cases/demo-4', isRead: false, readAt: null, metadata: { caseId: 'demo-4', daysLeft: 5 }, createdAt: new Date(Date.now() - 6 * 3600000).toISOString() },
  { id: 'notif-5', type: 'EVIDENCE_COLLECTED', priority: 'MEDIUM', title: 'Evidence Auto-Collected', message: 'Guest ID, folio, and registration card collected from PMS for case CB-2026-0246.', link: '/cases/demo-2', isRead: true, readAt: new Date(Date.now() - 4 * 3600000).toISOString(), metadata: { caseId: 'demo-2' }, createdAt: new Date(Date.now() - 8 * 3600000).toISOString() },
];

// Mutable in-memory store: seeded with demo data, new notifications prepended
let demoStore = [...SEED_NOTIFICATIONS];

/**
 * Add a notification to the demo in-memory store.
 * Called by case routes when actions occur (submit, arbitration, upload, etc.)
 */
const addDemoNotification = (data) => {
  const notif = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    type: data.type || 'CASE_UPDATE',
    priority: data.priority || 'MEDIUM',
    title: data.title,
    message: data.message,
    link: data.link || null,
    isRead: false,
    readAt: null,
    metadata: data.metadata || null,
    createdAt: new Date().toISOString(),
  };
  demoStore.unshift(notif); // prepend so newest first
  // Cap at 50 to avoid unbounded growth
  if (demoStore.length > 50) demoStore = demoStore.slice(0, 50);
  logger.info(`Demo notification added: ${notif.title}`);
  return notif;
};

/**
 * Helper: get all demo notifications
 */
const getDemoNotifications = () => demoStore;
const getDemoUnreadCount = () => demoStore.filter(n => !n.isRead).length;

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * Get all notifications for the current user
 */
const getNotifications = async (req, res) => {
  // Skip Prisma entirely if DB is known to be unavailable
  if (_dbAvailable === false) {
    const all = getDemoNotifications();
    return res.json({
      success: true,
      notifications: all,
      total: all.length,
      unreadCount: getDemoUnreadCount(),
      isDemo: true
    });
  }

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

    _dbAvailable = true;
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
    // DB unavailable — flag it to skip Prisma on future calls
    if (_dbAvailable === null) {
      _dbAvailable = false;
      logger.warn('Database unavailable — notifications using demo mode (this message appears once)');
    }
    const all = getDemoNotifications();
    res.json({
      success: true,
      notifications: all,
      total: all.length,
      unreadCount: getDemoUnreadCount(),
      isDemo: true
    });
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  // Skip Prisma entirely if DB is known to be unavailable (polled every 30s)
  if (_dbAvailable === false) {
    return res.json({ success: true, count: getDemoUnreadCount(), isDemo: true });
  }

  try {
    const userId = req.user.id;
    const count = await prisma.notification.count({
      where: { userId, isRead: false }
    });
    _dbAvailable = true;
    res.json({ success: true, count });
  } catch (error) {
    if (_dbAvailable === null) {
      _dbAvailable = false;
      logger.warn('Database unavailable — notifications using demo mode (this message appears once)');
    }
    res.json({ success: true, count: getDemoUnreadCount(), isDemo: true });
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (req, res) => {
  const { id } = req.params;

  if (_dbAvailable === false) {
    const notif = demoStore.find(n => n.id === id);
    if (notif) { notif.isRead = true; notif.readAt = new Date().toISOString(); }
    return res.json({ success: true, notification: { id, isRead: true }, isDemo: true });
  }

  try {
    const userId = req.user.id;
    const notification = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() }
    });
    _dbAvailable = true;
    res.json({ success: true, notification: { id: updated.id, isRead: updated.isRead, readAt: updated.readAt } });
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; logger.warn('Database unavailable — notifications using demo mode (this message appears once)'); }
    const notif = demoStore.find(n => n.id === id);
    if (notif) { notif.isRead = true; notif.readAt = new Date().toISOString(); }
    res.json({ success: true, notification: { id, isRead: true }, isDemo: true });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  if (_dbAvailable === false) {
    demoStore.forEach(n => { n.isRead = true; n.readAt = new Date().toISOString(); });
    return res.json({ success: true, message: 'All notifications marked as read', isDemo: true });
  }

  try {
    const userId = req.user.id;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });
    _dbAvailable = true;
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; logger.warn('Database unavailable — notifications using demo mode (this message appears once)'); }
    demoStore.forEach(n => { n.isRead = true; n.readAt = new Date().toISOString(); });
    res.json({ success: true, message: 'All notifications marked as read', isDemo: true });
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  const { id } = req.params;

  if (_dbAvailable === false) {
    demoStore = demoStore.filter(n => n.id !== id);
    return res.json({ success: true, message: 'Notification deleted', isDemo: true });
  }

  try {
    const userId = req.user.id;
    const notification = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    await prisma.notification.delete({ where: { id } });
    _dbAvailable = true;
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; logger.warn('Database unavailable — notifications using demo mode (this message appears once)'); }
    demoStore = demoStore.filter(n => n.id !== id);
    res.json({ success: true, message: 'Notification deleted', isDemo: true });
  }
};

/**
 * Clear all notifications
 */
const clearAll = async (req, res) => {
  if (_dbAvailable === false) {
    demoStore = [];
    return res.json({ success: true, message: 'All notifications cleared', isDemo: true });
  }

  try {
    const userId = req.user.id;
    await prisma.notification.deleteMany({ where: { userId } });
    _dbAvailable = true;
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; logger.warn('Database unavailable — notifications using demo mode (this message appears once)'); }
    demoStore = [];
    res.json({ success: true, message: 'All notifications cleared', isDemo: true });
  }
};

/**
 * Create a notification (internal use — production DB)
 */
const createNotification = async (userId, data) => {
  if (_dbAvailable === false) {
    return addDemoNotification(data);
  }

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
    _dbAvailable = true;
    logger.info(`Notification created for user ${userId}: ${data.title}`);
    return notification;
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; }
    return addDemoNotification(data);
  }
};

/**
 * Create notifications for multiple users
 */
const createBulkNotifications = async (userIds, data) => {
  if (_dbAvailable === false) {
    return addDemoNotification(data);
  }

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
    _dbAvailable = true;
    logger.info(`Bulk notifications created for ${userIds.length} users: ${data.title}`);
    return notifications;
  } catch (error) {
    if (_dbAvailable === null) { _dbAvailable = false; }
    return addDemoNotification(data);
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
  createBulkNotifications,
  addDemoNotification
};
