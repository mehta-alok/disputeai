const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class VerifiAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Verifi', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = VerifiAdapter;
