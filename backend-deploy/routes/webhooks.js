const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../utils/logger');

// =============================================================================
// SHIFT4 WEBHOOK (Primary pay