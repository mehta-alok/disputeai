const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class EthocaAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Ethoca', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = EthocaAdapter;
