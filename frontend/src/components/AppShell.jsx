import React, { useCallback, useContext, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import { initials } from './PmsUi';
import PmsAutoRefreshBridge from './PmsAutoRefreshBridge';
import SemLogo from './SemLogo';

const Icon = ({ name, className = 'h-5 w-5' }) => {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    reception: <><path d="M4 20V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12"/><path d="M3 20h18M8 11h8M8 15h8"/></>,
    bookings: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2"/></>,
    guests: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 11a4 4 0 0 1 5 4v2"/></>,
    rooms: <><path d="M3 20V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12M3 14h18"/></>,
    housekeeping: <><path d="M4 20h16M8 20l2-10h4l2 10M9 6h6"/></>,
    shuttle: <><path d="M3 16V8a2 2 0 0 1 2-2h10l4 4v6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M15 6v4h4M3 13h16"/></>,
    insights: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></>,
    portal: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

const M = ['admin', 'manager', 'management'];
const groups = [
  { label: 'Front office', items: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: [...M, 'reception', 'supervisor'] },
    { to: '/reception', label: 'Front Desk', icon: 'reception', roles: [...M, 'reception'] },
    { to: '/calendar', label: 'Calendar', icon: 'calendar', roles: [...M, 'reception', 'supervisor'] },
    { to: '/bookings', label: 'Reservations', icon: 'bookings', roles: [...M, 'reception', 'supervisor'] },
    { to: '/guest-management', label: 'Guest Portal', icon: 'portal', roles: [...M, 'reception', 'supervisor'] },
    { to: '/customers', label: 'Guests', icon: 'guests', roles: [...M, 'reception'] },
    { to: '/rooms', label: 'Rooms', icon: 'rooms', roles: [...M, 'reception', 'supervisor'] },
  ]},
  { label: 'Housekeeping', items: [
    { to: '/cleaning-mobile', label: 'Housekeeping Admin', icon: 'housekeeping', roles: [...M, 'supervisor', 'cleaneradmin'] },
    { to: '/my-cleaning', label: 'My Cleaning Schedule', icon: 'calendar', roles: ['cleaner', 'cleaning'] },
  ]},
  { label: 'Mobility', items: [
    { to: '/shuttle', label: 'Free Shuttle', icon: 'shuttle', roles: [...M, 'reception', 'supervisor', 'driversadmin', 'dispatcher'] },
    { to: '/my-shuttles', label: 'My Free Shuttles', icon: 'calendar', roles: ['driver'] },
  ]},
  { label: 'Management', items: [
    { to: '/supervisor', label: 'Supervisor', icon: 'reception', roles: [...M, 'supervisor'] },
    { to: '/statistics', label: 'Reports', icon: 'insights', roles: [...M, 'supervisor'] },
    { to: '/settings', label: 'Developer Settings', icon: 'settings', roles: ['admin'] },
  ]},
];
const titles = Object.fromEntries(groups.flatMap((group) => group.items.map((item) => [item.to, item.label])));

