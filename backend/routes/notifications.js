const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  res.json({ success: true, notifications: [] });
});

router.get('/unread-count', authenticateToken, async (req, res) => {
  res.json({ success: true, count: 0 });
});

router.patch('/:id/read', authenticateToken, async (req, res) => {
  res.json({ success: true });
});

module.exports = router;
