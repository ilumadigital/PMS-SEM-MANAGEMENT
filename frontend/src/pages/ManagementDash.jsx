import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';

const ManagementDash = () => {
    const { user, logout } = useContext(AuthContext);
    const [loading, setLoading] = useState(true);
    
    const stats = {
        todayArrivals: 12,
        pendingBookings: 5,
        totalGuests: 142,
        completedCleanings: 8,
    };

    useEffect(() => {
        setTimeout(() => setLoading(false), 600);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C29C71]"></div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#0A0A0A] font-sans overflow-hidden text-[#ACAFAE]">
            
            {/* SIDEBAR (SEM Dark Charcoal #222222) */}
            <aside className="w-64 bg-[#222222] text-[#ACAFAE] flex flex-col transition-all duration-300 shadow-2xl z-20 border-r border-[#C29C71]/10">
                {/* Logo Area */}
                <div className="h-20 flex items-center px-6 border-b border-[#0A0A0A]">
                    <div className="font-bold text-xl tracking-wider flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[#C29C71] flex items-center justify-center shadow-lg shadow-[#C29C71]/20">
                            <span className="text-[#0A0A0A] font-black text-sm">S</span>
                        </div>
                        <span className="text-white font-bold">SEM <span className="text-[#C29C71] font-light text-xs tracking-widest block text-[10px] -mt-1">PORTAL</span></span>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    <NavItem icon={<HomeIcon />} label="DASHBOARD" active />
                    <NavItem icon={<CalendarIcon />} label="ΚΡΑΤΗΣΕΙΣ" />
                    <NavItem icon={<UsersIcon />} label="ΠΕΛΑΤΕΣ" />
                    <NavItem icon={<KeyIcon />} label="ΔΩΜΑΤΙΑ" />
                    <NavItem icon={<ChartIcon />} label="ΣΤΑΤΙΣΤΙΚΑ" />
                    <NavItem icon={<SettingsIcon />} label="ΡΥΘΜΙΣΕΙΣ" />
                </nav>

                {/* User Area / Logout */}
                <div className="p-4 border-t border-[#0A0A0A]">
                    <button 
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#ACAFAE]/60 rounded-lg hover:bg-[#0A0A0A] hover:text-[#C29C71] transition-colors"
                    >
                        <LogoutIcon />
                        <span>Αποσύνδεση</span>
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                
                {/* TOPBAR (SEM Dark Charcoal #222222) */}
                <header className="h-20 bg-[#222222] border-b border-[#0A0A0A] flex items-center justify-between px-8 z-10 shadow-sm">
                    <div className="text-xs font-bold text-[#C29C71] tracking-widest">
                        DASHBOARD OVERVIEW
                    </div>
                    
                    {/* Search Bar */}
                    <div className="hidden md:flex items-center flex-1 max-w-xl mx-8">
                        <div className="relative w-full">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#ACAFAE]/40">
                                <SearchIcon />
                            </span>
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-2 bg-[#0A0A0A] border border-[#0A0A0A] text-white placeholder-[#ACAFAE]/40 text-sm rounded-lg focus:outline-none focus:border-[#C29C71] transition-all" 
                                placeholder="Αναζήτηση κράτησης, πελάτη, δωματίου..."
                            />
                        </div>
                    </div>

                    {/* Right User Info */}
                    <div className="flex items-center gap-4">
                        <button className="w-10 h-10 rounded-lg bg-[#0A0A0A] text-[#C29C71] flex items-center justify-center hover:border hover:border-[#C29C71]/30 transition-colors">
                            <BellIcon />
                        </button>
                        <div className="text-right hidden md:block">
                            <div className="text-sm font-bold text-white">{user?.firstName} {user?.lastName}</div>
                            <div className="text-[10px] text-[#C29C71] font-bold tracking-widest uppercase">{user?.role}</div>
                        </div>
                    </div>
                </header>

                {/* DASHBOARD CONTENT (SEM Deep Black #0A0A0A background) */}
                <div className="flex-1 overflow-y-auto p-8 bg-[#0A0A0A]">
                    <div className="max-w-7xl mx-auto space-y-8">
                        
                        {/* WELCOME BANNER (SEM Charcoal to Black Gradient with Gold border) */}
                        <div className="relative bg-gradient-to-r from-[#222222] to-[#0A0A0A] border border-[#C29C71]/20 rounded-xl p-10 overflow-hidden shadow-lg">
                            <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_1px_1px,#C29C71_1px,transparent_0)] [background-size:20px_20px]"></div>
                            
                            <div className="relative z-10">
                                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                                    Καλησπέρα, <span className="text-[#C29C71]">{user?.firstName || 'Admin'}</span>!
                                </h1>
                                <p className="text-[#ACAFAE] tracking-widest text-xs font-semibold uppercase">
                                    Καλώς ορίσατε στο Georgali Travel Control Center
                                </p>
                            </div>
                        </div>

                        {/* STATS CARDS GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="ΤΑΞΙΔΙΑ ΣΗΜΕΡΑ" value={stats.todayArrivals} icon={<AirplaneIcon />} />
                            <StatCard title="ΕΚΚΡΕΜΕΙΣ ΚΡΑΤΗΣΕΙΣ" value={stats.pendingBookings} icon={<ClockIcon />} />
                            <StatCard title="ΣΥΝΟΛΟ ΠΕΛΑΤΩΝ" value={stats.totalGuests} icon={<UsersGroupIcon />} />
                            <StatCard title="ΟΛΟΚΛΗΡΩΜΕΝΑ" value={stats.completedCleanings} icon={<CheckIcon />} />
                        </div>

                        {/* DATA TABLE SECTION */}
                        <div className="bg-[#222222] rounded-xl shadow-xl border border-[#C29C71]/10 overflow-hidden">
                            <div className="px-6 py-5 border-b border-[#0A0A0A] flex justify-between items-center">
                                <h3 className="text-xs font-bold text-[#C29C71] tracking-widest flex items-center gap-2">
                                    <ListIcon />
                                    ΠΡΟΣΦΑΤΕΣ ΚΡΑΤΗΣΕΙΣ
                                </h3>
                                <button className="text-[10px] font-bold text-[#C29C71] hover:text-white uppercase tracking-widest transition-colors">
                                    ΠΡΟΒΟΛΗ ΟΛΩΝ
                                </button>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#0A0A0A]/40">
                                            <th className="px-6 py-4 text-xs font-bold text-[#C29C71] uppercase tracking-wider border-b border-[#0A0A0A]">ΠΕΛΑΤΗΣ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-[#C29C71] uppercase tracking-wider border-b border-[#0A0A0A]">ΔΙΑΔΡΟΜΗ & ΚΑΤΕΥΘΥΝΣΗ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-[#C29C71] uppercase tracking-wider border-b border-[#0A0A0A]">ΗΜΕΡ/NIA & ΩΡΑ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-[#C29C71] uppercase tracking-wider border-b border-[#0A0A0A]">ΚΑΤΑΣΤΑΣΗ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan="4" className="px-6 py-12 text-center text-[#ACAFAE]/50 text-sm">
                                                Δεν βρέθηκαν πρόσφατες κρατήσεις.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

/* --- ΕΣΩΤΕΡΙΚΑ ΜΙΚΡΑ COMPONENTS --- */
const NavItem = ({ icon, label, active }) => (
    <a href="#" className={`flex items-center gap-4 px-4 py-3 rounded-lg text-xs font-bold tracking-widest transition-all ${active ? 'bg-[#0A0A0A] text-[#C29C71] border-l-2 border-[#C29C71]' : 'text-[#ACAFAE]/60 hover:bg-[#0A0A0A]/50 hover:text-white'}`}>
        <span>{icon}</span>
        <span>{label}</span>
    </a>
);

const StatCard = ({ title, value, icon }) => (
    <div className="bg-[#222222] rounded-xl p-6 shadow-lg border border-[#C29C71]/5 flex flex-col justify-between hover:border-[#C29C71]/20 transition-all group">
        <div className="flex justify-between items-start mb-4">
            <h3 className="text-[10px] font-bold text-[#ACAFAE]/70 uppercase tracking-widest w-2/3 leading-relaxed">{title}</h3>
            <div className="w-8 h-8 rounded-lg bg-[#0A0A0A] text-[#C29C71] flex items-center justify-center group-hover:scale-110 transition-transform">
                {icon}
            </div>
        </div>
        <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
    </div>
);

/* --- INLINE SVGs --- */
const HomeIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const CalendarIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const UsersIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const KeyIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>;
const ChartIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const SettingsIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const LogoutIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const SearchIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const BellIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const AirplaneIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const ClockIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const UsersGroupIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const CheckIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ListIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;

export default ManagementDash;