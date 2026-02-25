const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/status', authenticateToken, async (req, res) => {
  res.json({ connected: false, adapters: [], message: 'PMS integration (demo mode)' });
});

/**
 * GET /api/pms/connected
 * Returns list of connected PMS systems for multi-property support.
 * In demo mode, returns AutoClerk as the primary connected PMS
 * plus simulated connections for Mews and Opera Cloud.
 */
router.get('/connected', authenticateToken, async (req, res) => {
  try {
    // In production, this would query the database for connected PMS systems
    // In demo mode, we return realistic multi-property connections
    const connectedSystems = [
      {
        id: 'autoclerk',
        name: 'AutoClerk',
        propertyName: 'Grand Hotel & Suites',
        propertyId: 'PROP-001',
        status: 'connected',
        lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        reservationsCount: 12,
        color: '#10B981',
        isPrimary: true,
      },
      {
        id: 'mews',
        name: 'Mews',
        propertyName: 'Oceanview Resort',
        propertyId: 'PROP-002',
        status: 'connected',
        lastSync: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        reservationsCount: 8,
        color: '#6366F1',
        isPrimary: false,
      },
      {
        id: 'opera-cloud',
        name: 'Opera Cloud',
        propertyName: 'Downtown Business Hotel',
        propertyId: 'PROP-003',
        status: 'connected',
        lastSync: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
        reservationsCount: 15,
        color: '#EF4444',
        isPrimary: false,
      },
    ];

    res.json({
      success: true,
      systems: connectedSystems,
      total: connectedSystems.length,
      isDemo: true,
    });
  } catch (error) {
    logger.error('Get connected PMS systems error:', error);
    res.status(500).json({ error: 'Failed to get connected PMS systems' });
  }
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
