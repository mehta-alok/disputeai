const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class MastercomAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Mastercom', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = MastercomAdapter;
