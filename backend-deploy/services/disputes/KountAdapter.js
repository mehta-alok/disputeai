const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class KountAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Kount', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = KountAdapter;
