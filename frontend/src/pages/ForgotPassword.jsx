import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not request a password reset. Please try again.');
      setStatus('If an account exists for that email, a password-reset link has been sent. The link expires after one hour.');
    } catch (err) {
      setError(err.message || 'Could not request a password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-500">We will send a secure, time-limited reset link to your coaching email.</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {status && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>}
          {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {!status && <form onSubmit={submit} className="space-y-4">
            <label htmlFor="reset-request-email" className="block text-sm font-medium text-gray-700">Coaching email
              <input id="reset-request-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" placeholder="you@example.com" />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[--primary-green] py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">{loading ? 'Sending reset link…' : 'Send reset link'}</button>
          </form>}
          <p className="mt-5 text-center text-sm text-gray-500"><Link to="/login" className="font-semibold text-[--primary-green] hover:underline">Back to sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
