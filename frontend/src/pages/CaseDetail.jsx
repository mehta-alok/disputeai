/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Case Detail Page
 */

import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, formatCurrency } from '../utils/api';
import { formatDate, formatDateTime } from '../utils/helpers';
import {
  ArrowLeft,
  FileText,
  Shield,
  Clock,
  CheckCircle,
  DollarSign,
  Calendar,
  CreditCard,
  Package,
  Upload,
  Send,
  AlertTriangle,
  ExternalLink,
  XCircle,
  RefreshCw,
  Building2,
  Eye,
  Download,
  Paperclip,
  Scale,
  Gavel,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Plus,
  Info
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock, dotColor: 'bg-amber-500' },
  IN_REVIEW: { label: 'In Review', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: FileText, dotColor: 'bg-blue-500' },
  SUBMITTED: { label: 'Submitted', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Send, dotColor: 'bg-indigo-500' },
  WON: { label: 'Won', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, dotColor: 'bg-green-500' },
  LOST: { label: 'Lost', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, dotColor: 'bg-red-500' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: AlertTriangle, dotColor: 'bg-gray-400' },
};

const TIMELINE_STEPS = [
  { key: 'PENDING', label: 'Case Created' },
  { key: 'IN_REVIEW', label: 'Under Review' },
  { key: 'SUBMITTED', label: 'Response Submitted' },
  { key: 'RESOLVED', label: 'Resolved' },
];

