const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAll
} = require('../controllers/notificationsController');
const router = express.Router();

// GET /api/notifications - Get all notifications
router.get('/', authenticateToken, getNotifications);

// GET /api/notifications/unread-count - Get unread count
router.get('/unread-count', authenticateToken, getUnreadCount);

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', authenticateToken, markAsRead);

// PATCH /api/notifications/read-all - Mark all notifications as read
router.patch('/read-all', authenticateToken, markAllAsRead);

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', authenticateToken, deleteNotification);

// DELETE /api/notifications - Clear all notifications
router.delete('/', authenticateToken, clearAll);

module.exports = router;
