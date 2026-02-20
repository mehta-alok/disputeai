/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Admin Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { prisma } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createPropertySchema, createProviderSchema } = require('../utils/validators');
const logger = require('../utils/logger');
const documentsController = require('../controllers/documentsController');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

const router = express.Router();

// Apply authentication and admin role to all routes
router.use(authenticateToken);
router.use(requireRole('ADMIN'));

// =============================================================================
// USER MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/users
 * List all users
 */
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, propertyId } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (role) where.role = role;
    if (propertyId) where.propertyId = propertyId;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          property: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve users'
    });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { firstName, lastName, role, propertyId, isActive, password } = req.body;

    const existing = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (role) updateData.role = role;
    if (propertyId !== undefined) updateData.propertyId = propertyId || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        property: {
          select: { id: true, name: true }
        }
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: user.id,
        oldValues: { role: existing.role, isActive: existing.isActive },
        newValues: updateData,
        ipAddress: req.ip
      }
    });

    logger.info(`User updated: ${user.email} by ${req.user.email}`);

    res.json({
      message: 'User updated successfully',
      user
    });

  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Deactivate user
 */
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot deactivate your own account'
      });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: { id: true, email: true }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DEACTIVATE_USER',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip
      }
    });

    logger.info(`User deactivated: ${user.email} by ${req.user.email}`);

    res.json({
      message: 'User deactivated successfully'
    });

  } catch (error) {
    logger.error('Deactivate user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to deactivate user'
    });
  }
});

// =============================================================================
// PROPERTY MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/properties
 * List all properties
 */
router.get('/properties', async (req, res) => {
  try {
    const properties = await prisma.property.findMany({
      include: {
        _count: {
          select: { users: true, chargebacks: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ properties });

  } catch (error) {
    logger.error('List properties error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve properties'
    });
  }
});

/**
 * POST /api/admin/properties
 * Create new property
 */
router.post('/properties', async (req, res) => {
  try {
    const validation = createPropertySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const property = await prisma.property.create({
      data: validation.data
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_PROPERTY',
        entityType: 'Property',
        entityId: property.id,
        newValues: validation.data,
        ipAddress: req.ip
      }
    });

    logger.info(`Property created: ${property.name} by ${req.user.email}`);

    res.status(201).json({
      message: 'Property created successfully',
      property
    });

  } catch (error) {
    logger.error('Create property error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create property'
    });
  }
});

/**
 * PATCH /api/admin/properties/:id
 * Update property
 */
router.patch('/properties/:id', async (req, res) => {
  try {
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: req.body
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_PROPERTY',
        entityType: 'Property',
        entityId: property.id,
        newValues: req.body,
        ipAddress: req.ip
      }
    });

    logger.info(`Property updated: ${property.name} by ${req.user.email}`);

    res.json({
      message: 'Property updated successfully',
      property
    });

  } catch (error) {
    logger.error('Update property error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update property'
    });
  }
});

// =============================================================================
// PROVIDER MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/providers
 * List all providers
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = await prisma.provider.findMany({
      include: {
        _count: {
          select: { chargebacks: true, webhookEvents: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Remove sensitive credentials from response
    const sanitized = providers.map(p => ({
      ...p,
      credentials: p.credentials ? '***configured***' : null,
      webhookSecret: p.webhookSecret ? '***configured***' : null
    }));

    res.json({ providers: sanitized });

  } catch (error) {
    logger.error('List providers error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve providers'
    });
  }
});

/**
 * POST /api/admin/providers
 * Create new provider
 */
router.post('/providers', async (req, res) => {
  try {
    const validation = createProviderSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const provider = await prisma.provider.create({
      data: validation.data
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_PROVIDER',
        entityType: 'Provider',
        entityId: provider.id,
        newValues: { name: provider.name, type: provider.type },
        ipAddress: req.ip
      }
    });

    logger.info(`Provider created: ${provider.name} by ${req.user.email}`);

    res.status(201).json({
      message: 'Provider created successfully',
      provider: {
        ...provider,
        credentials: provider.credentials ? '***configured***' : null,
        webhookSecret: provider.webhookSecret ? '***configured***' : null
      }
    });

  } catch (error) {
    logger.error('Create provider error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create provider'
    });
  }
});

