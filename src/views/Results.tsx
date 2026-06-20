import React from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { CheckCircle2, TrendingUp, Users, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ELECTION_DATA } from '../constants';

const Results: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [turnoutData, setTurnoutData] = React.useState({ total_eligible: 150, votes_cast: 0, turnout_percentage: 0 });

  React.useEffect(() => {
    const fetchTurnout = async () => {
      try {
        const res = await fetch('/api/results/turnout');
        if (res.ok) {
          const data = await res.json();
          setTurnoutData({
            total_eligible: data.total_eligible,
            votes_cast: data.votes_cast,
            turnout_percentage: data.turnout_percentage
          });
        }
      } catch (err) {
        console.error('Failed to fetch turnout', err);
      }
    };
    
    fetchTurnout();
    
    // Optional polling: refresh every 10 seconds
    const interval = setInterval(fetchTurnout, 10000);
    return () => clearInterval(interval);
  }, []);

  const { total_eligible: TOTAL_ELIGIBLE, votes_cast: VOTES_CAST, turnout_percentage: turnoutPercentage } = turnoutData;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col space-y-6 self-start">
      <div className="bg-white p-8 border-2 border-slate-200 rounded-xl shadow-sm">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Live Turnout Metrics</h3>
            <p className="text-slate-500 mt-1 text-sm font-medium">Welcome back, {user?.name || 'Voter'}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-slate-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-green-50 rounded-lg p-4 flex items-start border border-green-200 mb-8">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-3 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-green-800 uppercase tracking-wide">Vote Recorded</h3>
            <p className="text-xs text-green-700 mt-1 font-medium">
              Thank you for participating. Your vote has been securely anonymized and recorded in the ledger.
            </p>
          </div>
        </div>

        <div className="relative flex flex-col items-center justify-center mb-8">
          {/* Circular Progress Meter */}
          <div className="relative w-48 h-48">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path 
                className="text-slate-100" 
                strokeWidth="3" 
                stroke="currentColor" 
                fill="transparent" 
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
              />
              <motion.path 
                className="text-blue-600" 
                strokeWidth="3" 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                strokeDasharray="100, 100"
                initial={{ strokeDashoffset: 100 }}
                animate={{ strokeDashoffset: 100 - turnoutPercentage }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-blue-900">{turnoutPercentage}%</span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Participation</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg flex justify-between items-center border border-slate-100 hover:border-slate-300 transition-colors">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Votes Cast</p>
              <p className="text-2xl font-black text-slate-900">{VOTES_CAST}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-slate-300" />
          </div>
          <div className="bg-slate-50 p-4 rounded-lg flex justify-between items-center border border-slate-100 hover:border-slate-300 transition-colors">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Total Eligible</p>
              <p className="text-2xl font-black text-slate-900">{TOTAL_ELIGIBLE}</p>
            </div>
            <Users className="w-8 h-8 text-slate-300" />
          </div>
        </div>
      </div>

      <div className="bg-white p-8 border-2 border-slate-200 rounded-xl shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight mb-6">Your Cast Ballot</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ELECTION_DATA.map((category) => {
            const selectedId = user?.userBallot?.[category.position];
            const candidate = category.candidates.find(c => c.id === selectedId);
            return (
              <div key={category.position} className="bg-slate-50 p-4 border border-slate-200 rounded-lg">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{category.position}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900">{candidate?.name || 'Not selected'}</span>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 border-2 border-slate-200 rounded-xl shadow-sm">
        <div className="bg-blue-50 p-4 rounded-lg flex items-center space-x-3 border border-blue-100">
          <div className="bg-blue-600 p-2 rounded">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <p className="text-[10px] text-blue-900 leading-tight font-bold uppercase">
            Encrypted End-to-End <br/> SHA-256 Integrity Validated
          </p>
        </div>
        <div className="mt-4 text-center text-[10px] text-slate-400 uppercase font-bold tracking-wider">
          Candidate standings remain hidden until the election concludes.
        </div>
      </div>
    </div>
  );
};

export default Results;
