/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Reservation Viewer Component
 *
 * Full-screen slide-over panel for viewing reservation details,
 * guest information, and collecting evidence for dispute cases.
 */

import React, { useState, useCallback } from 'react';
import { api, formatCurrency } from '../utils/api';
import { formatDate, formatDateTime } from '../utils/helpers';
import GuestFolioViewer from './GuestFolioViewer';
import {
  X,
  User,
  Mail,
  Phone,
  Hotel,
  CalendarCheck,
  CreditCard,
  Key,
  FileText,
  Camera,
  Shield,
  Package,
  Download,
  ExternalLink,
  RefreshCw,
  Star,
  MapPin,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Evidence type configuration                                        */
/* ------------------------------------------------------------------ */
const EVIDENCE_TYPES = {
  registration_card: { label: 'Registration Card', icon: FileText, color: 'text-blue-600 bg-blue-50' },
  folio: { label: 'Guest Folio', icon: FileText, color: 'text-indigo-600 bg-indigo-50' },
  id_scan: { label: 'ID Scan', icon: Camera, color: 'text-purple-600 bg-purple-50' },
  signature: { label: 'Signature', icon: FileText, color: 'text-pink-600 bg-pink-50' },
  key_card_log: { label: 'Key Card Log', icon: Key, color: 'text-amber-600 bg-amber-50' },
  cctv_screenshot: { label: 'CCTV Screenshot', icon: Camera, color: 'text-red-600 bg-red-50' },
  checkout_receipt: { label: 'Checkout Receipt', icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
  authorization_log: { label: 'Authorization Log', icon: Shield, color: 'text-gray-600 bg-gray-50' },
  correspondence: { label: 'Guest Correspondence', icon: Mail, color: 'text-cyan-600 bg-cyan-50' },
  booking_confirmation: { label: 'Booking Confirmation', icon: CalendarCheck, color: 'text-teal-600 bg-teal-50' },
  cancellation_policy: { label: 'Cancellation Policy', icon: FileText, color: 'text-orange-600 bg-orange-50' },
  minibar_log: { label: 'Minibar / Incidental Log', icon: Package, color: 'text-lime-600 bg-lime-50' },
};

/* ------------------------------------------------------------------ */
/*  Info row helper                                                    */
/* ------------------------------------------------------------------ */
function InfoRow({ icon: Icon, label, value, className = '' }) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */
function Section({ title, icon: Icon, children, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-500" />}
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {count !== undefined && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence card                                                      */
/* ------------------------------------------------------------------ */
function EvidenceCard({ evidence, onAttach }) {
  const config = EVIDENCE_TYPES[evidence.type] || {
    label: evidence.type?.replace(/_/g, ' ') || 'Evidence',
    icon: FileText,
    color: 'text-gray-600 bg-gray-50',
  };
  const Icon = config.icon;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900">{config.label}</h4>
          {evidence.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{evidence.description}</p>
          )}
          {evidence.timestamp && (
            <p className="text-xs text-gray-400 mt-1">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatDateTime(evidence.timestamp)}
            </p>
          )}
          {evidence.preview && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 font-mono line-clamp-3">
              {evidence.preview}
            </div>
          )}
          {evidence.fileUrl && (
            <a
              href={evidence.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-600 hover:text-indigo-700"
            >
              <ExternalLink className="w-3 h-3" /> View Document
            </a>
          )}
        </div>
      </div>
      {onAttach && (
        <button
          onClick={() => onAttach(evidence)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Download className="w-3 h-3" />
          Attach to Case
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main ReservationViewer component                                   */
/* ------------------------------------------------------------------ */
export default function ReservationViewer({ reservation, onClose, caseId, onEvidenceAttached }) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState(null);
  const [evidenceFetched, setEvidenceFetched] = useState(false);
  const [attachingId, setAttachingId] = useState(null);
  const [showFolio, setShowFolio] = useState(false);
  const [folioData, setFolioData] = useState(null);
  const [folioLoading, setFolioLoading] = useState(false);

  if (!reservation) return null;

  const guest = reservation.guest || reservation;
  const confirmationNumber = reservation.confirmationNumber || reservation.confirmation_number || '';

  /* ----- Fetch evidence ----- */
  const fetchEvidence = useCallback(async () => {
    if (!confirmationNumber) return;
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const res = await api.get(`/reservations/${confirmationNumber}/evidence`);
      const items = res?.evidence || res?.data?.evidence || res?.data || [];
      setEvidenceList(Array.isArray(items) ? items : []);
      setEvidenceFetched(true);
    } catch (err) {
      console.error('Failed to fetch evidence:', err);
      setEvidenceError(err.message || 'Failed to load evidence');
    } finally {
      setEvidenceLoading(false);
    }
  }, [confirmationNumber]);

  /* ----- Fetch folio ----- */
  const fetchFolio = useCallback(async () => {
    if (!confirmationNumber) return;
    setFolioLoading(true);
    try {
      const res = await api.get(`/reservations/${confirmationNumber}/folio`);
      const folio = res?.folio || res?.data?.folio || res?.data || null;
      setFolioData(folio);
      setShowFolio(true);
    } catch (err) {
      console.error('Failed to fetch folio:', err);
    } finally {
      setFolioLoading(false);
    }
  }, [confirmationNumber]);

  /* ----- Attach evidence to case ----- */
  const handleAttachEvidence = useCallback(async (evidence) => {
    if (!caseId) return;
    setAttachingId(evidence.id || evidence.type);
    try {
      await api.post(`/cases/${caseId}/evidence`, {
        evidenceType: evidence.type,
        source: 'reservation',
        sourceId: confirmationNumber,
        data: evidence,
      });
      if (onEvidenceAttached) onEvidenceAttached(evidence);
    } catch (err) {
      console.error('Failed to attach evidence:', err);
    } finally {
      setAttachingId(null);
    }
  }, [caseId, confirmationNumber, onEvidenceAttached]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reservation Details</h2>
            {confirmationNumber && (
              <p className="text-sm text-gray-500">Confirmation: {confirmationNumber}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* ---- Guest Information ---- */}
          <Section title="Guest Information" icon={User} defaultOpen={true}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={User} label="Guest Name" value={guest.guestName || guest.name || `${guest.firstName || ''} ${guest.lastName || ''}`.trim()} />
              <InfoRow icon={Mail} label="Email" value={guest.email} />
              <InfoRow icon={Phone} label="Phone" value={guest.phone} />
              <InfoRow icon={Star} label="Loyalty Number" value={guest.loyaltyNumber || guest.loyalty_number} />
              <InfoRow icon={MapPin} label="Address" value={guest.address} />
            </div>
          </Section>

          {/* ---- Reservation Details ---- */}
          <Section title="Reservation Details" icon={CalendarCheck} defaultOpen={true}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={Key} label="Confirmation #" value={confirmationNumber} />
              <InfoRow icon={Hotel} label="Room" value={reservation.roomNumber || reservation.room_number || reservation.room} />
              <InfoRow
                icon={CalendarCheck}
                label="Check-in"
                value={formatDate(reservation.checkIn || reservation.check_in || reservation.checkInDate)}
              />
              <InfoRow
                icon={CalendarCheck}
                label="Check-out"
                value={formatDate(reservation.checkOut || reservation.check_out || reservation.checkOutDate)}
              />
              <InfoRow
                icon={CreditCard}
                label="Rate / Night"
                value={reservation.rate ? formatCurrency(reservation.rate) : reservation.roomRate ? formatCurrency(reservation.roomRate) : null}
              />
              <InfoRow
                icon={CreditCard}
                label="Total Charges"
                value={reservation.totalCharges || reservation.total ? formatCurrency(reservation.totalCharges || reservation.total) : null}
              />
              <InfoRow icon={CreditCard} label="Payment Method" value={reservation.paymentMethod || reservation.payment_method} />
              <InfoRow icon={CreditCard} label="Card" value={reservation.cardLast4 ? `****${reservation.cardLast4}` : reservation.card} />
              <InfoRow icon={ExternalLink} label="Booking Source" value={reservation.bookingSource || reservation.source || reservation.channel} />
              <InfoRow icon={Clock} label="Status" value={reservation.status} />
            </div>
          </Section>

          {/* ---- Special Requests ---- */}
          {(reservation.specialRequests || reservation.special_requests || reservation.notes) && (
            <Section title="Special Requests" icon={FileText} defaultOpen={false}>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {reservation.specialRequests || reservation.special_requests || reservation.notes}
              </p>
            </Section>
          )}

          {/* ---- Guest Folio ---- */}
          <Section title="Guest Folio" icon={FileText} defaultOpen={false}>
            {showFolio && folioData ? (
              <GuestFolioViewer folio={folioData} />
            ) : (
              <div className="text-center py-4">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">
                  View the full guest folio including charges, payments, and incidentals.
                </p>
                <button
                  onClick={fetchFolio}
                  disabled={folioLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  {folioLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {folioLoading ? 'Loading Folio...' : 'Load Guest Folio'}
                </button>
              </div>
            )}
          </Section>

          {/* ---- Evidence Collection ---- */}
          <Section
            title="Evidence Collection"
            icon={Shield}
            defaultOpen={true}
            count={evidenceFetched ? evidenceList.length : undefined}
          >
            {!evidenceFetched ? (
              <div className="text-center py-4">
                <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">
                  Collect evidence from PMS records, key card logs, CCTV, and more.
                </p>
                <button
                  onClick={fetchEvidence}
                  disabled={evidenceLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {evidenceLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4" />
                  )}
                  {evidenceLoading ? 'Collecting Evidence...' : 'Collect Evidence'}
                </button>
              </div>
            ) : evidenceError ? (
              <div className="text-center py-4">
                <p className="text-sm text-red-600 mb-3">{evidenceError}</p>
                <button
                  onClick={fetchEvidence}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
              </div>
            ) : evidenceList.length === 0 ? (
              <div className="text-center py-4">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No evidence found for this reservation.</p>
                <button
                  onClick={fetchEvidence}
                  className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {evidenceList.map((ev, idx) => (
                  <EvidenceCard
                    key={ev.id || idx}
                    evidence={ev}
                    onAttach={caseId ? handleAttachEvidence : undefined}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
          {!evidenceFetched && (
            <button
              onClick={fetchEvidence}
              disabled={evidenceLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Shield className="w-4 h-4" />
              Collect Evidence
            </button>
          )}
        </div>
      </div>
    </>
  );
}
