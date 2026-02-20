const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { DISPUTE_COMPANIES, DisputeCompanyService } = require('../services/disputeCompanies');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/companies', authenticateToken, async (req, res) => {
  try {
    const companies = Object.entries(DISPUTE_COMPANIES).map(([key, company]) => ({
      id: key,
      name: company.name,
      fullName: company.fullName,
      type: company.type,
      category: company.category,
      features: company.features || [],
      status: company.status || 'available',
      twoWaySync: company.twoWaySync || false,
      portalUrl: company.portalUrl || null,
      description: company.description || '',
      requiredConfig: company.requiredConfig || [],
      integration: company.integration || {}
    }));
    res.json({ success: true, companies });
  } catch (error) {
    logger.error('Get dispute companies error:', error);
    res.status(500).json({ error: 'Failed to get dispute companies' });
  }
});

router.get('/companies/:id', authenticateToken, async (req, res) => {
  try {
    const company = DISPUTE_COMPANIES[req.params.id.toUpperCase()];
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({ success: true, company: { id: req.params.id, ...company } });
  } catch (error) {
    logger.error('Get dispute company error:', error);
    res.status(500).json({ error: 'Failed to get dispute company' });
  }
});

module.exports = router;
