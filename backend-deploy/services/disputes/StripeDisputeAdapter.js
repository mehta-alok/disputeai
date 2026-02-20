const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class StripeDisputeAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Stripe Disputes', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = StripeDisputeAdapter;
