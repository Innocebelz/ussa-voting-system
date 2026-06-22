import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LOGO_URL = 'https://res.cloudinary.com/dbdgbj4qz/image/upload/v1782139265/logo_ze2vq7.jpg';

const Layout: React.FC = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [logoClicks, setLogoClicks] = useState(0);
    const [logoScale, setLogoScale] = useState(false);

    const isAdminPage = location.pathname === '/admin' || location.pathname === '/admin/login';

    // Secret handshake — 5 clicks navigates to admin login
    const handleSecretClick = () => {
        // Brief scale-up animation feedback on each click
        setLogoScale(true);
        setTimeout(() => setLogoScale(false), 150);

        const newCount = logoClicks + 1;
        setLogoClicks(newCount);

        if (newCount >= 5) {
            setLogoClicks(0);
            navigate('/admin/login');
        }

        setTimeout(() => setLogoClicks(0), 2000);
    };

    return (
        <div className="min-h-screen bg-stone-50 font-sans flex flex-col overflow-hidden text-zinc-900">

            {/* ── HEADER ───────────────────────────────────────────────── */}
            <header className="bg-zinc-900 text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-center border-b-4 border-yellow-500 space-y-4 sm:space-y-0 relative z-10 w-full shrink-0">

                {/* Left side — logo + title */}
                <div className="flex items-center space-x-4">

                    {/* Logo — click 5× to reach admin */}
                    <div
                        onClick={handleSecretClick}
                        title="U.S.S.A"
                        className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 cursor-pointer select-none overflow-hidden border-2 border-yellow-500 transition-transform duration-150 ${logoScale ? 'scale-110' : 'scale-100'}`}
                    >
                        {LOGO_URL ? (
                            <img
                                src={LOGO_URL}
                                alt="USSA Logo"
                                className="w-full h-full object-cover rounded-full"
                            />
                        ) : (
                            /* Fallback initials badge until the real logo URL is added */
                            <div className="w-full h-full bg-yellow-500 flex items-center justify-center">
                                <span className="text-zinc-900 font-black text-sm tracking-tight">USSA</span>
                            </div>
                        )}
                    </div>

                    {/* Title + motto */}
                    <div>
                        <h1 className="text-lg sm:text-xl font-black tracking-tight uppercase leading-tight">
                            Uganda Students' Association in Algeria
                        </h1>
                        <p className="text-yellow-400 text-[10px] font-bold tracking-widest uppercase mt-0.5">
                            'Unitè Triomphe Tout' &nbsp;·&nbsp; Electoral Portal
                        </p>
                    </div>
                </div>

                {/* Right side — session badge (only when logged in) */}
                {user && (
                    <div className="flex items-center space-x-5">
                        <div className="text-right border-r border-zinc-700 pr-5">
                            <p className={`text-[10px] uppercase tracking-widest font-bold ${isAdminPage ? 'text-yellow-400' : 'text-zinc-400'}`}>
                                {isAdminPage ? 'Elevated Access' : 'Verified Identity'}
                            </p>
                            <p className="font-mono text-sm text-white">
                                {isAdminPage ? 'ROLE: ADMINISTRATOR' : `MATRIC: ${user.matNumber}`}
                            </p>
                        </div>
                        <div className={`px-4 py-2 rounded text-xs font-bold flex items-center border ${isAdminPage ? 'bg-yellow-500 text-zinc-900 border-yellow-600' : 'bg-zinc-800 text-white border-zinc-700'}`}>
                            <span className={`w-2 h-2 rounded-full mr-2 ${isAdminPage ? 'bg-zinc-900' : 'bg-green-400 animate-pulse'}`}></span>
                            {isAdminPage ? 'SECURE MODE' : 'SESSION ACTIVE'}
                        </div>
                    </div>
                )}
            </header>

            {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-10 flex flex-col sm:flex-row overflow-y-auto">
                <Outlet />
            </main>

            {/* ── FOOTER ───────────────────────────────────────────────── */}
            <footer className="bg-zinc-900 h-10 flex items-center justify-between px-8 border-t border-yellow-500 shrink-0 select-none">

                {/* Left — copyright */}
                <div className="text-[10px] font-medium text-zinc-500 tracking-wide">
                    © 2026 USAA Electoral Committee. All Rights Reserved.
                </div>

                {/* Centre — social links */}
                <div className="flex items-center space-x-4">
                    {/* Facebook */}
                    <a
                        href="https://www.facebook.com/share/18qWFZKpMK/"
                        target="_blank"
                        rel="noreferrer"
                        title="USAA Facebook"
                        className="text-zinc-500 hover:text-yellow-400 transition-colors duration-200"
                    >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                        </svg>
                    </a>

                    {/* Instagram */}
                    <a
                        href="https://www.instagram.com/ugandan_students_in_algeria?igsh=MWN4cmZrZjU1eXN6dA=="
                        target="_blank"
                        rel="noreferrer"
                        title="USAA Instagram"
                        className="text-zinc-500 hover:text-yellow-400 transition-colors duration-200"
                    >
                        <svg className="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                        </svg>
                    </a>
                </div>

                {/* Right — system status */}
                <div className="flex space-x-2 items-center">
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Status:</span>
                    <div className="flex items-center space-x-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] text-zinc-500 font-mono tracking-tight">ONLINE</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
