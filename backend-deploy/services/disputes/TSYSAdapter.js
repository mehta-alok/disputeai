const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class TSYSAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'TSYS', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = TSYSAdapter;
