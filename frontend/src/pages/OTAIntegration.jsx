/**
 * AccuDefend - OTA Integration Page
 * Two-way integration with Online Travel Agencies
 * Allows guests to access chargebacks, reservations via OTA portal
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
  Eye
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
    connectionType: 'OAuth 2.0'
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
    connectionType: 'API Key'
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
    connectionType: 'OAuth 2.0'
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
    connectionType: 'API Key'
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
    connectionType: 'OAuth 2.0'
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
    connectionType: 'API Key'
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
    connectionType: 'OAuth 2.0'
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
    connectionType: 'API Key'
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
    connectionType: 'OAuth 2.0'
  }
];

const STATUS_STYLES = {
  connected: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Connected' },
  pending: { color: 'bg-amber-100 text-amber-700', icon: RefreshCw, label: 'Pending' },
  disconnected: { color: 'bg-gray-100 text-gray-500', icon: XCircle, label: 'Not Connected' }
};

export default function OTAIntegration() {
  const [providers, setProviders] = useState(OTA_PROVIDERS);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [connectingId, setConnectingId] = useState(null);

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
    setProviders(prev => prev.map(p =>
      p.id === id ? { ...p, status: 'disconnected', lastSync: null, reservations: 0 } : p
    ));
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
            <p className="text-blue-800">Reservation syncs to AccuDefend via AutoClerk PMS</p>
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
                      <button
                        onClick={() => setSelectedProvider(provider)}
                        className="btn-secondary flex-1 text-xs"
                      >
                        <Settings className="w-3 h-3 mr-1" /> Configure
                      </button>
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
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
            When two-way sync is active, AccuDefend receives real-time updates from connected OTAs on disputes, potential fraud, and booking anomalies.
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
    </div>
  );
}
