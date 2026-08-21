import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { CourtToonNudge } from '../components/CourtToonNudge';
import spinLotus from '../assets/courttoons/spin-lotus-crop.webp';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const IDENTITY_NUDGE_DISMISSAL = 'cgto_nudge_identity_customisation_spin_dismissed';

function isIdentityNudgeDismissed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(IDENTITY_NUDGE_DISMISSAL) === 'true';
}
const TABS = [
  { key: 'identity',    label: 'My Identity' },
  { key: 'behavioural', label: 'Behavioural Intelligence' },
  { key: 'growth',      label: '3-Year Growth Plan' },
];

export default function IdentityBuilder() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [activeTab, setActiveTab]     = useState('identity');
  const [identity, setIdentity]       = useState(null);
  const [behavioural, setBehavioural] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [identityNudgeDismissed, setIdentityNudgeDismissed] = useState(() => isIdentityNudgeDismissed());
  const [form, setForm] = useState({
    coaching_philosophy: '', core_values: '', signature_style: '',
    three_year_vision: '', primary_framework: '', growth_focus_areas: '',
  });

  const authHeaders = (json = false) => ({
    Authorization: `Bearer ${localStorage.getItem('cgto_token')}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  const coachId = () => {
    try { const p = JSON.parse(atob(localStorage.getItem('cgto_token').split('.')[1])); return p.userId || p.id; }
    catch { return null; }
  };

  const fetchIdentity = useCallback(async () => {
    const id = coachId();
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [idRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/coaching-identity/${id}`,     { headers: authHeaders() }),
        fetch(`${API_BASE}/behavioural/player/${id}`, { headers: authHeaders() }),
      ]);
      if (idRes.ok) {
        const d = await idRes.json();
        setIdentity(d);
        setForm({
          coaching_philosophy: d.coaching_philosophy ?? '',
          core_values:         d.core_values         ?? '',
          signature_style:     d.signature_style     ?? '',
          three_year_vision:   d.three_year_vision   ?? '',
          primary_framework:   d.primary_framework   ?? '',
          growth_focus_areas:  d.growth_focus_areas  ?? '',
        });
      }
      if (bRes.ok) setBehavioural(await bRes.json());
    } catch (err) {
      addToast({ type: 'error', message: `Could not load identity: ${err.message}` });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchIdentity(); }, [fetchIdentity]);

  const handleSave = async () => {
    const id = coachId();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/users/coach-profiles/${id}`, {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      addToast({ type: 'success', message: 'Identity saved' });
      fetchIdentity();
    } catch (err) {
      addToast({ type: 'error', message: `Save failed: ${err.message}` });
    } finally { setSaving(false); }
  };

  const field = (key) => ({
    id: key,
    name: key,
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  });

  const FRAMEWORKS = ['Playing To Excel™'];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="identity" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Identity Builder</h1>
          <button type="button" onClick={handleSave} disabled={saving} className="ml-auto rounded-lg bg-[--primary-green] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </header>

        {loading && <LoadingOverlay message="Loading identity profile…" />}

        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
              {TABS.map(t => (
                <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'identity' && (
              <div className="max-w-xl space-y-5">
                {!identityNudgeDismissed && !form.coaching_philosophy.trim() && !form.core_values.trim() && !form.signature_style.trim() && (
                  <CourtToonNudge
                    className="max-w-md"
                    characterSrc={spinLotus}
                    characterName="Spin"
                    title="Make it your own"
                    message="Not sure where to begin? Try one idea, then shape it your way."
                    onDismiss={() => {
                      window.localStorage.setItem(IDENTITY_NUDGE_DISMISSAL, 'true');
                      setIdentityNudgeDismissed(true);
                    }}
                  />
                )}
                {[
                  { key: 'coaching_philosophy', label: 'Coaching philosophy', badge: null, rows: 4, placeholder: 'Describe your coaching philosophy…' },
                  { key: 'core_values',         label: 'Core values',         badge: null,             rows: 3, placeholder: 'e.g. Integrity, resilience, curiosity…' },
                  { key: 'signature_style',     label: 'Signature coaching style', badge: null,        rows: 3, placeholder: 'What makes your coaching unmistakably yours?…' },
                ].map(f => (
                  <div key={f.key}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <label className="text-sm font-semibold text-gray-700">{f.label}</label>
                      {f.badge && <FrameworkBadge name={f.badge} size="xs" />}
                    </div>
                    <textarea id={f.key} name={f.key} {...field(f.key)} rows={f.rows} placeholder={f.placeholder}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                      aria-label={f.label} />
                  </div>
                ))}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Primary framework</label>
                  <select id="primary_framework" name="primary_framework" {...field('primary_framework')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[--primary-green]" aria-label="Primary framework">
                    <option value="">Select a framework</option>
                    {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'behavioural' && (
              <div className="space-y-4">
                {behavioural ? (
                  <div className="space-y-3">
                    {Object.entries(behavioural).filter(([k]) => k !== 'id' && k !== 'coach_id').map(([key, val]) => val != null && (
                      <div key={key} className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{key.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-gray-700">{String(val)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
                    <p className="text-sm text-gray-400">No behavioural intelligence data yet. Complete your coaching identity profile to unlock insights.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'growth' && (
              <div className="max-w-xl space-y-5">
                <div>
                  <div className="mb-1.5">
                    <label className="text-sm font-semibold text-gray-700">3-year vision</label>
                  </div>
                  <textarea id="three_year_vision" name="three_year_vision" {...field('three_year_vision')} rows={4} placeholder="Where do you want to be in 3 years as a coach?…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                    aria-label="3-year vision" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Growth focus areas</label>
                  <textarea id="growth_focus_areas" name="growth_focus_areas" {...field('growth_focus_areas')} rows={3} placeholder="Key areas you want to develop…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                    aria-label="Growth focus areas" />
                </div>
                {identity?.cpd_hours_this_year != null && (
                  <div className="rounded-lg border border-[--primary-green]/30 bg-[#f0f7f3] p-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">CPD progress this year</p>
                    <div className="flex items-center gap-4">
                      <p className="text-3xl font-bold text-[--primary-green]">{identity.cpd_hours_this_year}h</p>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-[--primary-green] transition-all" style={{ width: `${Math.min(100, (identity.cpd_hours_this_year / 30) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">Target: 30h / year</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="identity" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}