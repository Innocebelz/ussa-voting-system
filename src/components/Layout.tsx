import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout: React.FC = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // State to track secret clicks
    const [logoClicks, setLogoClicks] = useState(0);

    const isAdminPage = location.pathname === '/admin';

    // The Secret Handshake function
    const handleSecretClick = () => {
        const newCount = logoClicks + 1;
        setLogoClicks(newCount);

        if (newCount >= 5) {
            setLogoClicks(0); // Reset the counter
            navigate('/admin'); // Teleport to the admin dashboard
        }

        // Automatically reset the counter after 2 seconds if they stop clicking
        setTimeout(() => setLogoClicks(0), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col overflow-hidden text-slate-900">
            <header className="bg-blue-950 text-white px-8 py-6 flex flex-col sm:flex-row justify-between items-center border-b-4 border-blue-600 space-y-4 sm:space-y-0 relative z-10 w-full shrink-0">
                <div className="flex items-center space-x-4">

                    {/* We added the click handler to the logo box here */}
                    <div
                        onClick={handleSecretClick}
                        className="w-12 h-12 bg-white rounded-md flex items-center justify-center shrink-0 cursor-pointer select-none"
                    >
                        <ShieldCheck className="w-8 h-8 text-blue-900" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight uppercase">UGANDA STUDENTS' ASSOCIATION IN ALGERIA (U.S.S.A)</h1>
                        <p className="text-blue-300 text-xs font-medium tracking-widest uppercase">Student Association Portal</p>
                    </div>
                </div>

                {user && (
                    <div className="flex items-center space-x-6">
                        <div className="text-right border-r border-blue-800 pr-6">
                            <p className={`text-xs uppercase tracking-widest ${isAdminPage ? 'text-amber-400 font-bold' : 'text-blue-300'}`}>
                                {isAdminPage ? 'Elevated Access' : 'Verified Identity'}
                            </p>
                            <p className="font-mono text-sm">
                                {isAdminPage ? 'ROLE: SYSTEM ADMINISTRATOR' : `MATRIC: ${user.matNumber}`}
                            </p>
                        </div>
                        <div className="bg-blue-800 px-4 py-2 rounded text-sm font-semibold flex items-center">
                            <span className={`w-2 h-2 rounded-full mr-2 ${isAdminPage ? 'bg-amber-400' : 'bg-green-400'}`}></span>
                            {isAdminPage ? 'Secure Mode' : 'Session Active'}
                        </div>
                    </div>
                )}
            </header>

            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-10 flex flex-col sm:flex-row overflow-y-auto">
                <Outlet />
            </main>

            <footer className="bg-slate-200 h-10 flex items-center px-8 border-t border-slate-300 shrink-0">
                <div className="flex space-x-4 items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Status:</span>
                    <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] text-slate-600 font-mono tracking-tight">NODES_SYNC_OK_12ms</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;