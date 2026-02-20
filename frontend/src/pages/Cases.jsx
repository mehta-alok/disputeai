import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  ArrowUpRight,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Eye,
  ChevronLeft,
  ChevronRight,
  Download,
  Gavel,
  RefreshCw,
} from 'lucide-react';
import { api } from '../utils/api';

// ─── Status config ──────────────────────────────────────────────────────
const STATUS_MAP = {
  PENDING:    { label: 'Pending',    color: 'amber',  icon: Clock,         bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  IN_REVIEW:  { label: 'In Review',  color: 'blue',   icon: Eye,           bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  SUBMITTED:  { label: 'Submitted',  color: 'purple', icon: Send,          bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  WON:        { label: 'Won',        color: 'green',  icon: CheckCircle2,  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500' },
  LOST:       { label: 'Lost',       color: 'red',    icon: XCircle,       bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ArbitrationBadge({ caseData }) {
  if (!caseData.arbitrationEligible) return null;
  const st = caseData.arbitrationStatus;
  if (st === 'FILED') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
        <Gavel className="w-3 h-3" /> Arbitration Filed
      </span>
    );
  }
  if (st === 'AVAILABLE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Gavel className="w-3 h-3" /> Arbitration Available
      </span>
    );
  }
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────────
function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysLeft(dueDate) {
  if (!dueDate) return null;
  const diff = Math.ceil((new Date(dueDate) - Date.now()) / 86400000);
  return diff;
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function Cases() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);

  // Apply status filter from URL params
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
    }
  }, [searchParams]);

  // Fetch cases
  useEffect(() => {
    fetchCases();
  }, [statusFilter, pagination.page, sortBy, sortOrder]);

  async function fetchCases() {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder,
      };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/cases', params);
      setCases(res.cases || []);
      setPagination(prev => ({
        ...prev,
        total: res.pagination?.total || 0,
        totalPages: res.pagination?.totalPages || 1,
      }));
      setError(null);
    } catch (err) {
      console.error('Error fetching cases:', err);
      setError('Failed to load cases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchCases();
  }

  function handleStatusFilter(st) {
    setStatusFilter(st);
    setPagination(prev => ({ ...prev, page: 1 }));
    if (st) {
      setSearchParams({ status: st });
    } else {
      setSearchParams({});
    }
  }

  function handleSort(field) {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchCases();
  }

  // Summary counts
  const summary = useMemo(() => {
    const total = cases.length;
    const pending = cases.filter(c => c.status === 'PENDING').length;
    const inReview = cases.filter(c => c.status === 'IN_REVIEW').length;
    const submitted = cases.filter(c => c.status === 'SUBMITTED').length;
    const won = cases.filter(c => c.status === 'WON').length;
    const lost = cases.filter(c => c.status === 'LOST').length;
    const urgent = cases.filter(c => {
      const dl = daysLeft(c.dueDate);
      return dl !== null && dl <= 3 && dl >= 0 && !['WON', 'LOST'].includes(c.status);
    }).length;
    return { total, pending, inReview, submitted, won, lost, urgent };
  }, [cases]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chargeback Cases</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination.total} total case{pagination.total !== 1 ? 's' : ''}
            {statusFilter ? ` \u00b7 Filtered by ${STATUS_MAP[statusFilter]?.label || statusFilter}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/cases/new')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Case
          </button>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400 mr-1" />
        <button
          onClick={() => handleStatusFilter('')}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            !statusFilter
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          All ({summary.total})
        </button>
        {Object.entries(STATUS_MAP).map(([key, cfg]) => {
          const count = summary[key === 'IN_REVIEW' ? 'inReview' : key.toLowerCase()] || 0;
          return (
            <button
              key={key}
              onClick={() => handleStatusFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === key
                  ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
        {summary.urgent > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3" /> {summary.urgent} Urgent
          </span>
        )}
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest name, email, case number, or confirmation..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={handleRefresh} className="ml-auto text-sm font-medium text-red-600 hover:text-red-700">
            Retry
          </button>
        </div>
      )}

      {/* Cases Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-sm text-gray-500">Loading cases...</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto w-12 h-12 text-gray-300" />
            <h3 className="mt-4 text-sm font-medium text-gray-900">No cases found</h3>
            <p className="mt-2 text-sm text-gray-500">
              {statusFilter
                ? `No ${STATUS_MAP[statusFilter]?.label || ''} cases. Try removing the filter.`
                : search
                ? 'No cases match your search. Try different keywords.'
                : 'Get started by creating your first chargeback case.'}
            </p>
            {!statusFilter && !search && (
              <button
                onClick={() => navigate('/cases/new')}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" /> Create a case
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50/80">
                    <SortableHeader label="Case" field="caseNumber" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort} />
                    <SortableHeader label="Guest" field="guestName" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort} />
                    <SortableHeader label="Amount" field="amount" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort} />
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AI Score
                    </th>
                    <SortableHeader label="Date" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort} />
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cases.map((c) => {
                    const dl = daysLeft(c.dueDate);
                    const isUrgent = dl !== null && dl <= 3 && dl >= 0 && !['WON', 'LOST'].includes(c.status);
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${isUrgent ? 'bg-red-50/30' : ''}`}
                        onClick={() => navigate(`/cases/${c.id}`)}
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-mono font-medium text-gray-900">
                            {c.caseNumber || c.id}
                          </div>
                          {c.cardBrand && (
                            <div className="text-[11px] text-gray-400 mt-0.5">{c.cardBrand}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{c.guestName || 'Unknown'}</div>
                          {c.guestEmail && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{c.guestEmail}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {formatCurrency(c.amount)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-sm font-mono text-gray-600">{c.reasonCode || '--'}</span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={c.status} />
                            <ArbitrationBadge caseData={c} />
                          </div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {c.confidenceScore != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    c.confidenceScore >= 80
                                      ? 'bg-green-500'
                                      : c.confidenceScore >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${c.confidenceScore}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600">{c.confidenceScore}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(c.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {dl !== null && !['WON', 'LOST'].includes(c.status) ? (
                            <span
                              className={`text-xs font-medium ${
                                dl <= 3 ? 'text-red-600' : dl <= 7 ? 'text-amber-600' : 'text-gray-500'
                              }`}
                            >
                              {dl < 0
                                ? 'Overdue'
                                : dl === 0
                                ? 'Due today'
                                : `${dl}d left`}
                            </span>
                          ) : c.resolvedAt ? (
                            <span className="text-xs text-gray-400">Resolved</span>
                          ) : (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <ArrowUpRight className="w-4 h-4 text-gray-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                    className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 px-2">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Pending', count: summary.pending, color: 'amber', status: 'PENDING' },
          { label: 'In Review', count: summary.inReview, color: 'blue', status: 'IN_REVIEW' },
          { label: 'Submitted', count: summary.submitted, color: 'purple', status: 'SUBMITTED' },
          { label: 'Won', count: summary.won, color: 'green', status: 'WON' },
          { label: 'Lost', count: summary.lost, color: 'red', status: 'LOST' },
        ].map(({ label, count, color, status }) => (
          <button
            key={status}
            onClick={() => handleStatusFilter(statusFilter === status ? '' : status)}
            className={`p-4 rounded-lg border text-left transition-all hover:shadow-sm ${
              statusFilter === status
                ? `bg-${color}-50 border-${color}-200`
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{count}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Sortable Header Component ──────────────────────────────────────────
function SortableHeader({ label, field, sortBy, sortOrder, onClick }) {
  const active = sortBy === field;
  return (
    <th
      className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
      onClick={() => onClick(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-blue-600' : 'text-gray-300'}`} />
        {active && (
          <span className="text-[10px] text-blue-600">{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </div>
    </th>
  );
}
