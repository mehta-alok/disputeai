/**
 * DisputeAI - OTA Integration Page
 * Two-way integration with Online Travel Agencies
 * Allows guests to access chargebacks, reservations via OTA portal
 *
 * Features:
 * - Portal sign-in links that redirect to OTA partner portals
 * - Configure modal with API credentials, sync settings, webhook URL
 * - Connect/Disconnect with loading states
 * - Real-time monitoring dashboard with live activity feed
 * - Guest portal access documentation
 */

import React, { useState } from 'react';
import {
  Globe,
  Link2,
  ExternalLink,
  CheckCircle,
  XCircle,
  RefreshCw,
  Shield,
  ArrowLeftRight,
  Hotel,
  CreditCard,
  FileText,
  Users,
  Settings,
  Key,
  Zap,
  Lock,
  AlertTriangle,
  Radio,
  Bell,
  Activity,
  ShieldAlert,
  Eye,
  EyeOff,
  X,
  Save,
  Clock,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Copy
} from 'lucide-react';

const OTA_PROVIDERS = [
  {
    id: 'booking',
    name: 'Booking.com',
    logo: 'B',
    logoColor: 'bg-blue-600',
    status: 'connected',
    lastSync: '2 min ago',
    reservations: 156,
    features: ['Two-way sync', 'Guest portal', 'Dispute alerts', 'Auto-evidence'],
    apiVersion: 'v3.2',
    connectionType: 'OAuth 2.0',
    portalUrl: 'https://admin.booking.com',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['clientId', 'clientSecret', 'propertyId', 'webhookSecret'],
  },
  {
    id: 'expedia',
    name: 'Expedia Group',
    logo: 'E',
    logoColor: 'bg-yellow-500',
    status: 'connected',
    lastSync: '5 min ago',
    reservations: 89,
    features: ['Two-way sync', 'Guest portal', 'Dispute alerts'],
    apiVersion: 'v2.8',
    connectionType: 'API Key',
    portalUrl: 'https://www.expediapartnercentral.com/Account/Logon',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['apiKey', 'apiSecret', 'propertyId'],
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    logo: 'A',
    logoColor: 'bg-rose-500',
    status: 'pending',
    lastSync: null,
    reservations: 0,
    features: ['Two-way sync', 'Guest messaging'],
    apiVersion: 'v2.0',
    connectionType: 'OAuth 2.0',
    portalUrl: 'https://www.airbnb.com/login',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['clientId', 'clientSecret', 'listingId'],
  },
  {
    id: 'hotels',
    name: 'Hotels.com',
    logo: 'H',
    logoColor: 'bg-red-600',
    status: 'connected',
    lastSync: '10 min ago',
    reservations: 67,
    features: ['Two-way sync', 'Dispute alerts', 'Auto-evidence'],
    apiVersion: 'v1.5',
    connectionType: 'API Key',
    portalUrl: 'https://www.expediapartnercentral.com/Account/Logon',
    webhookSupport: false,
    twoWaySync: true,
    requiredConfig: ['apiKey', 'propertyId'],
  },
  {
    id: 'tripadvisor',
    name: 'TripAdvisor',
    logo: 'T',
    logoColor: 'bg-green-600',
    status: 'disconnected',
    lastSync: null,
    reservations: 0,
    features: ['One-way sync', 'Review monitoring'],
    apiVersion: 'v2.1',
    connectionType: 'OAuth 2.0',
    portalUrl: 'https://www.tripadvisor.com/Owners',
    webhookSupport: false,
    twoWaySync: false,
    requiredConfig: ['clientId', 'clientSecret', 'locationId'],
  },
  {
    id: 'vrbo',
    name: 'VRBO',
    logo: 'V',
    logoColor: 'bg-indigo-600',
    status: 'disconnected',
    lastSync: null,
    reservations: 0,
    features: ['Two-way sync', 'Guest portal'],
    apiVersion: 'v1.8',
    connectionType: 'API Key',
    portalUrl: 'https://www.vrbo.com/lp/b/owner-account',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['apiKey', 'apiSecret', 'propertyId'],
  },
  {
    id: 'agoda',
    name: 'Agoda',
    logo: 'A',
    logoColor: 'bg-teal-600',
    status: 'connected',
    lastSync: '8 min ago',
    reservations: 43,
    features: ['Two-way sync', 'Guest portal', 'Dispute alerts'],
    apiVersion: 'v2.4',
    connectionType: 'OAuth 2.0',
    portalUrl: 'https://ycs.agoda.com',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['clientId', 'clientSecret', 'hotelId', 'webhookSecret'],
  },
  {
    id: 'priceline',
    name: 'Priceline',
    logo: 'P',
    logoColor: 'bg-sky-600',
    status: 'pending',
    lastSync: null,
    reservations: 0,
    features: ['Two-way sync', 'Guest portal', 'Auto-evidence'],
    apiVersion: 'v1.3',
    connectionType: 'API Key',
    portalUrl: 'https://ycs.agoda.com',
    webhookSupport: false,
    twoWaySync: true,
    requiredConfig: ['apiKey', 'propertyId'],
  },
  {
    id: 'hotelengine',
    name: 'Hotel Engine',
    logo: 'HE',
    logoColor: 'bg-emerald-600',
    status: 'connected',
    lastSync: '4 min ago',
    reservations: 28,
    features: ['Two-way sync', 'Corporate rates', 'Dispute alerts', 'Auto-evidence'],
    apiVersion: 'v2.0',
    connectionType: 'OAuth 2.0',
    portalUrl: 'https://partnerhub.engine.com/auth/signin',
    webhookSupport: true,
    twoWaySync: true,
    requiredConfig: ['clientId', 'clientSecret', 'organizationId', 'webhookSecret'],
  }
];

