const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class DiscoverDisputeAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Discover Disputes', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = DiscoverDisputeAdapter;
