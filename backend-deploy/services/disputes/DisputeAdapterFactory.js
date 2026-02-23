/**
 * DisputeAI - Dispute Adapter Factory
 * Loads and manages all dispute/payment processor adapters
 */
const fs = require('fs');
const path = require('path');
const BaseDisputeAdapter = require('./BaseDisputeAdapter');

class DisputeAdapterFactory {
  constructor() {
    this.adapters = new Map();
    this.loadAdapters();
  }

  loadAdapters() {
    const adapterDir = __dirname;
    const files = fs.readdirSync(adapterDir).filter(f =>
      f.endsWith('Adapter.js') && f !== 'BaseDisputeAdapter.js'
    );

    for (const file of files) {
      try {
        const AdapterClass = require(path.join(adapterDir, file));
        const adapter = new AdapterClass();
        this.adapters.set(adapter.name.toLowerCase().replace(/\s+/g, '_'), adapter);
      } catch (err) {
        // Skip adapters that fail to load
      }
    }
  }

  getAdapter(name) {
    return this.adapters.get(name.toLowerCase().replace(/\s+/g, '_'));
  }

  getAllAdapters() {
    return Array.from(this.adapters.values()).map(a => a.getInfo());
  }

  getAdapterCount() {
    return this.adapters.size;
  }
}

module.exports = new DisputeAdapterFactory();
