import React, { useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', eyebrow: 'Overview' },
  { to: '/reception', label: 'Reception', eyebrow: 'Front desk' },
  { to: '/bookings', label: 'Bookings', eyebrow: 'Reservations' },
  { to: '/customers', label: 'Guests', eyebrow: 'Profiles' },
  { to: '/rooms', label: 'Rooms', eyebrow: 'Inventory' },
  { to: '/cleaning-mobile', label: 'Housekeeping', eyebrow: 'Cleaning' },
  { to: '/supervisor', label: 'Supervisor', eyebrow: 'Operations' },
  { to: '/statistics', label: 'Insights', eyebrow: 'Performance' },
  { to: '/settings', label: 'Settings', eyebrow: 'System' },
];

const AppShell = () => {
  const { user, logout } = useContext(AuthContext);

  const displayName = user?.firstName
    ? `${user.firstName} ${user?.lastName || ''}`.trim()
    : 'Giannis Admin';

  return (
    <div className="min-h-screen bg-[#070707] text-[#E8E1D5] font-sans">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-180px] right-[-120px] h-[420px] w-[420px] rounded-full bg-[#C9A46A]/10 blur-3xl" />
        <div className="absolute bottom-[-220px] left-[12%] h-[460px] w-[460px] rounded-full bg-[#756247]/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.035] bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="w-[292px] bg-[#1D1D1C]/95 border-r border-[#C9A46A]/10 flex flex-col">
          <div className="h-28 px-8 flex items-center border-b border-white/[0.04]">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl border border-[#C9A46A]/40 bg-[#C9A46A]/10 flex items-center justify-center">
                <span className="text-[#C9A46A] font-black tracking-tight text-lg">S</span>
              </div>

              <div>
                <div className="text-white text-2xl font-black tracking-[0.16em] leading-none">
                  SEM
                </div>
                <div className="mt-2 text-[9px] uppercase tracking-[0.32em] text-[#C9A46A]">
                  Estate & Mobility
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 pt-7 pb-4">
            <div className="text-[10px] uppercase tracking-[0.32em] text-[#8F8A82]">
              Operations
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'group relative flex items-center justify-between rounded-2xl px-4 py-4 transition-all duration-200',
                    isActive
                      ? 'bg-[#090909] text-white shadow-[inset_0_0_0_1px_rgba(201,164,106,0.22)]'
                      : 'text-[#A7A19A] hover:bg-white/[0.035] hover:text-white',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] font-bold">
                        {item.label}
                      </div>
                      <div
                        className={[
                          'mt-1 text-[10px] uppercase tracking-[0.18em]',
                          isActive ? 'text-[#C9A46A]' : 'text-[#6F6B66]',
                        ].join(' ')}
                      >
                        {item.eyebrow}
                      </div>
                    </div>

                    <div
                      className={[
                        'h-2 w-2 rounded-full transition-all',
                        isActive ? 'bg-[#C9A46A]' : 'bg-white/10 group-hover:bg-[#C9A46A]/60',
                      ].join(' ')}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="p-5 border-t border-white/[0.04]">
            <div className="rounded-2xl bg-[#090909] border border-[#C9A46A]/10 p-4 mb-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#8F8A82]">
                Signed in as
              </div>
              <div className="mt-2 text-sm font-bold text-white truncate">
                {displayName}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#C9A46A]">
                SEM Administrator
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full rounded-2xl border border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.24em] font-bold text-[#A7A19A] hover:text-white hover:border-[#C9A46A]/30 hover:bg-[#C9A46A]/5 transition-all"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="h-24 bg-[#1D1D1C]/90 backdrop-blur border-b border-white/[0.04] flex items-center justify-between px-10">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#C9A46A] font-bold">
                SEM Management
              </div>
              <div className="mt-2 text-xl text-white font-semibold tracking-tight">
                Private Operations Center
              </div>
            </div>

            <div className="hidden xl:flex items-center flex-1 max-w-2xl mx-10">
              <div className="relative w-full">
                <input
                  type="text"
                  className="w-full rounded-2xl bg-[#090909] border border-white/10 px-5 py-4 text-sm text-white placeholder:text-[#6F6B66] focus:outline-none focus:border-[#C9A46A]/45 transition-all"
                  placeholder="Search reservation, guest, room or task..."
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:block text-right">
                <div className="text-sm font-bold text-white">{displayName}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-[#C9A46A]">
                  Online
                </div>
              </div>

              <div className="h-11 w-11 rounded-full bg-[#C9A46A] text-[#090909] flex items-center justify-center text-sm font-black">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </header>

          <section className="h-[calc(100vh-96px)] overflow-y-auto">
            <div className="max-w-[1480px] mx-auto px-10 py-10">
              <Outlet />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default AppShell;