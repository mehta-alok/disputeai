/**
 * DisputeAI - AI Client Service (stub for demo mode)
 */
const logger = require('../utils/logger');

async function checkAIHealth() {
  return {
    available: false,
    provider: process.env.AI_MODEL_PROVIDER || 'none',
    model: process.env.AI_MODEL_NAME || 'none',
    error: 'AI provider not configured'
  };
}

async function generateResponse(prompt, options = {}) {
  return { text: 'AI response unavailable in demo mode', confidence: 0 };
}

module.exports = { checkAIHealth, generateResponse };
