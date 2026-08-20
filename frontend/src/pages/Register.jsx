import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const PLANS = {
  solo: { label: 'Solo Coach', cap: 'Up to 35 active player profiles' },
  professional: { label: 'Professional Coach', cap: 'Up to 100 active player profiles' },
};

export default function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const requestedPlan = params.get('plan');
  const initialPlan = requestedPlan === 'pro' ? 'professional' : requestedPlan === 'solo' ? 'solo' : 'solo';
  const [form, setForm] = useState({ name: '', email: '', password: '', plan: initialPlan });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: 'coach' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const validation = Array.isArray(data.errors) ? data.errors.map(item => item.msg).join(' ') : '';
        throw new Error(validation || data.error || data.message || 'Unable to create your account. Please try again.');
      }
      localStorage.setItem('cgto_token', data.accessToken);
      localStorage.setItem('cgto_selected_plan', form.plan);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your CG Tennis OS account</h1>
          <p className="text-sm text-gray-500 mt-2">Start your 14-day trial. No card is required.</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>}
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input id="register-name" name="name" autoComplete="name" value={form.name} onChange={e => update('name', e.target.value)} required maxLength={255} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Your name" />
            </div>
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="register-email" name="email" type="email" autoComplete="email" value={form.email} onChange={e => update('email', e.target.value)} required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="register-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={8} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="At least 8 characters, with upper/lowercase and a number" />
            </div>
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">Choose your starting plan</legend>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(PLANS).map(([key, plan]) => (
                  <label key={key} className={`rounded-xl border p-3 cursor-pointer ${form.plan === key ? 'border-[--primary-green] bg-green-50' : 'border-gray-200'}`}>
                    <input type="radio" name="plan" value={key} checked={form.plan === key} onChange={e => update('plan', e.target.value)} className="sr-only" />
                    <span className="block text-sm font-semibold text-gray-800">{plan.label}</span>
                    <span className="block text-xs text-gray-500 mt-1">{plan.cap}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[--primary-green] py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-500">Already registered? <a href="/login" className="font-semibold text-[--primary-green] hover:underline">Sign in</a></p>
        </div>
      </div>
    </div>
  );
}
