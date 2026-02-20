const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/status', authenticateToken, async (req, res) => {
  res.json({ connected: false, adapters: [], message: 'PMS integration (demo mode)' });
});

router.get('/adapters', authenticateToken, async (req, res) => {
  res.json({ adapters: ['Opera Cloud', 'Mews', 'Cloudbeds', 'AutoClerk', 'Guesty', 'Agilysys'] });
});

module.exports = router;
