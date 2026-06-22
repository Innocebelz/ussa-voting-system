import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

const Login: React.FC = () => {
  const [matNum, setMatNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matNum.trim()) {
      setError('Matriculation Number is required.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await login(matNum);
      navigate('/verify');
    } catch (err) {
      setError('Failed to request OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="w-full max-w-sm mx-auto bg-white p-8 rounded-xl shadow-sm border-2 border-slate-200 self-center">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">Identity Verification</h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">Enter your matriculation number to receive a one-time password securely.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="matNum" className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
              Matriculation Number
            </label>
            <input
                type="text"
                id="matNum"
                className={`block w-full rounded-md border-2 py-3 px-4 text-slate-900 shadow-sm ${
                    error ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-600 outline-none'
                } placeholder:text-slate-400 sm:text-sm font-mono sm:leading-6 transition-colors`}
                placeholder="e.g. 1912345"
                value={matNum}
                onChange={(e) => setMatNum(e.target.value)}
                disabled={loading}
            />
            {error && <p className="mt-2 text-sm text-red-600 font-medium">{error}</p>}
          </div>

          <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center rounded-lg bg-blue-600 px-3 py-4 text-sm font-bold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b-4 border-blue-800 active:border-b-0 uppercase tracking-wide"
          >
            {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Requesting...
                </>
            ) : (
                'Request OTP'
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          By requesting an OTP, you agree to the USSA election guidelines.
        </div>
      </div>
  );
};

export default Login;
