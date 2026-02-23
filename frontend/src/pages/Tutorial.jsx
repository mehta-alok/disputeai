import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, LayoutDashboard, FileText, CalendarCheck, Package,
  GitBranch, Settings, CheckCircle, ChevronLeft, ChevronRight,
  ArrowRight, Sparkles
} from 'lucide-react';

const STEPS = [
  {
    id: 0,
    title: 'Welcome to DisputeAI',
    description:
      'DisputeAI is your all-in-one hotel chargeback defense platform. This tutorial will walk you through the key features and help you get started with defending against fraudulent chargebacks. Each step covers a major area of the system.',
    icon: BookOpen,
    link: null,
  },
  {
    id: 1,
    title: 'Dashboard Overview',
    description:
      'The Dashboard is your command center. It shows real-time KPIs including active cases, win rate, amount recovered, and urgent items requiring attention. Monitor your chargeback defense performance at a glance and quickly identify cases that need immediate action.',
    icon: LayoutDashboard,
    link: '/',
  },
  {
    id: 2,
    title: 'Managing Cases',
    description:
      'The Cases page lists all your chargeback disputes. You can filter by status, search by guest or transaction details, and click into any case to view its full history. Each case tracks the dispute lifecycle from initial notification through evidence submission and final resolution.',
    icon: FileText,
    link: '/cases',
  },
  {
    id: 3,
    title: 'Reservations & PMS',
    description:
      'The Reservations page connects directly to your Property Management System (PMS). Search guest records, view reservation details, and pull evidence like folios, registration cards, and key card logs. This data is critical for building strong chargeback defense packages.',
    icon: CalendarCheck,
    link: '/reservations',
  },
  {
    id: 4,
    title: 'Evidence Collection',
    description:
      'Evidence is the backbone of chargeback defense. DisputeAI automatically collects and organizes evidence from your PMS including guest folios, ID scans, signed registration cards, key card access logs, CCTV snapshots, and guest correspondence. Strong evidence packages dramatically improve your win rate.',
    icon: Package,
    link: '/cases',
  },
  {
    id: 5,
    title: 'Defense Workflow',
    description:
      'The defense workflow guides each case through its lifecycle: detection, evidence gathering, AI-powered analysis, response drafting, submission, and outcome tracking. The system uses AI agents to analyze disputes and recommend optimal defense strategies based on reason codes and available evidence.',
    icon: GitBranch,
    link: '/analytics',
  },
  {
    id: 6,
    title: 'Settings & Configuration',
    description:
      'Configure your PMS integration, notification preferences, team members, and AI defense parameters in Settings. You can customize automated evidence collection rules, set up webhook integrations with payment processors, and fine-tune the AI defense engine for your property.',
    icon: Settings,
    link: '/settings',
  },
];

export default function Tutorial() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const step = STEPS[currentStep];
  const allCompleted = completedSteps.size === STEPS.length;

  const markComplete = () => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(currentStep);
      return next;
    });
  };

  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  // Progress
  const progressPercent = (completedSteps.size / STEPS.length) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-blue-600" />
            Interactive Tutorial
          </h1>
          <p className="text-sm text-gray-500 mt-1">Learn how to use DisputeAI step by step</p>
        </div>
        <div className="text-sm text-gray-600 font-medium">
          {completedSteps.size} of {STEPS.length} steps completed
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm font-medium text-blue-600">{Math.round(progressPercent)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Completion Screen */}
      {allCompleted ? (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <Sparkles className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Congratulations!</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            You have completed all tutorial steps. You are now ready to start defending against chargebacks with DisputeAI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </Link>
            <Link
              to="/cases"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              View Cases
            </Link>
            <Link
              to="/reservations"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              <CalendarCheck className="w-4 h-4" />
              Browse Reservations
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Step Navigation Sidebar + Content */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Step List */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 p-3">
              <nav className="space-y-1">
                {STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  const isActive = idx === currentStep;
                  const isCompleted = completedSteps.has(idx);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setCurrentStep(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-blue-50 border border-blue-200 text-blue-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg ${
                        isCompleted
                          ? 'bg-green-100'
                          : isActive
                          ? 'bg-blue-100'
                          : 'bg-gray-100'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                        )}
                      </div>
                      <span className={`text-sm font-medium truncate ${
                        isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-700'
                      }`}>
                        {s.title}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Step Content */}
            <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <step.icon className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                    Step {currentStep + 1} of {STEPS.length}
                  </p>
                  <h2 className="text-xl font-bold text-gray-900">{step.title}</h2>
                </div>
              </div>

              <p className="text-gray-600 leading-relaxed mb-6">{step.description}</p>

              {/* Link to Page */}
              {step.link && (
                <Link
                  to={step.link}
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 mb-6"
                >
                  <ArrowRight className="w-4 h-4" />
                  Go to {step.title} page
                </Link>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  onClick={goPrev}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <div className="flex items-center gap-3">
                  {!completedSteps.has(currentStep) ? (
                    <button
                      onClick={markComplete}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark Complete
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-green-600 font-medium">
                      <CheckCircle className="w-4 h-4" />
                      Completed
                    </span>
                  )}

                  <button
                    onClick={goNext}
                    disabled={currentStep === STEPS.length - 1}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
