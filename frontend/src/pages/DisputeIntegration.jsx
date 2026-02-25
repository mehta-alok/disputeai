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
  Filter,
  Zap,
  Link2,
  Globe
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

function CompanyCard({ company, onConfigure, isConnected, onToggleConnection }) {
  return (
    <div className={`bg-white rounded-lg border p-5 hover:shadow-md transition-shadow ${isConnected ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${isConnected ? 'text-emerald-600' : 'text-indigo-600'}`} />
          <h3 className="font-semibold text-gray-900">{company.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {company.twoWaySync && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600" title="Two-way sync">
              <ArrowLeftRight className="w-3 h-3" />
            </span>
          )}
          {isConnected ? (
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
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Sign In
          </a>
        )}
        <button
          onClick={() => onConfigure(company)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Configure
        </button>
        <button
          onClick={() => onToggleConnection(company.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isConnected
              ? 'text-red-600 bg-red-50 hover:bg-red-100'
              : 'text-green-600 bg-green-50 hover:bg-green-100'
          }`}
        >
          {isConnected ? (
            <><XCircle className="w-3.5 h-3.5" /> Disconnect</>
          ) : (
            <><Link2 className="w-3.5 h-3.5" /> Connect</>
          )}
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
  // Track connected companies locally (in demo mode, simulate some as active)
  const [connectedIds, setConnectedIds] = useState(new Set());

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/disputes/companies');
        const data = res?.companies || res?.data?.companies || [];
        if (data.length > 0) {
          setCompanies(data);
          // In demo mode, auto-connect a subset of companies to demonstrate multi-integration
          const defaultConnected = new Set();
          data.forEach((c, i) => {
            if (c.status === 'active' || i < 8) defaultConnected.add(c.id);
          });
          setConnectedIds(defaultConnected);
        }
      } catch (err) {
        console.debug('Could not fetch dispute companies:', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  const handleToggleConnection = (companyId) => {
    setConnectedIds(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const handleConnectAll = () => {
    setConnectedIds(new Set(companies.map(c => c.id)));
  };

  const companiesWithStatus = companies.map(c => ({
    ...c,
    status: connectedIds.has(c.id) ? 'active' : c.status
  }));

  const filteredCompanies = companiesWithStatus.filter(c => {
    const matchesSearch = !searchTerm ||
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryCount = (cat) => {
    if (cat === 'all') return companiesWithStatus.length;
    return companiesWithStatus.filter(c => c.category === cat).length;
  };

  const twoWayCount = companiesWithStatus.filter(c => c.twoWaySync).length;
  const activeCount = connectedIds.size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispute Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {companiesWithStatus.length} integrations available — connect as many as needed across all properties
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount < companiesWithStatus.length && (
            <button
              onClick={handleConnectAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              <Zap className="w-4 h-4" />
              Connect All
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Active Integrations Summary */}
      {activeCount > 0 && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {activeCount} of {companiesWithStatus.length} Dispute Integrations Active
            </h3>
            <span className="text-sm text-indigo-200">{twoWayCount} with two-way sync</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {companiesWithStatus.filter(c => connectedIds.has(c.id)).slice(0, 12).map(c => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-full text-xs">
                <CheckCircle className="w-3 h-3" />
                {c.name}
              </span>
            ))}
            {activeCount > 12 && (
              <span className="inline-flex items-center px-2.5 py-1 bg-white/10 rounded-full text-xs text-indigo-200">
                +{activeCount - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Link2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeCount}/{companiesWithStatus.length}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{twoWayCount}</p>
              <p className="text-sm text-gray-500">Two-Way Sync</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{categoryCount('network')}</p>
              <p className="text-sm text-gray-500">Card Networks</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Globe className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{categoryCount('processor')}</p>
              <p className="text-sm text-gray-500">Processors</p>
            </div>
          </div>
        </div>
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
              isConnected={connectedIds.has(company.id)}
              onConfigure={setConfigureCompany}
              onToggleConnection={handleToggleConnection}
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
