/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Tutorial / Welcome Modal + Floating Help System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  HelpCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Shield,
  BookOpen,
  LayoutDashboard,
  FileText,
  CalendarCheck,
  BarChart3,
  Settings,
  Link2,
  MessageCircle
} from 'lucide-react';

const STORAGE_KEY = 'disputeai_tutorial_complete';

/* ------------------------------------------------------------------ */
/*  Tutorial steps                                                     */
/* ------------------------------------------------------------------ */
const STEPS = [
  {
    title: 'Welcome to DisputeAI',
    description:
      'DisputeAI is an AI-powered chargeback defense platform designed for hotels. It automates evidence collection, generates compelling dispute responses, and integrates with your PMS, payment processors, and card networks to maximize your win rate.',
    features: [
      'AI-powered evidence collection from PMS records',
      'Automated dispute response generation',
      'Real-time chargeback monitoring and alerts',
      'Integration with Visa VROL, Mastercom, and more',
      'Comprehensive analytics and reporting',
    ],
  },
  {
    title: 'Getting Started - Demo Mode',
    description:
      'DisputeAI is running in demo mode with sample data. You can explore all features without connecting a real PMS or payment processor.',
    features: [
      'Demo login: admin@disputeai.com / DisputeAdmin123!',
      'Browse sample cases with realistic hotel dispute data',
      'View reservation details and guest folios',
      'Explore the analytics dashboard',
      'Test the AI defense recommendation engine',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Quick nav links for the help panel                                 */
/* ------------------------------------------------------------------ */
const QUICK_LINKS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Cases', href: '/cases', icon: FileText },
  { label: 'Reservations', href: '/reservations', icon: CalendarCheck },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'PMS Integration', href: '/pms', icon: Link2 },
  { label: 'Dispute Companies', href: '/disputes', icon: Shield },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Tutorial', href: '/tutorial', icon: BookOpen },
];

/* ------------------------------------------------------------------ */
/*  Tutorial (Welcome Modal)                                           */
/* ------------------------------------------------------------------ */
function Tutorial() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setShow(true);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!show) return null;

  const currentStep = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6" />
              <span className="text-sm font-medium opacity-80">DisputeAI</span>
            </div>
            <button
              onClick={handleComplete}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="mt-3 text-xl font-bold">{currentStep.title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 mb-4">{currentStep.description}</p>
          <ul className="space-y-2">
            {currentStep.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <ArrowRight className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {step < STEPS.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                'Get Started'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HelpPanel                                                          */
/* ------------------------------------------------------------------ */
function HelpPanel({ onClose }) {
  const navigate = useNavigate();

  const handleResetTutorial = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  const handleNavigate = (href) => {
    navigate(href);
    onClose();
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          <span className="text-sm font-semibold">Help & Navigation</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/20">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick links */}
      <div className="p-3">
        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Quick Navigation</p>
        <div className="space-y-0.5">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => handleNavigate(link.href)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Icon className="w-4 h-4 text-gray-400" />
                {link.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset tutorial */}
      <div className="px-3 pb-3">
        <button
          onClick={handleResetTutorial}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <BookOpen className="w-3 h-3" />
          Reset Tutorial
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HelpButton (floating)                                              */
/* ------------------------------------------------------------------ */
function HelpButton() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <button
        onClick={() => {
          setPanelOpen(!panelOpen);
          setShowPulse(false);
        }}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 flex items-center justify-center transition-all hover:scale-105"
      >
        {showPulse && (
          <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-50" />
        )}
        <HelpCircle className="w-6 h-6 relative" />
      </button>

      {panelOpen && <HelpPanel onClose={() => setPanelOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */
export { Tutorial as default, HelpButton, HelpPanel };
