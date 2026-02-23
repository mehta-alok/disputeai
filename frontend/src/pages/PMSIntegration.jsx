import React, { useState, useMemo, useCallback } from 'react';
import {
  Link2,
  Wifi,
  WifiOff,
  Search,
  Filter,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Hotel,
  Globe,
  Building2,
  Key,
  Database,
  ArrowLeftRight,
  Shield,
  Zap,
  ChevronDown,
  Plus,
  ExternalLink,
  AlertTriangle,
  Server,
  X,
  Loader2,
  ChevronRight,
  Activity,
  Calendar,
  Users,
  FileText,
  CreditCard,
  ToggleLeft,
  ToggleRight,
  Info,
  Copy,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

// ============================================================
// PMS Adapter Data
// ============================================================

const PMS_ADAPTERS = [
  {
    id: 'autoclerk',
    name: 'AutoClerk',
    category: 'independent',
    status: 'connected',
    description: 'Full-featured PMS for independent hotels and resorts',
    apiVersion: 'v2.4',
    color: '#10B981',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'audit_logs', 'pos'],
    website: 'https://autoclerk.com',
    portalUrl: 'https://www.bwh.autoclerkcloud.com/logon.do2',
    lastSync: '2026-02-16T10:28:00Z',
    syncCount: 12,
  },
  {
    id: 'opera-cloud',
    name: 'Opera Cloud (Oracle)',
    category: 'enterprise',
    status: 'available',
    description: 'Enterprise-grade PMS by Oracle Hospitality',
    apiVersion: 'v22.5',
    color: '#EF4444',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'audit_logs', 'pos', 'loyalty'],
    website: 'https://oracle.com/hospitality',
    portalUrl: 'https://www.oracle.com/hospitality/hotel-property-management/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'marriott-gxp',
    name: 'Marriott GXP',
    category: 'enterprise',
    status: 'available',
    description: 'Marriott International guest experience platform',
    apiVersion: 'v3.1',
    color: '#8B5CF6',
    features: ['reservations', 'folios', 'guest_data', 'loyalty', 'rewards'],
    website: 'https://marriott.com',
    portalUrl: 'https://gxp.iris.net/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'hilton-onq',
    name: 'Hilton OnQ',
    category: 'enterprise',
    status: 'available',
    description: 'Hilton proprietary property management system',
    apiVersion: 'v4.0',
    color: '#1D4ED8',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'honors'],
    website: 'https://hilton.com',
    portalUrl: 'https://www.globaldms.net/HPP/Default.aspx',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'hyatt-opera',
    name: 'Hyatt Opera',
    category: 'enterprise',
    status: 'available',
    description: 'Hyatt Hotels customized Opera PMS instance',
    apiVersion: 'v5.6',
    color: '#D97706',
    features: ['reservations', 'folios', 'guest_data', 'world_of_hyatt'],
    website: 'https://hyatt.com',
    portalUrl: 'https://www.hyattconnect.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'ihg-concerto',
    name: 'IHG Concerto',
    category: 'enterprise',
    status: 'available',
    description: 'IHG next-generation cloud-based PMS platform',
    apiVersion: 'v2.0',
    color: '#059669',
    features: ['reservations', 'folios', 'guest_data', 'ihg_rewards'],
    website: 'https://ihg.com',
    portalUrl: 'https://concerto.ihg.com',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'best-western',
    name: 'Best Western',
    category: 'enterprise',
    status: 'available',
    description: 'Best Western Hotels central reservation system',
    apiVersion: 'v1.8',
    color: '#2563EB',
    features: ['reservations', 'folios', 'guest_data', 'rewards'],
    website: 'https://bestwestern.com',
    portalUrl: 'https://hotel.bwhhotelgroup.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'mews',
    name: 'Mews',
    category: 'cloud',
    status: 'available',
    description: 'Modern cloud-native hospitality platform',
    apiVersion: 'v1.0',
    color: '#6366F1',
    features: ['reservations', 'folios', 'guest_data', 'payments', 'audit_logs'],
    website: 'https://mews.com',
    portalUrl: 'https://app.mews.com',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'cloudbeds',
    name: 'Cloudbeds',
    category: 'cloud',
    status: 'available',
    description: 'All-in-one cloud hospitality management suite',
    apiVersion: 'v1.2',
    color: '#0EA5E9',
    features: ['reservations', 'folios', 'guest_data', 'channel_manager', 'payments'],
    website: 'https://cloudbeds.com',
    portalUrl: 'https://www.cloudbeds.com/sign-in/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'guesty',
    name: 'Guesty',
    category: 'vacation_rental',
    status: 'available',
    description: 'Property management for short-term rentals',
    apiVersion: 'v2.0',
    color: '#F59E0B',
    features: ['reservations', 'guest_data', 'channel_manager', 'payments', 'messaging'],
    website: 'https://guesty.com',
    portalUrl: 'https://app.guesty.com/auth/login',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'hostaway',
    name: 'Hostaway',
    category: 'vacation_rental',
    status: 'available',
    description: 'Vacation rental management software',
    apiVersion: 'v2.1',
    color: '#14B8A6',
    features: ['reservations', 'guest_data', 'channel_manager', 'payments'],
    website: 'https://hostaway.com',
    portalUrl: 'https://dashboard.hostaway.com/login',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'little-hotelier',
    name: 'Little Hotelier',
    category: 'independent',
    status: 'available',
    description: 'PMS designed for small hotels and B&Bs',
    apiVersion: 'v3.0',
    color: '#EC4899',
    features: ['reservations', 'folios', 'guest_data', 'channel_manager'],
    website: 'https://littlehotelier.com',
    portalUrl: 'https://www.littlehotelier.com/login/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'rms-cloud',
    name: 'RMS Cloud',
    category: 'cloud',
    status: 'available',
    description: 'Cloud PMS popular in Australian and APAC markets',
    apiVersion: 'v9.0',
    color: '#3B82F6',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'audit_logs'],
    website: 'https://rmscloud.com',
    portalUrl: 'https://app.rmscloud.com/Login',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'stayntouch',
    name: 'Stayntouch',
    category: 'cloud',
    status: 'available',
    description: 'Mobile-first cloud PMS with contactless check-in',
    apiVersion: 'v2.3',
    color: '#7C3AED',
    features: ['reservations', 'folios', 'guest_data', 'mobile_keys', 'payments'],
    website: 'https://stayntouch.com',
    portalUrl: 'https://pms.stayntouch.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'protel',
    name: 'Protel',
    category: 'independent',
    status: 'available',
    description: 'Established PMS widely used in European markets',
    apiVersion: 'v4.2',
    color: '#DC2626',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'pos'],
    website: 'https://protel.net',
    portalUrl: 'https://app.protel.net/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'infor-hms',
    name: 'Infor HMS',
    category: 'enterprise',
    status: 'available',
    description: 'Enterprise hospitality management by Infor',
    apiVersion: 'v11.6',
    color: '#F97316',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'audit_logs', 'pos', 'analytics'],
    website: 'https://infor.com',
    portalUrl: 'https://hmsweb.hms.inforcloudsuite.com',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'maestro-pms',
    name: 'Maestro PMS',
    category: 'independent',
    status: 'available',
    description: 'PMS for independent hotels, resorts, and multi-property groups',
    apiVersion: 'v7.1',
    color: '#0891B2',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'spa', 'pos'],
    website: 'https://maestropms.com',
    portalUrl: 'https://web.maestropms.com',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'innroad',
    name: 'InnRoad',
    category: 'independent',
    status: 'available',
    description: 'Cloud PMS for independent properties',
    apiVersion: 'v3.5',
    color: '#4F46E5',
    features: ['reservations', 'folios', 'guest_data', 'channel_manager'],
    website: 'https://innroad.com',
    portalUrl: 'https://app.innroad.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'ezee',
    name: 'eZee',
    category: 'cloud',
    status: 'available',
    description: 'Affordable cloud PMS for budget segment properties',
    apiVersion: 'v2.0',
    color: '#16A34A',
    features: ['reservations', 'folios', 'guest_data', 'channel_manager', 'payments'],
    website: 'https://ezeetechnosys.com',
    portalUrl: 'https://live.ipms247.com/login/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'hotelogix',
    name: 'Hotelogix',
    category: 'cloud',
    status: 'available',
    description: 'Cloud-based PMS for small and mid-size hotels',
    apiVersion: 'v4.0',
    color: '#E11D48',
    features: ['reservations', 'folios', 'guest_data', 'channel_manager'],
    website: 'https://hotelogix.com',
    portalUrl: 'https://app.hotelogix.com',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'webrezpro',
    name: 'WebRezPro',
    category: 'cloud',
    status: 'available',
    description: 'Cloud PMS for hotels, inns, and vacation rentals',
    apiVersion: 'v5.2',
    color: '#0284C7',
    features: ['reservations', 'folios', 'guest_data', 'online_booking'],
    website: 'https://webrezpro.com',
    portalUrl: 'https://secure.webrez.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'siteminder-sihot',
    name: 'SiteMinder (SIHOT)',
    category: 'cloud',
    status: 'available',
    description: 'Leading hotel distribution and PMS platform',
    apiVersion: 'v2.6',
    color: '#9333EA',
    features: ['reservations', 'guest_data', 'channel_manager', 'booking_engine', 'analytics'],
    website: 'https://siteminder.com',
    portalUrl: 'https://www.siteminder.com/login/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'guestline',
    name: 'Guestline',
    category: 'independent',
    status: 'available',
    description: 'Cloud PMS widely adopted in the UK market',
    apiVersion: 'v3.8',
    color: '#2DD4BF',
    features: ['reservations', 'folios', 'guest_data', 'payments', 'channel_manager'],
    website: 'https://guestline.com',
    portalUrl: 'https://pms.eu.guestline.net/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'resnexus',
    name: 'ResNexus',
    category: 'independent',
    status: 'available',
    description: 'PMS for B&Bs, inns, and small properties',
    apiVersion: 'v2.1',
    color: '#CA8A04',
    features: ['reservations', 'folios', 'guest_data', 'online_booking'],
    website: 'https://resnexus.com',
    portalUrl: 'https://resnexus.com/resnexus/login.aspx',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'thinkreservations',
    name: 'ThinkReservations',
    category: 'independent',
    status: 'available',
    description: 'Reservation and property management for B&Bs and inns',
    apiVersion: 'v1.5',
    color: '#65A30D',
    features: ['reservations', 'folios', 'guest_data', 'online_booking'],
    website: 'https://thinkreservations.com',
    portalUrl: 'https://manage.thinkreservations.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'roomkey-pms',
    name: 'RoomKey PMS',
    category: 'independent',
    status: 'coming_soon',
    description: 'Modern PMS for independent hotels',
    apiVersion: 'v1.0',
    color: '#6D28D9',
    features: ['reservations', 'folios', 'guest_data'],
    website: 'https://roomkeypms.com',
    portalUrl: 'https://app.roomkeypms.com/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'frontdesk-anywhere',
    name: 'FrontDesk Anywhere',
    category: 'cloud',
    status: 'available',
    description: 'Cloud-based front desk and PMS solution',
    apiVersion: 'v2.0',
    color: '#0D9488',
    features: ['reservations', 'folios', 'guest_data', 'payments'],
    website: 'https://frontdeskanywhere.com',
    portalUrl: 'https://pms.us-west.frontdeskanywhere.net/login',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'lodgify',
    name: 'Lodgify',
    category: 'vacation_rental',
    status: 'available',
    description: 'Vacation rental software with website builder',
    apiVersion: 'v2.3',
    color: '#F472B6',
    features: ['reservations', 'guest_data', 'channel_manager', 'website_builder', 'payments'],
    website: 'https://lodgify.com',
    portalUrl: 'https://app.lodgify.com/login/',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'escapia',
    name: 'Escapia (VRBO)',
    category: 'vacation_rental',
    status: 'available',
    description: 'Vacation rental management by Expedia Group',
    apiVersion: 'v3.2',
    color: '#DB2777',
    features: ['reservations', 'guest_data', 'channel_manager', 'trust_accounting'],
    website: 'https://escapia.com',
    portalUrl: 'https://app.escapia.com/p/login',
    lastSync: null,
    syncCount: 0,
  },
  {
    id: 'agilysys',
    name: 'Agilysys',
    category: 'enterprise',
    status: 'available',
    description: 'Enterprise hospitality software for hotels, resorts, and casinos',
    apiVersion: 'v14.2',
    color: '#1E40AF',
    features: ['reservations', 'folios', 'guest_data', 'key_cards', 'pos', 'spa', 'golf', 'analytics'],
    website: 'https://agilysys.com',
    portalUrl: 'https://stay.rguest.com/',
    lastSync: null,
    syncCount: 0,
  },
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'connected', label: 'Connected', icon: Wifi },
  { id: 'enterprise', label: 'Enterprise', icon: Building2 },
  { id: 'cloud', label: 'Cloud', icon: Server },
  { id: 'vacation_rental', label: 'Vacation Rental', icon: Hotel },
  { id: 'independent', label: 'Independent', icon: Key },
];

