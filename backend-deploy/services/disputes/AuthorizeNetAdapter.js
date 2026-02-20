const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class AuthorizeNetAdapter extends BaseDisputeAdapter {
  constructor(config = {}) {
    super({ ...config, name: 'Authorize.Net', type: 'dispute' });
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload', 'webhook_notifications'];
  }
}

module.exports = AuthorizeNetAdapter;