/**
 * PATCH /api/admin/providers/:id
 * Update provider
 */
router.patch('/providers/:id', async (req, res) => {
  try {
    const provider = await prisma.provider.update({
      where: { id: req.params.id },
      data: req.body
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_PROVIDER',
        entityType: 'Provider',
        entityId: provider.id,
        newValues: { name: provider.name, enabled: provider.enabled },
        ipAddress: req.ip
      }
    });

    logger.info(`Provider updated: ${provider.name} by ${req.user.email}`);

    res.json({
      message: 'Provider updated successfully',
      provider: {
        ...provider,
        credentials: provider.credentials ? '***configured***' : null,
        webhookSecret: provider.webhookSecret ? '***configured***' : null
      }
    });

  } catch (error) {
    logger.error('Update provider error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update provider'
    });
  }
});

// =============================================================================
// AUDIT LOG
// =============================================================================

/**
 * GET /api/admin/audit-log
 * View audit trail
 */
router.get('/audit-log', async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action, entityType, dateFrom, dateTo } = req.query;

    const where = {};
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = entityType;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { email: true, firstName: true, lastName: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Get audit log error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve audit log'
    });
  }
});

// =============================================================================
// SYSTEM CONFIGURATION
// =============================================================================

/**
 * GET /api/admin/config
 * Get system configuration
 */
router.get('/config', async (req, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const configMap = configs.reduce((acc, c) => {
      acc[c.key] = c.value;
      return acc;
    }, {});

    res.json({ config: configMap });

  } catch (error) {
    logger.error('Get config error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve configuration'
    });
  }
});

/**
 * PUT /api/admin/config
 * Update system configuration
 */
router.put('/config', async (req, res) => {
  try {
    const { key, value, description } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Key and value are required'
      });
    }

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: {
        value,
        description,
        updatedBy: req.user.id
      },
      create: {
        key,
        value,
        description,
        updatedBy: req.user.id
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_CONFIG',
        entityType: 'SystemConfig',
        entityId: key,
        newValues: { key, value },
        ipAddress: req.ip
      }
    });

    logger.info(`Config updated: ${key} by ${req.user.email}`);

    res.json({
      message: 'Configuration updated successfully',
      config
    });

  } catch (error) {
    logger.error('Update config error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update configuration'
    });
  }
});

// =============================================================================
// STORAGE STATUS
// =============================================================================

/**
 * GET /api/admin/storage/status
 * Check storage connection status
 */
router.get('/storage/status', async (req, res) => {
  try {
    const hasS3Config = !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID !== 'YOUR_AWS_ACCESS_KEY_ID'
    );

    if (hasS3Config) {
      // Try to verify S3 connection
      try {
        const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        });

        // Simple test - just try to list buckets
        await s3Client.send(new ListBucketsCommand({}));

        res.json({
          connected: true,
          type: 's3',
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION || 'us-east-1'
        });
      } catch (s3Error) {
        res.json({
          connected: false,
          type: 's3',
          error: s3Error.message
        });
      }
    } else {
      // Local storage
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, '..', 'uploads');

      // Check if uploads directory exists or can be created
      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        res.json({
          connected: true,
          type: 'local',
          path: uploadsDir
        });
      } catch (fsError) {
        res.json({
          connected: false,
          type: 'local',
          error: fsError.message
        });
      }
    }
  } catch (error) {
    logger.error('Storage status check error:', error);
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
});

// =============================================================================
// WEBHOOK EVENTS
// =============================================================================

/**
 * GET /api/admin/webhook-events
 * View webhook event history
 */
