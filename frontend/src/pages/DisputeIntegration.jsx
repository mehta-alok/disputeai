/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Dispute Companies Integration Page
 */

import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import {
  Shield,
  Settings,
  CheckCircle,
  XCircle,
  CreditCard,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

const PLACEHOLDER_COMPANIES = [
  { name: 'Merlink', type: 'dispute_management', category: 'hospitality', features: ['Real-time Dispute Alerts', 'Two-Way Case Sync', 'Evidence Submission'] },
  { name: 'StaySettle', type: 'dispute_management', category: 'hospitality', features: ['Autopilot Dispute Resolution', 'PMS Integration', 'Smart Response Generation'] },
  { name: 'Win Chargebacks', type: 'dispute_management', category: 'hospitality', features: ['AI-Powered Platform', 'Booking System Integration', 'Representment Filing'] },
  { name: 'Chargeback Gurus', type: 'dispute_management', category: 'hospitality', features: ['Early Alert System', 'Analytics Dashboard', 'Expert Dispute Management'] },
  { name: 'ChargebackHelp', type: 'dispute_management', category: 'hospitality', features: ['Multi-Tool Integration', 'Verifi CDRN Integration', 'Ethoca Alerts Integration'] },
  { name: 'Clearview', type: 'dispute_management', category: 'hospitality', features: ['Proactive Dispute Alerting', 'Automated Evidence Collection', 'Real-time Risk Monitoring'] },
  { name: 'Verifi (Visa)', type: 'card_network', category: 'network', features: ['Visa CDRN Alerts', 'RDR (Rapid Dispute Resolution)', 'Order Insight'] },
  { name: 'Ethoca (Mastercard)', type: 'card_network', category: 'network', features: ['Consumer Clarity', 'Alerts Service', 'Collaboration Network'] },
  { name: 'Chargebacks911', type: 'dispute_management', category: 'general', features: ['Chargeback Alerts', 'Prevention Tools', 'Recovery Services'] },
  { name: 'Riskified', type: 'dispute_management', category: 'general', features: ['Debt Recovery', 'Dispute Automation', 'Evidence Compilation'] },
  { name: 'Chargeblast', type: 'dispute_management', category: 'general', features: ['Real-time Alerts', 'Evidence Compilation', 'Dispute Prevention'] },
  { name: 'Midigator (CAVU)', type: 'dispute_management', category: 'general', features: ['Dispute Intelligence', 'Automated Responses', 'Analytics & Reporting'] },
  { name: 'CAVU', type: 'dispute_management', category: 'general', features: ['Hospitality Focus', 'Real-time Alerts', 'Evidence Collection'] },
  { name: 'TailoredPay', type: 'dispute_management', category: 'general', features: ['Fraud Prevention', 'Chargeback Management', 'High-Risk Support'] },
  { name: 'Visa VROL', type: 'card_network', category: 'network', features: ['Visa Resolve Online', 'Dispute Portal', 'Evidence Upload'] },
  { name: 'Mastercom', type: 'card_network', category: 'network', features: ['Mastercard Dispute Portal', 'Case Management', 'Evidence Submission'] },
  { name: 'Amex Merchant', type: 'card_network', category: 'network', features: ['American Express Disputes', 'Merchant Dashboard', 'Evidence Upload'] },
  { name: 'Discover Disputes', type: 'card_network', category: 'network', features: ['Discover Dispute Portal', 'Case Tracking', 'Response Filing'] },
  { name: 'Chase Merchant Services', type: 'processor', category: 'general', features: ['Merchant Portal', 'Dispute Management', 'Transaction Lookup'] },
  { name: 'Stripe Disputes', type: 'processor', category: 'general', features: ['Stripe Dashboard', 'Evidence Submission', 'Automated Alerts'] },
  { name: 'PayPal Resolution', type: 'processor', category: 'general', features: ['Resolution Center', 'Dispute Tracking', 'Seller Protection'] },
];

function TypeBadge({ type }) {
  const styles = {
    dispute_management: 'bg-blue-100 text-blue-700',
    card_network: 'bg-purple-100 text-purple-700',
    processor: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[type] || styles.processor}`}>
      <CreditCard className="w-3 h-3 mr-1" />
      {type?.replace('_', ' ') || 'Other'}
    </span>
  );
}

function CompanyCard({ company }) {
  const isActive = company.status === 'active';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">{company.name}</h3>
        </div>
        {company.status ? (
          isActive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
              <CheckCircle className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              <XCircle className="w-3 h-3" /> Inactive
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            <XCircle className="w-3 h-3" /> Not Connected
          </span>
        )}
      </div>

      <TypeBadge type={company.type} />

      {company.features && company.features.length > 0 && (
        <ul className="mt-3 space-y-1">
          {company.features.slice(0, 3).map((f, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" /> {f}
            </li>
          ))}
        </ul>
      )}

      <button className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
        <Settings className="w-4 h-4" />
        Configure
      </button>
    </div>
  );
}

export default function DisputeIntegration() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/disputes/companies');
        if (res?.companies?.length || res?.data?.companies?.length) {
          setCompanies(res.companies || res.data.companies);
        }
      } catch (err) {
        console.debug('Could not fetch dispute companies:', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  const displayCompanies = companies.length > 0 ? companies : PLACEHOLDER_COMPANIES;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispute Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage integrations with dispute management and card network providers
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
              <div className="h-8 bg-gray-100 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayCompanies.map((company, idx) => (
            <CompanyCard key={company.name || idx} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
