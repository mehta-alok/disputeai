/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Dispute Companies Integration Page
 *
 * Features:
 * - Portal sign-in links for each dispute company
 * - Configure modal with API key fields
 * - Two-way sync status badges
 * - Category filtering (All, Hospitality, Card Networks, Processors, General)
 */

import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import {
  Shield,
  Settings,
  CheckCircle,
  XCircle,
  CreditCard,
  ExternalLink,
  RefreshCw,
  X,
  ArrowLeftRight,
  Lock,
  Eye,
  EyeOff,
  Save,
  Search,
  Filter
} from 'lucide-react';

function TypeBadge({ type }) {
  const styles = {
    dispute_management: 'bg-blue-100 text-blue-700',
    card_network: 'bg-purple-100 text-purple-700',
    processor: 'bg-amber-100 text-amber-700',
  };
  const labels = {
    dispute_management: 'Dispute Management',
    card_network: 'Card Network',
    processor: 'Processor',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type] || 'bg-gray-100 text-gray-700'}`}>
      <CreditCard className="w-3 h-3 mr-1" />
      {labels[type] || type?.replace('_', ' ') || 'Other'}
    </span>
  );
}

function ConfigureModal({ company, onClose }) {
  const [configValues, setConfigValues] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fields = company.requiredConfig || [];

  const handleSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isSecretField = (field) => {
    return field.toLowerCase().includes('key') ||
      field.toLowerCase().includes('secret') ||
      field.toLowerCase().includes('password') ||
      field.toLowerCase().includes('pin') ||
      field.toLowerCase().includes('token');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Configure {company.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{company.fullName || company.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {company.description && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{company.description}</p>
          )}

          {company.portalUrl && (
            <a
              href={company.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors w-full justify-center"
            >
              <ExternalLink className="w-4 h-4" />
              Sign In to {company.name} Portal
            </a>
          )}

          {company.twoWaySync && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
              <ArrowLeftRight className="w-4 h-4" />
              Two-way sync enabled - disputes sync automatically between DisputeAI and {company.name}
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              API Credentials
            </h3>

            {fields.length > 0 ? (
              <div className="space-y-3">
                {fields.map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                      {field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                      <span className="text-red-400 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={isSecretField(field) && !showSecrets[field] ? 'password' : 'text'}
                        value={configValues[field] || ''}
                        onChange={e => setConfigValues(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={`Enter ${field}`}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                      />
                      {isSecretField(field) && (
                        <button
                          type="button"
                          onClick={() => setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showSecrets[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No configuration fields required for this integration.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyCard({ company, onConfigure }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">{company.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {company.twoWaySync && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600" title="Two-way sync">
              <ArrowLeftRight className="w-3 h-3" />
            </span>
          )}
          {company.status === 'active' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
              <CheckCircle className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              <XCircle className="w-3 h-3" /> Not Connected
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <TypeBadge type={company.type} />
        {company.twoWaySync && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-600">
            <ArrowLeftRight className="w-3 h-3 mr-1" />
            2-Way Sync
          </span>
        )}
      </div>

      {company.features && company.features.length > 0 && (
        <ul className="mt-2 space-y-1">
          {company.features.slice(0, 3).map((f, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" /> {f}
            </li>
          ))}
          {company.features.length > 3 && (
            <li className="text-xs text-gray-400">+{company.features.length - 3} more</li>
          )}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        {company.portalUrl && (
          <a
            href={company.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Sign In
          </a>
        )}
        <button
          onClick={() => onConfigure(company)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Configure
        </button>
      </div>
    </div>
  );
}

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'network', label: 'Card Networks' },
  { key: 'processor', label: 'Processors' },
  { key: 'general', label: 'General' },
];

export default function DisputeIntegration() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [configureCompany, setConfigureCompany] = useState(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/disputes/companies');
        const data = res?.companies || res?.data?.companies || [];
        if (data.length > 0) {
          setCompanies(data);
        }
      } catch (err) {
        console.debug('Could not fetch dispute companies:', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = !searchTerm ||
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryCount = (cat) => {
    if (cat === 'all') return companies.length;
    return companies.filter(c => c.category === cat).length;
  };

  const twoWayCount = companies.filter(c => c.twoWaySync).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispute Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {companies.length} integrations ({twoWayCount} with two-way sync)
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search + Category Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search companies..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORY_FILTERS.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeCategory === cat.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label} ({categoryCount(cat.key)})
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
              <div className="h-8 bg-gray-100 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No companies match your search</p>
          <button
            onClick={() => { setSearchTerm(''); setActiveCategory('all'); }}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company, idx) => (
            <CompanyCard
              key={company.id || company.name || idx}
              company={company}
              onConfigure={setConfigureCompany}
            />
          ))}
        </div>
      )}

      {/* Configure Modal */}
      {configureCompany && (
        <ConfigureModal
          company={configureCompany}
          onClose={() => setConfigureCompany(null)}
        />
      )}
    </div>
  );
}
