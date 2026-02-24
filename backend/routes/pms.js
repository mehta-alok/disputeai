const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/status', authenticateToken, async (req, res) => {
  res.json({ connected: false, adapters: [], message: 'PMS integration (demo mode)' });
});

router.get('/adapters', authenticateToken, async (req, res) => {
  res.json({ adapters: ['Opera Cloud', 'Mews', 'Cloudbeds', 'AutoClerk', 'Guesty', 'Agilysys'] });
});

router.post('/connect', authenticateToken, async (req, res) => {
  const { pmsId, ...config } = req.body;
  logger.info(`PMS connect request: ${pmsId}`);
  res.json({
    message: `Connected to ${pmsId} successfully`,
    connection: {
      id: `conn-${Date.now()}`,
      pmsId,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      config: { syncFrequency: config.syncFrequency || '15min' }
    },
    isDemo: true
  });
});

router.post('/sync', authenticateToken, async (req, res) => {
  const { pmsId } = req.body;
  logger.info(`PMS sync request: ${pmsId}`);
  res.json({
    message: `Sync initiated for ${pmsId}`,
    sync: {
      id: `sync-${Date.now()}`,
      pmsId,
      status: 'completed',
      recordsSynced: Math.floor(Math.random() * 50) + 10,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    },
    isDemo: true
  });
});

router.put('/config', authenticateToken, async (req, res) => {
  const { pmsId, syncFrequency, syncOptions } = req.body;
  logger.info(`PMS config update: ${pmsId}`);
  res.json({
    message: `Configuration updated for ${pmsId}`,
    config: { pmsId, syncFrequency, syncOptions, updatedAt: new Date().toISOString() },
    isDemo: true
  });
});

router.post('/disconnect', authenticateToken, async (req, res) => {
  const { pmsId } = req.body;
  logger.info(`PMS disconnect request: ${pmsId}`);
  res.json({
    message: `Disconnected from ${pmsId}`,
    isDemo: true
  });
});

module.exports = router;
