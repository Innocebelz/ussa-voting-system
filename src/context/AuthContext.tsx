import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

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

  // 3. Standard API Functions
  const login = async (matNum: string) => {
    const res = await fetch('/api/request-otp', {
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
  };

  const verifyOtp = async (otp: string) => {
    if (!matNumber) throw new Error('Matriculation number is missing.');

    const res = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matric_number: matNumber, otp_code: otp })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Invalid OTP');
    }

    setUser({
      matNumber: data.user.matric,
      name: data.user.name,
      hasVoted: data.hasVoted,
      userBallot: data.userBallot
    });
  };

  const vote = async (userBallot: Record<string, string>) => {
    if (!matNumber) throw new Error('Not authenticated');

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

    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to cast vote');
    }

    setUser((prev) => prev ? { ...prev, hasVoted: true, userBallot } : null);
  };

  const logout = () => {
    setUser(null);
    setMatNumber(null);
    setMaskedEmail(null);
    // Explicitly wipe storage on manual logout
    localStorage.removeItem('laa_user');
    localStorage.removeItem('laa_matric');
    localStorage.removeItem('laa_email');
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