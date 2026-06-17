import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Verify: React.FC = () => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);

  // Destructure maskedEmail from the updated AuthContext
  const { matNumber, verifyOtp, user, maskedEmail } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let timer: number;
    if (countdown > 0) {
      timer = window.setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => window.clearInterval(timer);
  }, [countdown]);

  if (!matNumber) {
    return <Navigate to="/login" replace />;
  }

  if (user) {
    return <Navigate to={user.hasVoted ? '/results' : '/voting-booth'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await verifyOtp(otp);
    } catch (err: any) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      if (!user) setLoading(false);
    }
  };

  const handleResend = () => {
    if (countdown === 0) {
      setCountdown(60);
    }
  };

  return (
      <div className="w-full max-w-sm mx-auto bg-white p-8 rounded-xl shadow-sm border-2 border-slate-200 self-center relative">
        <button
            onClick={() => navigate('/login')}
            className="absolute top-6 left-6 flex items-center text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
        >
          BACK
        </button>

        <div className="text-center mb-8 mt-8">
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Enter OTP</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">
            We have sent a 6-digit code for <strong>{matNumber}</strong> to your registered email at <strong>{maskedEmail || 'your email'}</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="otp" className="sr-only">
              OTP Code
            </label>
            <input
                type="text"
                id="otp"
                maxLength={6}
                className={`block w-full text-center tracking-[0.5em] font-mono text-2xl rounded-md border-2 py-3 px-4 text-slate-900 shadow-sm ${
                    error ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-600 outline-none'
                } placeholder:text-slate-300 sm:leading-6 transition-colors`}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                disabled={loading}
            />
            {error && <p className="mt-2 text-sm text-red-600 font-medium text-center">{error}</p>}
          </div>

          <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full flex justify-center items-center rounded-lg bg-blue-600 px-3 py-4 text-sm font-bold text-white shadow-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:border-slate-400 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors border-b-4 border-blue-800 active:border-b-0 uppercase tracking-wide"
          >
            {loading ? 'VERIFYING...' : 'VERIFY & LOGIN'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm font-medium">
          <span className="text-slate-500">Did not receive the code? </span>
          <button
              onClick={handleResend}
              disabled={countdown > 0}
              className={`font-bold uppercase text-xs tracking-wider ${
                  countdown > 0
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-blue-600 hover:text-blue-800'
              } transition-colors ml-1`}
          >
            {countdown > 0 ? `WAIT ${countdown}S` : 'RESEND CODE'}
          </button>
        </div>
      </div>
  );
};

export default Verify;