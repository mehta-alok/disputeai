const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class WorldpayAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Worldpay', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = WorldpayAdapter;
