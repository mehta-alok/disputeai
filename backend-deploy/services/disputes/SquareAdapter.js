const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class SquareAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Square Disputes', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = SquareAdapter;