router.get('/webhook-events', async (req, res) => {
  try {
    const { page = 1, limit = 50, providerId, processed } = req.query;

    const where = {};
    if (providerId) where.providerId = providerId;
    if (processed !== undefined) where.processed = processed === 'true';

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        include: {
          provider: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit)
      }),
      prisma.webhookEvent.count({ where })
    ]);

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Get webhook events error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve webhook events'
    });
  }
});

// =============================================================================
// SUPPORTING DOCUMENTS
// =============================================================================

/**
 * GET /api/admin/documents
 * Get all supporting documents
 */
router.get('/documents', documentsController.getDocuments);

/**
 * POST /api/admin/documents/upload
 * Upload a new supporting document
 */
router.post('/documents/upload', upload.single('file'), documentsController.uploadDocument);

/**
 * GET /api/admin/documents/:id
 * Get a specific document
 */
router.get('/documents/:id', documentsController.getDocumentById);

/**
 * GET /api/admin/documents/:id/download
 * Download a document
 */
router.get('/documents/:id/download', documentsController.downloadDocument);

/**
 * PATCH /api/admin/documents/:id
 * Update document metadata
 */
router.patch('/documents/:id', documentsController.updateDocument);

/**
 * DELETE /api/admin/documents/:id
 * Delete a document
 */
router.delete('/documents/:id', documentsController.deleteDocument);

// =============================================================================
// AI AGENT MANAGEMENT
// =============================================================================

const { AIAgentService } = require('../services/aiAgents');
const { checkAIHealth } = require('../services/aiClient');

/**
 * GET /api/admin/agents
 * List all AI agents with stats
 */
router.get('/agents', async (req, res) => {
  try {
    const agents = await AIAgentService.listAgents(req.query);
    const stats = await AIAgentService.getStatistics();
    const aiHealth = await checkAIHealth();

    res.json({
      agents,
      stats,
      aiHealth
    });
  } catch (error) {
    logger.error('List agents error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list agents'
    });
  }
});

/**
 * GET /api/admin/agents/:id
 * Get agent details with recent runs
 */
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await AIAgentService.getAgent(req.params.id);

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found'
      });
    }

    res.json({ agent });
  } catch (error) {
    logger.error('Get agent error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get agent details'
    });
  }
});

/**
 * POST /api/admin/agents/:id/run
 * Trigger agent execution
 */
router.post('/agents/:id/run', async (req, res) => {
  try {
    const run = await AIAgentService.runAgent(
      req.params.id,
      req.body.input || {},
      'manual'
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'RUN_AI_AGENT',
        entityType: 'AIAgent',
        entityId: req.params.id,
        newValues: { runId: run.id, trigger: 'manual' },
        ipAddress: req.ip
      }
    });

    res.status(202).json({
      message: 'Agent run started',
      run
    });
  } catch (error) {
    logger.error('Run agent error:', error);
    const status = error.message.includes('not found') ? 404
      : error.message.includes('disabled') ? 403
      : error.message.includes('already running') ? 409
      : 500;

    res.status(status).json({
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/agents/:id
 * Update agent configuration
 */
router.patch('/agents/:id', async (req, res) => {
  try {
    const allowedUpdates = ['status', 'schedule', 'priority', 'config', 'maxTokens', 'temperature', 'modelProvider', 'modelName'];
    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const agent = await AIAgentService.updateAgent(req.params.id, updates);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPDATE_AI_AGENT',
        entityType: 'AIAgent',
        entityId: req.params.id,
        newValues: updates,
        ipAddress: req.ip
      }
    });

    res.json({
      message: 'Agent updated successfully',
      agent
    });
  } catch (error) {
    logger.error('Update agent error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update agent'
    });
  }
});

/**
 * GET /api/admin/agents/:id/runs
 * Get run history for an agent
 */
router.get('/agents/:id/runs', async (req, res) => {
  try {
    const runs = await AIAgentService.getAgentRuns(req.params.id, {
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50
    });

    res.json({ runs });
  } catch (error) {
    logger.error('Get agent runs error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get agent runs'
    });
  }
});

module.exports = router;
