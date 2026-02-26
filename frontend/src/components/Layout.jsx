/**
 * DisputeAI - AI-Powered Chargeback Defense Platform
 * Main Layout Component
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  User,
  Building2,
  Shield,
  HelpCircle,
  Search,
  ChevronDown,
  Plus,
  Sun,
  Moon,
  Sunrise,
  Link2,
  BookOpen,
  CalendarCheck,
  RefreshCw,
  Globe,
  Phone,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  ExternalLink,
  Check
} from 'lucide-react';
import ChatHelp from './ChatHelp';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cases', href: '/cases', icon: FileText },
  { name: 'Reservations', href: '/reservations', icon: CalendarCheck },
  { name: 'PMS Integration', href: '/pms', icon: Link2 },
  { name: 'Dispute Companies', href: '/disputes', icon: Shield },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'OTA Integrations', href: '/ota', icon: Globe },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Contact Us', href: '/contact', icon: Phone },
  { name: 'Help & Tutorial', href: '/tutorial', icon: HelpCircle }
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good morning', icon: Sunrise };
    if (hour < 18) return { text: 'Good afternoon', icon: Sun };
    return { text: 'Good evening', icon: Moon };
  };

  const greeting = getGreeting();

  useEffect(() => {
    const fetchNotificationCount = async () => {
      try {
        const response = await api.get('/notifications/unread-count');
        // api.js interceptor unwraps .data, so response IS the data object
        if (response.success || response.count !== undefined) {
          setNotificationCount(response.count || 0);
        }
      } catch (error) {
        console.debug('Could not fetch notification count:', error.message);
      }
    };

    fetchNotificationCount();
    const interval = setInterval(fetchNotificationCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const response = await api.get('/notifications');
      const data = response.data || response;
      setNotifications(data.notifications || []);
      setNotificationCount(data.unreadCount || 0);
    } catch (err) {
      console.debug('Could not fetch notifications:', err.message);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const toggleNotifications = () => {
    if (!notificationsOpen) {
      fetchNotifications();
    }
    setNotificationsOpen(!notificationsOpen);
    setUserMenuOpen(false);
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
      setNotificationCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // Demo fallback: just update locally
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
      setNotificationCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
    } catch (err) {
      // Demo fallback
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setNotificationCount(0);
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) handleMarkAsRead(notif.id);
    if (notif.link) {
      navigate(notif.link);
      setNotificationsOpen(false);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'CHARGEBACK_ALERT': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'AI_ANALYSIS': return <Zap className="w-4 h-4 text-purple-500" />;
      case 'CASE_WON': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'DEADLINE_WARNING': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'EVIDENCE_COLLECTED': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'CASE_UPDATE': return <RefreshCw className="w-4 h-4 text-indigo-500" />;
      case 'DOCUMENT_UPLOADED': return <FileText className="w-4 h-4 text-teal-500" />;
      case 'ARBITRATION_FILED': return <Shield className="w-4 h-4 text-amber-600" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const getNotifPriorityDot = (priority) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-500';
      case 'MEDIUM': return 'bg-amber-500';
      case 'LOW': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  const formatTimeAgo = (dateStr) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <Link to="/" className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-blue-600">DisputeAI</h1>
                <p className="text-xs text-gray-500">Chargeback Defense</p>
              </div>
            </Link>
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            {user?.property && (
              <div className="mt-3 flex items-center text-xs text-gray-500">
                <Building2 className="w-4 h-4 mr-1.5" />
                {user.property.name}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            {/* Left side */}
            <div className="flex items-center space-x-4">
              <button
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-6 h-6 text-gray-500" />
              </button>

              <div className="hidden md:flex items-center space-x-2">
                <greeting.icon className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-sm text-gray-500">{greeting.text},</p>
                  <p className="text-base font-semibold text-gray-900">{user?.firstName || 'User'}</p>
                </div>
              </div>
            </div>

            {/* Center - Search Bar */}
            <div className="flex-1 max-w-xl mx-4 hidden md:block">
              <form onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  navigate({ pathname: '/cases', search: `?search=${encodeURIComponent(searchQuery.trim())}` });
                  setSearchQuery('');
                }
              }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search cases by guest, case number, or confirmation..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-gray-400"
                  />
                  <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 hidden lg:inline-flex items-center px-2 py-0.5 text-xs text-gray-400 bg-gray-100 rounded">
                    ⌘K
                  </kbd>
                </div>
              </form>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-2 lg:space-x-3">
              <button
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Search className="w-5 h-5 text-gray-500" />
              </button>

              <button
                className="hidden sm:flex items-center space-x-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                onClick={() => navigate({ pathname: '/cases', search: '?status=PENDING' })}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden lg:inline">Urgent Cases</span>
              </button>

              {/* Notification bell */}
              <div className="relative">
                <button
                  onClick={toggleNotifications}
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Bell className={`w-5 h-5 ${notificationsOpen ? 'text-blue-600' : 'text-gray-500'}`} />
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                      {notificationCount > 9 ? '9+' : notificationCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown Panel */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-fade-in z-50">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                        {notificationCount > 0 && (
                          <span className="text-xs font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">
                            {notificationCount}
                          </span>
                        )}
                      </div>
                      {notifications.some(n => !n.isRead) && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[400px] overflow-y-auto">
                      {notificationsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 px-4">
                          <Bell className="w-10 h-10 text-gray-300 mb-2" />
                          <p className="text-sm text-gray-500 font-medium">No notifications</p>
                          <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <button
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50/50 transition-colors ${
                              !notif.isRead ? 'bg-blue-50/30' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex-shrink-0">
                                {getNotifIcon(notif.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm truncate ${!notif.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                    {notif.title}
                                  </p>
                                  {!notif.isRead && (
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getNotifPriorityDot(notif.priority)}`} />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{formatTimeAgo(notif.createdAt)}</p>
                              </div>
                              {notif.link && (
                                <ExternalLink className="w-3 h-3 text-gray-300 mt-1 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
                        <button
                          onClick={() => { setNotificationsOpen(false); navigate('/cases'); }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          View all cases
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* User menu */}
              <div className="relative">
                <button
                  className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full ring-2 ring-white shadow-sm">
                    <span className="text-sm font-semibold text-white">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-sm font-medium text-gray-700">{user?.firstName}</p>
                    <p className="text-xs text-gray-500">{user?.role || 'User'}</p>
                  </div>
                  <ChevronDown className="hidden lg:block w-4 h-4 text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 animate-fade-in">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
                      {user?.property && (
                        <div className="mt-2 flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                          <Building2 className="w-3 h-3 mr-1" />
                          {user.property.name}
                        </div>
                      )}
                    </div>
                    <div className="py-1">
                      <Link
                        to="/settings"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings className="w-4 h-4 mr-3 text-gray-400" />
                        Settings
                      </Link>
                    </div>
                    <div className="border-t border-gray-100 pt-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Search Bar */}
          {showSearch && (
            <div className="md:hidden px-4 pb-3 animate-fade-in">
              <form onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  navigate({ pathname: '/cases', search: `?search=${encodeURIComponent(searchQuery.trim())}` });
                  setSearchQuery('');
                  setShowSearch(false);
                }
              }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search cases..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </form>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="px-4 py-6 text-center text-sm text-gray-500 lg:px-8">
          <p>DisputeAI - AI-Powered Chargeback Defense Platform</p>
          <p className="mt-1">&copy; 2026 DisputeAI. All rights reserved.</p>
        </footer>
      </div>

      {/* Click outside to close dropdowns */}
      {(userMenuOpen || notificationsOpen) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setUserMenuOpen(false); setNotificationsOpen(false); }}
        />
      )}

      {/* AI Help Chatbox */}
      <ChatHelp />

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden mobile-bottom-nav">
        <div className="flex items-center justify-around h-16">
          {[
            { name: 'Home', href: '/', icon: LayoutDashboard },
            { name: 'Cases', href: '/cases', icon: FileText },
            { name: 'Reservations', href: '/reservations', icon: CalendarCheck },
            { name: 'Analytics', href: '/analytics', icon: BarChart3 },
            { name: 'More', href: '#menu', icon: Menu, isMenu: true }
          ].map((item) => {
            const isActive = item.href !== '#menu' && (
              location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href))
            );
            const Icon = item.icon;

            if (item.isMenu) {
              return (
                <button
                  key={item.name}
                  onClick={() => setSidebarOpen(true)}
                  className="flex flex-col items-center justify-center flex-1 py-1 text-gray-400 hover:text-omni-600 transition-colors"
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] mt-0.5">{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
                  isActive ? 'text-omni-600' : 'text-gray-400 hover:text-omni-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-omni-600' : ''}`} />
                <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : ''}`}>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
