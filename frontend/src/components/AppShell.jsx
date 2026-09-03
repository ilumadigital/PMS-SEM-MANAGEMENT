import React, { useContext, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { initials } from './PmsUi';

const Icon = ({ name, className = 'h-5 w-5' }) => {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    reception: <><path d="M4 20V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12" /><path d="M8 6V4h8v2" /><path d="M3 20h18" /><path d="M8 11h8M8 15h8" /></>,
    bookings: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="M8 14h3M8 17h6" /></>,
    guests: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" /><path d="M16 11a4 4 0 0 1 5 4v2" /></>,
    rooms: <><path d="M3 20V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12" /><path d="M3 14h18" /><path d="M7 10h3M14 10h3" /></>,
    housekeeping: <><path d="M4 20h16" /><path d="M8 20l2-10h4l2 10" /><path d="M9 6h6" /></>,
    shuttle: <><path d="M3 16V8a2 2 0 0 1 2-2h10l4 4v6" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M15 6v4h4M3 13h16" /></>,
    insights: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="M6 6l12 12M18 6 6 18" /></>,
    refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16" /></>,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const navGroups = [
  {
    label: 'Front office',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/reception', label: 'Front Desk', icon: 'reception' },
      { to: '/bookings', label: 'Reservations', icon: 'bookings' },
      { to: '/customers', label: 'Guests', icon: 'guests' },
      { to: '/rooms', label: 'Rooms', icon: 'rooms' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/cleaning-mobile', label: 'Housekeeping', icon: 'housekeeping' },
      { to: '/shuttle', label: 'Transfers', icon: 'shuttle' },
      { to: '/supervisor', label: 'Supervisor', icon: 'reception' },
    ],
  },
  {
    label: 'Management',
    items: [
      { to: '/statistics', label: 'Reports', icon: 'insights' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const routeTitles = {
  '/dashboard': 'Dashboard',
  '/reception': 'Front Desk',
  '/bookings': 'Reservations',
  '/customers': 'Guests',
  '/rooms': 'Rooms',
  '/cleaning-mobile': 'Housekeeping',
  '/shuttle': 'Transfers',
  '/supervisor': 'Supervisor',
  '/statistics': 'Reports',
  '/settings': 'Settings',
};

const AppShell = () => {
  const { user, logout } = useContext(AuthContext);
  const cloudbeds = useContext(CloudbedsDataContext);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = useMemo(() => {
    if (user?.firstName) return `${user.firstName} ${user?.lastName || ''}`.trim();
    if (user?.name) return user.name;
    return user?.email || 'SEM User';
  }, [user]);

  const currentTitle = routeTitles[location.pathname] || 'SEM PMS';
  const cloudbedsReady = cloudbeds.status?.connected && cloudbeds.status?.dataStatus === 'ready';
  const cloudbedsAuthorized = cloudbeds.status?.authorized || cloudbeds.status?.connected;
  const cloudbedsConnected = cloudbeds.status?.connected;
  const cloudbedsChecking = cloudbedsAuthorized && !cloudbeds.status?.dataStatus;

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-black text-white">S</div>
        <div className="ml-3 min-w-0">
          <div className="text-sm font-bold tracking-wide text-white">SEM PMS</div>
          <div className="text-[11px] text-slate-400">Property Management</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 rounded-lg bg-white/5 px-3 py-3">
          <div className="truncate text-sm font-semibold text-white">{displayName}</div>
          <div className="mt-0.5 truncate text-xs text-slate-400">{user?.role || 'Administrator'}</div>
        </div>
        <button
          onClick={logout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <aside className="relative h-full w-72 shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="mr-3 rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
            aria-label="Open menu"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-950">{currentTitle}</div>
            <div className="hidden text-xs text-slate-500 sm:block">
              {cloudbedsReady
                ? 'Live Cloudbeds sandbox data'
                : cloudbedsAuthorized
                  ? 'Cloudbeds authorized · PMS data validation in progress'
                  : 'Cloudbeds connection required'}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex ${
              cloudbeds.error
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : cloudbedsReady
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : cloudbedsAuthorized
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                cloudbeds.error
                  ? 'bg-rose-500'
                  : cloudbedsReady
                    ? 'bg-emerald-500'
                    : cloudbedsAuthorized
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
              }`} />
              {cloudbeds.error
                ? 'Sync issue'
                : cloudbedsReady
                  ? 'Cloudbeds synced'
                  : cloudbedsChecking
                    ? 'Connected · checking data'
                    : cloudbedsAuthorized
                      ? 'Authorized · PMS access needed'
                      : 'Not connected'}
            </div>

            <button
              onClick={cloudbeds.refresh}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              title="Refresh Cloudbeds"
            >
              <Icon name="refresh" className={`h-4.5 w-4.5 ${cloudbeds.loading ? 'animate-spin' : ''}`} />
            </button>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {initials(displayName)}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)]">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
