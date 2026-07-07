import React, { useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const menuItems = [
  { to: '/dashboard', label: 'DASHBOARD', icon: '⌂' },
  { to: '/bookings', label: 'ΚΡΑΤΗΣΕΙΣ', icon: '▣' },
  { to: '/customers', label: 'ΠΕΛΑΤΕΣ', icon: '♚' },
  { to: '/rooms', label: 'ΔΩΜΑΤΙΑ', icon: '⚿' },
  { to: '/statistics', label: 'ΣΤΑΤΙΣΤΙΚΑ', icon: '▥' },
  { to: '/settings', label: 'ΡΥΘΜΙΣΕΙΣ', icon: '⚙' },
];

const AppShell = () => {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#ACAFAE] flex font-sans">
      <aside className="w-64 bg-[#222222] border-r border-[#C29C71]/10 flex flex-col">
        <div className="h-20 flex items-center px-6 border-b border-[#0A0A0A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#C29C71] flex items-center justify-center text-[#0A0A0A] font-black text-sm">
              S
            </div>
            <div>
              <div className="text-white font-bold tracking-wider leading-none">SEM</div>
              <div className="text-[#C29C71] text-[10px] tracking-widest mt-1">PORTAL</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-lg text-xs font-bold tracking-widest transition-all ${
                  isActive
                    ? 'bg-[#0A0A0A] text-[#C29C71] border-l-2 border-[#C29C71]'
                    : 'text-[#ACAFAE]/60 hover:bg-[#0A0A0A]/50 hover:text-white'
                }`
              }
            >
              <span className="w-4 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[#0A0A0A]">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#ACAFAE]/60 rounded-lg hover:bg-[#0A0A0A] hover:text-[#C29C71] transition-colors"
          >
            <span>↩</span>
            <span>Αποσύνδεση</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-20 bg-[#222222] border-b border-[#0A0A0A] flex items-center justify-between px-8">
          <div className="text-xs font-bold text-[#C29C71] tracking-widest">
            SEM PMS MANAGEMENT
          </div>

          <div className="hidden md:flex items-center flex-1 max-w-xl mx-8">
            <input
              type="text"
              className="w-full px-4 py-2 bg-[#0A0A0A] border border-[#0A0A0A] text-white placeholder-[#ACAFAE]/40 text-sm rounded-lg focus:outline-none focus:border-[#C29C71]"
              placeholder="Αναζήτηση κράτησης, πελάτη, δωματίου..."
            />
          </div>

          <div className="text-right">
            <div className="text-white text-sm font-bold">
              {user?.firstName || 'User'} {user?.lastName || ''}
            </div>
            <div className="text-[#C29C71] text-[10px] tracking-widest">
              ADMIN
            </div>
          </div>
        </header>

        <div className="p-8 overflow-y-auto h-[calc(100vh-80px)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppShell;