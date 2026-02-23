/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { tokenBlacklist } = require('../config/redis');
const logger = require('../utils/logger');

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token required'
      });
    }

    try {
      const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
      if (isBlacklisted) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has been revoked'
        });
      }
    } catch {
      // Redis unavailable - skip blacklist check
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.userId && decoded.userId.startsWith('demo-')) {
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        firstName: decoded.email.split('@')[0].split('.')[0].replace(/\b\w/g, l => l.toUpperCase()),
        lastName: 'User',
        role: decoded.role || 'ADMIN',
        isActive: true,
        propertyId: decoded.propertyId || 'demo-property-1',
        property: { id: 'demo-property-1', name: 'DisputeAI Demo Hotel' }
      };
      req.token = token;
      return next();
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          propertyId: true,
          property: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    } catch (dbError) {
      logger.warn('Database unavailable in auth middleware, using token data');
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        isActive: true,
        propertyId: decoded.propertyId,
        property: null
      };
      req.token = token;
      return next();
    }

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found or inactive'
      });
    }

    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.email} - required roles: ${allowedRoles.join(', ')}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
}

function requirePropertyAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (req.user.role === 'ADMIN') {
    return next();
  }

  const requestedPropertyId =
    req.query.propertyId ||
    req.params.propertyId ||
    req.body?.propertyId;

  if (!requestedPropertyId) {
    req.propertyFilter = { propertyId: req.user.propertyId };
    return next();
  }

  if (requestedPropertyId !== req.user.propertyId) {
    logger.warn(`Property access denied for user ${req.user.email} - attempted: ${requestedPropertyId}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied to this property'
    });
  }

  req.propertyFilter = { propertyId: requestedPropertyId };
  next();
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
    if (isBlacklisted) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        propertyId: true
      }
    });

    if (user?.isActive !== false) {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    next();
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  requirePropertyAccess,
  optionalAuth
};
