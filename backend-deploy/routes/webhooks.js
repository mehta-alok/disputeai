const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../utils/logger');

// Helper: parse webhook body (handles Buffer from express.raw, string, or object)
function parseBody(body) {
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString());
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

// Helper: get raw payload string for signature validation
function getRawPayload(body) {
  if (Buffer.isBuffer(body)) return body.toString();
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

// =============================================================================
// SHIFT4 WEBHOOK (Primary payment processor)
// =============================================================================
router.post('/shift4', async (req, res) => {
  try {
    const signature = req.headers['x-shift4-signature'] || req.headers['x-webhook-signature'];
    const webhookSecret = process.env.SHIFT4_WEBHOOK_SECRET;

    // Validate signature if webhook secret is configured
    if (webhookSecret && signature) {
      const payload = getRawPayload(req.body);
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSig) {
        logger.warn('Shift4 webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = parseBody(req.body);
    const eventType = event.type || event.eventType;

    logger.info(`Shift4 webhook received: ${eventType}`);

    switch (eventType) {
      case 'DISPUTE_CREATED':
      case 'charge.dispute.created':
        logger.info(`New dispute from Shift4: ${event.data?.id || event.disputeId || 'unknown'}`);
        // In production: create chargeback case from dispute data
        // const chargebackData = {
        //   processorDisputeId: event.data?.id,
        //   amount: event.data?.amount / 100,
        //   reasonCode: event.data?.reason,
        //   cardLastFour: event.data?.card?.last4,
        //   guestName: event.data?.customer?.name,
        // };
        break;

      case 'DISPUTE_UPDATED':
      case 'charge.dispute.updated':
        logger.info(`Dispute updated from Shift4: ${event.data?.id || event.disputeId || 'unknown'}`);
        break;

      case 'DISPUTE_WON':
      case 'charge.dispute.closed':
        logger.info(`Dispute resolved from Shift4: ${event.data?.id || event.disputeId || 'unknown'}`);
        break;

      case 'DISPUTE_EVIDENCE_REQUIRED':
        logger.info(`Evidence requested by Shift4: ${event.data?.id || event.disputeId || 'unknown'}`);
        break;

      default:
        logger.info(`Unhandled Shift4 event type: ${eventType}`);
    }

    res.json({ received: true, eventType });
  } catch (error) {
    logger.error('Shift4 webhook processing error:', error.message);
    res.status(200).json({ received: true, error: 'Processing failed' });
  }
});

// =============================================================================
// MERLINK WEBHOOK (Dispute management platform via Shift4)
// =============================================================================
router.post('/merlink', async (req, res) => {
  try {
    const signature = req.headers['x-merlink-signature'];
    const webhookSecret = process.env.MERLINK_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const payload = getRawPayload(req.body);
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSig) {
        logger.warn('Merlink webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = parseBody(req.body);
    const eventType = event.type || event.eventType || event.action;

    logger.info(`Merlink webhook received: ${eventType}`);

    switch (eventType) {
      case 'dispute.new':
      case 'case.created':
        logger.info(`New dispute case from Merlink: ${event.caseId || event.data?.caseId || 'unknown'}`);
        break;

      case 'dispute.updated':
      case 'case.updated':
        logger.info(`Case updated from Merlink: ${event.caseId || event.data?.caseId || 'unknown'}`);
        break;

      case 'evidence.requested':
        logger.info(`Evidence requested via Merlink: ${event.caseId || event.data?.caseId || 'unknown'}`);
        break;

      case 'dispute.resolved':
      case 'case.closed':
        logger.info(`Case resolved via Merlink: ${event.caseId || event.data?.caseId || 'unknown'}`);
        break;

      case 'deadline.approaching':
        logger.warn(`Deadline approaching via Merlink: ${event.caseId || event.data?.caseId || 'unknown'}`);
        break;

      default:
        logger.info(`Unhandled Merlink event type: ${eventType}`);
    }

    res.json({ received: true, eventType });
  } catch (error) {
    logger.error('Merlink webhook processing error:', error.message);
    res.status(200).json({ received: true, error: 'Processing failed' });
  }
});

// =============================================================================
// STRIPE WEBHOOK
// =============================================================================
router.post('/stripe', async (req, res) => {
  try {
    const event = parseBody(req.body);
    logger.info(`Stripe webhook received: ${event.type}`);
    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook error:', error.message);
    res.json({ received: true });
  }
});

// =============================================================================
// ADYEN WEBHOOK
// =============================================================================
router.post('/adyen', async (req, res) => {
  try {
    const event = parseBody(req.body);
    logger.info(`Adyen webhook received: ${event.notificationItems?.[0]?.NotificationRequestItem?.eventCode || 'unknown'}`);
    res.json({ received: true });
  } catch (error) {
    logger.error('Adyen webhook error:', error.message);
    res.json({ received: true });
  }
});

module.exports = router;
