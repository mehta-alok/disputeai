/**
 * AccuDefend System
 * Redis Configuration (Caching & Session Management)
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

/**
 * Get or create Redis client
 */
function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis: Max retry attempts reached, stopping reconnect');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      }
    });

    redisClient.on('connect', () => {
      logger.info('AccuDefend: Redis client connected');
    });

    redisClient.on('error', (error) => {
      if (error.code !== 'ECONNREFUSED' || !redisClient._retryLogged) {
        logger.error('Redis connection error:', { code: error.code });
        redisClient._retryLogged = true;
      }
    });

    redisClient.on('close', () => {
      // Only log once
      if (!redisClient._closeLogged) {
        logger.warn('Redis connection closed');
        redisClient._closeLogged = true;
      }
    });
  }

  return redisClient;
}

/**
 * Connect to Redis
 */
async function connectRedis() {
  try {
    const client = getRedisClient();

    // Add connection timeout to avoid hanging
    const connectPromise = client.connect().then(() => client.ping());
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout (5s)')), 5000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    logger.info('AccuDefend: Redis connection verified');
    return client;
  } catch (error) {
    logger.error('Redis connection failed:', error.message || error);
    throw error;
  }
}

/**
 * Token blacklist management for JWT invalidation
 */
const tokenBlacklist = {
  async add(token, expiresIn = 7 * 24 * 60 * 60) {
    const client = getRedisClient();
    await client.setex(`blacklist:${token}`, expiresIn, '1');
  },

  async isBlacklisted(token) {
    const client = getRedisClient();
    const result = await client.get(`blacklist:${token}`);
    return result === '1';
  }
};

/**
 * Session management
 */
const sessionStore = {
  async setRefreshToken(userId, token, expiresIn = 7 * 24 * 60 * 60) {
    const client = getRedisClient();
    await client.setex(`refresh:${userId}:${token}`, expiresIn, JSON.stringify({
      createdAt: new Date().toISOString(),
      userId
    }));
  },

  async validateRefreshToken(userId, token) {
    const client = getRedisClient();
    const data = await client.get(`refresh:${userId}:${token}`);
    return data ? JSON.parse(data) : null;
  },

  async removeRefreshToken(userId, token) {
    const client = getRedisClient();
    await client.del(`refresh:${userId}:${token}`);
  },

  async removeAllUserTokens(userId) {
    const client = getRedisClient();
    const keys = await client.keys(`refresh:${userId}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
};

/**
 * Cache utilities
 */
const cache = {
  async get(key) {
    const client = getRedisClient();
    const value = await client.get(`cache:${key}`);
    return value ? JSON.parse(value) : null;
  },

  async set(key, value, ttl = 300) {
    const client = getRedisClient();
    await client.setex(`cache:${key}`, ttl, JSON.stringify(value));
  },

  async del(key) {
    const client = getRedisClient();
    await client.del(`cache:${key}`);
  },

  async clearPattern(pattern) {
    const client = getRedisClient();
    const keys = await client.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
};

module.exports = {
  getRedisClient,
  connectRedis,
  tokenBlacklist,
  sessionStore,
  cache
};
