/**
 * DisputeAI - Database Configuration
 * Uses deferred loading to avoid Node.js v25 hanging on require('@prisma/client')
 * Falls back gracefully to demo mode when database is unavailable
 */

let _prisma = null;
let _initialized = false;

// Create a deferred proxy that only loads Prisma when actually accessed
const prisma = new Proxy({}, {
  get(target, prop) {
    if (!_initialized) {
      _initialized = true;
      try {
        const { PrismaClient } = require('@prisma/client');
        _prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
          datasources: {
            db: {
              url: process.env.DATABASE_URL
            }
          }
        });
      } catch (err) {
        // Prisma client not available - demo mode will handle this
        _prisma = null;
      }
    }

    if (!_prisma) {
      // Return a mock that throws on any database operation
      if (prop === '$connect' || prop === '$disconnect') {
        return async () => {};
      }
      if (prop === '$queryRaw' || prop === '$executeRaw') {
        return async () => { throw new Error('Database not available'); };
      }
      if (prop === 'then') {
        return undefined; // Prevent Promise-like behavior
      }
      // Return a proxy for model access (e.g., prisma.user.findMany)
      return new Proxy({}, {
        get() {
          return async () => { throw new Error('Database not available - running in demo mode'); };
        }
      });
    }

    return _prisma[prop];
  }
});

async function connectDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}

async function disconnectDatabase() {
  try {
    if (_prisma && _prisma.$disconnect) {
      await _prisma.$disconnect();
    }
  } catch (error) {
    // Ignore disconnect errors
  }
}

module.exports = { prisma, connectDatabase, disconnectDatabase };
