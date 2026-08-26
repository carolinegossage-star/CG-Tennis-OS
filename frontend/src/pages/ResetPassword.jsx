import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is invalid or incomplete. Please request a new link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not reset your password. The link may have expired.');
      setStatus('Password updated. You can now sign in with your new password.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Could not reset your password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-gray-500">Use at least eight characters, including uppercase, lowercase, and a number.</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {status && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>}
          {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {!status && <form onSubmit={submit} className="space-y-4">
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New password
              <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength="8" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" />
            </label>
            <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700">Confirm new password
              <input id="confirm-new-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength="8" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[--primary-green] py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50">{loading ? 'Updating password…' : 'Update password'}</button>
          </form>}
          <p className="mt-5 text-center text-sm text-gray-500"><Link to="/login" className="font-semibold text-[--primary-green] hover:underline">Back to sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
