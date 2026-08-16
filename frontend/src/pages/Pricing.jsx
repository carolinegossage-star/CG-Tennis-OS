import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function CheckoutButton({ planId, children, className }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startCheckout = async () => {
    const token = localStorage.getItem('cgto_token');
    if (!token) {
      navigate('/login?redirect=/pricing');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={startCheckout} disabled={loading} className={className}>
        {loading ? 'Opening checkout…' : children}
      </button>
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const period = annual ? 'annual' : 'monthly';

  const soloPlanId = `solo_${period}`;
  const professionalPlanId = `professional_${period}`;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">Tennis Operating System</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Build better players.</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">One system to plan, track, and improve every player you coach. Start with a free trial, then choose the level that fits your professional caseload.</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-12" aria-label="Billing period">
          <span className={`text-sm ${!annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Monthly</span>
          <button type="button" aria-pressed={annual} aria-label="Toggle annual billing" onClick={() => setAnnual(!annual)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${annual ? 'bg-gray-900' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Annual <span className="text-gray-500 font-medium ml-1">12 months, no discount</span></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4"><span className="text-2xl">👤</span><h2 className="text-xl font-bold text-gray-900">Solo Coach</h2></div>
            <p className="text-sm text-gray-500 mb-6">For an independent coach with a single bookable diary.</p>
            <div className="mb-2"><span className="text-3xl font-bold text-gray-900">£{annual ? '228' : '19'}</span><span className="text-gray-400"> {annual ? '/ year' : '/ month'}</span></div>
            <p className="text-sm font-semibold text-green-700 mb-6">35 active player profiles</p>
            <Link to="/register?plan=solo" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-3">Start free trial</Link>
            <CheckoutButton planId={soloPlanId} className="w-full py-3 rounded-xl border border-gray-900 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">Upgrade to Solo</CheckoutButton>
            <ul className="space-y-4">{['Professional coaching workspace', 'Up to 35 active player profiles', 'Session planning and reflection', 'Player progress and core reports', 'Community access'].map((f) => <li key={f} className="flex items-start gap-3 text-sm text-gray-600"><span className="text-gray-900">✓</span>{f}</li>)}</ul>
          </div>

          <div className="bg-white rounded-2xl border-2 border-gray-900 p-8 shadow-xl relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full">Most Popular</div>
            <div className="flex items-center gap-3 mb-4 mt-2"><span className="text-2xl">🚀</span><h2 className="text-xl font-bold text-gray-900">Professional Coach</h2></div>
            <p className="text-sm text-gray-500 mb-6">For a single coach who wants a higher-capacity, more advanced system.</p>
            <div className="mb-2"><span className="text-3xl font-bold text-gray-900">£{annual ? '348' : '29'}</span><span className="text-gray-400"> {annual ? '/ year' : '/ month'}</span></div>
            <p className="text-sm font-semibold text-green-700 mb-6">100 active player profiles</p>
            <Link to="/register?plan=professional" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-3">Start free trial</Link>
            <CheckoutButton planId={professionalPlanId} className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors mb-8">Upgrade to Professional</CheckoutButton>
            <ul className="space-y-4">{['Everything in Solo Coach', 'Up to 100 active player profiles', 'Advanced reporting and tournament planning', 'Parent communication tools', 'Priority support'].map((f) => <li key={f} className="flex items-start gap-3 text-sm text-gray-600"><span className="text-gray-900">✓</span>{f}</li>)}</ul>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4"><span className="text-2xl">🏫</span><h2 className="text-xl font-bold text-gray-900">Academy / Club</h2></div>
            <p className="text-sm text-gray-500 mb-6">For multi-coach programmes that need shared operations and academy-wide visibility.</p>
            <div className="mb-8"><span className="text-3xl font-bold text-gray-900">Custom</span></div>
            <Link to="/contact" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">Book a Demo</Link>
            <ul className="space-y-4">{['Multi-coach logins', 'Schedule coordination across coaches', 'Academy-wide player tracking', 'Custom reporting and onboarding', 'Dedicated account support'].map((f) => <li key={f} className="flex items-start gap-3 text-sm text-gray-600"><span className="text-gray-900">✓</span>{f}</li>)}</ul>
          </div>
        </div>

        <div className="mt-12 bg-gray-900 text-white rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div><h3 className="text-lg font-bold mb-1">Ready to keep building?</h3><p className="text-sm text-gray-300">The upgrade path stays visible throughout your trial, so you can move to Professional whenever the higher cap and advanced tools become valuable.</p></div>
          <CheckoutButton planId={professionalPlanId} className="bg-white text-gray-900 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors whitespace-nowrap">Upgrade to Professional</CheckoutButton>
        </div>

        <div className="mt-20 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-8">Common questions</h3>
          <div className="space-y-4">{[
            { q: 'What happens after the 14-day trial?', a: 'Coaches who qualify for the existing engagement extension receive an additional 7 days. After the trial, choose Solo Coach at £19/month or Professional Coach at £29/month. Annual billing is exactly 12 times the monthly price.' },
            { q: 'What happens when I reach my player cap?', a: 'Solo Coach supports up to 35 active player profiles. Professional Coach supports up to 100. Upgrade when you need more capacity; deactivated profiles do not count toward the active cap.' },
            { q: 'Can I use this with my whole academy?', a: 'Academy / Club is designed for multi-coach logins, cross-coach scheduling, and academy-wide player tracking. Book a demo for custom pricing.' },
            { q: 'Can I choose Professional even with a smaller caseload?', a: 'Yes. Professional is available for coaches with fewer than 35 players when its advanced features are the better fit.' },
          ].map((item) => <details key={item.q} className="group bg-white rounded-xl border border-gray-200 p-4"><summary className="flex items-center justify-between cursor-pointer font-semibold text-gray-900">{item.q}<span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span></summary><p className="mt-4 text-sm text-gray-600 leading-relaxed">{item.a}</p></details>)}</div>
        </div>

        <div className="mt-12 text-center"><p className="text-xs text-gray-400">Trusted by coaches in 30+ countries. Built by coaches, for coaches.</p></div>
      </div>
    </div>
  );
}
