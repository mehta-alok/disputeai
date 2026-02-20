import React, { useState, useEffect, useCallback } from 'react';
import { api, formatCurrency } from '../utils/api';
import { formatDate } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import GuestFolioViewer from '../components/GuestFolioViewer';
import {
  Search, Hotel, CalendarCheck, CreditCard, FileText, Shield, Key,
  Camera, Mail, Phone, User, MapPin, RefreshCw, ChevronDown, ChevronUp,
  Package, Download, ExternalLink, Wifi, CheckCircle, Clock, AlertTriangle
} from 'lucide-react';

const EVIDENCE_ICONS = {
  folio: FileText,
  id_scan: Shield,
  registration_card: FileText,
  key_card_log: Key,
  audit_trail: Clock,
  cctv_snapshot: Camera,
  correspondence: Mail,
};

const EVIDENCE_LABELS = {
  folio: 'Guest Folio',
  id_scan: 'ID Scan',
  registration_card: 'Registration Card',
  key_card_log: 'Key Card Log',
  audit_trail: 'Audit Trail',
  cctv_snapshot: 'CCTV Snapshot',
  correspondence: 'Correspondence',
};

function StatusBadge({ status }) {
  const styles = {
    confirmed: 'bg-green-100 text-green-800',
    checked_in: 'bg-blue-100 text-blue-800',
    checked_out: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-yellow-100 text-yellow-800',
  };
  const s = (status || '').toLowerCase().replace(/-/g, '_');
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[s] || 'bg-gray-100 text-gray-700'}`}>
      {status || 'Unknown'}
    </span>
  );
}

export default function Reservations() {
  const { user } = useAuth();
  const [pmsStatus, setPmsStatus] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Detail / evidence state
  const [expandedId, setExpandedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [collectCaseId, setCollectCaseId] = useState('');
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectResult, setCollectResult] = useState(null);

  // Fetch PMS status
  useEffect(() => {
    api.get('/reservations/pms/status')
      .then((data) => setPmsStatus(data))
      .catch(() => setPmsStatus(null));
  }, []);

  // Fetch reservations
  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const data = await api.get('/reservations', params);
      setReservations(data.reservations || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load reservations');
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Expand row -> fetch detail
  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetailData(null);
      setEvidence(null);
      setCollectResult(null);
      return;
    }
    setExpandedId(id);
    setDetailData(null);
    setEvidence(null);
    setCollectResult(null);
    setDetailLoading(true);
    try {
      const data = await api.get(`/reservations/${id}`);
      setDetailData(data.reservation || data);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Fetch evidence
  const fetchEvidence = async (id) => {
    setEvidenceLoading(true);
    try {
      const data = await api.get(`/reservations/${id}/evidence`);
      setEvidence(data.evidence || []);
    } catch {
      setEvidence([]);
    } finally {
      setEvidenceLoading(false);
    }
  };

  // Collect evidence
  const collectEvidence = async (id) => {
    if (!collectCaseId.trim()) return;
    setCollectLoading(true);
    setCollectResult(null);
    try {
      const data = await api.post(`/reservations/${id}/evidence/collect`, { caseId: collectCaseId.trim() });
      setCollectResult({ success: true, message: data.message || 'Evidence collected successfully' });
    } catch (err) {
      setCollectResult({ success: false, message: err.message || 'Failed to collect evidence' });
    } finally {
      setCollectLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReservations();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
          <p className="text-sm text-gray-500 mt-1">Powered by AutoClerk PMS</p>
        </div>
        <button
          onClick={fetchReservations}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* PMS Status Banner */}
      {pmsStatus && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Wifi className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{pmsStatus.system || 'PMS'} Connected</h3>
                <p className="text-green-100 text-sm">{pmsStatus.propertyName || 'Property'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{(pmsStatus.reservationsCount || 0).toLocaleString()}</p>
              <p className="text-green-100 text-sm">Reservations</p>
            </div>
          </div>
          {pmsStatus.version && (
            <p className="text-green-200 text-xs mt-2">Version {pmsStatus.version} &middot; Status: {pmsStatus.status}</p>
          )}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, confirmation #, room, card, loyalty, room type, booking source..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          Search
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && reservations.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Hotel className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No reservations found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your search criteria</p>
        </div>
      )}

      {/* Results Table */}
      {!loading && reservations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Guest Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Confirmation #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Room</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-out</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Card Last 4</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservations.map((res) => (
                  <React.Fragment key={res.id || res.confirmationNumber}>
                    <tr
                      onClick={() => toggleExpand(res.id || res.confirmationNumber)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{res.guestName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{res.guestEmail}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{res.confirmationNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{res.roomNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(res.checkIn)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(res.checkOut)}</td>
                      <td className="px-4 py-3"><StatusBadge status={res.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{res.cardLast4 || '----'}</td>
                      <td className="px-4 py-3">
                        {expandedId === (res.id || res.confirmationNumber)
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </td>
                    </tr>

                    {/* Expanded Detail */}
                    {expandedId === (res.id || res.confirmationNumber) && (
                      <tr>
                        <td colSpan={9} className="bg-gray-50 px-6 py-5">
                          {detailLoading ? (
                            <div className="flex items-center gap-2 text-gray-500">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Loading details...
                            </div>
                          ) : detailData ? (
                            <div className="space-y-6">
                              {/* Guest Info + Reservation Details */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Guest Info */}
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-500" />
                                    Guest Information
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-600">Name:</span>
                                      <span className="font-medium">{detailData.guestName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Mail className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-600">Email:</span>
                                      <span className="font-medium">{detailData.guestEmail}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-4 h-4 text-gray-400" />
                                      <span className="text-gray-600">Phone:</span>
                                      <span className="font-medium">{detailData.guestPhone || 'N/A'}</span>
                                    </div>
                                    {detailData.loyaltyNumber && (
                                      <div className="flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-gray-400" />
                                        <span className="text-gray-600">Loyalty #:</span>
                                        <span className="font-medium">{detailData.loyaltyNumber}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Reservation Details */}
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Hotel className="w-4 h-4 text-blue-500" />
                                    Reservation Details
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Confirmation #</span>
                                      <span className="font-mono font-medium">{detailData.confirmationNumber}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Room</span>
                                      <span className="font-medium">{detailData.roomNumber} ({detailData.roomType})</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Check-in</span>
                                      <span className="font-medium">{formatDate(detailData.checkIn)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Check-out</span>
                                      <span className="font-medium">{formatDate(detailData.checkOut)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Rate/Night</span>
                                      <span className="font-medium">{formatCurrency(detailData.ratePerNight)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Total Charges</span>
                                      <span className="font-bold text-green-600">{formatCurrency(detailData.totalCharges)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Payment</span>
                                      <span className="font-medium">{detailData.paymentMethod} ****{detailData.cardLast4}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Booking Source</span>
                                      <span className="font-medium">{detailData.bookingSource}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Guests</span>
                                      <span className="font-medium">{detailData.adults} adults, {detailData.children} children</span>
                                    </div>
                                    {detailData.specialRequests && (
                                      <div className="pt-2 border-t border-gray-100">
                                        <span className="text-gray-600 block mb-1">Special Requests:</span>
                                        <span className="text-gray-800 italic">{detailData.specialRequests}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Evidence Section */}
                              <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-blue-500" />
                                    Evidence
                                  </h4>
                                  <button
                                    onClick={() => fetchEvidence(res.id || res.confirmationNumber)}
                                    disabled={evidenceLoading}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                                  >
                                    {evidenceLoading ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Download className="w-4 h-4" />
                                    )}
                                    Fetch Evidence
                                  </button>
                                </div>

                                {/* Evidence Cards Grid */}
                                {evidence && evidence.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                    {evidence.map((item, idx) => {
                                      const Icon = EVIDENCE_ICONS[item.type] || FileText;
                                      return (
                                        <div key={idx} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                                          <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-blue-50 rounded">
                                              <Icon className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-900">
                                              {EVIDENCE_LABELS[item.type] || item.type}
                                            </span>
                                          </div>
                                          {item.type === 'folio' && item.data ? (
                                            <GuestFolioViewer data={item.data} />
                                          ) : (
                                            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-auto max-h-32">
                                              {JSON.stringify(item.data, null, 2)}
                                            </pre>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {evidence && evidence.length === 0 && (
                                  <p className="text-sm text-gray-500 mb-4">No evidence available for this reservation.</p>
                                )}

                                {/* Collect Evidence */}
                                <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                                  <input
                                    type="text"
                                    value={collectCaseId}
                                    onChange={(e) => setCollectCaseId(e.target.value)}
                                    placeholder="Enter Case ID to collect evidence"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                  <button
                                    onClick={() => collectEvidence(res.id || res.confirmationNumber)}
                                    disabled={collectLoading || !collectCaseId.trim()}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {collectLoading ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Package className="w-4 h-4" />
                                    )}
                                    Collect Evidence
                                  </button>
                                </div>
                                {collectResult && (
                                  <div className={`mt-2 p-3 rounded-lg text-sm flex items-center gap-2 ${
                                    collectResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                  }`}>
                                    {collectResult.success ? (
                                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    )}
                                    {collectResult.message}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Failed to load reservation details.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {reservations.length} of {total} reservations
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
