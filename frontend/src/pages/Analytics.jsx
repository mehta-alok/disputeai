import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency } from '../utils/api';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Shield, FileText,
  CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, ArrowUpRight,
  ArrowDownRight, Package, Wifi
} from 'lucide-react';

const STATUS_COLORS = {
  PENDING: { bg: 'bg-yellow-100', bar: 'bg-yellow-500', text: 'text-yellow-800' },
  IN_REVIEW: { bg: 'bg-blue-100', bar: 'bg-blue-500', text: 'text-blue-800' },
  SUBMITTED: { bg: 'bg-purple-100', bar: 'bg-purple-500', text: 'text-purple-800' },
  WON: { bg: 'bg-green-100', bar: 'bg-green-500', text: 'text-green-800' },
  LOST: { bg: 'bg-red-100', bar: 'bg-red-500', text: 'text-red-800' },
  EXPIRED: { bg: 'bg-gray-100', bar: 'bg-gray-500', text: 'text-gray-800' },
};

const STATUS_ICONS = {
  PENDING: Clock,
  IN_REVIEW: FileText,
  SUBMITTED: Shield,
  WON: CheckCircle,
  LOST: XCircle,
  EXPIRED: AlertTriangle,
};

function KpiCard({ title, value, icon: Icon, trend, trendLabel, color = 'blue', onClick }) {
  const colorMap = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all ${
        onClick ? 'cursor-pointer hover:border-blue-300 hover:scale-[1.02] active:scale-[0.98]' : ''
      }`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {trend !== undefined && (
            <>
              {trend >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(trend)}%
              </span>
              {trendLabel && <span className="text-xs text-gray-500 ml-1">{trendLabel}</span>}
            </>
          )}
        </div>
        {onClick && (
          <span className="text-xs text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
        )}
      </div>
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, trendsData] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/analytics/trends'),
      ]);
      setDashboard(dashData);
      setTrends(trendsData.trends || []);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-red-600 hover:underline">
          Try Again
        </button>
      </div>
    );
  }

  const summary = dashboard?.summary || {};
  const statusBreakdown = dashboard?.statusBreakdown || {};
  const evidenceSummary = dashboard?.evidenceSummary || {};
  const pmsStatus = dashboard?.pmsStatus;

  // Calculate max count for status bars
  const maxStatusCount = Math.max(
    ...Object.values(statusBreakdown).map((s) => s.count || 0),
    1
  );

  // Trends summary
  const trendsSummary = trends.reduce(
    (acc, t) => ({
      cases: acc.cases + (t.cases || 0),
      won: acc.won + (t.won || 0),
      lost: acc.lost + (t.lost || 0),
      recovered: acc.recovered + (t.recovered || 0),
    }),
    { cases: 0, won: 0, lost: 0, recovered: 0 }
  );
  const trendsWinRate = trendsSummary.cases > 0
    ? ((trendsSummary.won / (trendsSummary.won + trendsSummary.lost || 1)) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Performance metrics and case insights</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Cases"
          value={summary.totalCases || 0}
          icon={BarChart3}
          trend={summary.trends?.cases}
          trendLabel="vs last period"
          color="blue"
          onClick={() => navigate('/cases')}
        />
        <KpiCard
          title="Win Rate"
          value={`${(summary.winRate || 0).toFixed(1)}%`}
          icon={TrendingUp}
          color="green"
          onClick={() => navigate('/cases?status=WON')}
        />
        <KpiCard
          title="Amount Recovered"
          value={formatCurrency(summary.recoveredAmount)}
          icon={DollarSign}
          color="purple"
          onClick={() => navigate('/cases?status=WON')}
        />
        <KpiCard
          title="Urgent Cases"
          value={summary.urgentCases || 0}
          icon={AlertTriangle}
          color="orange"
          onClick={() => navigate('/cases?status=PENDING')}
        />
      </div>

      {/* Middle Row: Status Breakdown + Evidence + PMS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case Status Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Case Status Breakdown
          </h3>
          <div className="space-y-3">
            {Object.entries(STATUS_COLORS).map(([status, colors]) => {
              const data = statusBreakdown[status] || { count: 0, amount: 0 };
              const Icon = STATUS_ICONS[status] || Clock;
              const barWidth = maxStatusCount > 0 ? (data.count / maxStatusCount) * 100 : 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 flex-shrink-0">
                    <Icon className={`w-4 h-4 ${colors.text}`} />
                    <span className="text-sm font-medium text-gray-700">{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full ${colors.bar} rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    >
                      {data.count > 0 && (
                        <span className="text-xs text-white font-medium">{data.count}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-gray-500 w-24 text-right flex-shrink-0">
                    {formatCurrency(data.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: Evidence + PMS */}
        <div className="space-y-6">
          {/* Evidence Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-500" />
              Evidence Summary
            </h3>
            <div className="text-center mb-3">
              <p className="text-3xl font-bold text-gray-900">{evidenceSummary.total || 0}</p>
              <p className="text-sm text-gray-500">Total Documents</p>
            </div>
            {evidenceSummary.casesWithEvidence !== undefined && (
              <p className="text-xs text-gray-500 text-center mb-3">
                {evidenceSummary.casesWithEvidence} cases with evidence
              </p>
            )}
            {evidenceSummary.byType && Object.keys(evidenceSummary.byType).length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-100">
                {Object.entries(evidenceSummary.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 capitalize">{type.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PMS Status */}
          {pmsStatus && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Wifi className="w-5 h-5 text-green-500" />
                PMS Status
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">System</span>
                  <span className="font-medium">{pmsStatus.system}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Property</span>
                  <span className="font-medium">{pmsStatus.propertyName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Reservations</span>
                  <span className="font-medium">{(pmsStatus.reservationsCount || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 font-medium">Connected</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Trends */}
      {trends.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Monthly Trends
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cases</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Won</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lost</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Win Rate</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Recovered</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trends.map((t, idx) => {
                  const winRate = (t.won + t.lost) > 0
                    ? ((t.won / (t.won + t.lost)) * 100).toFixed(1)
                    : 0;
                  const maxRecovered = Math.max(...trends.map((x) => x.recovered || 0), 1);
                  const perfWidth = ((t.recovered || 0) / maxRecovered) * 100;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.month}</td>
                      <td className="px-5 py-3 text-sm text-right text-gray-700">{t.cases}</td>
                      <td className="px-5 py-3 text-sm text-right text-green-600 font-medium">{t.won}</td>
                      <td className="px-5 py-3 text-sm text-right text-red-600 font-medium">{t.lost}</td>
                      <td className="px-5 py-3 text-sm text-right">
                        <span className={`font-medium ${Number(winRate) >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                          {winRate}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-gray-700">{formatCurrency(t.recovered)}</td>
                      <td className="px-5 py-3">
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div
                            className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${perfWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Summary Row */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-5 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-900">{trendsSummary.cases}</td>
                  <td className="px-5 py-3 text-sm text-right text-green-600">{trendsSummary.won}</td>
                  <td className="px-5 py-3 text-sm text-right text-red-600">{trendsSummary.lost}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-900">{trendsWinRate}%</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-900">{formatCurrency(trendsSummary.recovered)}</td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
