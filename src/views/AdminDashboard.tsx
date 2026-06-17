import React, { useState, useEffect } from 'react';
import { ELECTION_DATA } from '../constants';
import { useNavigate } from 'react-router-dom';

interface TurnoutData {
    total_eligible: number;
    votes_cast: number;
    turnout_percentage: number;
}

interface TallyData {
    [position: string]: { candidate_id: string; votes: number }[];
}

const AdminDashboard: React.FC = () => {
    const [turnout, setTurnout] = useState<TurnoutData | null>(null);
    const [tally, setTally] = useState<TallyData | null>(null);
    const [isElectionOpen, setIsElectionOpen] = useState<boolean>(true);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const navigate = useNavigate();

    const backendUrl = `http://${window.location.hostname}:8000`;

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const [turnoutRes, tallyRes, statusRes] = await Promise.all([
                    fetch(`${backendUrl}/api/results/turnout`),
                    fetch(`${backendUrl}/api/admin/tally`),
                    fetch(`${backendUrl}/api/admin/status`)
                ]);

                const turnoutJson = await turnoutRes.json();
                const tallyJson = await tallyRes.json();
                const statusJson = await statusRes.json();

                if (turnoutJson.status === 'success') setTurnout(turnoutJson);
                if (tallyJson.status === 'success') setTally(tallyJson.data);
                if (statusJson.status === 'success') setIsElectionOpen(statusJson.election_open);
            } catch (error) {
                console.error("Failed to fetch admin data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAdminData();
        const interval = setInterval(fetchAdminData, 10000);
        return () => clearInterval(interval);
    }, [backendUrl]);

    const getCandidateName = (positionKey: string, candidateId: string) => {
        const formattedPosition = positionKey.replace('_', ' ').toLowerCase();
        const category = ELECTION_DATA.find(c => c.position.toLowerCase() === formattedPosition);
        if (!category) return candidateId;

        const candidate = category.candidates.find(c => c.id === candidateId);
        return candidate ? candidate.name : candidateId;
    };

    const toggleElectionStatus = async () => {
        if (!window.confirm(`Are you sure you want to ${isElectionOpen ? 'CLOSE' : 'OPEN'} the election?`)) return;

        setActionLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/admin/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ election_open: !isElectionOpen })
            });
            const data = await res.json();
            if (data.status === 'success') setIsElectionOpen(data.election_open);
        } catch (error) {
            console.error("Failed to update status", error);
        } finally {
            setActionLoading(false);
        }
    };

    const downloadCSV = () => {
        if (!tally) return;

        let csvContent = "data:text/csv;charset=utf-8,Position,Candidate,Votes\n";

        Object.entries(tally).forEach(([position, candidates]: [string, { candidate_id: string; votes: number }[]]) => {
            candidates.forEach(candidate => {
                const name = getCandidateName(position, candidate.candidate_id);
                const formattedPosition = position.replace('_', ' ').toUpperCase();
                csvContent += `"${formattedPosition}","${name}",${candidate.votes}\n`;
            });
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `laa_election_results_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen text-slate-500 font-bold tracking-widest uppercase">
                Loading Election Data...
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto pt-8 pb-16 px-4">
            <div className="flex justify-between items-end mb-8 border-b-2 border-slate-200 pb-4">
                <div>
                    <span className="text-sm font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded uppercase tracking-wider mb-2 inline-block">Secure Area</span>
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight uppercase">Election Control Center</h1>
                </div>
                <button
                    onClick={() => navigate('/login')}
                    className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
                >
                    Exit Dashboard
                </button>
            </div>

            {/* NEW: Admin Controls Panel */}
            <div className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
                <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${isElectionOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-sm">
            Status: {isElectionOpen ? 'Accepting Votes' : 'Election Closed'}
          </span>
                </div>
                <div className="flex space-x-3 w-full sm:w-auto">
                    <button
                        onClick={downloadCSV}
                        disabled={!tally}
                        className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-md text-sm font-bold uppercase transition-colors flex items-center justify-center disabled:opacity-50"
                    >
                        Export Results (CSV)
                    </button>
                    <button
                        onClick={toggleElectionStatus}
                        disabled={actionLoading}
                        className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-bold uppercase transition-colors flex items-center justify-center border-2 ${
                            isElectionOpen
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                        } disabled:opacity-50`}
                    >
                        {isElectionOpen ? 'Lock Election' : 'Unlock Election'}
                    </button>
                </div>
            </div>

            {/* Turnout Statistics Cards */}
            {turnout && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-white p-6 rounded-xl border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="text-slate-500 font-bold uppercase tracking-widest text-sm mb-2">Total Eligible</span>
                        <span className="text-5xl font-black text-slate-900">{turnout.total_eligible}</span>
                    </div>
                    <div className="bg-blue-600 p-6 rounded-xl border-2 border-blue-700 shadow-md flex flex-col items-center justify-center text-center">
                        <span className="text-blue-200 font-bold uppercase tracking-widest text-sm mb-2">Votes Cast</span>
                        <span className="text-5xl font-black text-white">{turnout.votes_cast}</span>
                    </div>
                    <div className="bg-white p-6 rounded-xl border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="text-slate-500 font-bold uppercase tracking-widest text-sm mb-2">Turnout Rate</span>
                        <div className="flex items-baseline space-x-1">
                            <span className="text-5xl font-black text-blue-600">{turnout.turnout_percentage}</span>
                            <span className="text-2xl font-bold text-blue-600">%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Live Tally Results */}
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight uppercase mb-6">Live Vote Tally</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {tally && Object.entries(tally).map(([position, candidates]: [string, { candidate_id: string; votes: number }[]]) => {
                    const totalVotesInPosition = candidates.reduce((sum, c) => sum + c.votes, 0);

                    return (
                        <div key={position} className="bg-white p-6 rounded-xl border-2 border-slate-100 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-6 border-b pb-2">
                                {position.replace('_', ' ')}
                            </h3>

                            <div className="space-y-6">
                                {candidates
                                    .sort((a, b) => b.votes - a.votes)
                                    .map((candidate, index) => {
                                        const candidateName = getCandidateName(position, candidate.candidate_id);
                                        const percentage = totalVotesInPosition > 0
                                            ? Math.round((candidate.votes / totalVotesInPosition) * 100)
                                            : 0;

                                        return (
                                            <div key={candidate.candidate_id} className="relative">
                                                <div className="flex justify-between items-end mb-2">
                                                    <div className="flex items-center space-x-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 && candidate.votes > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {index + 1}
                            </span>
                                                        <span className="font-bold text-slate-900 uppercase">{candidateName}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-lg font-black text-blue-600">{candidate.votes}</span>
                                                        <span className="text-xs font-bold text-slate-400 ml-1 uppercase">Votes</span>
                                                    </div>
                                                </div>

                                                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-1000 ease-out ${index === 0 && candidate.votes > 0 ? 'bg-blue-500' : 'bg-slate-400'}`}
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}

                                {candidates.length === 0 && (
                                    <p className="text-sm text-slate-400 italic font-medium">No votes cast yet.</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminDashboard;