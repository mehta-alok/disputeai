const logger = require('../../utils/logger');

async function initializeWorkers() {
  logger.info('Queue workers: demo mode (no Redis)');
}

async function shutdownWorkers() {
  logger.info('Queue workers: shutdown');
}

module.exports = { initializeWorkers, shutdownWorkers };