function StatusBadge({ status, size = 'md' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  const sizeClasses = size === 'lg'
    ? 'px-3.5 py-1.5 text-sm gap-2'
    : 'px-2.5 py-1 text-xs gap-1.5';
  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${config.color} ${sizeClasses}`}>
      <Icon className={size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} />
      {config.label}
    </span>
  );
}

function getTimelineStatus(caseStatus) {
  const order = ['PENDING', 'IN_REVIEW', 'SUBMITTED'];
  const currentIndex = order.indexOf(caseStatus);
  const isResolved = caseStatus === 'WON' || caseStatus === 'LOST' || caseStatus === 'EXPIRED';

  return TIMELINE_STEPS.map((step, index) => {
    if (step.key === 'RESOLVED') {
      if (isResolved) return { ...step, state: 'completed', resolvedStatus: caseStatus };
      return { ...step, state: 'upcoming' };
    }
    const stepIndex = order.indexOf(step.key);
    if (isResolved || stepIndex <= currentIndex) return { ...step, state: 'completed' };
    if (stepIndex === currentIndex + 1) return { ...step, state: 'current' };
    return { ...step, state: 'upcoming' };
  });
}

function getDaysRemaining(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [arbitrationNarrative, setArbitrationNarrative] = useState('');
  const [filingArbitration, setFilingArbitration] = useState(false);
  const [showArbitrationForm, setShowArbitrationForm] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [arbTab, setArbTab] = useState('overview');
  const [arbDocuments, setArbDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/cases/${id}`);
        const data = response.data || response;
        const c = data.chargeback || data.case || data;
        setCaseData(c);
        if (c.timeline) setTimeline(c.timeline);
        if (c.notes) setNotes(c.notes);
      } catch (err) {
        console.error('Failed to fetch case:', err);
        if (err?.status === 404 || err?.statusCode === 404) {
          setError('not_found');
        } else {
          setError('Failed to load case details. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    const fetchEvidence = async () => {
      setEvidenceLoading(true);
      try {
        const response = await api.get(`/evidence/${id}`);
        const data = response.data || response;
        setEvidence(data.evidence || data || []);
      } catch (err) {
        console.error('Failed to fetch evidence:', err);
        setEvidence([]);
      } finally {
        setEvidenceLoading(false);
      }
    };

    fetchCase();
    fetchEvidence();
  }, [id]);

  const handleSubmitResponse = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/cases/${id}/submit`);
      const response = await api.get(`/cases/${id}`);
      const data = response.data || response;
      const c = data.chargeback || data.case || data;
      setCaseData(c);
      if (c.timeline) setTimeline(c.timeline);
    } catch (err) {
      console.error('Failed to submit response:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileArbitration = async () => {
    if (filingArbitration || !arbitrationNarrative.trim()) return;
    setFilingArbitration(true);
    try {
      await api.post(`/cases/${id}/arbitration`, { narrative: arbitrationNarrative.trim() });
      // Refresh case data
      const response = await api.get(`/cases/${id}`);
      const data = response.data || response;
      const c = data.chargeback || data.case || data;
      setCaseData(c);
      if (c.timeline) setTimeline(c.timeline);
      setShowArbitrationForm(false);
      setArbitrationNarrative('');
    } catch (err) {
      console.error('Failed to file arbitration:', err);
    } finally {
      setFilingArbitration(false);
    }
  };

  // Load existing arbitration documents from case data
  useEffect(() => {
    if (caseData?.resolution?.arbitration?.documents) {
      const docs = caseData.resolution.arbitration.documents.map((doc, i) => {
        const name = typeof doc === 'string' ? doc : doc.name;
        const ext = name.split('.').pop().toLowerCase();
        const typeMap = { pdf: 'PDF', png: 'Image', jpg: 'Image', jpeg: 'Image', doc: 'Document', docx: 'Document', xls: 'Spreadsheet', xlsx: 'Spreadsheet', csv: 'Spreadsheet' };
        return {
          id: `arb-doc-${i}`,
          name,
          type: typeMap[ext] || 'File',
          size: typeof doc === 'object' ? doc.size : null,
          uploadedAt: typeof doc === 'object' ? doc.uploadedAt : caseData.resolution.arbitration.filedDate || new Date().toISOString(),
          uploadedBy: typeof doc === 'object' ? doc.uploadedBy : 'System',
        };
      });
      setArbDocuments(docs);
    }
  }, [caseData]);

  const handleArbDocUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploadingDoc(true);
    try {
      for (const file of files) {
        // Upload to backend
        const formData = new FormData();
        formData.append('document', file);
        formData.append('type', 'arbitration');
        const response = await api.post(`/cases/${id}/arbitration/documents`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        }).catch(() => null);

        // Add to local state regardless (demo mode may not have backend)
        const newDoc = {
          id: `arb-doc-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: file.name,
          type: file.type.includes('pdf') ? 'PDF' : file.type.includes('image') ? 'Image' : 'Document',
          size: file.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'You',
        };
        setArbDocuments(prev => [...prev, newDoc]);
      }
    } catch (err) {
      console.error('Failed to upload arbitration document:', err);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleArbDocDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleArbDocUpload(files);
  };

  const handleArbDocSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) handleArbDocUpload(files);
    e.target.value = '';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getDocIcon = (type) => {
    if (type === 'PDF') return '📄';
    if (type === 'Image') return '🖼️';
    if (type === 'Spreadsheet') return '📊';
    return '📎';
  };

  const handleAddNote = async () => {
    if (addingNote || !newNote.trim()) return;
    setAddingNote(true);
    try {
      const response = await api.post(`/cases/${id}/notes`, { content: newNote.trim() });
      const data = response.data || response;
      if (data.note) {
        setNotes(prev => [data.note, ...prev]);
      }
      setNewNote('');
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-sm text-gray-500 font-medium">Loading case details...</p>
      </div>
    );
  }

  // Not Found State
  if (error === 'not_found') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
          <FileText className="w-10 h-10 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Case Not Found</h2>
        <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
          The case you are looking for does not exist or may have been removed.
        </p>
        <Link
          to="/cases"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cases
        </Link>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link
            to="/cases"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cases
          </Link>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const daysLeft = getDaysRemaining(caseData.dueDate);
  const progressSteps = getTimelineStatus(caseData.status);
  const isActionable = caseData.status === 'PENDING' || caseData.status === 'IN_REVIEW';

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        to="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Cases
      </Link>

      {/* Case Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-14 h-14 bg-blue-50 rounded-xl flex-shrink-0">
                <Shield className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {caseData.guestName || 'Unknown Guest'}
                  </h1>
                  <StatusBadge status={caseData.status} size="lg" />
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Case #{caseData.id}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-3">
                  {formatCurrency(caseData.amount)}
                </p>
              </div>
            </div>

            {/* Due Date Warning */}
            {daysLeft !== null && isActionable && (
              <div
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border flex-shrink-0 ${
                  daysLeft <= 3
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : daysLeft <= 7
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                <div>
                  <p className="text-sm font-semibold">
                    {daysLeft > 0 ? `${daysLeft} days remaining` : 'Response overdue'}
                  </p>
                  <p className="text-xs opacity-75">Due {formatDate(caseData.dueDate)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Case Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Case Information */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Case Information</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-amber-50 rounded-lg flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reason Code</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 font-mono">
                      {caseData.reasonCode || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-red-50 rounded-lg flex-shrink-0">
                    <Calendar className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Chargeback Date</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatDate(caseData.chargebackDate) || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-blue-50 rounded-lg flex-shrink-0">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatDate(caseData.dueDate) || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-purple-50 rounded-lg flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Card Last 4</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {caseData.cardLast4 ? `**** ${caseData.cardLast4}` : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-green-50 rounded-lg flex-shrink-0">
                    <Building2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Property</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {caseData.propertyName || caseData.property?.name || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 bg-indigo-50 rounded-lg flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Disputed Amount</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatCurrency(caseData.amount)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Case Progress</h2>
            </div>
            <div className="p-6">
              <div className="flex items-start">
                {progressSteps.map((step, index) => {
                  const isLast = index === progressSteps.length - 1;
                  const resolvedConfig = step.resolvedStatus ? STATUS_CONFIG[step.resolvedStatus] : null;

                  return (
                    <div key={step.key} className={`flex-1 ${!isLast ? 'relative' : ''}`}>
                      <div className="flex flex-col items-center text-center">
                        {/* Step Indicator */}
                        <div
                          className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                            step.state === 'completed'
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : step.state === 'current'
                                ? 'bg-white border-blue-500 text-blue-600 ring-4 ring-blue-100'
                                : 'bg-white border-gray-200 text-gray-400'
                          }`}
                        >
                          {step.state === 'completed' ? (
                            step.resolvedStatus === 'WON' ? (
                              <CheckCircle className="w-5 h-5" />
                            ) : step.resolvedStatus === 'LOST' ? (
                              <XCircle className="w-5 h-5" />
                            ) : (
                              <CheckCircle className="w-5 h-5" />
                            )
                          ) : (
                            <span className="text-sm font-bold">{index + 1}</span>
                          )}
                        </div>

                        {/* Step Label */}
                        <p
                          className={`mt-2 text-xs font-medium ${
                            step.state === 'completed'
                              ? 'text-gray-900'
                              : step.state === 'current'
                                ? 'text-blue-600'
                                : 'text-gray-400'
                          }`}
                        >
                          {step.key === 'RESOLVED' && resolvedConfig
                            ? resolvedConfig.label
                            : step.label}
                        </p>
                      </div>

                      {/* Connector Line */}
                      {!isLast && (
                        <div className="absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-0.5">
                          <div
                            className={`h-full ${
                              step.state === 'completed' ? 'bg-blue-600' : 'bg-gray-200'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evidence Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-gray-400" />
                <h2 className="text-base font-semibold text-gray-900">Evidence</h2>
                {evidence.length > 0 && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {evidence.length}
                  </span>
                )}
              </div>
              {isActionable && (
                <Link
                  to={`/reservations?caseId=${id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Collect Evidence
                </Link>
              )}
            </div>
            <div className="p-6">
              {evidenceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : evidence.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="flex items-center justify-center w-14 h-14 bg-gray-100 rounded-full mb-3">
                    <Package className="w-7 h-7 text-gray-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No evidence yet</h3>
                  <p className="text-xs text-gray-500 text-center max-w-xs mb-4">
                    Collect evidence from reservations and supporting documents to strengthen your defense.
                  </p>
                  {isActionable && (
                    <Link
                      to={`/reservations?caseId=${id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Browse Reservations
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {evidence.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center justify-center w-10 h-10 bg-white rounded-lg border border-gray-200 flex-shrink-0">
                        <FileText className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.fileName || item.name || item.type || `Evidence ${index + 1}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.type && <span className="capitalize">{item.type.replace(/_/g, ' ')}</span>}
                          {item.createdAt && <span> - {formatDate(item.createdAt)}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                        {item.downloadUrl && (
                          <a
                            href={item.downloadUrl}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resolution / Outcome Section (WON or LOST cases) */}
          {caseData.resolution && (
            <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
              caseData.status === 'WON' ? 'border-green-200' : 'border-red-200'
            }`}>
              <div className={`px-6 py-4 border-b ${
                caseData.status === 'WON'
                  ? 'bg-green-50 border-green-100'
                  : 'bg-red-50 border-red-100'
              }`}>
                <div className="flex items-center gap-2">
                  {caseData.status === 'WON' ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <h2 className={`text-base font-semibold ${
                    caseData.status === 'WON' ? 'text-green-900' : 'text-red-900'
                  }`}>
                    Dispute {caseData.status === 'WON' ? 'Won' : 'Lost'} — Outcome Details
                  </h2>
                </div>
              </div>
              <div className="p-6 space-y-5">
                {/* Outcome reason */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Decision Summary</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{caseData.resolution.reason}</p>
                </div>

                {/* Recovered amount (WON) */}
                {caseData.status === 'WON' && caseData.resolution.recoveredAmount > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                    <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-green-600 font-medium">Amount Recovered</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(caseData.resolution.recoveredAmount)}</p>
                    </div>
                  </div>
                )}

                {/* Win factors */}
                {caseData.resolution.winFactors && caseData.resolution.winFactors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      {caseData.status === 'WON' ? 'Winning Factors' : 'Submitted Evidence'}
                    </p>
                    <ul className="space-y-1.5">
                      {caseData.resolution.winFactors.map((factor, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence gaps (LOST) */}
                {caseData.resolution.evidenceGaps && caseData.resolution.evidenceGaps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Evidence Gaps</p>
                    <ul className="space-y-1.5">
                      {caseData.resolution.evidenceGaps.map((gap, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Denial details (LOST) */}
                {caseData.resolution.denialDetails && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Denial Details</p>
                    <p className="text-sm text-gray-700 leading-relaxed bg-red-50 p-3 rounded-lg border border-red-100">
                      {caseData.resolution.denialDetails}
                    </p>
                  </div>
                )}

                {/* Processor notes */}
                {caseData.resolution.processorNotes && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Processor Notes</p>
                    <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 italic">
                      {caseData.resolution.processorNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Arbitration Section (LOST cases with arbitration available) */}
          {caseData.status === 'LOST' && caseData.resolution?.arbitration && (
            <div data-section="arbitration" className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gavel className="w-5 h-5 text-amber-600" />
                    <h2 className="text-base font-semibold text-amber-900">Arbitration</h2>
                  </div>
                  {caseData.resolution.arbitration.status === 'AVAILABLE' && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      Available
                    </span>
                  )}
                  {caseData.resolution.arbitration.status === 'FILED' && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                      Filed
                    </span>
                  )}
                </div>
              </div>

              {/* Arbitration Tabs */}
              <div className="flex border-b border-amber-100">
                <button
                  onClick={() => setArbTab('overview')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    arbTab === 'overview'
                      ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Scale className="w-4 h-4" />
                    Overview
                  </div>
                </button>
                <button
                  onClick={() => setArbTab('documents')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    arbTab === 'documents'
                      ? 'text-amber-700 border-b-2 border-amber-500 bg-amber-50/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    Documents
                    {arbDocuments.length > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {arbDocuments.length}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Overview Tab */}
              {arbTab === 'overview' && (
                <div className="p-6 space-y-4">
                  {/* Arbitration info */}
                  {caseData.resolution.arbitration.instructions && (
                    <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800 leading-relaxed">
                        {caseData.resolution.arbitration.instructions}
                      </p>
                    </div>
                  )}

                  {/* Deadline & fee */}
                  <div className="grid grid-cols-2 gap-4">
                    {caseData.resolution.arbitration.deadline && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deadline</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {formatDate(caseData.resolution.arbitration.deadline)}
                        </p>
                        {(() => {
                          const dl = getDaysRemaining(caseData.resolution.arbitration.deadline);
                          if (dl !== null && dl <= 5) {
                            return <p className="text-xs text-red-600 font-medium mt-0.5">{dl} days left</p>;
                          }
                          return dl !== null ? <p className="text-xs text-gray-500 mt-0.5">{dl} days left</p> : null;
                        })()}
                      </div>
                    )}
                    {caseData.resolution.arbitration.fee && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filing Fee</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {formatCurrency(caseData.resolution.arbitration.fee)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">Non-refundable if lost</p>
                      </div>
                    )}
                  </div>

                  {/* File arbitration form */}
                  {caseData.resolution.arbitration.status === 'AVAILABLE' && (
                    <>
                      {!showArbitrationForm ? (
                        <button
                          onClick={() => setShowArbitrationForm(true)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors shadow-sm"
                        >
                          <Scale className="w-4 h-4" />
                          File for Arbitration
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="text-sm font-medium text-gray-700">Arbitration Narrative</span>
                            <p className="text-xs text-gray-500 mt-0.5 mb-2">
                              Explain why the dispute decision should be overturned. Include any new evidence or arguments.
                            </p>
                            <textarea
                              value={arbitrationNarrative}
                              onChange={(e) => setArbitrationNarrative(e.target.value)}
                              rows={6}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                              placeholder="Provide a detailed narrative explaining why this dispute decision should be overturned..."
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={handleFileArbitration}
                              disabled={filingArbitration || !arbitrationNarrative.trim()}
                              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {filingArbitration ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Gavel className="w-4 h-4" />
                              )}
                              {filingArbitration ? 'Filing...' : 'Submit Arbitration'}
                            </button>
                            <button
                              onClick={() => { setShowArbitrationForm(false); setArbitrationNarrative(''); }}
                              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Filed status */}
                  {caseData.resolution.arbitration.status === 'FILED' && caseData.resolution.arbitration.filedDate && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-sm font-medium text-blue-800">
                        Arbitration filed on {formatDate(caseData.resolution.arbitration.filedDate)}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Awaiting card network decision. This is a binding ruling.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Documents Tab */}
              {arbTab === 'documents' && (
                <div className="p-6 space-y-4">
                  {/* Upload area */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleArbDocDrop}
                    className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragOver
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/30'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      onChange={handleArbDocSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx,.csv,.txt"
                    />
                    <div className="flex flex-col items-center gap-2">
                      {uploadingDoc ? (
                        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                      ) : (
                        <Upload className="w-8 h-8 text-gray-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {uploadingDoc ? 'Uploading...' : 'Drop files here or click to upload'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          PDF, DOC, images, spreadsheets up to 25MB each
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Suggested documents */}
                  {arbDocuments.length === 0 && (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recommended Documents</p>
                      <ul className="space-y-1.5">
                        <li className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full flex-shrink-0" />
                          Booking confirmation with cancellation policy
                        </li>
                        <li className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full flex-shrink-0" />
                          Guest check-in/check-out records
                        </li>
                        <li className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full flex-shrink-0" />
                          Signed registration card or authorization form
                        </li>
                        <li className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full flex-shrink-0" />
                          Folio with itemized charges
                        </li>
                        <li className="text-xs text-gray-600 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full flex-shrink-0" />
                          Website screenshots showing terms at time of booking
                        </li>
                      </ul>
                    </div>
                  )}

                  {/* Document list */}
                  {arbDocuments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded Documents ({arbDocuments.length})
                      </p>
                      {arbDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-base flex-shrink-0">
                              {getDocIcon(doc.type)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>{doc.type}</span>
                                {doc.size && (
                                  <>
                                    <span className="text-gray-300">·</span>
                                    <span>{formatFileSize(doc.size)}</span>
                                  </>
                                )}
                                <span className="text-gray-300">·</span>
                                <span>{formatDate(doc.uploadedAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Download">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Timeline Section */}
          {timeline.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Timeline</h2>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {timeline.length}
                  </span>
                </div>
                {timeline.length > 4 && (
                  <button
                    onClick={() => setShowAllTimeline(!showAllTimeline)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showAllTimeline ? 'Show less' : 'Show all'}
                    {showAllTimeline ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
              <div className="p-6">
                <div className="space-y-0">
                  {(showAllTimeline ? timeline : timeline.slice(0, 4)).map((event, index) => {
                    const isLast = index === (showAllTimeline ? timeline.length : Math.min(timeline.length, 4)) - 1;
                    const eventColors = {
                      ALERT: 'bg-red-100 text-red-600',
                      AI: 'bg-purple-100 text-purple-600',
                      AI_ANALYSIS: 'bg-purple-100 text-purple-600',
                      SUCCESS: 'bg-green-100 text-green-600',
                      WON: 'bg-green-100 text-green-600',
                      LOST: 'bg-red-100 text-red-600',
                      SYSTEM: 'bg-blue-100 text-blue-600',
                      STATUS_CHANGE: 'bg-blue-100 text-blue-600',
                      EVIDENCE: 'bg-indigo-100 text-indigo-600',
                      USER_ACTION: 'bg-amber-100 text-amber-600',
                    };
                    const colorClass = eventColors[event.eventType] || 'bg-gray-100 text-gray-600';

                    return (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                            {event.eventType === 'WON' ? <CheckCircle className="w-4 h-4" /> :
                             event.eventType === 'LOST' ? <XCircle className="w-4 h-4" /> :
                             event.eventType === 'ALERT' ? <AlertTriangle className="w-4 h-4" /> :
                             event.eventType === 'AI' || event.eventType === 'AI_ANALYSIS' ? <Shield className="w-4 h-4" /> :
                             event.eventType === 'EVIDENCE' ? <Paperclip className="w-4 h-4" /> :
                             <Clock className="w-4 h-4" />}
                          </div>
                          {!isLast && <div className="w-px h-full bg-gray-200 min-h-[24px]" />}
                        </div>
                        <div className={`pb-4 ${isLast ? '' : ''}`}>
                          <p className="text-sm font-medium text-gray-900">{event.title}</p>
                          {event.description && (
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Notes</h2>
              {notes.length > 0 && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {notes.length}
                </span>
              )}
            </div>
            <div className="p-6 space-y-4">
              {/* Add note form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !newNote.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingNote ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note, i) => (
                    <div key={note.id || i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-800">{note.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-500">
                          {note.user ? `${note.user.firstName} ${note.user.lastName}` : 'System'}
                        </span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{formatDateTime(note.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Actions & Meta */}
        <div className="space-y-6">
          {/* Quick Actions */}
          {isActionable && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Actions</h2>
              </div>
              <div className="p-6 space-y-3">
                <button
                  onClick={handleSubmitResponse}
                  disabled={submitting || evidence.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
                {evidence.length === 0 && (
                  <p className="text-xs text-amber-600 text-center">
                    Collect evidence before submitting a response.
                  </p>
                )}

                <Link
                  to={`/reservations?caseId=${id}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Package className="w-4 h-4" />
                  Collect Evidence
                </Link>
              </div>
            </div>
          )}

          {/* Arbitration Quick Action (LOST cases) */}
          {caseData.status === 'LOST' && caseData.resolution?.arbitration?.status === 'AVAILABLE' && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-900">Arbitration Available</h3>
                </div>
                <p className="text-xs text-amber-700">
                  You can file for arbitration to appeal this decision. The card network will make a final binding ruling.
                </p>
                {caseData.resolution.arbitration.deadline && (
                  <p className="text-xs font-medium text-amber-800">
                    Deadline: {formatDate(caseData.resolution.arbitration.deadline)}
                  </p>
                )}
                <a
                  href="#arbitration"
                  onClick={(e) => { e.preventDefault(); document.querySelector('[data-section="arbitration"]')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Scale className="w-4 h-4" />
                  File Arbitration
                </a>
              </div>
            </div>
          )}

          {/* Fraud Indicators */}
          {caseData.fraudIndicators && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Fraud Indicators</h2>
              </div>
              <div className="p-6 space-y-3">
                {caseData.confidenceScore != null && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">AI Confidence</span>
                    <span className={`text-sm font-bold ${
                      caseData.confidenceScore >= 80 ? 'text-green-600' :
                      caseData.confidenceScore >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {caseData.confidenceScore}%
                    </span>
                  </div>
                )}
                {caseData.fraudIndicators.positive?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-1">Positive</p>
                    <div className="flex flex-wrap gap-1">
                      {caseData.fraudIndicators.positive.map((ind, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                          {ind.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {caseData.fraudIndicators.negative?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-1">Risk Flags</p>
                    <div className="flex flex-wrap gap-1">
                      {caseData.fraudIndicators.negative.map((ind, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded-full border border-red-100">
                          {ind.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Case Summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Summary</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <StatusBadge status={caseData.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(caseData.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Created</span>
                <span className="text-sm text-gray-700">{formatDate(caseData.createdAt)}</span>
              </div>
              {caseData.dueDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Due Date</span>
                  <span
                    className={`text-sm font-medium ${
                      daysLeft !== null && daysLeft <= 3 ? 'text-red-600' : 'text-gray-700'
                    }`}
                  >
                    {formatDate(caseData.dueDate)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Evidence</span>
                <span className="text-sm text-gray-700">{evidence.length} document{evidence.length !== 1 ? 's' : ''}</span>
              </div>
              {caseData.reasonCode && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Reason Code</span>
                  <span className="text-sm font-mono text-gray-700 bg-gray-50 px-2 py-0.5 rounded">
                    {caseData.reasonCode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Activity</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Created</p>
                <p className="text-sm text-gray-700 mt-0.5">{formatDateTime(caseData.createdAt) || 'N/A'}</p>
              </div>
              {caseData.updatedAt && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</p>
                  <p className="text-sm text-gray-700 mt-0.5">{formatDateTime(caseData.updatedAt)}</p>
                </div>
              )}
              {caseData.submittedAt && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</p>
                  <p className="text-sm text-gray-700 mt-0.5">{formatDateTime(caseData.submittedAt)}</p>
                </div>
              )}
              {caseData.resolvedAt && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Resolved</p>
                  <p className="text-sm text-gray-700 mt-0.5">{formatDateTime(caseData.resolvedAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
