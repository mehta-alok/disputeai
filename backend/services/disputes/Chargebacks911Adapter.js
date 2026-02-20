const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class Chargebacks911Adapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Chargebacks911', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = Chargebacks911Adapter;