const AppShell = () => {
  const { user, logout } = useContext(AuthContext);
  const cloudbeds = useContext(CloudbedsDataContext);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageRevision, setPageRevision] = useState(0);
  const bumpPageRevision = useCallback(() => setPageRevision((revision) => revision + 1), []);

  const userRole = String(user?.role || '').toLowerCase();
  const displayName = useMemo(
    () => user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : user?.name || user?.email || 'SEM User',
    [user]
  );
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes('*') || item.roles.includes(userRole)) }))
    .filter((group) => group.items.length);
  const mobileItems = visibleGroups.flatMap((group) => group.items).slice(0, 4);

  const roleLimited = ['cleaner','cleaning','driver'].includes(userRole);
  const ready = cloudbeds.status?.connected && cloudbeds.status?.dataStatus === 'ready';
  const authorized = cloudbeds.status?.authorized || cloudbeds.status?.connected;

  const sidebar = (
    <div className="flex h-full flex-col overflow-hidden bg-[#0b1220] text-slate-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.18),transparent_34%),radial-gradient(circle_at_90%_90%,rgba(14,165,233,0.10),transparent_30%)]" />
      <div className="relative flex h-[72px] items-center border-b border-white/[0.08] px-5">
        <div className="min-w-0">
          <SemLogo inverted className="h-8 w-auto max-w-[148px]" />
          <div className="mt-1 text-[10px] font-medium tracking-[0.04em] text-slate-400">Estate & Mobility Operations</div>
        </div>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 py-5">
        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-white/[0.10] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                >
                  {({ isActive }) => <>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/30' : 'bg-white/[0.04] text-slate-400 group-hover:text-slate-200'}`}>
                      <Icon name={item.icon} className="h-[17px] w-[17px] shrink-0" />
                    </span>
                    <span>{item.label}</span>
                  </>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/[0.08] p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.10] text-xs font-semibold text-white">{initials(displayName)}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{displayName}</div>
            <div className="mt-0.5 truncate text-[11px] font-normal text-slate-400">{user?.role || 'User'}</div>
          </div>
        </div>
        <button onClick={logout} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white">Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="pms-app min-h-screen bg-[#f5f7fb] text-slate-900">
      <PmsAutoRefreshBridge onRevision={bumpPageRevision} />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] xl:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <aside className="pms-mobile-drawer relative h-full w-[min(84vw,320px)] shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="xl:pl-[252px]">
        <header className="sticky top-0 z-30 flex min-h-[64px] items-center border-b border-slate-200/80 bg-white/92 px-3 py-2 backdrop-blur-xl sm:min-h-[72px] sm:px-5 lg:px-6 xl:px-8">
          <button onClick={() => setMobileOpen(true)} className="mr-2 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm xl:hidden" aria-label="Open navigation"><Icon name="menu" /></button>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-950 sm:text-[16px]">{titles[location.pathname] || 'SEM PMS'}</div>
            <div className="mt-0.5 hidden text-xs font-normal text-slate-500 md:block">{roleLimited ? 'Assigned schedule access only' : ready ? 'Live data · automatic refresh enabled' : authorized ? 'Cloudbeds authorized · validation in progress' : 'Cloudbeds connection required'}</div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium md:flex ${roleLimited ? 'border-slate-200 bg-slate-50 text-slate-600' : cloudbeds.error ? 'border-rose-200 bg-rose-50 text-rose-700' : ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : authorized ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              <span className={`h-2 w-2 rounded-full ${roleLimited ? 'bg-blue-500' : cloudbeds.error ? 'bg-rose-500' : ready ? 'bg-emerald-500' : authorized ? 'bg-amber-500' : 'bg-slate-400'}`} />
              {roleLimited ? 'Schedule only' : cloudbeds.error ? 'Sync issue' : ready ? 'Cloudbeds synced' : authorized ? 'Connected' : 'Not connected'}
            </div>
            {!roleLimited && <button onClick={cloudbeds.refresh} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50" title="Refresh PMS data">
              <Icon name="refresh" className={`h-[18px] w-[18px] ${cloudbeds.loading ? 'animate-spin' : ''}`} />
            </button>}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white shadow-sm">{initials(displayName)}</div>
          </div>
        </header>

        <main className="min-h-[calc(100dvh-64px)] bg-[radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.055),transparent_30%),linear-gradient(180deg,#f8faff_0%,#f5f7fb_45%,#f5f7fb_100%)] sm:min-h-[calc(100dvh-72px)]">
          <div className="mx-auto max-w-[1640px] px-3 py-4 pb-28 sm:px-5 sm:py-6 sm:pb-28 lg:px-6 xl:px-8 xl:py-7 xl:pb-7">
            <Outlet key={`${location.pathname}:${pageRevision}`} />
          </div>
        </main>

        <nav className="pms-mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-2 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl xl:hidden" aria-label="Quick navigation">
          <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
            {mobileItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}
              >
                <Icon name={item.icon} className="h-[19px] w-[19px]" />
                <span className="max-w-full truncate">{item.label.replace(' Schedule','')}</span>
              </NavLink>
            ))}
            <button onClick={() => setMobileOpen(true)} className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold text-slate-500">
              <Icon name="menu" className="h-[19px] w-[19px]" />
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default AppShell;
