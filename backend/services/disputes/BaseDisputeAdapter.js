/**
 * AccuDefend - Base Dispute Adapter
 * All dispute/payment processor adapters extend this class
 */
class BaseDisputeAdapter {
  constructor(config = {}) {
    this.name = config.name || 'Unknown';
    this.type = config.type || 'dispute';
    this.isActive = config.isActive || false;
    this.apiEndpoint = config.apiEndpoint || '';
    this.credentials = config.credentials || {};
    this.webhookUrl = config.webhookUrl || '';
  }

  async testConnection() {
    return { success: false, message: `${this.name} adapter not configured` };
  }

  async submitDispute(caseData) {
    throw new Error(`submitDispute not implemented for ${this.name}`);
  }

  async getDisputeStatus(disputeId) {
    throw new Error(`getDisputeStatus not implemented for ${this.name}`);
  }

  async submitEvidence(disputeId, evidence) {
    throw new Error(`submitEvidence not implemented for ${this.name}`);
  }

  async getUpdates(since) {
    return [];
  }

  getInfo() {
    return {
      name: this.name,
      type: this.type,
      isActive: this.isActive,
      features: this.getFeatures()
    };
  }

  getFeatures() {
    return ['dispute_submission', 'status_tracking', 'evidence_upload'];
  }
}

module.exports = BaseDisputeAdapter;
