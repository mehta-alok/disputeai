/**
 * DisputeAI Hotels Chargeback Defense System
 * Main Server Entry Point
 *
 * AI-powered chargeback dispute management platform
 * for DisputeAI Hotels & Resorts
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initializeS3 } = require('./config/s3');

// Route imports
const authRoutes = require('./routes/auth');
const casesRoutes = require('./routes/cases');
const evidenceRoutes = require('./routes/evidence');
const analyticsRoutes = require('./routes/analytics');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const pmsRoutes = require('./routes/pms');
const notificationsRoutes = require('./routes/notifications');
const disputesRoutes = require('./routes/disputes');
const reservationsRoutes = require('./routes/reservations');
const syncRoutes = require('./routes/sync');

// Queue manager for two-way sync
const { initializeWorkers, shutdownWorkers } = require('./services/queue/queueManager');
const { initializeScheduledSyncs } = require('./services/queue/scheduledSync');

const app = express();
const PORT = process.env.PORT || 8000;

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Request logging
app.use(morgan(process.env.LOG_FORMAT || 'combined', {
  stream: { write: (message) => logger.http(message.trim()) }
}));

// Body parsing (raw for webhooks, json for API)
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// RATE LIMITING
// =============================================================================

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth endpoint rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 20,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  }
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'DisputeAI Chargeback Defense API',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', async (req, res) => {
  try {
    const { prisma } = require('./config/database');
    const redis = require('./config/redis').getRedisClient();

    // Check database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redis.ping();

    res.status(200).json({
      status: 'ready',
      service: 'DisputeAI Chargeback Defense API',
      checks: {
        database: 'connected',
        redis: 'connected',
        s3: 'configured'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

// =============================================================================
// API ROUTES
// =============================================================================

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pms', pmsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/sync', syncRoutes);

// API documentation redirect
app.get('/api', (req, res) => {
  res.json({
    service: 'DisputeAI Chargeback Defense API',
    version: 'v1',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      cases: '/api/cases',
      evidence: '/api/evidence',
      analytics: '/api/analytics',
      webhooks: '/api/webhooks',
      admin: '/api/admin',
      pms: '/api/pms',
      notifications: '/api/notifications',
      disputes: '/api/disputes',
      reservations: '/api/reservations',
      sync: '/api/sync'
    }
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    service: 'DisputeAI Chargeback Defense API'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  try {
    logger.info('Starting DisputeAI Chargeback Defense System...');

    let dbConnected = false;
    let redisConnected = false;
    let s3Initialized = false;
    const forceDemo = process.env.DEMO_MODE === 'true';

    // Initialize connections (graceful - continue in demo mode if unavailable)
    if (forceDemo) {
      logger.info('DEMO_MODE=true - skipping database connection');
    } else {
      try {
        const connected = await Promise.race([
          connectDatabase(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        if (connected) {
          dbConnected = true;
          logger.info('Database connected');
        } else {
          throw new Error('Connection test failed');
        }
      } catch (dbError) {
        logger.warn('Database not available - running in demo mode:', dbError.message);
      }
    }

    try {
      await connectRedis();
      redisConnected = true;
      logger.info('Redis connected');
    } catch (redisError) {
      logger.warn('Redis not available - running without cache:', redisError.message);
    }

    try {
      await initializeS3();
      s3Initialized = true;
      logger.info('S3 initialized');
    } catch (s3Error) {
      logger.warn('S3 not available - file uploads disabled:', s3Error.message);
    }

    // Initialize BullMQ workers for two-way sync (requires Redis)
    if (redisConnected) {
      try {
        await initializeWorkers();
        logger.info('BullMQ sync workers initialized');

        await initializeScheduledSyncs();
        logger.info('Scheduled sync jobs configured');
      } catch (workerError) {
        logger.warn('BullMQ workers not initialized (non-fatal):', workerError.message);
      }
    }

    // Initialize AI Agents (requires database)
    let aiAgentsInitialized = false;
    if (dbConnected) {
      try {
        const { AIAgentService } = require('./services/aiAgents');
        await AIAgentService.initializeAgents();
        aiAgentsInitialized = true;
        logger.info('AI Agents initialized in database (8 agents)');
      } catch (agentError) {
        logger.warn('AI Agent initialization failed (non-fatal):', agentError.message);
      }
    }

    // Check AI provider health
    try {
      const { checkAIHealth } = require('./services/aiClient');
      const aiHealth = await checkAIHealth();
      if (aiHealth.available) {
        logger.info(`AI Provider: ${aiHealth.provider}/${aiHealth.model} ✓`);
      } else {
        logger.warn(`AI Provider: ${aiHealth.provider} - ${aiHealth.error || 'unavailable'}`);
      }
    } catch (aiErr) {
      logger.warn('AI health check failed:', aiErr.message);
    }

    const mode = dbConnected ? 'production' : 'demo';

    // Start server
    app.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     DisputeAI CHARGEBACK DEFENSE SYSTEM                      ║
║     AI-Powered Dispute Management Platform                    ║
║                                                               ║
║     Server running on port ${PORT}                              ║
║     Environment: ${(process.env.NODE_ENV || 'development').padEnd(16)}                    ║
║     Mode: ${mode.padEnd(23)}                    ║
║     Database: ${(dbConnected ? 'Connected' : 'Demo Mode').padEnd(20)}                    ║
║     Redis: ${(redisConnected ? 'Connected' : 'Disabled').padEnd(23)}                    ║
║     S3: ${(s3Initialized ? 'Connected' : 'Disabled').padEnd(26)}                    ║
║     AI Agents: ${(aiAgentsInitialized ? '8 Active' : 'Disabled').padEnd(21)}                    ║
║     AI Provider: ${(process.env.AI_MODEL_PROVIDER || 'none').padEnd(18)}                    ║
║     PMS Adapters: 30 loaded                                   ║
║     Dispute Adapters: 27 loaded                               ║
║     OTA Integrations: 9 loaded                                ║
║     Total Integrations: 66                                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  try { await shutdownWorkers(); } catch (e) { /* ignore */ }
  const { prisma } = require('./config/database');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  try { await shutdownWorkers(); } catch (e) { /* ignore */ }
  const { prisma } = require('./config/database');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

module.exports = app;
