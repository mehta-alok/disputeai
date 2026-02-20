const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class AmexMerchantAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Amex Merchant', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = AmexMerchantAdapter;
