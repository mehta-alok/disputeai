const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class ElavonAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Elavon', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = ElavonAdapter;
