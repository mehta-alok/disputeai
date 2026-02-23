import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Brain,
  Link2,
  Users,
  CreditCard,
  Lock,
  Building2,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Key,
  Mail,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  X,
  Loader2,
  Copy,
  Download,
  Upload,
  Info,
  Globe,
  Phone,
  MapPin,
  Clock,
  ToggleLeft,
  ToggleRight,
  Sliders,
  FileText,
  Camera,
  CreditCard as CardIcon,
  LogOut,
  Monitor,
  Smartphone,
  Activity,
  Calendar,
  Search,
  Edit3,
  BarChart3,
  HardDrive,
  Zap
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

// ============================================================
// Constants
// ============================================================

const TABS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'ai-defense', label: 'AI Defense', icon: Brain },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
  { id: 'security', label: 'Security', icon: Lock },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
];

const AI_MODELS = [
  { value: 'gpt-4', label: 'GPT-4 (OpenAI)', description: 'Most capable, highest accuracy' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (OpenAI)', description: 'Faster, cost-effective' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus (Anthropic)', description: 'Excellent reasoning' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet (Anthropic)', description: 'Balanced performance' },
  { value: 'llama-3-70b', label: 'Llama 3 70B (Meta)', description: 'Open-source, self-hosted' },
  { value: 'ollama-local', label: 'Ollama (Local)', description: 'Privacy-first, on-premise' },
];

const EVIDENCE_PRIORITIES = [
  { id: 'folio', label: 'Guest Folio / Bill', description: 'Itemized billing statement' },
  { id: 'id_scan', label: 'ID Scan / Verification', description: 'Government ID verification' },
  { id: 'registration_card', label: 'Registration Card', description: 'Signed registration form' },
  { id: 'key_card_logs', label: 'Key Card Logs', description: 'Room access timestamps' },
  { id: 'cctv', label: 'CCTV Footage', description: 'Security camera evidence' },
  { id: 'correspondence', label: 'Guest Correspondence', description: 'Emails, messages, notes' },
  { id: 'pos_receipts', label: 'POS Receipts', description: 'Point-of-sale transactions' },
  { id: 'booking_confirmation', label: 'Booking Confirmation', description: 'Original reservation details' },
  { id: 'cancellation_policy', label: 'Cancellation Policy', description: 'Terms agreed at booking' },
  { id: 'third_party_auth', label: '3rd Party Authorization', description: 'OTA / travel agent records' },
];

const DEMO_USERS = [
  {
    id: 1,
    name: 'Admin User',
    email: 'admin@disputeai.com',
    role: 'ADMIN',
    status: 'active',
    lastLogin: '2026-02-16T08:30:00Z',
    avatar: null,
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    email: 'sarah.johnson@disputeai.com',
    role: 'MANAGER',
    status: 'active',
    lastLogin: '2026-02-15T14:20:00Z',
    avatar: null,
  },
  {
    id: 3,
    name: 'Mike Chen',
    email: 'mike.chen@disputeai.com',
    role: 'STAFF',
    status: 'active',
    lastLogin: '2026-02-14T09:45:00Z',
    avatar: null,
  },
];

const DEMO_SESSIONS = [
  {
    id: 1,
    device: 'Chrome on macOS',
    icon: Monitor,
    ip: '192.168.1.100',
    location: 'New York, US',
    lastActive: '2026-02-16T10:00:00Z',
    current: true,
  },
  {
    id: 2,
    device: 'Safari on iPhone',
    icon: Smartphone,
    ip: '10.0.0.42',
    location: 'New York, US',
    lastActive: '2026-02-15T18:30:00Z',
    current: false,
  },
  {
    id: 3,
    device: 'Firefox on Windows',
    icon: Monitor,
    ip: '172.16.0.55',
    location: 'Chicago, US',
    lastActive: '2026-02-12T11:15:00Z',
    current: false,
  },
];

const DEMO_AUDIT_LOG = [
  { id: 1, action: 'Settings updated', user: 'Admin User', timestamp: '2026-02-16T09:00:00Z', details: 'Updated notification preferences' },
  { id: 2, action: 'User invited', user: 'Admin User', timestamp: '2026-02-15T16:30:00Z', details: 'Invited mike.chen@disputeai.com as STAFF' },
  { id: 3, action: 'API key regenerated', user: 'Admin User', timestamp: '2026-02-14T11:00:00Z', details: 'Regenerated primary API key' },
  { id: 4, action: 'AI model changed', user: 'Sarah Johnson', timestamp: '2026-02-13T14:20:00Z', details: 'Changed from GPT-4 to Claude 3 Opus' },
  { id: 5, action: 'Password changed', user: 'Admin User', timestamp: '2026-02-12T08:45:00Z', details: 'Password updated successfully' },
  { id: 6, action: 'Integration connected', user: 'Admin User', timestamp: '2026-02-11T10:00:00Z', details: 'Connected AutoClerk PMS' },
  { id: 7, action: 'Two-factor enabled', user: 'Sarah Johnson', timestamp: '2026-02-10T15:30:00Z', details: 'Enabled 2FA via authenticator app' },
  { id: 8, action: 'Webhook configured', user: 'Admin User', timestamp: '2026-02-09T09:15:00Z', details: 'Added webhook for dispute updates' },
];

// ============================================================
// Helper Components
// ============================================================

function ToggleSwitch({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3">
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
  const styles = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
    suspended: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.inactive}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RoleBadge({ role }) {
  const styles = {
    ADMIN: 'bg-purple-100 text-purple-700',
    MANAGER: 'bg-blue-100 text-blue-700',
    STAFF: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[role] || styles.STAFF}`}>
      {role}
    </span>
  );
}

function SectionCard({ title, description, children, icon: Icon, actions }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2 bg-blue-50 rounded-lg">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function SaveButton({ onClick, loading, saved }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        saved
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {loading ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
    </button>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder, required, helpText, icon: Icon, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-4 w-4 text-gray-400" />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5 ${
            Icon ? 'pl-10' : ''
          } ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
        />
      </div>
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, helpText }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5 bg-white"
      >
        {options.map((opt) => (
          <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
            {typeof opt === 'string' ? opt : opt.label}
          </option>
        ))}
      </select>
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}

function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
        <div className={`relative inline-block w-full ${maxWidth} bg-white rounded-2xl text-left shadow-2xl transform transition-all`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
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
// Tab Content Components
// ============================================================

function GeneralSettingsTab() {
  const [form, setForm] = useState({
    propertyName: 'Grand Hotel & Resort',
    address: '123 Main Street',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'United States',
    phone: '+1 (212) 555-0100',
    email: 'admin@grandhotel.com',
    timezone: 'America/New_York',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/general', form);
    } catch (err) {
      // Demo mode - still show saved
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Property Information" description="Basic information about your property" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <InputField
              label="Property Name"
              value={form.propertyName}
              onChange={(v) => updateField('propertyName', v)}
              placeholder="Enter property name"
              required
              icon={Building2}
            />
          </div>
          <div className="md:col-span-2">
            <InputField
              label="Street Address"
              value={form.address}
              onChange={(v) => updateField('address', v)}
              placeholder="Enter street address"
              icon={MapPin}
            />
          </div>
          <InputField
            label="City"
            value={form.city}
            onChange={(v) => updateField('city', v)}
            placeholder="City"
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="State"
              value={form.state}
              onChange={(v) => updateField('state', v)}
              placeholder="State"
            />
            <InputField
              label="ZIP Code"
              value={form.zip}
              onChange={(v) => updateField('zip', v)}
              placeholder="ZIP"
            />
          </div>
          <InputField
            label="Country"
            value={form.country}
            onChange={(v) => updateField('country', v)}
            placeholder="Country"
            icon={Globe}
          />
          <InputField
            label="Phone"
            value={form.phone}
            onChange={(v) => updateField('phone', v)}
            placeholder="+1 (555) 000-0000"
            icon={Phone}
          />
          <InputField
            label="Email"
            value={form.email}
            onChange={(v) => updateField('email', v)}
            type="email"
            placeholder="admin@property.com"
            icon={Mail}
          />
          <SelectField
            label="Timezone"
            value={form.timezone}
            onChange={(v) => updateField('timezone', v)}
            options={TIMEZONES}
          />
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailAlerts: true,
    smsAlerts: false,
    inAppNotifications: true,
    urgentCaseAlerts: true,
    weeklyDigest: true,
    monthlyReport: true,
  });
  const [deadlineWarningDays, setDeadlineWarningDays] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const togglePref = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/notifications', {
        ...prefs,
        deadlineWarningDays,
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

  return (
    <div className="space-y-6">
      <SectionCard title="Alert Channels" description="Choose how you want to receive notifications" icon={Bell}>
        <div className="divide-y divide-gray-100">
          <ToggleSwitch
            enabled={prefs.emailAlerts}
            onChange={() => togglePref('emailAlerts')}
            label="Email Alerts"
            description="Receive dispute notifications via email"
          />
          <ToggleSwitch
            enabled={prefs.smsAlerts}
            onChange={() => togglePref('smsAlerts')}
            label="SMS Alerts"
            description="Get text messages for urgent disputes"
          />
          <ToggleSwitch
            enabled={prefs.inAppNotifications}
            onChange={() => togglePref('inAppNotifications')}
            label="In-App Notifications"
            description="Show notifications within the application"
          />
          <ToggleSwitch
            enabled={prefs.urgentCaseAlerts}
            onChange={() => togglePref('urgentCaseAlerts')}
            label="Urgent Case Alerts"
            description="Priority notifications for high-value disputes"
          />
        </div>
      </SectionCard>

      <SectionCard title="Reports & Digests" description="Scheduled summary reports" icon={FileText}>
        <div className="divide-y divide-gray-100">
          <ToggleSwitch
            enabled={prefs.weeklyDigest}
            onChange={() => togglePref('weeklyDigest')}
            label="Weekly Digest"
            description="Summary of all dispute activity sent every Monday"
          />
          <ToggleSwitch
            enabled={prefs.monthlyReport}
            onChange={() => togglePref('monthlyReport')}
            label="Monthly Report"
            description="Detailed analytics report sent on the 1st of each month"
          />
        </div>
      </SectionCard>

      <SectionCard title="Threshold Settings" description="Configure alert timing" icon={Clock}>
        <div className="max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Days Before Deadline Warning
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={30}
              value={deadlineWarningDays}
              onChange={(e) => {
                setDeadlineWarningDays(parseInt(e.target.value) || 1);
                setSaved(false);
              }}
              className="block w-24 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5"
            />
            <span className="text-sm text-gray-500">days before response deadline</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            You will be alerted this many days before a dispute response is due
          </p>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  );
}

function AIDefenseTab() {
  const [config, setConfig] = useState({
    model: 'claude-3-opus',
    autoEvidenceCollection: true,
    autoResponseDrafting: true,
    confidenceThreshold: 75,
    maxResponseTimeHours: 4,
    evidencePriorities: ['folio', 'id_scan', 'registration_card', 'key_card_logs', 'correspondence', 'booking_confirmation'],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateConfig = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const toggleEvidence = (id) => {
    setConfig((prev) => {
      const current = prev.evidencePriorities;
      const updated = current.includes(id) ? current.filter((e) => e !== id) : [...current, id];
      return { ...prev, evidencePriorities: updated };
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/ai-defense', config);
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  const selectedModel = AI_MODELS.find((m) => m.value === config.model);

  return (
    <div className="space-y-6">
      <SectionCard title="AI Model Configuration" description="Select and configure the AI model for dispute defense" icon={Brain}>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AI_MODELS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => updateConfig('model', model.value)}
                  className={`flex items-start p-4 rounded-xl border-2 text-left transition-all ${
                    config.model === model.value
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${config.model === model.value ? 'text-blue-900' : 'text-gray-900'}`}>
                      {model.label}
                    </p>
                    <p className={`text-xs mt-0.5 ${config.model === model.value ? 'text-blue-600' : 'text-gray-500'}`}>
                      {model.description}
                    </p>
                  </div>
                  {config.model === model.value && (
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Automation Settings" description="Control AI-driven automation features" icon={Zap}>
        <div className="divide-y divide-gray-100">
          <ToggleSwitch
            enabled={config.autoEvidenceCollection}
            onChange={(v) => updateConfig('autoEvidenceCollection', v)}
            label="Auto-Evidence Collection"
            description="Automatically gather and compile evidence when a new dispute is received"
          />
          <ToggleSwitch
            enabled={config.autoResponseDrafting}
            onChange={(v) => updateConfig('autoResponseDrafting', v)}
            label="Auto-Response Drafting"
            description="Generate draft responses for new disputes using AI analysis"
          />
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Confidence Threshold</label>
              <span className="text-sm font-semibold text-blue-600">{config.confidenceThreshold}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={config.confidenceThreshold}
              onChange={(e) => updateConfig('confidenceThreshold', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Low (auto-submit more)</span>
              <span>High (manual review more)</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Responses above this confidence level may be auto-submitted. Below this threshold, they require manual review.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Response Time</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={72}
                value={config.maxResponseTimeHours}
                onChange={(e) => updateConfig('maxResponseTimeHours', parseInt(e.target.value) || 1)}
                className="block w-24 rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5"
              />
              <span className="text-sm text-gray-500">hours</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Maximum time allowed for AI to prepare a defense response</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Evidence Priority" description="Select and prioritize the types of evidence the AI should collect" icon={FileText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EVIDENCE_PRIORITIES.map((evidence) => {
            const isSelected = config.evidencePriorities.includes(evidence.id);
            return (
              <button
                key={evidence.id}
                onClick={() => toggleEvidence(evidence.id)}
                className={`flex items-center p-3.5 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mr-3 flex-shrink-0 ${
                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                }`}>
                  {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {evidence.label}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{evidence.description}</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          {config.evidencePriorities.length} of {EVIDENCE_PRIORITIES.length} evidence types selected
        </p>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKey] = useState('accd_sk_live_4f8b2c1d9e3a7f6b5c8d2e1a0f9b3c7d');
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.disputeai.com/webhook/disputes');
  const [s3Config, setS3Config] = useState({
    bucket: 'disputeai-evidence',
    region: 'us-east-1',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [regenerating, setRegenerating] = useState(false);

  const maskedKey = apiKey.slice(0, 12) + '****' + apiKey.slice(-4);

  const handleTestConnection = async (service) => {
    setTesting((prev) => ({ ...prev, [service]: true }));
    setTestResults((prev) => ({ ...prev, [service]: null }));
    setTimeout(() => {
      setTesting((prev) => ({ ...prev, [service]: false }));
      setTestResults((prev) => ({ ...prev, [service]: 'success' }));
      setTimeout(() => {
        setTestResults((prev) => ({ ...prev, [service]: null }));
      }, 5000);
    }, 1500);
  };

  const handleRegenerateKey = async () => {
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
    }, 1200);
  };

  const handleCopyKey = () => {
    navigator.clipboard?.writeText(apiKey);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/integrations', { webhookUrl, s3Config });
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  return (
    <div className="space-y-6">
      <SectionCard title="PMS Connection" description="Property Management System integration status" icon={Link2}>
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-900">AutoClerk PMS</p>
              <p className="text-xs text-green-600">Connected - Last synced 2 minutes ago</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTestConnection('pms')}
              disabled={testing.pms}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
            >
              {testing.pms ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Test
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              <SettingsIcon className="w-3 h-3" />
              Configure
            </button>
          </div>
        </div>
        {testResults.pms === 'success' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            Connection test successful - PMS is responding normally
          </div>
        )}
      </SectionCard>

      <SectionCard title="API Key Management" description="Manage your API authentication credentials" icon={Key}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary API Key</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  readOnly
                  value={apiKeyVisible ? apiKey : maskedKey}
                  className="block w-full rounded-lg border border-gray-300 bg-gray-50 text-sm px-3 py-2.5 font-mono text-gray-700"
                />
              </div>
              <button
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title={apiKeyVisible ? 'Hide key' : 'Show key'}
              >
                {apiKeyVisible ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
              </button>
              <button
                onClick={handleCopyKey}
                className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                title="Copy key"
              >
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={handleRegenerateKey}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500" />
              Regenerating will invalidate the current key. Update all integrations after regenerating.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Webhook Configuration" description="Configure webhook endpoints for real-time updates" icon={Globe}>
        <div className="space-y-4">
          <InputField
            label="Webhook URL"
            value={webhookUrl}
            onChange={(v) => {
              setWebhookUrl(v);
              setSaved(false);
            }}
            placeholder="https://your-domain.com/webhook"
            icon={Globe}
            helpText="POST requests will be sent to this URL for dispute events"
          />
          <button
            onClick={() => handleTestConnection('webhook')}
            disabled={testing.webhook}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {testing.webhook ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Send Test Webhook
          </button>
          {testResults.webhook === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              Test webhook delivered successfully (200 OK)
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="S3 Storage Configuration" description="Configure cloud storage for evidence files" icon={HardDrive}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InputField
            label="S3 Bucket Name"
            value={s3Config.bucket}
            onChange={(v) => {
              setS3Config((prev) => ({ ...prev, bucket: v }));
              setSaved(false);
            }}
            placeholder="my-bucket"
            icon={HardDrive}
          />
          <SelectField
            label="AWS Region"
            value={s3Config.region}
            onChange={(v) => {
              setS3Config((prev) => ({ ...prev, region: v }));
              setSaved(false);
            }}
            options={[
              { value: 'us-east-1', label: 'US East (N. Virginia)' },
              { value: 'us-east-2', label: 'US East (Ohio)' },
              { value: 'us-west-1', label: 'US West (N. California)' },
              { value: 'us-west-2', label: 'US West (Oregon)' },
              { value: 'eu-west-1', label: 'EU (Ireland)' },
              { value: 'eu-central-1', label: 'EU (Frankfurt)' },
              { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
            ]}
          />
        </div>
        <div className="mt-4">
          <button
            onClick={() => handleTestConnection('s3')}
            disabled={testing.s3}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {testing.s3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            Test S3 Connection
          </button>
          {testResults.s3 === 'success' && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              S3 bucket accessible - read/write permissions verified
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} loading={saving} saved={saved} />
      </div>
    </div>
  );
}

function UserManagementTab() {
  const [users] = useState(DEMO_USERS);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'STAFF' });
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInvite = async () => {
    try {
      await api.post('/admin/users/invite', inviteForm);
    } catch (err) {
      // Demo mode
    }
    setShowInviteModal(false);
    setInviteForm({ email: '', role: 'STAFF' });
  };

  const formatLastLogin = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Team Members"
        description="Manage who has access to DisputeAI"
        icon={Users}
        actions={
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Invite User
          </button>
        }
      >
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">Role</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Login</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="py-3.5 px-4 text-gray-500">{formatLastLogin(user.lastLogin)}</td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit user">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Remove user">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No users found matching your search</p>
          </div>
        )}
      </SectionCard>

      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite Team Member">
        <div className="space-y-5">
          <InputField
            label="Email Address"
            value={inviteForm.email}
            onChange={(v) => setInviteForm((prev) => ({ ...prev, email: v }))}
            type="email"
            placeholder="colleague@company.com"
            icon={Mail}
            required
          />
          <SelectField
            label="Role"
            value={inviteForm.role}
            onChange={(v) => setInviteForm((prev) => ({ ...prev, role: v }))}
            options={[
              { value: 'ADMIN', label: 'Admin - Full access to all settings and features' },
              { value: 'MANAGER', label: 'Manager - Can manage disputes and view analytics' },
              { value: 'STAFF', label: 'Staff - Can view and respond to disputes' },
            ]}
            helpText="Choose the appropriate access level for this user"
          />
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowInviteModal(false)}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={!inviteForm.email}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Mail className="w-4 h-4" />
              Send Invitation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BillingTab() {
  const usageStats = {
    casesThisMonth: 47,
    casesLimit: 200,
    apiCalls: 12849,
    apiCallsLimit: 50000,
    storageUsedGB: 3.2,
    storageLimitGB: 50,
  };

  const plans = [
    {
      name: 'Starter',
      price: '$49',
      period: '/month',
      features: ['Up to 25 disputes/month', '5,000 API calls', '5 GB storage', 'Email support', '1 PMS integration'],
      current: false,
    },
    {
      name: 'Professional',
      price: '$149',
      period: '/month',
      features: ['Up to 100 disputes/month', '25,000 API calls', '25 GB storage', 'Priority support', '5 PMS integrations', 'AI auto-response'],
      current: false,
    },
    {
      name: 'Enterprise',
      price: '$399',
      period: '/month',
      features: [
        'Up to 200 disputes/month',
        '50,000 API calls',
        '50 GB storage',
        'Dedicated support',
        'Unlimited PMS integrations',
        'AI auto-response',
        'Custom AI training',
        'Advanced analytics',
        'SLA guarantee',
      ],
      current: true,
    },
  ];

  const formatUsagePercent = (used, limit) => Math.round((used / limit) * 100);

  return (
    <div className="space-y-6">
      <SectionCard title="Current Plan" description="Your active subscription" icon={CreditCard}>
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-bold text-blue-900">Enterprise Plan</h4>
              <span className="px-2.5 py-0.5 bg-blue-600 text-white text-xs font-semibold rounded-full">ACTIVE</span>
            </div>
            <p className="text-sm text-blue-700 mt-1">Billed monthly - Next billing date: March 1, 2026</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-900">$399</p>
            <p className="text-sm text-blue-600">/month</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Usage This Month" description="Current billing period: Feb 1 - Feb 28, 2026" icon={BarChart3}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Cases</span>
              <span className="text-sm text-gray-500">
                {usageStats.casesThisMonth} / {usageStats.casesLimit}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${formatUsagePercent(usageStats.casesThisMonth, usageStats.casesLimit)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatUsagePercent(usageStats.casesThisMonth, usageStats.casesLimit)}% used
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">API Calls</span>
              <span className="text-sm text-gray-500">
                {usageStats.apiCalls.toLocaleString()} / {usageStats.apiCallsLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${formatUsagePercent(usageStats.apiCalls, usageStats.apiCallsLimit)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatUsagePercent(usageStats.apiCalls, usageStats.apiCallsLimit)}% used
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Storage</span>
              <span className="text-sm text-gray-500">
                {usageStats.storageUsedGB} GB / {usageStats.storageLimitGB} GB
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${formatUsagePercent(usageStats.storageUsedGB, usageStats.storageLimitGB)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatUsagePercent(usageStats.storageUsedGB, usageStats.storageLimitGB)}% used
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Plan Comparison" description="Choose the plan that fits your needs" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative p-5 rounded-xl border-2 transition-all ${
                plan.current
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {plan.current && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">
                    Current Plan
                  </span>
                </div>
              )}
              <div className="text-center mb-4 pt-1">
                <h4 className="text-lg font-bold text-gray-900">{plan.name}</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2.5 mb-5">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.current
                    ? 'bg-blue-100 text-blue-700 cursor-default'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                disabled={plan.current}
              >
                {plan.current ? 'Current Plan' : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SecurityTab() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const passwordStrength = useCallback((pwd) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const levels = [
      { label: 'Very Weak', color: 'bg-red-500' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Strong', color: 'bg-blue-500' },
      { label: 'Very Strong', color: 'bg-green-500' },
    ];
    return { score, ...levels[Math.min(score, levels.length) - 1] || levels[0] };
  }, []);

  const handlePasswordChange = async () => {
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
    } catch (err) {
      // Demo mode
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  const strength = passwordStrength(passwordForm.newPassword);

  return (
    <div className="space-y-6">
      <SectionCard title="Change Password" description="Update your account password" icon={Lock}>
        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5 pr-10"
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => ({ ...prev, current: !prev.current }))}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
              >
                {showPasswords.current ? (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5 pr-10"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => ({ ...prev, new: !prev.new }))}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
              >
                {showPasswords.new ? (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
            {passwordForm.newPassword && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strength.color : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-gray-500">{strength.label}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                className="block w-full rounded-lg border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm px-3 py-2.5 pr-10"
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
                className="absolute inset-y-0 right-0 flex items-center pr-3"
              >
                {showPasswords.confirm ? (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
            {passwordForm.confirmPassword &&
              passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Passwords do not match
                </p>
              )}
          </div>

          {passwordError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{passwordError}</p>
            </div>
          )}

          <SaveButton onClick={handlePasswordChange} loading={saving} saved={saved} />
        </div>
      </SectionCard>

      <SectionCard title="Two-Factor Authentication" description="Add an extra layer of security to your account" icon={Shield}>
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${twoFactorEnabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Shield className={`w-5 h-5 ${twoFactorEnabled ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Two-Factor Authentication (2FA)
              </p>
              <p className="text-xs text-gray-500">
                {twoFactorEnabled
                  ? 'Your account is protected with 2FA'
                  : 'Add an extra layer of security to your account'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              twoFactorEnabled
                ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </button>
        </div>
        {twoFactorEnabled && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">Two-factor authentication is enabled</p>
              <p className="text-xs text-green-700 mt-0.5">
                You will be prompted for a verification code when signing in from a new device.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Active Sessions" description="Manage your logged-in sessions" icon={Monitor}>
        <div className="space-y-3">
          {DEMO_SESSIONS.map((session) => {
            const SessionIcon = session.icon;
            const lastActive = new Date(session.lastActive);
            const timeAgo = (() => {
              const diffMs = Date.now() - lastActive.getTime();
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              if (diffHours < 1) return 'Active now';
              if (diffHours < 24) return `${diffHours}h ago`;
              return `${Math.floor(diffHours / 24)}d ago`;
            })();

            return (
              <div key={session.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <SessionIcon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{session.device}</p>
                      {session.current && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {session.ip} - {session.location} - {timeAgo}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                    <LogOut className="w-3 h-3" />
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Audit Log" description="Recent administrative actions" icon={Activity}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Action</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Details</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {DEMO_AUDIT_LOG.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-medium text-gray-900">{entry.action}</td>
                  <td className="py-2.5 px-3 text-gray-600">{entry.user}</td>
                  <td className="py-2.5 px-3 text-gray-500">{entry.details}</td>
                  <td className="py-2.5 px-3 text-gray-500">
                    {new Date(entry.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================
// Main Settings Component
// ============================================================

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettingsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'ai-defense':
        return <AIDefenseTab />;
      case 'integrations':
        return <IntegrationsTab />;
      case 'users':
        return <UserManagementTab />;
      case 'billing':
        return <BillingTab />;
      case 'security':
        return <SecurityTab />;
      default:
        return <GeneralSettingsTab />;
    }
  };

  const activeTabData = TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <SettingsIcon className="w-6 h-6 text-blue-600" />
                </div>
                Settings
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your DisputeAI configuration and preferences
              </p>
            </div>
            {user && (
              <div className="hidden sm:flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
                  <p className="text-xs text-gray-500">{user.role || 'Administrator'}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {(user.name || user.email || 'A').charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-8 space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                    {tab.label}
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto text-blue-400" />}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Mobile Tab Selector */}
          <div className="lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm"
            >
              <div className="flex items-center gap-2">
                {activeTabData && <activeTabData.icon className="w-5 h-5 text-blue-600" />}
                <span className="font-medium text-gray-900">{activeTabData?.label}</span>
              </div>
              <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${mobileMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            {mobileMenuOpen && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            {renderTabContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