const STATUS_STYLES = {
  connected: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Connected' },
  pending: { color: 'bg-amber-100 text-amber-700', icon: RefreshCw, label: 'Pending' },
  disconnected: { color: 'bg-gray-100 text-gray-500', icon: XCircle, label: 'Not Connected' }
};

const SYNC_FREQUENCIES = [
  { value: 'realtime', label: 'Real-time (WebSocket)' },
  { value: '5min', label: 'Every 5 minutes' },
  { value: '15min', label: 'Every 15 minutes' },
  { value: 'hourly', label: 'Every hour' },
];

// ============================================================
// Toggle Switch Component
// ============================================================

function ToggleSwitch({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ============================================================
// Configure Modal for OTA Providers
// ============================================================

function ConfigureModal({ provider, onClose, onSave }) {
  const [configValues, setConfigValues] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState('15min');
  const [syncOptions, setSyncOptions] = useState({
    reservations: true,
    guestData: true,
    disputeAlerts: true,
    autoEvidence: provider?.features?.includes('Auto-evidence') || false,
    guestMessaging: provider?.features?.includes('Guest messaging') || false,
  });
  const [copied, setCopied] = useState(false);

  if (!provider) return null;

  const fields = provider.requiredConfig || [];

  const isSecretField = (field) => {
    return field.toLowerCase().includes('key') ||
      field.toLowerCase().includes('secret') ||
      field.toLowerCase().includes('password') ||
      field.toLowerCase().includes('token');
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      if (onSave) onSave();
    }, 2000);
  };

  const handleManualSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 3000);
  };

  const webhookUrl = `https://api.disputeai.com/webhooks/ota/${provider.id}`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${provider.logoColor} rounded-xl flex items-center justify-center text-white font-bold`}>
              {provider.logo}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Configure {provider.name}</h2>
              <p className="text-sm text-gray-500">API {provider.apiVersion} - {provider.connectionType}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Portal Sign-In Link */}
          {provider.portalUrl && (
            <a
              href={provider.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors w-full"
            >
              <ExternalLink className="w-4 h-4" />
              Sign In to {provider.name} Partner Portal
            </a>
          )}

          {/* Two-Way Sync Badge */}
          {provider.twoWaySync && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
              <ArrowLeftRight className="w-4 h-4" />
              Two-way sync enabled - disputes sync automatically between DisputeAI and {provider.name}
            </div>
          )}

          {/* Sync Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sync Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {SYNC_FREQUENCIES.map((freq) => (
                <button
                  key={freq.value}
                  onClick={() => setSyncFrequency(freq.value)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left text-sm transition-all ${
                    syncFrequency === freq.value
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {syncFrequency === freq.value ? (
                    <CheckCircle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-xs">{freq.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Data Sync Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Sync Options</label>
            <div className="bg-gray-50 rounded-xl p-3 space-y-0.5 border border-gray-200">
              <ToggleSwitch
                enabled={syncOptions.reservations}
                onChange={(v) => setSyncOptions(prev => ({ ...prev, reservations: v }))}
                label="Reservations"
                description="Sync booking and reservation data from OTA"
              />
              <ToggleSwitch
                enabled={syncOptions.guestData}
                onChange={(v) => setSyncOptions(prev => ({ ...prev, guestData: v }))}
                label="Guest Data"
                description="Sync guest profiles and contact info"
              />
              <ToggleSwitch
                enabled={syncOptions.disputeAlerts}
                onChange={(v) => setSyncOptions(prev => ({ ...prev, disputeAlerts: v }))}
                label="Dispute Alerts"
                description="Receive real-time chargeback notifications"
              />
              <ToggleSwitch
                enabled={syncOptions.autoEvidence}
                onChange={(v) => setSyncOptions(prev => ({ ...prev, autoEvidence: v }))}
                label="Auto-Evidence Collection"
                description="Automatically gather evidence when disputes filed"
              />
            </div>
          </div>

          {/* Webhook URL (if supported) */}
          {provider.webhookSupport && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Webhook URL</label>
              <p className="text-xs text-gray-500 mb-2">Add this URL to your {provider.name} partner dashboard to receive real-time events</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg text-gray-600"
                />
                <button
                  onClick={handleCopyWebhook}
                  className="px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
            </div>
          )}

          {/* API Credentials */}
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
                        placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
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
              <p className="text-sm text-gray-500">No configuration fields required.</p>
            )}
          </div>

          {/* Manual Sync */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">Last synced: {provider.lastSync || 'Never'}</span>
            </div>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {syncing && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-700">Syncing data from {provider.name}...</span>
            </div>
          )}
        </div>

        {/* Footer */}
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
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg shadow-sm transition-all ${
              saved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
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

// ============================================================
// Activity Logs Modal
// ============================================================

function LogsModal({ provider, onClose }) {
  if (!provider) return null;

  const logs = [
    { time: '2 min ago', action: 'Reservation synced', detail: `RES-${Math.floor(Math.random() * 90000 + 10000)}`, status: 'success' },
    { time: '5 min ago', action: 'Guest data updated', detail: 'Profile merge completed', status: 'success' },
    { time: '12 min ago', action: 'Dispute alert received', detail: 'Chargeback CB-2026-4421', status: 'warning' },
    { time: '18 min ago', action: 'Evidence auto-collected', detail: '5 documents from AutoClerk PMS', status: 'success' },
    { time: '25 min ago', action: 'Webhook received', detail: 'booking.modified event', status: 'info' },
    { time: '1 hr ago', action: 'Full sync completed', detail: `${provider.reservations} reservations`, status: 'success' },
    { time: '2 hrs ago', action: 'API rate limit warning', detail: '80% of hourly quota used', status: 'warning' },
    { time: '3 hrs ago', action: 'Connection verified', detail: 'Health check passed', status: 'success' },
  ];

  const statusColors = {
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${provider.logoColor} rounded-xl flex items-center justify-center text-white font-bold`}>
              {provider.logo}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{provider.name} - Activity Logs</h2>
              <p className="text-sm text-gray-500">Recent sync and event activity</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusColors[log.status]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">{log.action}</p>
                  <span className="text-xs text-gray-400">{log.time}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main OTA Integration Component
