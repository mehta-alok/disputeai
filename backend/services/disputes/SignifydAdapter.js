const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class SignifydAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Signifyd', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = SignifydAdapter;