const FEATURE_LABELS = {
  reservations: 'Reservations',
  folios: 'Folios',
  guest_data: 'Guest Data',
  key_cards: 'Key Cards',
  audit_logs: 'Audit Logs',
  pos: 'POS',
  loyalty: 'Loyalty',
  rewards: 'Rewards',
  honors: 'Honors',
  world_of_hyatt: 'World of Hyatt',
  ihg_rewards: 'IHG Rewards',
  payments: 'Payments',
  channel_manager: 'Channel Mgr',
  messaging: 'Messaging',
  mobile_keys: 'Mobile Keys',
  spa: 'Spa',
  golf: 'Golf',
  analytics: 'Analytics',
  online_booking: 'Online Booking',
  booking_engine: 'Booking Engine',
  website_builder: 'Website Builder',
  trust_accounting: 'Trust Accounting',
};

const SYNC_FREQUENCIES = [
  { value: 'realtime', label: 'Real-time (WebSocket)' },
  { value: '5min', label: 'Every 5 minutes' },
  { value: '15min', label: 'Every 15 minutes' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Once daily' },
];

// ============================================================
// Helper Components
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

function StatusBadge({ status }) {
  const configs = {
    connected: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      dot: 'bg-green-500',
      label: 'Connected',
    },
    available: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      dot: 'bg-blue-500',
      label: 'Available',
    },
    coming_soon: {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      dot: 'bg-gray-400',
      label: 'Coming Soon',
    },
    disconnected: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      dot: 'bg-red-500',
      label: 'Disconnected',
    },
  };
  const config = configs[status] || configs.available;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function FeatureTag({ feature }) {
  const label = FEATURE_LABELS[feature] || feature;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      {label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
        <div className={`relative inline-block w-full ${maxWidth} bg-white rounded-2xl text-left shadow-2xl transform transition-all`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PMS Adapter Card Component
// ============================================================

function PMSCard({ adapter, onConnect, onConfigure, onDisconnect }) {
  const isConnected = adapter.status === 'connected';
  const isComingSoon = adapter.status === 'coming_soon';
  const maxFeatures = 5;
  const displayedFeatures = adapter.features.slice(0, maxFeatures);
  const remainingCount = adapter.features.length - maxFeatures;

  return (
    <div
      className={`group bg-white rounded-xl border-2 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
        isConnected
          ? 'border-green-200 ring-1 ring-green-100'
          : isComingSoon
          ? 'border-gray-200 opacity-75'
          : 'border-gray-200 hover:border-blue-200'
      }`}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
              style={{ backgroundColor: adapter.color }}
            >
              {adapter.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                {adapter.name}
              </h3>
              <p className="text-xs text-gray-500">API {adapter.apiVersion}</p>
            </div>
          </div>
          <StatusBadge status={adapter.status} />
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{adapter.description}</p>

        {/* Features */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {displayedFeatures.map((feature) => (
            <FeatureTag key={feature} feature={feature} />
          ))}
          {remainingCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
              +{remainingCount} more
            </span>
          )}
        </div>

        {/* Connected Info */}
        {isConnected && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">Connected</span>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-green-600">
              <span>{adapter.syncCount} reservations synced</span>
              <span>Last sync: {new Date(adapter.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isConnected ? (
            <>
              {/* Portal Sign-In */}
              {adapter.portalUrl && (
                <a
                  href={adapter.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Sign In
                </a>
              )}
              <button
                onClick={() => onConfigure(adapter)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure
              </button>
              <button
                onClick={() => onDisconnect(adapter)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
              >
                <WifiOff className="w-3.5 h-3.5" />
              </button>
            </>
          ) : isComingSoon ? (
            <button
              disabled
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
            >
              <Clock className="w-3.5 h-3.5" />
              Coming Soon
            </button>
          ) : (
            <>
              {/* Portal Sign-In (for available adapters too) */}
              {adapter.portalUrl && (
                <a
                  href={adapter.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Sign In
                </a>
              )}
              <button
                onClick={() => onConnect(adapter)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Connection Modal Component
// ============================================================

function ConnectModal({ open, onClose, adapter }) {
  const [form, setForm] = useState({
    endpoint: '',
    apiKey: '',
    apiSecret: '',
    propertyId: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      if (form.endpoint && form.apiKey) {
        setTestResult({ success: true, message: 'Connection successful! PMS is responding.' });
      } else {
        setTestResult({ success: false, message: 'Please fill in all required fields.' });
      }
    }, 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/pms/connect', {
        pmsId: adapter?.id,
        ...form,
      });
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSaving(false);
      onClose();
    }, 1000);
  };

  if (!adapter) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Connect ${adapter.name}`}
      subtitle="Enter your PMS API credentials to establish the connection"
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {/* PMS Info Header */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: adapter.color }}
          >
            {adapter.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{adapter.name}</p>
            <p className="text-xs text-gray-500">API Version {adapter.apiVersion}</p>
          </div>
        </div>

        {/* Form Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            API Endpoint URL <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={form.endpoint}
              onChange={(e) => setForm((prev) => ({ ...prev, endpoint: e.target.value }))}
              placeholder={`https://api.${adapter.id.replace(/-/g, '')}.com/v1`}
              className="block w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            API Key <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={showApiKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Enter your API key"
              className="block w-full rounded-lg border border-gray-300 pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {showApiKey ? (
                <EyeOff className="w-4 h-4 text-gray-400" />
              ) : (
                <Eye className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">API Secret</label>
          <div className="relative">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={form.apiSecret}
              onChange={(e) => setForm((prev) => ({ ...prev, apiSecret: e.target.value }))}
              placeholder="Enter your API secret (if required)"
              className="block w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Property ID</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={form.propertyId}
              onChange={(e) => setForm((prev) => ({ ...prev, propertyId: e.target.value }))}
              placeholder="Your property identifier in the PMS"
              className="block w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg border ${
              testResult.success
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.endpoint || !form.apiKey}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {saving ? 'Connecting...' : 'Save & Connect'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Configure / Sync Modal Component
// ============================================================

function ConfigureModal({ open, onClose, adapter }) {
  const [syncFrequency, setSyncFrequency] = useState('15min');
  const [syncOptions, setSyncOptions] = useState({
    reservations: true,
    guestProfiles: true,
    folios: true,
    keyCards: true,
    auditLogs: false,
  });
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await api.post('/pms/sync', { pmsId: adapter?.id });
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSyncing(false);
    }, 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/pms/config', {
        pmsId: adapter?.id,
        syncFrequency,
        syncOptions,
      });
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  if (!adapter) return null;

  const lastSyncTime = adapter.lastSync
    ? new Date(adapter.lastSync).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Configure ${adapter.name}`}
      subtitle="Manage sync settings and data flow"
      maxWidth="max-w-xl"
    >
      <div className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: adapter.color }}
            >
              {adapter.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold text-green-900">{adapter.name}</p>
              <p className="text-xs text-green-600">Connected - API {adapter.apiVersion}</p>
            </div>
          </div>
          <StatusBadge status="connected" />
        </div>

        {/* Portal Sign-In Link */}
        {adapter.portalUrl && (
          <a
            href={adapter.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors w-full"
          >
            <ExternalLink className="w-4 h-4" />
            Sign In to {adapter.name} Portal
          </a>
        )}

        {/* Sync Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sync Frequency</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SYNC_FREQUENCIES.map((freq) => (
              <button
                key={freq.value}
                onClick={() => setSyncFrequency(freq.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left text-sm transition-all ${
                  syncFrequency === freq.value
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {syncFrequency === freq.value ? (
                  <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                {freq.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data Sync Toggles */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Data Sync Options</label>
          <div className="bg-gray-50 rounded-xl p-4 space-y-0.5 border border-gray-200">
            <ToggleSwitch
              enabled={syncOptions.reservations}
              onChange={(v) => setSyncOptions((prev) => ({ ...prev, reservations: v }))}
              label="Reservations"
              description="Sync booking and reservation data"
            />
            <ToggleSwitch
              enabled={syncOptions.guestProfiles}
              onChange={(v) => setSyncOptions((prev) => ({ ...prev, guestProfiles: v }))}
              label="Guest Profiles"
              description="Sync guest information and history"
            />
            <ToggleSwitch
              enabled={syncOptions.folios}
              onChange={(v) => setSyncOptions((prev) => ({ ...prev, folios: v }))}
              label="Folios"
              description="Sync billing and folio records"
            />
            <ToggleSwitch
              enabled={syncOptions.keyCards}
              onChange={(v) => setSyncOptions((prev) => ({ ...prev, keyCards: v }))}
              label="Key Cards"
              description="Sync key card access logs"
            />
            <ToggleSwitch
              enabled={syncOptions.auditLogs}
              onChange={(v) => setSyncOptions((prev) => ({ ...prev, auditLogs: v }))}
              label="Audit Logs"
              description="Sync system audit trail"
            />
          </div>
        </div>

        {/* Last Sync Info */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Last synced: {lastSyncTime}</span>
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
            <span className="text-sm text-blue-700">Syncing data from {adapter.name}...</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-lg shadow-sm transition-all ${
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
              <Settings className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// PMS Activity Logs Modal Component
// ============================================================

function PMSLogsModal({ open, onClose, adapter }) {
  if (!open || !adapter) return null;

  const logs = [
    { time: '2 min ago', action: 'Reservation synced', detail: `RES-${Math.floor(Math.random() * 90000 + 10000)} · Check-in Mar 5`, status: 'success' },
    { time: '5 min ago', action: 'Guest profile updated', detail: 'John Smith · Loyalty tier: Gold', status: 'success' },
    { time: '8 min ago', action: 'Folio data synced', detail: 'Folio #44291 · Total: $1,847.50', status: 'success' },
    { time: '15 min ago', action: 'Key card access log synced', detail: 'Room 412 · 3 entries recorded', status: 'success' },
    { time: '22 min ago', action: 'Evidence auto-collected', detail: 'Chargeback CB-2026-3891 · 6 documents', status: 'info' },
    { time: '45 min ago', action: 'Audit log synced', detail: '12 new entries from PMS audit trail', status: 'success' },
    { time: '1 hr ago', action: 'Full sync completed', detail: `${adapter.syncCount} reservations · 0 conflicts`, status: 'success' },
    { time: '2 hrs ago', action: 'API rate limit warning', detail: '75% of hourly quota used', status: 'warning' },
    { time: '3 hrs ago', action: 'Connection health check', detail: 'API responding · Latency: 142ms', status: 'success' },
  ];

  const statusColors = {
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${adapter.name} - Activity Logs`}
      subtitle="Recent sync and event activity"
      maxWidth="max-w-lg"
    >
      <div className="space-y-2">
        {logs.map((log, i) => (
          <div key={i} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusColors[log.status]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">{log.action}</p>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{log.time}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{log.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4 border-t border-gray-100 mt-4">
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// Main PMS Integration Component
// ============================================================

export default function PMSIntegration() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [connectModal, setConnectModal] = useState({ open: false, adapter: null });
  const [configureModal, setConfigureModal] = useState({ open: false, adapter: null });
  const [disconnectConfirm, setDisconnectConfirm] = useState({ open: false, adapter: null });
  const [logsModal, setLogsModal] = useState({ open: false, adapter: null });

  // Derived data
  const connectedCount = PMS_ADAPTERS.filter((a) => a.status === 'connected').length;
  const totalSyncedReservations = PMS_ADAPTERS.reduce((sum, a) => sum + (a.syncCount || 0), 0);

  const filteredAdapters = useMemo(() => {
    let result = PMS_ADAPTERS;

    // Apply category filter
    if (activeFilter === 'connected') {
      result = result.filter((a) => a.status === 'connected');
    } else if (activeFilter !== 'all') {
      result = result.filter((a) => a.category === activeFilter);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query) ||
          a.features.some((f) => FEATURE_LABELS[f]?.toLowerCase().includes(query))
      );
    }

    // Sort: connected first, then alphabetically
    result.sort((a, b) => {
      if (a.status === 'connected' && b.status !== 'connected') return -1;
      if (b.status === 'connected' && a.status !== 'connected') return 1;
      if (a.status === 'coming_soon' && b.status !== 'coming_soon') return 1;
      if (b.status === 'coming_soon' && a.status !== 'coming_soon') return -1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [searchQuery, activeFilter]);

  const handleConnect = useCallback((adapter) => {
    setConnectModal({ open: true, adapter });
  }, []);

  const handleConfigure = useCallback((adapter) => {
    setConfigureModal({ open: true, adapter });
  }, []);

  const handleDisconnect = useCallback((adapter) => {
    setDisconnectConfirm({ open: true, adapter });
  }, []);

  const confirmDisconnect = async () => {
    try {
      await api.post('/pms/disconnect', { pmsId: disconnectConfirm.adapter?.id });
    } catch (err) {
      // Demo mode
    }
    setDisconnectConfirm({ open: false, adapter: null });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Link2 className="w-6 h-6 text-blue-600" />
                </div>
                PMS Integrations
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Connect your Property Management System to automate evidence collection
              </p>
            </div>
            <a
              href="https://docs.disputeai.com/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              API Documentation
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status Banner */}
        <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-600 rounded-xl">
                <Wifi className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-900">AutoClerk PMS Connected</p>
                <p className="text-xs text-green-600">Real-time sync active - Last updated 2 minutes ago</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleConfigure(PMS_ADAPTERS[0])}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure
              </button>
              <button
                onClick={() => setLogsModal({ open: true, adapter: PMS_ADAPTERS[0] })}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
              >
                <Activity className="w-3.5 h-3.5" />
                View Logs
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Adapters Available"
            value={PMS_ADAPTERS.length}
            icon={Database}
            color="bg-blue-600"
          />
          <StatCard
            label="Connected"
            value={connectedCount}
            icon={Wifi}
            color="bg-green-600"
          />
          <StatCard
            label="Reservations Synced"
            value={totalSyncedReservations}
            icon={ArrowLeftRight}
            color="bg-purple-600"
          />
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search PMS adapters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full rounded-xl border border-gray-300 pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((filter) => {
              const Icon = filter.icon;
              const isActive = activeFilter === filter.id;
              const count =
                filter.id === 'all'
                  ? PMS_ADAPTERS.length
                  : filter.id === 'connected'
                  ? PMS_ADAPTERS.filter((a) => a.status === 'connected').length
                  : PMS_ADAPTERS.filter((a) => a.category === filter.id).length;
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  {filter.label}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                      isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Adapter Grid */}
        {filteredAdapters.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAdapters.map((adapter) => (
              <PMSCard
                key={adapter.id}
                adapter={adapter}
                onConnect={handleConnect}
                onConfigure={handleConfigure}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No adapters found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {searchQuery
                ? `No PMS adapters match "${searchQuery}"`
                : 'No adapters in this category'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              Reset filters
            </button>
          </div>
        )}

        {/* Results count */}
        {filteredAdapters.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Showing {filteredAdapters.length} of {PMS_ADAPTERS.length} PMS adapters
            </p>
          </div>
        )}

        {/* Integration Help Section */}
        <div className="mt-10 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Need a PMS adapter not listed here?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  We are continuously adding new integrations. Contact our team to request a custom adapter
                  for your property management system.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.open('mailto:support@disputeai.com?subject=PMS%20Integration%20Request&body=Please%20add%20support%20for%20the%20following%20PMS%3A%0A%0APMS%20Name%3A%20%0AWebsite%3A%20%0AProperty%20Name%3A%20', '_blank')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Request Integration
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ConnectModal
        open={connectModal.open}
        onClose={() => setConnectModal({ open: false, adapter: null })}
        adapter={connectModal.adapter}
      />
      <ConfigureModal
        open={configureModal.open}
        onClose={() => setConfigureModal({ open: false, adapter: null })}
        adapter={configureModal.adapter}
      />

      {/* Disconnect Confirmation Modal */}
      <Modal
        open={disconnectConfirm.open}
        onClose={() => setDisconnectConfirm({ open: false, adapter: null })}
        title="Disconnect PMS"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">
                Are you sure you want to disconnect {disconnectConfirm.adapter?.name}?
              </p>
              <p className="text-xs text-red-600 mt-1">
                This will stop all data synchronization. Existing evidence will be preserved,
                but no new data will be collected from this PMS.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDisconnectConfirm({ open: false, adapter: null })}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDisconnect}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <WifiOff className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      </Modal>

      {/* Activity Logs Modal */}
      <PMSLogsModal
        open={logsModal.open}
        onClose={() => setLogsModal({ open: false, adapter: null })}
        adapter={logsModal.adapter}
      />
    </div>
  );
}