// ============================================================

export default function OTAIntegration() {
  const [providers, setProviders] = useState(OTA_PROVIDERS);
  const [connectingId, setConnectingId] = useState(null);
  const [configureProvider, setConfigureProvider] = useState(null);
  const [logsProvider, setLogsProvider] = useState(null);

  const connectedCount = providers.filter(p => p.status === 'connected').length;
  const totalReservations = providers.reduce((sum, p) => sum + p.reservations, 0);

  const handleConnect = (id) => {
    setConnectingId(id);
    setTimeout(() => {
      setProviders(prev => prev.map(p =>
        p.id === id ? { ...p, status: 'connected', lastSync: 'Just now', reservations: Math.floor(Math.random() * 50) + 10 } : p
      ));
      setConnectingId(null);
    }, 2000);
  };

  const handleDisconnect = (id) => {
    if (window.confirm('Are you sure you want to disconnect this OTA? Existing evidence will be preserved.')) {
      setProviders(prev => prev.map(p =>
        p.id === id ? { ...p, status: 'disconnected', lastSync: null, reservations: 0 } : p
      ));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">OTA Integrations</h1>
        <p className="text-gray-500">Two-way integration with Online Travel Agencies for all-in-one guest access</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Link2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{connectedCount}</p>
              <p className="text-sm text-gray-500">Connected OTAs</p>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Hotel className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalReservations}</p>
              <p className="text-sm text-gray-500">OTA Reservations Synced</p>
            </div>
          </div>
        </div>
        <div className="card card-body">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <ArrowLeftRight className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">Two-Way</p>
              <p className="text-sm text-gray-500">Sync Mode Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card card-body bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" /> How OTA Integration Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <p className="text-blue-800">Guest books via OTA (Booking.com, Expedia, etc.)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <p className="text-blue-800">Reservation syncs to DisputeAI via AutoClerk PMS</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <p className="text-blue-800">If chargeback filed, evidence auto-collected from both PMS + OTA</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <p className="text-blue-800">Guest can view dispute status through OTA portal</p>
          </div>
        </div>
      </div>

      {/* OTA List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((provider) => {
          const statusConfig = STATUS_STYLES[provider.status];
          const StatusIcon = statusConfig.icon;
          const isConnecting = connectingId === provider.id;

          return (
            <div key={provider.id} className="card">
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 ${provider.logoColor} rounded-xl flex items-center justify-center text-white text-xl font-bold`}>
                      {provider.logo}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{provider.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </span>
                        <span className="text-xs text-gray-400">{provider.connectionType}</span>
                        {provider.twoWaySync && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600" title="Two-way sync">
                            <ArrowLeftRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {provider.status === 'connected' && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Reservations</p>
                      <p className="font-semibold">{provider.reservations}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-500">Last Sync</p>
                      <p className="font-semibold">{provider.lastSync}</p>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1">
                  {provider.features.map((f, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{f}</span>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  {provider.status === 'connected' ? (
                    <>
                      {/* Portal Sign-In */}
                      {provider.portalUrl && (
                        <a
                          href={provider.portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Sign In
                        </a>
                      )}
                      {/* Configure */}
                      <button
                        onClick={() => setConfigureProvider(provider)}
                        className="btn-secondary flex-1 text-xs"
                      >
                        <Settings className="w-3 h-3 mr-1" /> Configure
                      </button>
                      {/* View Logs */}
                      <button
                        onClick={() => setLogsProvider(provider)}
                        className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <Activity className="w-3 h-3" />
                      </button>
                      {/* Disconnect */}
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Portal Sign-In (for pending/disconnected too) */}
                      {provider.portalUrl && (
                        <a
                          href={provider.portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Sign In
                        </a>
                      )}
                      {/* Connect */}
                      <button
                        onClick={() => handleConnect(provider.id)}
                        disabled={isConnecting}
                        className="btn-primary flex-1 text-xs"
                      >
                        {isConnecting ? (
                          <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Connecting...</>
                        ) : (
                          <><Link2 className="w-3 h-3 mr-1" /> Connect {provider.name}</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real-Time Dispute & Fraud Monitoring */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" /> Real-Time Monitoring
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </span>
          </div>
        </div>
        <div className="card-body space-y-4">
          <p className="text-sm text-gray-600">
            When two-way sync is active, DisputeAI receives real-time updates from connected OTAs on disputes, potential fraud, and booking anomalies.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <ShieldAlert className="w-6 h-6 text-red-600 mb-2" />
              <h4 className="font-semibold text-sm text-red-900">Dispute Alerts</h4>
              <p className="text-xs text-red-700 mt-1">Instant notification when a guest files a chargeback through their OTA portal. Auto-triggers evidence collection.</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-medium">
                <Activity className="w-3 h-3" /> 3 alerts today
              </div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
              <Eye className="w-6 h-6 text-amber-600 mb-2" />
              <h4 className="font-semibold text-sm text-amber-900">Fraud Detection</h4>
              <p className="text-xs text-amber-700 mt-1">AI monitors booking patterns across OTAs for suspicious activity: duplicate bookings, mismatched IDs, and rapid cancellations.</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
                <Activity className="w-3 h-3" /> 1 flagged booking
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <Bell className="w-6 h-6 text-blue-600 mb-2" />
              <h4 className="font-semibold text-sm text-blue-900">Booking Anomalies</h4>
              <p className="text-xs text-blue-700 mt-1">Detects rate discrepancies, unauthorized modifications, and policy violations across OTA channels in real-time.</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 font-medium">
                <Activity className="w-3 h-3" /> 0 anomalies
              </div>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" /> Recent Activity
            </h4>
            <div className="space-y-2">
              {[
                { time: '2 min ago', event: 'Dispute alert received from Booking.com', type: 'dispute', detail: 'Guest: James Wilson · $1,250.00 · Reason: Services not received' },
                { time: '15 min ago', event: 'Fraud flag: Duplicate booking detected via Expedia', type: 'fraud', detail: 'Guest: Unknown · Same card used across 3 properties in 24hrs' },
                { time: '28 min ago', event: 'Evidence auto-collected for Agoda reservation', type: 'evidence', detail: 'RES-2026-88421 · 7 documents fetched from AutoClerk PMS' },
                { time: '1 hr ago', event: 'OTA sync completed: Hotels.com', type: 'sync', detail: '67 reservations synced · 0 conflicts · 2 new bookings' },
                { time: '2 hrs ago', event: 'Rate discrepancy detected: Hotel Engine vs PMS', type: 'anomaly', detail: 'RES-78567 · OTA rate $189/night vs PMS rate $212/night' },
              ].map((item, i) => {
                const typeColors = {
                  dispute: 'bg-red-500',
                  fraud: 'bg-amber-500',
                  evidence: 'bg-green-500',
                  sync: 'bg-blue-500',
                  anomaly: 'bg-purple-500',
                };
                return (
                  <div key={i} className="flex items-start gap-3 p-2 hover:bg-white rounded-lg transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${typeColors[item.type]}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{item.event}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Guest Portal Features */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> Guest Portal Access
          </h2>
        </div>
        <div className="card-body">
          <p className="text-sm text-gray-600 mb-4">
            When OTA integration is active, guests get a unified portal through their OTA account to view:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <Hotel className="w-6 h-6 text-blue-600 mb-2" />
              <h4 className="font-semibold text-sm">Reservations</h4>
              <p className="text-xs text-gray-500 mt-1">View current and past hotel reservations, check-in/out details, and room information</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <CreditCard className="w-6 h-6 text-green-600 mb-2" />
              <h4 className="font-semibold text-sm">Chargebacks</h4>
              <p className="text-xs text-gray-500 mt-1">Track dispute status, view submitted evidence, and see case outcomes in real-time</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600 mb-2" />
              <h4 className="font-semibold text-sm">Documents</h4>
              <p className="text-xs text-gray-500 mt-1">Access folios, receipts, and registration documents through their OTA account</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800">Guest data is encrypted end-to-end. OTA partners only see data for their own bookings. Full GDPR and PCI-DSS compliance maintained.</p>
          </div>
        </div>
      </div>

      {/* Configure Modal */}
      {configureProvider && (
        <ConfigureModal
          provider={configureProvider}
          onClose={() => setConfigureProvider(null)}
          onSave={() => setConfigureProvider(null)}
        />
      )}

      {/* Logs Modal */}
      {logsProvider && (
        <LogsModal
          provider={logsProvider}
          onClose={() => setLogsProvider(null)}
        />
      )}
    </div>
  );
}
