import React, { useState, useEffect, useRef } from 'react';
import { ELECTION_DATA } from '../constants';
import {
    Trophy, Users, TrendingUp, Search,
    CheckCircle2, XCircle, Loader2, Clock
} from 'lucide-react';

const BACKEND_URL = 'https://laa-voting-system.onrender.com';

// ── Count-up animation hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, delay = 0) {
    const [value, setValue] = useState(0);
    const raf = useRef<number>(0);
    useEffect(() => {
        if (!target) { setValue(0); return; }
        const t = setTimeout(() => {
            let start: number | null = null;
            const step = (ts: number) => {
                if (!start) start = ts;
                const p = Math.min((ts - start) / duration, 1);
                setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
                if (p < 1) raf.current = requestAnimationFrame(step);
            };
            raf.current = requestAnimationFrame(step);
        }, delay);
        return () => { clearTimeout(t); cancelAnimationFrame(raf.current); };
    }, [target, duration, delay]);
    return value;
}

interface CandidateResult { candidate_id: string; votes: number; }
interface Tally { [position: string]: CandidateResult[]; }
interface Turnout { total_eligible: number; votes_cast: number; turnout_percentage: number; }

const PublicResults: React.FC = () => {
    const [status, setStatus]           = useState<'loading' | 'in_progress' | 'closed'>('loading');
    const [tally, setTally]             = useState<Tally | null>(null);
    const [turnout, setTurnout]         = useState<Turnout | null>(null);
    const [visible, setVisible]         = useState(false);

    // Ballot verification
    const [receiptInput, setReceiptInput] = useState('');
    const [verifying, setVerifying]       = useState(false);
    const [verifyResult, setVerifyResult] = useState<'counted' | 'not_found' | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 30);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const res  = await fetch(`${BACKEND_URL}/api/public/results`);
                const data = await res.json();
                if (data.status === 'in_progress') {
                    setStatus('in_progress');
                } else if (data.status === 'closed') {
                    setStatus('closed');
                    setTally(data.results);
                    setTurnout(data.turnout);
                }
            } catch (e) {
                console.error('Failed to load results:', e);
            }
        };
        fetchResults();
    }, []);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!receiptInput.trim()) return;
        try {
            setVerifyResult(null);
            setVerifying(true);
            const res  = await fetch(`${BACKEND_URL}/api/verify-ballot/${encodeURIComponent(receiptInput.trim())}`);
            const data = await res.json();
            setVerifyResult(data.counted ? 'counted' : 'not_found');
        } catch {
            setVerifyResult('not_found');
        } finally {
            setVerifying(false);
        }
    };

    // Build full results merging ELECTION_DATA with live tally
    const buildResults = (dbKey: string) => {
        const category = ELECTION_DATA.find(c => c.dbKey === dbKey);
        if (!category || !tally) return null;
        const raw      = tally[dbKey] ?? [];
        const voteMap  = Object.fromEntries(raw.map(r => [r.candidate_id, r.votes]));
        const total    = raw.reduce((s, r) => s + r.votes, 0);
        const candidates = category.candidates
            .map(c => ({ ...c, votes: voteMap[c.id] ?? 0 }))
            .sort((a, b) => b.votes - a.votes);
        return { label: category.position, candidates, total };
    };

    const positionKeys  = ELECTION_DATA.map(c => c.dbKey);
    const animPct       = useCountUp(turnout?.turnout_percentage ?? 0, 1200, 400);
    const animCast      = useCountUp(turnout?.votes_cast          ?? 0, 1000, 500);
    const animEligible  = useCountUp(turnout?.total_eligible      ?? 0, 1000, 600);

    const R       = 15.9155;
    const CIRCUMF = 2 * Math.PI * R;
    const offset  = CIRCUMF - (animPct / 100) * CIRCUMF;

    // ── Loading ─────────────────────────────────────────────────────────────────
    if (status === 'loading') return (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
            <p className="text-xs font-black uppercase tracking-widest">Loading Results...</p>
        </div>
    );

    // ── Election still open ──────────────────────────────────────────────────────
    if (status === 'in_progress') return (
        <div className={`w-full max-w-lg mx-auto self-center transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="bg-white rounded-2xl border-2 border-zinc-200 overflow-hidden shadow-sm text-center">
                <div className="h-1.5 bg-yellow-500 w-full" />
                <div className="p-10">
                    <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-yellow-500">
                        <Clock className="w-8 h-8 text-yellow-400" />
                    </div>
                    <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight mb-3">
                        Election In Progress
                    </h1>
                    <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                        Voting is currently open. Results will be published here
                        as soon as the Electoral Commission closes the election.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
              Accepting votes now
            </span>
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Results published ────────────────────────────────────────────────────────
    return (
        <div className={`w-full max-w-3xl mx-auto space-y-6 py-2 transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="text-center pb-4 border-b-2 border-zinc-200">
        <span className="text-[10px] font-black bg-zinc-900 text-yellow-400 px-3 py-1 rounded-full uppercase tracking-widest mb-3 inline-block border border-yellow-500">
          Official Results
        </span>
                <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 uppercase tracking-tight mt-2">
                    USSA General Election
                </h1>
                <p className="text-zinc-400 text-sm font-medium mt-1">
                    Final results · Algeria 2026
                </p>
            </div>

            {/* ── Turnout ────────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <div className="bg-white rounded-2xl border-2 border-zinc-200 overflow-hidden">
                    <div className="h-1 bg-zinc-200" />
                    <div className="p-5 flex flex-col items-center text-center">
                        <Users className="w-5 h-5 text-zinc-300 mb-2" />
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Total Eligible</p>
                        <p className="text-4xl font-black text-zinc-900 tabular-nums">{animEligible}</p>
                    </div>
                </div>

                <div className="bg-zinc-900 rounded-2xl border-2 border-zinc-900 overflow-hidden">
                    <div className="h-1 bg-yellow-500" />
                    <div className="p-5 flex flex-col items-center text-center">
                        <TrendingUp className="w-5 h-5 text-yellow-400 mb-2" />
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Votes Cast</p>
                        <p className="text-4xl font-black text-white tabular-nums">{animCast}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border-2 border-zinc-200 overflow-hidden">
                    <div className="h-1 bg-yellow-500" />
                    <div className="p-5 flex flex-col items-center text-center">
                        <div className="relative w-16 h-16 mb-1">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r={R} fill="none" stroke="#f4f4f5" strokeWidth="3.5" />
                                <circle cx="18" cy="18" r={R} fill="none" stroke="#eab308" strokeWidth="3.5"
                                        strokeLinecap="round"
                                        strokeDasharray={`${CIRCUMF} ${CIRCUMF}`}
                                        strokeDashoffset={offset}
                                        style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-black text-zinc-900 tabular-nums">{animPct}%</span>
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Turnout</p>
                    </div>
                </div>
            </div>

            {/* ── Position results ────────────────────────────────────────────────── */}
            <div className="space-y-4">
                {positionKeys.map(dbKey => {
                    const result = buildResults(dbKey);
                    if (!result) return null;
                    const { label, candidates, total } = result;
                    const winner = candidates[0];

                    return (
                        <div key={dbKey} className="bg-white rounded-2xl border-2 border-zinc-200 overflow-hidden">
                            <div className="h-1 bg-yellow-500" />
                            <div className="p-5">

                                {/* Position label + total */}
                                <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-zinc-100">
                                    <h2 className="text-sm font-black text-zinc-800 uppercase tracking-widest">
                                        {label}
                                    </h2>
                                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    {total} vote{total !== 1 ? 's' : ''}
                  </span>
                                </div>

                                <div className="space-y-4">
                                    {candidates.map((candidate, index) => {
                                        const pct       = total > 0 ? Math.round((candidate.votes / total) * 100) : 0;
                                        const isWinner  = index === 0 && candidate.votes > 0;

                                        return (
                                            <div key={candidate.id}>
                                                <div className="flex items-center gap-3 mb-2">

                                                    {/* Winner trophy / rank */}
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                                        isWinner ? 'bg-yellow-400' : 'bg-zinc-100'
                                                    }`}>
                                                        {isWinner
                                                            ? <Trophy className="w-3.5 h-3.5 text-zinc-900" />
                                                            : <span className="text-xs font-black text-zinc-400">{index + 1}</span>
                                                        }
                                                    </div>

                                                    {/* Photo */}
                                                    <img
                                                        src={candidate.image}
                                                        alt={candidate.name}
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src =
                                                                `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name)}&background=18181b&color=eab308&size=128`;
                                                        }}
                                                        className={`w-10 h-10 rounded-full object-cover border-2 shrink-0 ${
                                                            isWinner ? 'border-yellow-400' : 'border-zinc-200'
                                                        }`}
                                                    />

                                                    {/* Name + winner badge */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-black text-sm uppercase ${
                                  isWinner ? 'text-zinc-900' : 'text-zinc-500'
                              }`}>
                                {candidate.name}
                              </span>
                                                            {isWinner && (
                                                                <span className="text-[9px] font-black bg-yellow-400 text-zinc-900 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                  WINNER
                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Votes + pct */}
                                                    <div className="text-right shrink-0">
                            <span className={`text-2xl font-black tabular-nums ${
                                isWinner ? 'text-yellow-600' : 'text-zinc-400'
                            }`}>
                              {candidate.votes}
                            </span>
                                                        <span className="text-[10px] font-bold text-zinc-400 ml-1">{pct}%</span>
                                                    </div>
                                                </div>

                                                {/* Vote bar */}
                                                <div className="ml-10 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                            isWinner ? 'bg-yellow-400' : 'bg-zinc-300'
                                                        }`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Ballot verification ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border-2 border-zinc-200 overflow-hidden">
                <div className="h-1.5 bg-zinc-900 w-full" />
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center shrink-0">
                            <Search className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-zinc-900 uppercase tracking-widest">
                                Verify Your Ballot
                            </h2>
                            <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                                Enter your receipt code to confirm your vote was counted.
                                Your choices remain private.
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleVerify} className="flex gap-2">
                        <input
                            type="text"
                            value={receiptInput}
                            onChange={e => { setReceiptInput(e.target.value); setVerifyResult(null); }}
                            placeholder="Paste your ballot receipt UUID here"
                            className="flex-1 rounded-xl border-2 border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono text-zinc-800 outline-none focus:border-yellow-500 focus:bg-white transition-all"
                            disabled={verifying}
                        />
                        <button
                            type="submit"
                            disabled={verifying || !receiptInput.trim()}
                            className="shrink-0 bg-zinc-900 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-40 border-b-4 border-zinc-700 active:border-b-0"
                        >
                            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                        </button>
                    </form>

                    {/* Result */}
                    {verifyResult && (
                        <div className={`mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${
                            verifyResult === 'counted'
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                        }`}>
                            {verifyResult === 'counted'
                                ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                                : <XCircle     className="w-5 h-5 text-red-500 shrink-0" />
                            }
                            <p className={`text-sm font-bold ${
                                verifyResult === 'counted' ? 'text-green-800' : 'text-red-700'
                            }`}>
                                {verifyResult === 'counted'
                                    ? '✓ Your ballot was counted in the final results.'
                                    : '✗ No ballot found with this receipt code. Check for typos or contact the EC.'
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default PublicResults;
