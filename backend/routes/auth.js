/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { prisma } = require('../config/database');
const { sessionStore, tokenBlacklist } = require('../config/redis');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { loginSchema, registerSchema } = require('../utils/validators');
const logger = require('../utils/logger');

const router = express.Router();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      propertyId: user.propertyId
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
}

function generateRefreshToken() {
  return uuidv4();
}

// =============================================================================
// DEMO MODE
// =============================================================================

async function handleDemoLogin(req, res, email) {
  try {
    const passwordHash = await bcrypt.hash('demo123', parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    const demoUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName: email.split('@')[0].split('.')[0].replace(/\b\w/g, l => l.toUpperCase()),
        lastName: email.split('@')[0].split('.')[1]?.replace(/\b\w/g, l => l.toUpperCase()) || 'Demo',
        role: 'MANAGER',
      },
    });

    const accessToken = generateAccessToken(demoUser);
    const refreshToken = generateRefreshToken();
    await sessionStore.setRefreshToken(demoUser.id, refreshToken);

    await prisma.session.create({
      data: {
        userId: demoUser.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    await prisma.user.update({
      where: { id: demoUser.id },
      data: { lastLogin: new Date() }
    });

    logger.info(`Demo user created and logged in: ${email}`);

    res.json({
      message: 'Login successful',
      user: {
        id: demoUser.id,
        email: demoUser.email,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        role: demoUser.role,
        property: null
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
      },
      isDemo: true
    });
  } catch (error) {
    logger.error('Demo login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Demo login failed'
    });
  }
}

// =============================================================================
// ROUTES
// =============================================================================

router.get('/providers', async (req, res) => {
  try {
    const providers = await prisma.provider.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: { name: 'asc' },
    });

    if (providers.length === 0) {
      const defaultProviders = [
        { id: 'stripe', name: 'Stripe', type: 'PAYMENT_PROCESSOR' },
        { id: 'adyen', name: 'Adyen', type: 'PAYMENT_PROCESSOR' },
        { id: 'shift4', name: 'Shift4', type: 'PAYMENT_PROCESSOR' },
        { id: 'elavon', name: 'Elavon', type: 'PAYMENT_PROCESSOR' },
        { id: 'mews', name: 'Mews', type: 'PMS' },
        { id: 'opera', name: 'Opera Cloud', type: 'PMS' },
      ];
      return res.json({ providers: defaultProviders });
    }

    res.json({ providers });
  } catch (error) {
    logger.error('Get providers error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve providers'
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const { email, password } = validation.data;

    let dbAvailable = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbAvailable = false;
    }

    if (!dbAvailable) {
      const demoCredentials = {
        'admin@disputeai.com': { password: 'DisputeAdmin123!', role: 'ADMIN', firstName: 'Admin', lastName: 'User' },
        'manager@disputeai.com': { password: 'DisputeManager123!', role: 'MANAGER', firstName: 'Hotel', lastName: 'Manager' },
        'staff@disputeai.com': { password: 'DisputeStaff123!', role: 'STAFF', firstName: 'Staff', lastName: 'Member' },
      };

      const demoCred = demoCredentials[email.toLowerCase()];
      if (!demoCred || password !== demoCred.password) {
        return res.status(401).json({
          error: 'Authentication Failed',
          message: 'Invalid email or password. Use demo credentials shown on login page.'
        });
      }

      const demoUser = {
        id: 'demo-' + email.split('@')[0],
        email: email.toLowerCase(),
        firstName: demoCred.firstName,
        lastName: demoCred.lastName,
        role: demoCred.role,
        propertyId: 'demo-property-1'
      };

      const accessToken = generateAccessToken(demoUser);
      const refreshToken = generateRefreshToken();

      logger.info(`Demo login successful: ${email}`);

      return res.json({
        message: 'Login successful (Demo Mode)',
        user: {
          id: demoUser.id,
          email: demoUser.email,
          firstName: demoUser.firstName,
          lastName: demoUser.lastName,
          role: demoUser.role,
          property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '24h'
        },
        isDemo: true
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        property: {
          select: { id: true, name: true }
        }
      }
    });

    if (!user) {
      if (process.env.DEMO_MODE === 'true') {
        return handleDemoLogin(req, res, email);
      }
      logger.warn(`Login attempt failed: User not found - ${email}`);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      logger.warn(`Login attempt failed: Inactive user - ${email}`);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Account is inactive'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      logger.warn(`Login attempt failed: Invalid password - ${email}`);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid email or password'
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    await sessionStore.setRefreshToken(user.id, refreshToken);

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        property: user.property
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed'
    });
  }
});

router.post('/register', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.error.errors
      });
    }

    const { email, password, firstName, lastName, role, propertyId } = validation.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User with this email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role,
        propertyId
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        property: {
          select: { id: true, name: true }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: user.id,
        newValues: { email: user.email, role: user.role }
      }
    });

    logger.info(`User created by ${req.user.email}: ${user.email}`);

    res.status(201).json({
      message: 'User created successfully',
      user
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Registration failed'
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token required'
      });
    }

    const session = await prisma.session.findFirst({
      where: {
        refreshToken,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            propertyId: true,
            isActive: true
          }
        }
      }
    });

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
    }

    const isValid = await sessionStore.validateRefreshToken(session.userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token has been revoked'
      });
    }

    const accessToken = generateAccessToken(session.user);

    res.json({
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token refresh failed'
    });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    await tokenBlacklist.add(req.token);

    if (refreshToken) {
      await sessionStore.removeRefreshToken(req.user.id, refreshToken);

      await prisma.session.deleteMany({
        where: {
          userId: req.user.id,
          refreshToken
        }
      });
    }

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed'
    });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.id && req.user.id.startsWith('demo-')) {
      return res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName || 'Admin',
          lastName: req.user.lastName || 'User',
          role: req.user.role,
          lastLogin: new Date().toISOString(),
          createdAt: new Date('2026-01-01').toISOString(),
          property: req.user.property || { id: 'demo-property-1', name: 'DisputeAI Demo Hotel', city: 'New York', state: 'NY' }
        }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        lastLogin: true,
        createdAt: true,
        property: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true
          }
        }
      }
    });

    res.json({ user });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.firstName || 'User',
        lastName: req.user.lastName || '',
        role: req.user.role,
        lastLogin: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        property: req.user.property || null
      }
    });
  }
});

router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    await sessionStore.removeAllUserTokens(req.user.id);

    await prisma.session.deleteMany({
      where: { userId: req.user.id }
    });

    await tokenBlacklist.add(req.token);

    logger.info(`User logged out from all devices: ${req.user.email}`);

    res.json({
      message: 'Logged out from all devices'
    });

  } catch (error) {
    logger.error('Logout all error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed'
    });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Current and new password required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'New password must be at least 8 characters'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Current password is incorrect'
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash },
    });

    await sessionStore.removeAllUserTokens(req.user.id);
    await prisma.session.deleteMany({
      where: { userId: req.user.id }
    });
    await tokenBlacklist.add(req.token);

    logger.info(`Password changed for user: ${req.user.email}`);

    res.json({
      message: 'Password changed successfully. Please log in again.'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password change failed'
    });
  }
});

router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.user.id,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ sessions });
  } catch (error) {
    logger.error('Get sessions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve sessions'
    });
  }
});

module.exports = router;
