const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/status', authenticateToken, async (req, res) => {
  res.json({ syncing: false, lastSync: null, message: 'Sync (demo mode)' });
});

router.post('/trigger', authenticateToken, async (req, res) => {
  res.json({ success: true, message: 'Sync triggered (demo mode)' });
});

module.exports = router;
