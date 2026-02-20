import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Shield,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Wifi,
  Hotel,
  ExternalLink,
} from 'lucide-react';
import { api, formatCurrency } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */
const STATUS_STYLES = {
  WON: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle },
  LOST: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle },
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  IN_PROGRESS: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock },
  SUBMITTED: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: ArrowUpRight },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <Icon className="w-3 h-3" />
      {status?.replace('_', ' ') || 'Unknown'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI card                                                           */
/* ------------------------------------------------------------------ */
function KPICard({ title, value, subtitle, icon: Icon, trend, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  const iconColors = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className={`flex-shrink-0 p-2.5 rounded-lg ${iconColors}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend !== undefined && trend !== null && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend >= 0 ? (
            <>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-600 font-medium">+{trend}%</span>
            </>
          ) : (
            <>
              <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-600 font-medium">{trend}%</span>
            </>
          )}
          <span className="text-gray-400 ml-1">vs last month</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard page                                                     */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState(null);
  const [recentCases, setRecentCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [analytics, casesRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/cases', { limit: 5, sort: 'createdAt', order: 'desc' }),
      ]);

      setDashboardData(analytics);
      setRecentCases(casesRes?.cases || []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg
            className="animate-spin mx-auto w-10 h-10 text-blue-600"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  /* ---- Error state ---- */
  if (error && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto w-12 h-12 text-amber-500" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Unable to load dashboard</h3>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => fetchDashboard()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const summary = dashboardData?.summary || {};
  const pmsStatus = dashboardData?.pmsStatus;
  const evidenceSummary = dashboardData?.evidenceSummary;
  const statusBreakdown = dashboardData?.statusBreakdown || {};

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good{' '}
            {new Date().getHours() < 12
              ? 'morning'
              : new Date().getHours() < 18
                ? 'afternoon'
                : 'evening'}
            , {firstName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Here is your chargeback defense overview for today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/cases/new')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Case
          </button>
        </div>
      </div>

      {/* ---- PMS Status Banner ---- */}
      {pmsStatus && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-4 text-white shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">PMS Connected</p>
                <p className="text-xs text-emerald-100">
                  {pmsStatus.system} &mdash; {pmsStatus.propertyName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Hotel className="w-4 h-4 text-emerald-200" />
                <span className="font-medium">{pmsStatus.reservationsCount}</span>
                <span className="text-emerald-200">reservations synced</span>
              </div>
              <Link
                to="/reservations"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-100 hover:text-white transition-colors"
              >
                View <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Cases"
          value={summary.totalCases ?? 0}
          subtitle={`${summary.totalAmount ? formatCurrency(summary.totalAmount) : '$0.00'} total disputed`}
          icon={FileText}
          trend={summary.trends?.cases}
          color="blue"
        />
        <KPICard
          title="Win Rate"
          value={`${summary.winRate ?? 0}%`}
          subtitle={`${statusBreakdown.WON?.count ?? 0} won out of ${summary.totalCases ?? 0}`}
          icon={Shield}
          color="emerald"
        />
        <KPICard
          title="Amount Recovered"
          value={formatCurrency(summary.recoveredAmount)}
          subtitle={`of ${formatCurrency(summary.totalAmount)} disputed`}
          icon={DollarSign}
          color="emerald"
        />
        <KPICard
          title="Urgent Cases"
          value={summary.urgentCases ?? 0}
          subtitle="Require immediate attention"
          icon={AlertTriangle}
          color={summary.urgentCases > 0 ? 'red' : 'amber'}
        />
      </div>

      {/* ---- Middle row: Status breakdown + Evidence ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status breakdown */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Case Status Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: 'WON', label: 'Won', icon: CheckCircle, color: 'emerald' },
              { key: 'PENDING', label: 'Pending', icon: Clock, color: 'amber' },
              { key: 'LOST', label: 'Lost', icon: XCircle, color: 'red' },
            ].map(({ key, label, icon: Icon, color }) => {
              const data = statusBreakdown[key] || { count: 0, amount: 0 };
              const colorStyles = {
                emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
                amber: 'bg-amber-50 text-amber-600 border-amber-200',
                red: 'bg-red-50 text-red-600 border-red-200',
              };
              return (
                <div key={key} className={`rounded-lg border p-4 ${colorStyles[color]}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="text-2xl font-bold">{data.count}</p>
                  <p className="text-xs mt-1 opacity-80">{formatCurrency(data.amount)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evidence summary */}
        {evidenceSummary && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Evidence Collected</h2>
            </div>
            <p className="text-3xl font-bold text-gray-900">{evidenceSummary.total}</p>
            <p className="text-xs text-gray-500 mt-1">
              Across {evidenceSummary.casesWithEvidence} cases
            </p>
            {evidenceSummary.byType && (
              <div className="mt-4 space-y-2">
                {Object.entries(evidenceSummary.byType).map(([type, count]) => {
                  const pct =
                    evidenceSummary.total > 0
                      ? Math.round((count / evidenceSummary.total) * 100)
                      : 0;
                  const typeLabels = {
                    folio: 'Guest Folios',
                    id_scan: 'ID Scans',
                    registration_card: 'Reg. Cards',
                    signature: 'Signatures',
                    correspondence: 'Correspondence',
                  };
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">
                          {typeLabels[type] || type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-medium text-gray-900">{count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Recent Cases Table ---- */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent Cases</h2>
          <Link
            to="/cases"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View all <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {recentCases.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto w-10 h-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No cases yet.</p>
            <button
              onClick={() => navigate('/cases/new')}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" /> Create your first case
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Guest
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason Code
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentCases.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {c.guestName || 'Unknown Guest'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {formatCurrency(c.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap font-mono">
                      {c.reasonCode || '--'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '--'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ArrowUpRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Quick Actions ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'New Case',
            description: 'Create a chargeback defense case',
            icon: Plus,
            to: '/cases/new',
            color: 'bg-blue-600 hover:bg-blue-700',
          },
          {
            label: 'View Reservations',
            description: 'Browse synced PMS reservations',
            icon: Hotel,
            to: '/reservations',
            color: 'bg-emerald-600 hover:bg-emerald-700',
          },
          {
            label: 'View Analytics',
            description: 'Detailed performance reports',
            icon: TrendingUp,
            to: '/analytics',
            color: 'bg-indigo-600 hover:bg-indigo-700',
          },
        ].map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className={`flex items-center gap-4 px-5 py-4 rounded-xl text-white shadow-sm transition-all hover:shadow-md ${action.color}`}
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <action.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{action.label}</p>
              <p className="text-xs text-white/70">{action.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
