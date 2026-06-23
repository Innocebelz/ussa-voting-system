import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

// --- YOUR LIVE RENDER BACKEND URL ---
const API_BASE_URL = 'https://laa-voting-system.onrender.com';

// ── Session expiry ────────────────────────────────────────────────────────────
// Voter sessions expire after 12 hours. After that, the stored auth state is
// wiped on the next page load so nobody gets stuck in a stale voting or
// "already voted" state from a previous day / previous election.
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // 12 hours in milliseconds
const AUTH_KEYS = ['laa_user', 'laa_matric', 'laa_email', 'laa_vote_token', 'laa_session_at'];

const clearAuthStorage = () => AUTH_KEYS.forEach(k => localStorage.removeItem(k));

// Runs synchronously at module load — before any useState initializer reads storage.
// If there is no timestamp or it's older than SESSION_MAX_AGE_MS, wipe everything.
const purgeStaleSession = () => {
  try {
    const raw = localStorage.getItem('laa_session_at');
    const isStale = !raw || (Date.now() - parseInt(raw, 10)) > SESSION_MAX_AGE_MS;
    if (isStale) clearAuthStorage();
  } catch {
    // localStorage blocked (e.g. Safari private mode) — nothing to clear
  }
};
purgeStaleSession();   // ← runs once when this module is first imported
// ─────────────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  matNumber: string | null;
  maskedEmail: string | null;
  login: (matNumber: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  vote: (userBallot: Record<string, string>) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

  // 1. Initialize state by checking Local Storage first
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('laa_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [matNumber, setMatNumber] = useState<string | null>(() => {
    return localStorage.getItem('laa_matric') || null;
  });

  const [maskedEmail, setMaskedEmail] = useState<string | null>(() => {
    return localStorage.getItem('laa_email') || null;
  });

  // Proof that OTP verification succeeded — required by the backend to cast a vote.
  // Without this, POST /api/vote would accept any matric number with no proof
  // the OTP step ever happened.
  const [voteToken, setVoteToken] = useState<string | null>(() => {
    return localStorage.getItem('laa_vote_token') || null;
  });

  // 2. Automatically sync state changes to Local Storage
  useEffect(() => {
    if (user) localStorage.setItem('laa_user', JSON.stringify(user));
    else localStorage.removeItem('laa_user');
  }, [user]);

  useEffect(() => {
    if (matNumber) localStorage.setItem('laa_matric', matNumber);
    else localStorage.removeItem('laa_matric');
  }, [matNumber]);

  useEffect(() => {
    if (maskedEmail) localStorage.setItem('laa_email', maskedEmail);
    else localStorage.removeItem('laa_email');
  }, [maskedEmail]);

  useEffect(() => {
    if (voteToken) localStorage.setItem('laa_vote_token', voteToken);
    else localStorage.removeItem('laa_vote_token');
  }, [voteToken]);

  // 3. API Functions (Connected to Cloud Backend)
  const login = async (matNum: string) => {
    const res = await fetch(`${API_BASE_URL}/api/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matric_number: matNum })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || 'Failed to request OTP');
    }

    setMatNumber(matNum);
    setMaskedEmail(data.email);
    // Start the session clock — the 12-hour expiry is measured from here.
    localStorage.setItem('laa_session_at', String(Date.now()));
  };

  const verifyOtp = async (otp: string) => {
    if (!matNumber) throw new Error('Matriculation number is missing.');

    const res = await fetch(`${API_BASE_URL}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matric_number: matNumber, otp_code: otp })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || 'Invalid OTP');
    }

    setUser({
      matNumber: data.user.matric,
      name: data.user.name,
      hasVoted: data.hasVoted,
      userBallot: data.userBallot
    });

    // Present only when hasVoted is false — proves OTP was just verified.
    setVoteToken(data.voteToken || null);
  };

  const vote = async (userBallot: Record<string, string>) => {
    if (!matNumber) throw new Error('Not authenticated');
    if (!voteToken) throw new Error('Your voting session has expired. Please verify your OTP again.');

    const payload = {
      matric_number: matNumber,
      choices: userBallot,
      president: userBallot['President'] || '',
      vice_president: userBallot['Vice President'] || '',
      speaker: userBallot['Speaker'] || '',
      treasurer: userBallot['Treasurer'] || '',
      general_secretary: userBallot['General Secretary'] || '',
      coordinator: userBallot['Coordinator'] || ''
    };

    const res = await fetch(`${API_BASE_URL}/api/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voteToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to cast vote');
    }

    setVoteToken(null); // single-use: no longer needed once the ballot is recorded
    setUser((prev) => prev ? { ...prev, hasVoted: true, userBallot } : null);
  };

  const logout = () => {
    setUser(null);
    setMatNumber(null);
    setMaskedEmail(null);
    setVoteToken(null);
    clearAuthStorage();   // wipes all laa_* keys including laa_session_at
  };

  return (
      <AuthContext.Provider value={{ user, matNumber, maskedEmail, login, verifyOtp, vote, logout }}>
        {children}
      </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};