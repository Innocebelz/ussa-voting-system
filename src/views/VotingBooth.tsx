import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ELECTION_DATA } from '../constants';

const VotingBooth: React.FC = () => {
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user, vote } = useAuth();
    const navigate = useNavigate();

    // Pre-select unopposed candidates
    useEffect(() => {
        const initialSelections: Record<string, string> = {};
        ELECTION_DATA.forEach(category => {
            if (category.unopposed && category.candidates.length > 0) {
                initialSelections[category.position] = category.candidates[0].id;
            }
        });
        setSelections(initialSelections);
    }, []);

    const handleSelect = (position: string, candidateId: string) => {
        setSelections(prev => ({
            ...prev,
            [position]: candidateId
        }));
    };

    const isFormComplete = ELECTION_DATA.every(
        category => selections[category.position] !== undefined
    );

    const handleVoteSubmit = async () => {
        try {
            setIsSubmitting(true);
            await vote(selections);
            setShowConfirm(false);
            navigate('/results');
        } catch (error) {
            console.error(error);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col pt-4">
            <div className="mb-8">
                <div className="flex items-center space-x-2 text-blue-900 mb-2">
                    <span className="text-sm font-bold bg-blue-100 px-2 py-1 rounded">VOTING OPEN</span>
                    <h2 className="text-3xl font-extrabold tracking-tight uppercase">Official Ballot</h2>
                </div>
                <p className="text-slate-500 font-medium">Please select a candidate for each position. Unopposed positions are pre-selected.</p>
                <div className="mt-4 inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1.5 text-sm font-bold text-blue-800 ring-1 ring-inset ring-blue-700/10 uppercase tracking-widest">
                    Voter ID: {user?.matNumber}
                </div>
            </div>

            <div className="flex-1 space-y-12 mb-10 text-left">
                {ELECTION_DATA.map((category) => (
                    <div key={category.position} className="border-t-2 border-slate-100 pt-8 mt-8 first:border-0 first:pt-0 first:mt-0">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 tracking-tight uppercase">{category.position}</h3>
                            {category.unopposed && (
                                <span className="inline-flex items-center space-x-1 bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border border-green-200">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Unopposed</span>
                </span>
                            )}
                        </div>

                        <div className={`grid grid-cols-1 ${category.candidates.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-2' : ''} gap-6`}>
                            {category.candidates.map((candidate) => {
                                const isSelected = selections[category.position] === candidate.id;

                                return (
                                    <button
                                        key={candidate.id}
                                        onClick={() => !category.unopposed && handleSelect(category.position, candidate.id)}
                                        disabled={category.unopposed}
                                        className={`group relative bg-white border-2 rounded-xl p-6 transition-all text-center flex flex-col items-center w-full shadow-sm
                      ${category.unopposed
                                            ? 'border-blue-300 bg-blue-50/50 cursor-default opacity-90 relative overflow-hidden ring-2 ring-blue-100'
                                            : isSelected
                                                ? 'border-blue-600 ring-4 ring-blue-600/10 shadow-xl scale-[1.02] bg-white'
                                                : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                                        }`}
                                    >
                                        <div className="absolute top-4 right-4 z-20">
                                            <div className={`w-6 h-6 border-2 rounded-full flex items-center justify-center shrink-0 transition-colors
                        ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-slate-50 group-hover:border-blue-400'}`}
                                            >
                                                {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                                            </div>
                                        </div>

                                        <div className="z-10 relative flex flex-col items-center w-full">
                                            {/* NEW: Pulling the Cloudinary image link directly from constants.ts */}
                                            <img
                                                src={(candidate as any).image}
                                                alt={candidate.name}
                                                onError={(e) => {
                                                    // Clean fallback placeholder matching your blue UI theme
                                                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name)}&background=eff6ff&color=1e3a8a&size=256`;
                                                }}
                                                className={`w-24 h-24 rounded-full object-cover mx-auto mb-4 border-4 shadow-sm transition-colors ${isSelected ? 'border-blue-100' : 'border-white ring-1 ring-slate-200'}`}
                                            />

                                            <span className="text-xl font-bold text-slate-900 block">{candidate.name}</span>

                                            {category.unopposed ? (
                                                <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest mt-1 mb-2 bg-blue-200/50 border border-blue-200 px-2 py-0.5 rounded inline-block">Pre-Selected</span>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider mt-1 mb-2">{category.position}</span>
                                            )}

                                            <p className={`text-sm italic leading-relaxed mt-2 pt-4 border-t w-full
                        ${isSelected ? 'border-blue-100 text-slate-700' : 'border-slate-100 text-slate-500'}
                      `}>
                                                "{candidate.manifesto}"
                                            </p>
                                        </div>

                                        {category.unopposed && (
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] text-blue-900 z-0 pointer-events-none">
                                                <CheckCircle2 className="w-48 h-48" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-auto flex flex-col items-center pb-8 border-t-2 border-slate-200 pt-8 sticky bottom-0 bg-slate-50 z-10 w-full px-4 -mx-4 sm:mx-0 sm:px-0">
                {!isFormComplete && (
                    <p className="text-sm font-bold text-red-500 uppercase tracking-wider mb-4 animate-pulse">
                        Complete all selections to submit
                    </p>
                )}
                <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!isFormComplete || isSubmitting}
                    className="w-full max-w-sm bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl text-lg shadow-lg flex items-center justify-center space-x-3 transition-colors border-b-4 border-blue-800 active:border-b-0 disabled:bg-slate-300 disabled:border-slate-400 disabled:text-slate-500 disabled:cursor-not-allowed uppercase"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04a11.367 11.367 0 00-3.45 8.335c0 5.99 7.153 10.518 11.377 14.623a.994.994 0 001.353 0c4.224-4.105 11.377-8.633 11.377-14.623a11.367 11.367 0 00-3.45-8.335z"></path></svg>
                    <span>Submit Secure Vote</span>
                </button>
            </div>

            {showConfirm && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 max-w-sm w-full animate-in fade-in zoom-in-95 duration-200 border-2 border-slate-200">
                        <div className="flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-4 mx-auto border-2 border-amber-200">
                            <AlertCircle className="h-6 w-6 text-amber-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 text-center mb-2 uppercase tracking-tight">Confirm Your Vote</h3>
                        <p className="text-sm text-slate-500 text-center mb-6 font-medium">
                            Are you sure? This action cannot be undone and your vote will be securely recorded.
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={handleVoteSubmit}
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 text-white rounded-md py-3 font-semibold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center transition-colors uppercase text-sm border-b-4 border-blue-800 active:border-b-0"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                                        Casting Vote...
                                    </>
                                ) : (
                                    'Yes, submit my ballot'
                                )}
                            </button>
                            <button
                                onClick={() => setShowConfirm(false)}
                                disabled={isSubmitting}
                                className="w-full bg-white text-slate-700 border-2 border-slate-200 rounded-md py-3 font-semibold hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors uppercase text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VotingBooth;