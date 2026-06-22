import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, GraduationCap } from 'lucide-react';

const Login: React.FC = () => {
  const [matNum, setMatNum]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [visible, setVisible]   = useState(false);   // fade-in on mount
  const { login } = useAuth();
  const navigate  = useNavigate();

  // Trigger fade-in as soon as the component mounts
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = matNum.trim().toUpperCase();
    if (!trimmed) {
      setError('Matriculation number is required.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await login(trimmed);
      navigate('/verify');
    } catch (err: any) {
      setError(err.message || 'Matriculation number not found. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div
          className={`w-full max-w-sm mx-auto self-center transition-all duration-500 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
      >
        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-md border-2 border-zinc-200 overflow-hidden">

          {/* Gold top bar — mirrors the header border */}
          <div className="h-1.5 bg-yellow-500 w-full" />

          <div className="p-8">

            {/* Icon + heading */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-zinc-900 border-2 border-yellow-500 mb-4">
                <GraduationCap className="w-7 h-7 text-yellow-400" />
              </div>
              <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">
                Voter Login
              </h1>
              <p className="text-zinc-500 mt-2 text-sm font-medium">
                Enter your matriculation number to receive a one-time verification code.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                    htmlFor="matNum"
                    className="block text-xs font-black uppercase tracking-widest text-zinc-800 mb-2"
                >
                  Matriculation Number
                </label>
                <input
                    type="text"
                    id="matNum"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className={`block w-full rounded-lg border-2 py-3 px-4 text-zinc-900 font-mono text-sm shadow-sm outline-none transition-all duration-200 uppercase ${
                        error
                            ? 'border-red-400 bg-red-50 focus:border-red-500'
                            : 'border-zinc-200 bg-zinc-50 focus:border-yellow-500 focus:bg-white'
                    } placeholder:text-zinc-400 placeholder:normal-case placeholder:font-sans`}
                    placeholder="e.g. 8UGA12345"
                    value={matNum}
                    onChange={(e) => {
                      setMatNum(e.target.value);
                      if (error) setError('');   // clear error as they type
                    }}
                    disabled={loading}
                />

                {/* Error message — slides in */}
                <div className={`overflow-hidden transition-all duration-300 ${error ? 'max-h-10 mt-2' : 'max-h-0'}`}>
                  <p className="text-sm text-red-600 font-semibold">{error}</p>
                </div>
              </div>

              <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center rounded-xl bg-zinc-900 px-3 py-4 text-sm font-black text-white shadow-lg hover:bg-zinc-800 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 border-b-4 border-zinc-700 active:border-b-0 uppercase tracking-widest"
              >
                {loading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-yellow-400" />
                      <span className="text-yellow-400">Sending Code...</span>
                    </>
                ) : (
                    'Request Verification Code'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Fine print */}
        <p className="mt-5 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          By continuing, you agree to the USSA election guidelines.
        </p>
      </div>
  );
};

export default Login;
