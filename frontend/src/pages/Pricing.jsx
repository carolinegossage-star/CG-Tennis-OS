import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Brand Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2">Tennis Operating System</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Build better players.</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            One system to plan, track, and improve every player you coach. Start with a free trial. Upgrade when you are ready to go deeper.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`text-sm ${!annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>Monthly</span>
          <button 
            onClick={() => setAnnual(!annual)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${annual ? 'bg-gray-900' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
            Annual <span className="text-green-600 font-medium ml-1">Save 20%</span>
          </span>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Starter */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">👤</span>
              <h2 className="text-xl font-bold text-gray-900">Starter</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">For coaches building their system one player at a time.</p>
            <div className="mb-2">
              <span className="text-3xl font-bold text-gray-900">£12</span>
              <span className="text-gray-400"> / month</span>
            </div>
            <p className="text-sm font-semibold text-green-700 mb-6">14-day free trial</p>
            <Link to="/register?plan=starter" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">
              Start free trial
            </Link>
            <ul className="space-y-4">
              {['Up to 10 player profiles', 'Basic session planner', 'Match notes and simple reports', 'Community access', 'iOS and Android apps'].map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="text-gray-900">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Professional */}
          <div className="bg-white rounded-2xl border-2 border-gray-900 p-8 shadow-xl relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full">
              Most Popular
            </div>
            <div className="flex items-center gap-3 mb-4 mt-2">
              <span className="text-2xl">🚀</span>
              <h2 className="text-xl font-bold text-gray-900">Professional</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">For coaches who want the full picture on every player.</p>
            <div className="mb-2">
              <span className="text-3xl font-bold text-gray-900">£{annual ? '23' : '29'}</span>
              <span className="text-gray-400"> / month</span>
              {annual && <p className="text-xs text-gray-400 mt-1">£276 billed annually</p>}
            </div>
            <p className="text-sm font-semibold text-green-700 mb-6">14-day free trial</p>
            <Link to="/register?plan=pro" className="block w-full text-center py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors mb-8">
              Start free trial
            </Link>
            <ul className="space-y-4">
              {['Everything in Starter', 'Unlimited player profiles', 'AI-powered player insights', 'Share reports with players and parents', 'Priority support'].map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="text-gray-900">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Academy */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🏫</span>
              <h2 className="text-xl font-bold text-gray-900">Academy</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">For clubs, academies, and schools that run multiple coaches.</p>
            <div className="mb-8">
              <span className="text-3xl font-bold text-gray-900">Custom</span>
            </div>
            <Link to="/contact" className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-50 transition-colors mb-8">
              Talk to sales
            </Link>
            <ul className="space-y-4">
              {['Everything in Professional', 'Multi-coach dashboards', 'Custom branding', 'Dedicated account manager', 'API access and custom integrations'].map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="text-gray-900">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Founding Coach Banner */}
        <div className="mt-12 bg-white rounded-2xl border-2 border-gray-900 p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Founding Coach Programme</h3>
            <p className="text-sm text-gray-600 mb-2">Be among the first 100 coaches. Help shape the system from day one.</p>
            <p className="text-sm font-bold text-green-700">Lock in Professional at £19/month — for life. No price increases, ever.</p>
          </div>
          <Link to="/apply-founding" className="bg-gray-900 text-white px-8 py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap">
            Apply now
          </Link>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-8">Common questions</h3>
          <div className="space-y-4">
            {[
              { q: 'What happens after the 14-day trial?', a: 'If you have been using the system regularly, we will give you an extra 7 days on us, free. After that, you choose the plan that fits you: Starter at £12/month or Professional at £29/month. You can export your data anytime during the trial. No surprises.' },
              { q: 'What is the Founding Coach offer?', a: 'The first 100 coaches who join get Professional features at £19/month, locked in for life. Even when the price goes up, your rate stays the same. You also get direct input on new features before anyone else.' },
              { q: 'Can I use this with my whole academy?', a: 'Yes. The Academy plan is built for clubs, schools, and multi-coach programmes. Contact our sales team and we will set up a plan that fits your size and budget.' },
              { q: 'Do I need the app and the web dashboard?', a: 'The mobile app is great for on-court notes and quick updates. The web dashboard gives you the full view for deep planning, reports, and team management. Both sync together.' },
              { q: 'Can I switch plans later?', a: 'Yes. You can upgrade from Starter to Professional anytime. If you join as a Founding Coach, your locked-in rate follows you even if you later move to Academy.' }
            ].map((item, i) => (
              <details key={i} className="group bg-white rounded-xl border border-gray-200 p-4">
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-gray-900">
                  {item.q}
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-4 text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Trust Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-gray-400">Trusted by coaches in 30+ countries. Built by coaches, for coaches.</p>
        </div>
      </div>
    </div>
  );
}
