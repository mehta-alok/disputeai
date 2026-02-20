const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class MerlinkAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Merlink', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = MerlinkAdapter;
