import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function CheckoutButton({ plan, annual, children, className }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startCheckout = async () => {
    const token = localStorage.getItem('cgto_token');
    if (!token) {
      navigate(`/register?plan=${plan}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const planId = `${plan}_${annual ? 'annual' : 'monthly'}`;
      const response = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || data.message || 'Unable to start checkout. Please try again.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message || 'Unable to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={startCheckout} disabled={loading} className={className}>
        {loading ? 'Opening checkout…' : children}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const price = annual ? '228' : '19';
  const professionalPrice = annual ? '348' : '29';

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">Tennis Operating System</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Build better players.</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">One system for your players, sessions, and coaching. Start with a 14-day trial; no card is required.</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`text-sm ${!annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Monthly</span>
          <button type="button" aria-label="Toggle annual billing" onClick={() => setAnnual(value => !value)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${annual ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Annual <span className="text-gray-500 font-medium ml-1">12× monthly</span></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Solo Coach</h2>
            <p className="text-sm text-gray-500 my-4">For an independent coach with a busy real-world caseload.</p>
            <div className="mb-2"><span className="text-3xl font-bold text-gray-900">£{price}</span><span className="text-gray-400">{annual ? ' / year' : ' / month'}</span></div>
            <p className="text-sm font-semibold text-green-700 mb-2">Up to 35 active player profiles</p>
            {annual && <p className="text-xs text-gray-500 mb-6">£228 billed annually</p>}
            {!annual && <p className="text-xs text-gray-500 mb-6">14-day free trial</p>}
            <CheckoutButton plan="solo" annual={annual} className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">{localStorage.getItem('cgto_token') ? 'Upgrade to Solo' : 'Start free trial'}</CheckoutButton>
            <ul className="space-y-3 text-sm text-gray-600">{['Up to 35 active player profiles', 'Session planning and reports', 'Community access', 'Voice-to-report capture'].map(item => <li key={item}>✓ {item}</li>)}</ul>
          </div>

          <div className="bg-white rounded-2xl border-2 border-gray-900 p-8 shadow-xl relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full">Most Popular</div>
            <h2 className="text-xl font-bold text-gray-900 mt-2">Professional Coach</h2>
            <p className="text-sm text-gray-500 my-4">For coaches who want the full picture on every player.</p>
            <div className="mb-2"><span className="text-3xl font-bold text-gray-900">£{professionalPrice}</span><span className="text-gray-400">{annual ? ' / year' : ' / month'}</span></div>
            <p className="text-sm font-semibold text-green-700 mb-2">Up to 100 active player profiles</p>
            {annual && <p className="text-xs text-gray-500 mb-6">£348 billed annually</p>}
            {!annual && <p className="text-xs text-gray-500 mb-6">14-day free trial</p>}
            <CheckoutButton plan="professional" annual={annual} className="block w-full text-center py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors mb-8">{localStorage.getItem('cgto_token') ? 'Upgrade to Professional' : 'Start free trial'}</CheckoutButton>
            <ul className="space-y-3 text-sm text-gray-600">{['Up to 100 active player profiles', 'AI-powered player insights', 'Share reports with players and parents', 'Priority support'].map(item => <li key={item}>✓ {item}</li>)}</ul>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Academy / Club</h2>
            <p className="text-sm text-gray-500 my-4">For clubs, academies, and schools running multiple coaches.</p>
            <div className="mb-8"><span className="text-3xl font-bold text-gray-900">Book a demo</span></div>
            <a href="mailto:hello@cgtennisos.com?subject=Academy%20demo" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">Book a Demo</a>
            <ul className="space-y-3 text-sm text-gray-600">{['Multi-coach dashboards', 'Custom programme design', 'Account support', 'API access and integrations'].map(item => <li key={item}>✓ {item}</li>)}</ul>
          </div>
        </div>

        <div className="mt-16 max-w-2xl mx-auto text-center text-sm text-gray-500">
          <p>Choose Professional whenever you want the features; the 100-player limit is enforced only when adding active profiles.</p>
          <p className="mt-3"><Link to="/login" className="font-semibold text-[--primary-green] hover:underline">Already have an account? Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
