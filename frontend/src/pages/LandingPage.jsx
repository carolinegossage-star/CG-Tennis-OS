import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleLeadCapture = (e) => {
    e.preventDefault();
    navigate('/archetype-assessment', { state: { email } });
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[--primary-green]">CG Tennis OS™</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <a href="#features" className="hover:text-[--primary-green] transition-colors">System</a>
          <a href="#philosophy" className="hover:text-[--primary-green] transition-colors">Philosophy</a>
          <Link to="/pricing" className="hover:text-[--primary-green] transition-colors">Pricing</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors">
            Login
          </Link>
          <button onClick={() => navigate('/archetype-assessment')} className="rounded-full bg-[--primary-green] px-6 py-2 text-sm font-bold text-white hover:bg-[#1a7a4a] transition-colors">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-24 md:px-12 md:pt-24 max-w-7xl mx-auto">
        <div className="text-center mb-16 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-7xl font-extrabold leading-[1.1] mb-8 tracking-tight">
            Are you a high-performing coach? <br/>
            <span className="text-[--primary-green]">Build Better Players, Faster.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-500 mb-4 tracking-wide">
            Coaching Intelligence, Human Wisdom.
          </p>
            <p className="text-xl md:text-2xl text-gray-600 mb-10 font-medium">
            Your coaching system for session plans, player progress, and AI support, all in one place. A Coaching System for coaches who want to grow.
          </p>
          
          <form onSubmit={handleLeadCapture} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto mb-8">
            <input 
              type="email" 
              placeholder="Enter your coaching email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-[--primary-green] shadow-sm"
            />
            <button type="submit" className="bg-black text-white px-8 py-4 rounded-2xl text-lg font-bold hover:bg-gray-800 transition-all shadow-xl">
              Get Early Access
            </button>
          </form>
          <div className="mb-12">
            <Link to="/pricing" className="text-[--primary-green] font-bold border-b-2 border-[--primary-green] pb-1 hover:text-[#1a7a4a] transition-colors">
              View Pricing & Plans →
            </Link>
          </div>
          
          <div className="flex items-center justify-center gap-8 text-xs font-bold text-gray-400 uppercase tracking-widest">
            <span>✓ Voice-to-Report</span>
            <span>✓ Retention AI</span>
            <span>✓ Identity Builder</span>
          </div>
        </div>

        {/* Product UI Hero - Player Retention Dashboard Mockup */}
        <div className="relative max-w-6xl mx-auto">
          <div className="rounded-3xl bg-gray-900 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] border border-gray-800 overflow-hidden">
            {/* Window Header */}
            <div className="bg-gray-800/50 px-6 py-3 flex items-center justify-between border-b border-gray-700">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/50"></div>
                <div className="h-3 w-3 rounded-full bg-amber-500/50"></div>
                <div className="h-3 w-3 rounded-full bg-green-500/50"></div>
              </div>
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">CG TENNIS OS — COACHING INSIGHT</div>
              <div className="w-12"></div>
            </div>
            
            {/* Dashboard Content Mockup */}
            <div className="p-8 md:p-12 bg-gray-900 grid md:grid-cols-4 gap-8">
              {/* Sidebar Mockup */}
              <div className="hidden md:block space-y-6 border-r border-gray-800 pr-8">
                <div className="h-4 w-24 bg-gray-800 rounded"></div>
                <div className="space-y-3">
                  <div className="h-8 w-full bg-[--primary-green]/10 border border-[--primary-green]/20 rounded-lg"></div>
                  <div className="h-8 w-full bg-gray-800/50 rounded-lg"></div>
                  <div className="h-8 w-full bg-gray-800/50 rounded-lg"></div>
                  <div className="h-8 w-full bg-gray-800/50 rounded-lg"></div>
                </div>
              </div>

              {/* Main Content Mockup */}
              <div className="md:col-span-3 space-y-8">
                {/* Header */}
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">Player Retention Analytics</h3>
                    <p className="text-sm text-gray-500">Real-time coaching insight</p>
                  </div>
                  <div className="h-10 w-32 bg-[--primary-green] rounded-xl flex items-center justify-center text-xs font-bold text-white">GENERATE REPORT</div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-gray-800/30 border border-gray-700">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Active Players</p>
                    <p className="text-3xl font-bold text-white">42</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-gray-800/30 border border-gray-700">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Avg Retention</p>
                    <p className="text-3xl font-bold text-[--primary-green]">94%</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                    <p className="text-[10px] text-red-400 font-bold uppercase mb-2">Critical Alerts</p>
                    <p className="text-3xl font-bold text-red-500">2</p>
                  </div>
                </div>

                {/* The "Money" Alert */}
                <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-amber-500 flex items-center justify-center text-white text-xl">⚠️</div>
                    <div>
                      <p className="text-sm font-bold text-amber-500">RETENTION ALERT: Alex M.</p>
                      <p className="text-xs text-gray-400">Dropout risk critical: No session logged in 14 days. Enjoyment score trend: -3.2</p>
                    </div>
                  </div>
                  <div className="h-8 w-24 bg-white rounded-lg flex items-center justify-center text-[10px] font-bold text-black">INTERVENE</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[--primary-green]/20 blur-[120px] rounded-full"></div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section id="philosophy" className="py-24 bg-gray-50 px-6 md:px-12 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400 mb-12">The Philosophy</h2>
          <blockquote className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight mb-12">
            "Stop forcing the script. <br/>
            <span className="text-[--primary-green]">Find what's really holding them back.</span>"
          </blockquote>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto leading-relaxed">
            No two players arrive with the same body, beliefs, or readiness. CGTennis OS is built on the principle that great coaching begins by identifying the real problem, not accepting the surface version.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-5xl font-extrabold mb-6">Built to Get Results.</h2>
            <p className="text-xl text-gray-500">Built to solve the everyday challenges of coaching at scale.</p>
          </div>
          <button onClick={() => navigate('/archetype-assessment')} className="text-[--primary-green] font-bold border-b-2 border-[--primary-green] pb-1 hover:text-[#1a7a4a] transition-colors">
            View full capabilities →
          </button>
        </div>
        
        <div className="grid md:grid-cols-3 gap-12">
          {[
            { title: 'Voice-to-Report', desc: 'Record voice notes on court. AI generates structured reports instantly. No typing required.', icon: '🎙️' },
            { title: 'Retention Intelligence', desc: 'Predict player dropout before it happens with behavioural pattern monitoring.', icon: '🧠' },
            { title: 'Identity Builder', desc: 'Define your coaching archetype and unique value proposition using our proprietary framework.', icon: '🎯' },
            { title: 'Drill Learning Engine', desc: 'Generate game-based drills that prioritise decision-making over feeding.', icon: '🎾' },
            { title: 'Business Operating System', desc: 'Professional pricing calculators and programme templates to scale your academy.', icon: '📊' },
            { title: 'Community Knowledge', desc: 'Access and share ideas with a global network of coaches.', icon: '🌐' }
          ].map((f, i) => (
            <div key={i} className="group">
              <div className="text-3xl mb-6">{f.icon}</div>
              <h3 className="text-xl font-bold mb-4">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 md:px-12 bg-black text-white text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-10 leading-tight">Build on Your Own Terms.</h2>
          <p className="text-gray-400 text-xl mb-12 max-w-2xl mx-auto">
            Ready to find your coaching archetype and fast-track your entry into the CG Tennis OS ecosystem?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => navigate('/archetype-assessment')} className="bg-[--primary-green] text-white px-10 py-5 rounded-2xl text-lg font-bold hover:bg-[#1a7a4a] transition-all transform hover:scale-105">
              Take the Archetype Assessment
            </button>
            <button className="bg-white/10 backdrop-blur-md text-white px-10 py-5 rounded-2xl text-lg font-bold hover:bg-white/20 transition-all">
              Request a Demo
            </button>
          </div>
        </div>
        {/* Abstract design elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[--primary-green]/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2"></div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 md:px-12 border-t border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-xl font-bold text-gray-900">CG Tennis OS™</div>
          <div className="flex gap-8 text-sm font-bold text-gray-400 uppercase tracking-widest">
            <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-900 transition-colors">Contact</a>
          </div>
          <p className="text-gray-400 text-sm">© 2026 CG Tennis Academies.</p>
        </div>
      </footer>
    </div>
  );
}
