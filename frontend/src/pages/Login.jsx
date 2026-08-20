import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || 'Unable to sign in. Please check your details and try again.');
      localStorage.setItem('cgto_token', data.accessToken);
      navigate(searchParams.get('next') || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">CG Tennis OS™</h1>
          <p className="text-sm text-gray-500 mt-1">Your coaching operating system</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Sign in</h2>
          {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" placeholder="you@example.com" aria-label="Email address" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" placeholder="Password" aria-label="Password" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[--primary-green] py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-[--primary-green-dark] transition-colors focus:outline-none">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-500">
            New to CG Tennis OS? <a href="/register" className="font-semibold text-[--primary-green] hover:underline">Create your account</a>
          </p>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">2026 CG Tennis Academies. All Rights Reserved.</p>
      </div>
    </div>
  );
}
