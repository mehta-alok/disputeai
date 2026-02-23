/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Guest Folio Viewer Component
 *
 * Displays guest folio data from AutoClerk PMS including
 * room charges, incidentals, payments, and tax summary.
 */

import React, { useState } from 'react';
import { formatCurrency } from '../utils/api';
import { formatDate } from '../utils/helpers';
import {
  FileText,
  DollarSign,
  CreditCard,
  Receipt,
  ChevronDown,
  ChevronUp,
  Printer,
  Calendar,
  Hotel,
  ShoppingBag
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Summary card                                                       */
/* ------------------------------------------------------------------ */
function SummaryCard({ icon: Icon, label, value, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  const iconClass = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible section                                                */
/* ------------------------------------------------------------------ */
function FolioSection({ title, icon: Icon, children, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {count !== undefined && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
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
/*  Charge table                                                       */
/* ------------------------------------------------------------------ */
function ChargeTable({ items, showCategory = false }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-500 italic">No charges recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Description</th>
            {showCategory && (
              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Category</th>
            )}
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{formatDate(item.date)}</td>
              <td className="py-2 px-2 text-gray-900">{item.description}</td>
              {showCategory && (
                <td className="py-2 px-2">
                  <span className="inline-flex px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">
                    {item.category || 'Other'}
                  </span>
                </td>
              )}
              <td className="py-2 px-2 text-right font-medium text-gray-900">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payment table                                                      */
/* ------------------------------------------------------------------ */
function PaymentTable({ payments }) {
  if (!payments || payments.length === 0) {
    return <p className="text-sm text-gray-500 italic">No payments recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Method</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Card</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Auth Code</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, idx) => (
            <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{formatDate(p.date)}</td>
              <td className="py-2 px-2 text-gray-900">{p.method}</td>
              <td className="py-2 px-2 text-gray-600">
                {p.cardLast4 ? `****${p.cardLast4}` : '-'}
              </td>
              <td className="py-2 px-2 font-mono text-xs text-gray-600">{p.authCode || '-'}</td>
              <td className="py-2 px-2 font-mono text-xs text-gray-500">{p.transactionId || '-'}</td>
              <td className="py-2 px-2 text-right font-medium text-emerald-700">{formatCurrency(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tax summary table                                                  */
/* ------------------------------------------------------------------ */
function TaxTable({ taxes }) {
  if (!taxes || taxes.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 uppercase">Tax Type</th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500 uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {taxes.map((t, idx) => (
            <tr key={idx} className="border-b border-gray-50">
              <td className="py-2 px-2 text-gray-900">{t.type}</td>
              <td className="py-2 px-2 text-right font-medium text-gray-900">{formatCurrency(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main GuestFolioViewer component                                    */
/* ------------------------------------------------------------------ */
export default function GuestFolioViewer({ folio }) {
  if (!folio) {
    return (
      <div className="text-center py-6">
        <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No folio data available.</p>
      </div>
    );
  }

  const summary = folio.summary || {};
  const nights = (() => {
    if (folio.checkIn && folio.checkOut) {
      const diff = new Date(folio.checkOut) - new Date(folio.checkIn);
      return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    return folio.roomCharges?.length || 0;
  })();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Folio header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Guest Folio
          </h3>
          {folio.guestName && (
            <p className="text-sm text-gray-500 mt-0.5">{folio.guestName} - {folio.confirmationNumber}</p>
          )}
          {folio.roomNumber && (
            <p className="text-xs text-gray-400">
              Room {folio.roomNumber} | {formatDate(folio.checkIn)} - {formatDate(folio.checkOut)}
            </p>
          )}
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors print:hidden"
        >
          <Printer className="w-3 h-3" />
          Print
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Calendar} label="Nights" value={nights} color="blue" />
        <SummaryCard icon={Hotel} label="Room Total" value={formatCurrency(summary.roomTotal)} color="indigo" />
        <SummaryCard icon={ShoppingBag} label="Incidentals" value={formatCurrency(summary.incidentalTotal)} color="amber" />
        <SummaryCard icon={DollarSign} label="Grand Total" value={formatCurrency(summary.grandTotal)} color="emerald" />
      </div>

      {/* Room charges */}
      <FolioSection
        title="Room Charges"
        icon={Hotel}
        defaultOpen={true}
        count={folio.roomCharges?.length}
      >
        <ChargeTable items={folio.roomCharges} />
      </FolioSection>

      {/* Incidentals */}
      <FolioSection
        title="Incidentals"
        icon={ShoppingBag}
        defaultOpen={true}
        count={folio.incidentals?.length}
      >
        <ChargeTable items={folio.incidentals} showCategory={true} />
      </FolioSection>

      {/* Payments */}
      <FolioSection
        title="Payments"
        icon={CreditCard}
        defaultOpen={true}
        count={folio.payments?.length}
      >
        <PaymentTable payments={folio.payments} />
      </FolioSection>

      {/* Taxes */}
      {folio.taxes && folio.taxes.length > 0 && (
        <FolioSection
          title="Taxes & Fees"
          icon={Receipt}
          defaultOpen={false}
          count={folio.taxes?.length}
        >
          <TaxTable taxes={folio.taxes} />
        </FolioSection>
      )}

      {/* Grand total footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-8 text-sm text-gray-600">
              <span>Room Total</span>
              <span>{formatCurrency(summary.roomTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-8 text-sm text-gray-600">
              <span>Incidentals</span>
              <span>{formatCurrency(summary.incidentalTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-8 text-sm text-gray-600">
              <span>Taxes & Fees</span>
              <span>{formatCurrency(summary.taxTotal)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase font-medium">Grand Total</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.grandTotal)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
