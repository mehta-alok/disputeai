const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class ChaseMerchantAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Chase Merchant Services', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = ChaseMerchantAdapter;
