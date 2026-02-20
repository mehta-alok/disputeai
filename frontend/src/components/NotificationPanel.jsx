/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Notification Panel Component
 */

import React from 'react';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  XCircle,
  X
} from 'lucide-react';

const TYPE_CONFIG = {
  URGENT: { icon: AlertTriangle, bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  SUCCESS: { icon: CheckCircle, bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  WARNING: { icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  INFO: { icon: Info, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
};

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const t = new Date(timestamp);
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function NotificationPanel({ notifications = [], onClose, onMarkAllRead }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-900">Notifications</span>
          {notifications.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
              {notifications.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Notification list */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center">
            <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No notifications</p>
          </div>
        ) : (
          notifications.map((notification, idx) => {
            const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.INFO;
            const Icon = config.icon;
            return (
              <div
                key={notification.id || idx}
                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  notification.read ? 'opacity-60' : ''
                }`}
              >
                <div className={`flex-shrink-0 p-1.5 rounded-lg ${config.bg}`}>
                  <Icon className={`w-4 h-4 ${config.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-gray-900 ${notification.read ? 'font-normal' : ''}`}>
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{formatTimeAgo(notification.timestamp || notification.createdAt)}</p>
                </div>
                {!notification.read && (
                  <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-indigo-500" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onMarkAllRead}
            className="w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 py-1"
          >
            Mark all as read
          </button>
        </div>
      )}
    </div>
  );
}
