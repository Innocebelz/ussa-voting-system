import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertCircle, CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ELECTION_DATA } from '../constants';

const VotingBooth: React.FC = () => {
    const [selections, setSelections]     = useState<Record<string, string>>({});
    const [expanded, setExpanded]         = useState<Record<string, boolean>>({});
    const [showConfirm, setShowConfirm]   = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError]   = useState('');
    const [visible, setVisible]           = useState(false);
    const [justSelected, setJustSelected] = useState<string | null>(null);
    const { user, vote } = useAuth();
    const navigate = useNavigate();
    const confirmRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 30);
        return () => clearTimeout(t);
    }, []);

    const handleSelect = (position: string, candidateId: string) => {
        setSelections(prev => {
            const category = ELECTION_DATA.find(c => c.position === position);

            if (category?.unopposed && prev[position] === candidateId) {
                const newSelections = { ...prev };
                delete newSelections[position];
                return newSelections;
            }

            return { ...prev, [position]: candidateId };
        });

        setJustSelected(candidateId);
        setTimeout(() => setJustSelected(null), 600);
    };

    const toggleManifesto = (candidateId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [candidateId]: !prev[candidateId] }));
    };

    const opposedCategories = ELECTION_DATA.filter(c => !c.unopposed);
    const requiredPositionsCount = opposedCategories.length;
    const selectedRequiredCount = opposedCategories.filter(c => selections[c.position]).length;

    const remaining = requiredPositionsCount - selectedRequiredCount;
    const isFormComplete = remaining === 0;

    const progressPct = requiredPositionsCount === 0
        ? 100
        : Math.round((selectedRequiredCount / requiredPositionsCount) * 100);

    const handleVoteSubmit = async () => {
        try {
            setSubmitError('');
            setIsSubmitting(true);
            await vote(selections);
            navigate('/results');
            setShowConfirm(false);
        } catch (error: any) {
            const message: string = error?.message || 'Something went wrong. Please try again.';
            console.error('[VotingBooth] vote failed:', message);
            if (message.toLowerCase().includes('session') || message.toLowerCase().includes('expired') || message.toLowerCase().includes('401')) {
                setShowConfirm(false);
                navigate('/verify');
            } else {
                setSubmitError(message);
            }
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className={`w-full flex-1 flex flex-col transition-all duration-500 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
        >
            {/* ── Page header ────────────────────────────────────────────── */}
            <div className="mb-6 pt-2">
                <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-black bg-green-100 text-green-800 border border-green-300 px-2.5 py-1 rounded-full uppercase tracking-widest">
                        Voting Open
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-zinc-900">
                        Official Ballot
                    </h2>
                </div>
                <p className="text-zinc-500 font-medium text-sm">
                    Select one candidate per position. Tap <strong>Read more</strong> to see their manifesto.
                </p>
                <div className="mt-3 inline-flex items-center bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-zinc-700 uppercase tracking-widest">
                    Voter: {user?.matNumber}
                </div>
            </div>

            {/* ── Progress bar ───────────────────────────────────────────── */}
            <div className="mb-6 bg-white rounded-xl border-2 border-zinc-200 p-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase tracking-widest text-zinc-600">
                        Progress
                    </span>
                    <span className={`text-xs font-black uppercase tracking-widest ${isFormComplete ? 'text-green-600' : 'text-yellow-600'}`}>
                        {isFormComplete ? '✓ Ready to Submit' : `${remaining} Required remaining`}
                    </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${isFormComplete ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest mt-3 text-center">
                    Unopposed positions are optional. Leaving them blank counts as an abstention.
                </p>
            </div>

            {/* ── Ballot positions ───────────────────────────────────────── */}
            <div className="flex-1 space-y-6 mb-4">
                {ELECTION_DATA.map((category) => {
                    const positionSelected  = !!selections[category.position];
                    const selectedCandidate = category.candidates.find(c => c.id === selections[category.position]);
                    const isPresident       = category.position.toLowerCase() === 'president';

                    return (
                        <div
                            key={category.position}
                            className={`bg-white rounded-2xl overflow-hidden transition-all duration-300 ${
                                isPresident
                                    ? `border-4 ${positionSelected ? 'border-yellow-400 shadow-lg' : 'border-zinc-300 shadow-md'}`
                                    : `border-2 ${positionSelected ? 'border-yellow-400 shadow-md' : 'border-zinc-200'}`
                            }`}
                        >
                            {/* Position header */}
                            <div className={`px-4 flex items-center justify-between border-b-2 ${
                                positionSelected ? 'bg-yellow-50 border-yellow-200' : 'bg-zinc-50 border-zinc-100'
                            } ${isPresident ? 'py-4' : 'py-3'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    {positionSelected
                                        ? <CheckCircle2 className={`shrink-0 text-yellow-600 ${isPresident ? 'w-5 h-5' : 'w-4 h-4'}`} />
                                        : <div className={`rounded-full border-2 border-zinc-300 shrink-0 ${isPresident ? 'w-5 h-5' : 'w-4 h-4'}`} />
                                    }
                                    <div className="min-w-0">
                                        <h3 className={`font-black text-zinc-900 uppercase tracking-tight ${isPresident ? 'text-base sm:text-lg' : 'text-sm sm:text-base'}`}>
                                            {category.position}
                                        </h3>
                                        {/* Text confirmation of who was picked */}
                                        <p className={`text-xs font-bold text-yellow-700 truncate overflow-hidden transition-all duration-200 ${
                                            selectedCandidate ? 'max-h-5 opacity-100 mt-0.5' : 'max-h-0 opacity-0'
                                        }`}>
                                            {selectedCandidate ? `Selected: ${selectedCandidate.name}` : ''}
                                        </p>
                                    </div>
                                </div>
                                {category.unopposed && (
                                    <span className="text-[10px] font-black text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                                        Unopposed
                                    </span>
                                )}
                            </div>

                            {/* Candidate list — larger, more visible photos */}
                            <div className="divide-y divide-zinc-100">
                                {category.candidates.map((candidate) => {
                                    const isSelected  = selections[category.position] === candidate.id;
                                    const isExpanded  = expanded[candidate.id] ?? false;
                                    const isPulsing   = justSelected === candidate.id;
                                    const photoSize   = isPresident ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-16 h-16 sm:w-20 sm:h-20';

                                    return (
                                        <div key={candidate.id} className="flex flex-col">

                                            {/* ── Candidate row ── */}
                                            <button
                                                onClick={() => handleSelect(category.position, candidate.id)}
                                                className={`w-full flex items-center gap-4 px-4 py-4 text-left transition-all duration-200 active:bg-zinc-50 ${
                                                    isSelected ? 'bg-yellow-50' : 'bg-white hover:bg-zinc-50'
                                                } ${isPulsing ? 'scale-[0.99]' : 'scale-100'}`}
                                            >
                                                {/* Photo — meaningfully larger, this is a person, not an icon */}
                                                <div className={`relative shrink-0 transition-all duration-300 ${isSelected ? 'ring-4 ring-yellow-500 ring-offset-2 rounded-full' : ''}`}>
                                                    <img
                                                        src={candidate.image}
                                                        alt={candidate.name}
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src =
                                                                `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name)}&background=18181b&color=eab308&size=256`;
                                                        }}
                                                        className={`${photoSize} rounded-full object-cover border-2 border-zinc-200 transition-all duration-300`}
                                                    />
                                                    {isSelected && (
                                                        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                            <CheckCircle2 className="w-4 h-4 text-zinc-900" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Name + position */}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-black truncate ${isPresident ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} ${isSelected ? 'text-zinc-900' : 'text-zinc-800'}`}>
                                                        {candidate.name}
                                                    </p>
                                                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                                        {category.position}
                                                    </p>
                                                </div>

                                                {/* Radio indicator */}
                                                <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                                                    isSelected
                                                        ? 'border-yellow-500 bg-yellow-500'
                                                        : 'border-zinc-300'
                                                }`}>
                                                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />}
                                                </div>
                                            </button>

                                            {/* Read more toggle */}
                                            <button
                                                onClick={(e) => toggleManifesto(candidate.id, e)}
                                                className={`flex items-center gap-1 px-4 pb-3 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                                    isSelected ? 'text-yellow-600 hover:text-yellow-700' : 'text-zinc-400 hover:text-zinc-600'
                                                }`}
                                            >
                                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                {isExpanded ? 'Hide manifesto' : 'Read manifesto'}
                                            </button>

                                            {/* Manifesto — expands/collapses */}
                                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-64' : 'max-h-0'}`}>
                                                <p className={`px-4 pb-4 text-sm italic leading-relaxed border-t pt-3 ${
                                                    isSelected ? 'border-yellow-100 text-zinc-600' : 'border-zinc-100 text-zinc-500'
                                                }`}>
                                                    "{candidate.manifesto}"
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Sticky submit bar ──────────────────────────────────────── */}
            <div className="sticky bottom-0 z-20 bg-stone-50 border-t-2 border-zinc-200 pt-4 pb-6 px-0 -mx-4 sm:mx-0 sm:px-0 px-4">
                {!isFormComplete && (
                    <p className="text-center text-xs font-black text-zinc-400 uppercase tracking-widest mb-3">
                        {remaining} required position{remaining !== 1 ? 's' : ''} still need{remaining === 1 ? 's' : ''} a selection
                    </p>
                )}
                <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!isFormComplete || isSubmitting}
                    className={`w-full max-w-sm mx-auto flex items-center justify-center gap-3 py-4 px-8 rounded-xl text-sm font-black shadow-lg transition-all duration-200 border-b-4 active:border-b-0 active:scale-95 uppercase tracking-widest ${
                        isFormComplete
                            ? 'bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800'
                            : 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed'
                    }`}
                >
                    <ShieldCheck className={`w-5 h-5 ${isFormComplete ? 'text-yellow-400' : 'text-zinc-400'}`} />
                    Submit Secure Vote
                </button>
            </div>

            {/* ── Confirm modal ──────────────────────────────────────────── */}
            {showConfirm && (
                <div className="fixed inset-0 bg-zinc-900/60 flex items-end sm:items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div
                        ref={confirmRef}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border-2 border-zinc-200 overflow-hidden"
                    >
                        <div className="h-1.5 bg-yellow-500 w-full" />

                        <div className="p-6">
                            <div className="flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-4 mx-auto border-2 border-amber-200">
                                <AlertCircle className="h-6 w-6 text-amber-600" />
                            </div>
                            <h3 className="text-lg font-black text-zinc-900 text-center mb-2 uppercase tracking-tight">
                                Confirm Your Vote
                            </h3>

                            {submitError && (
                                <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 mb-4 text-sm text-red-700 font-bold text-center">
                                    ⚠️ {submitError}
                                </div>
                            )}

                            <p className="text-sm text-zinc-500 text-center mb-1 font-medium">
                                You are about to submit your ballot for{' '}
                                <strong className="text-zinc-800">{ELECTION_DATA.length} positions</strong>.
                            </p>
                            <p className="text-xs text-zinc-400 text-center mb-6 font-semibold uppercase tracking-wider">
                                This cannot be undone.
                            </p>

                            <div className="bg-zinc-50 rounded-lg border border-zinc-200 divide-y divide-zinc-100 mb-6 text-left max-h-48 overflow-y-auto">
                                {ELECTION_DATA.map(cat => {
                                    const sel = cat.candidates.find(c => c.id === selections[cat.position]);

                                    return (
                                        <div key={cat.position} className="flex items-center gap-3 px-3 py-2">
                                            {sel ? (
                                                <>
                                                    <img
                                                        src={sel.image}
                                                        alt={sel.name}
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src =
                                                                `https://ui-avatars.com/api/?name=${encodeURIComponent(sel.name)}&background=18181b&color=eab308&size=64`;
                                                        }}
                                                        className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-zinc-900 truncate">{sel.name}</p>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{cat.position}</p>
                                                    </div>
                                                    <CheckCircle2 className="w-4 h-4 text-yellow-500 shrink-0 ml-auto" />
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-8 h-8 rounded-full bg-zinc-200 border border-zinc-300 shrink-0 flex items-center justify-center">
                                                        <span className="text-[10px] font-bold text-zinc-400">-</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-zinc-500 truncate italic">Abstained (Blank)</p>
                                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{cat.position}</p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={handleVoteSubmit}
                                    disabled={isSubmitting}
                                    className="w-full bg-zinc-900 text-white rounded-xl py-3.5 font-black hover:bg-zinc-800 disabled:opacity-50 flex justify-center items-center transition-all uppercase text-sm border-b-4 border-zinc-700 active:border-b-0 active:scale-95 tracking-widest"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-yellow-400" />
                                            <span className="text-yellow-400">Casting Vote...</span>
                                        </>
                                    ) : (
                                        'Yes, Submit My Ballot'
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowConfirm(false);
                                        setSubmitError('');
                                    }}
                                    disabled={isSubmitting}
                                    className="w-full bg-white text-zinc-600 border-2 border-zinc-200 rounded-xl py-3.5 font-black hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 transition-all uppercase text-sm tracking-widest"
                                >
                                    Go Back &amp; Review
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VotingBooth;
