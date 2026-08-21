import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { VoiceCapture } from '../components/VoiceCapture';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { CourtToonNudge } from '../components/CourtToonNudge';
import { FrameworkBadge } from '../components/FrameworkBadge';
import aceThumbsUp from '../assets/courttoons/ace-thumbs-up-crop.webp';
import nettyGuide from '../assets/courttoons/netty-guide-crop.webp';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const NUDGE_DISMISSALS = {
  firstSession: 'cgto_nudge_first_session_ace_dismissed',
  sessionsOnboarding: 'cgto_nudge_sessions_onboarding_netty_dismissed',
};

function isNudgeDismissed(key) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === 'true';
}

function saveNudgeDismissal(key) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, 'true');
}

const SESSION_TYPES = [
  { value: 'individual',      label: 'Individual' },
  { value: 'group',           label: 'Group' },
  { value: 'squad',           label: 'Squad' },
  { value: 'match_play',      label: 'Match play' },
  { value: 'fitness',         label: 'Fitness' },
  { value: 'mental',          label: 'Mental' },
  { value: 'tournament_prep', label: 'Tournament prep' },
];

const SESSION_TYPE_COLOURS = {
  individual:      'bg-blue-100 text-blue-700',
  group:           'bg-purple-100 text-purple-700',
  squad:           'bg-indigo-100 text-indigo-700',
  match_play:      'bg-amber-100 text-amber-700',
  fitness:         'bg-orange-100 text-orange-700',
  mental:          'bg-teal-100 text-teal-700',
  tournament_prep: 'bg-red-100 text-red-600',
};

const TRIO_PROMPTS = [
  { key: 'trio_prediction_error',  step: 'Prediction-Error Priming',        q: 'What surprised you most in today\'s session? What did you predict that didn\'t happen?' },
  { key: 'trio_consolidation',     step: 'Synaptic Downtime Consolidation',  q: 'What\'s the single most important thing you want to consolidate from this session?' },
  { key: 'trio_emotional_anchor',  step: 'Emotional Anchor',                 q: 'What feeling or moment do you want to anchor from today?' },
];

export default function SessionReflection() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [sessions, setSessions]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [players, setPlayers]           = useState([]);
  const [view, setView]                 = useState('list');
  const [selectedSession, setSelected]  = useState(null);
  const [saving, setSaving]             = useState(false);
  const [standbyResult, setStandbyResult] = useState(null);
  const [showFirstSessionNudge, setShowFirstSessionNudge] = useState(false);
  const [sessionsOnboardingDismissed, setSessionsOnboardingDismissed] = useState(() => isNudgeDismissed(NUDGE_DISMISSALS.sessionsOnboarding));

  const [newForm, setNewForm] = useState({
    player_id: '', session_type: 'individual', duration_minutes: 60,
    session_date: new Date().toISOString().slice(0, 10), session_plan_notes: '',
  });

  const [reflForm, setReflForm] = useState({
    reflection_text: '',
    trio_prediction_error: '', trio_consolidation: '', trio_emotional_anchor: '',
  });

  const notifyStandby = async (scope) => {
    try {
      const res = await fetch(`${API_BASE}/coach/session/${selectedSession.id}/notify-standby`, {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not notify standby list');
      setStandbyResult(data.notifications || []);
      addToast({ type: 'success', message: data.notifications?.length ? 'Standby notification sent.' : 'No open standby places.' });
    } catch (err) { addToast({ type: 'error', message: err.message }); }
  };

  const authHeaders = (json = false) => ({
    Authorization: `Bearer ${localStorage.getItem('cgto_token')}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions?limit=30`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : (data.sessions ?? []));
    } catch (err) {
      addToast({ type: 'error', message: `Could not load sessions: ${err.message}` });
    } finally { setLoading(false); }
  }, []);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/players`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : (data.players ?? []));
    } catch {}
  }, []);

  useEffect(() => { fetchSessions(); fetchPlayers(); }, [fetchSessions, fetchPlayers]);

  const handleCreateSession = async () => {
    const isFirstLoggedSession = sessions.length === 0;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({
          player_id: newForm.player_id,
          session_date: newForm.session_date,
          duration_minutes: newForm.duration_minutes,
          session_plan: { session_type: newForm.session_type, notes: newForm.session_plan_notes || '' },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      addToast({ type: 'success', message: 'Session logged' });
      if (isFirstLoggedSession && !isNudgeDismissed(NUDGE_DISMISSALS.firstSession)) setShowFirstSessionNudge(true);
      setView('list'); fetchSessions();
    } catch (err) {
      addToast({ type: 'error', message: `Could not save session: ${err.message}` });
    } finally { setSaving(false); }
  };

  const handleSaveReflection = async () => {
    if (!selectedSession) return;
    setSaving(true);
    try {
      const combined = [
        reflForm.reflection_text,
        reflForm.trio_prediction_error  ? `[Prediction-Error] ${reflForm.trio_prediction_error}`  : '',
        reflForm.trio_consolidation     ? `[Consolidation] ${reflForm.trio_consolidation}`         : '',
        reflForm.trio_emotional_anchor  ? `[Emotional Anchor] ${reflForm.trio_emotional_anchor}`   : '',
      ].filter(Boolean).join('\n\n');
      const res = await fetch(`${API_BASE}/sessions/${selectedSession.id}/reflection`, {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ reflection_text: combined }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      addToast({ type: 'success', message: 'Reflection saved' });
      setView('list'); fetchSessions();
    } catch (err) {
      addToast({ type: 'error', message: `Could not save reflection: ${err.message}` });
    } finally { setSaving(false); }
  };

  const openReflection = (session) => {
    setSelected(session);
    setReflForm({ reflection_text: session.reflection_text ?? '', trio_prediction_error: '', trio_consolidation: '', trio_emotional_anchor: '' });
    setView('reflect');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="sessions" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 flex-wrap">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">
            {view === 'new' ? 'Log session' : view === 'reflect' ? 'Session reflection' : 'Sessions'}
          </h1>
          <FrameworkBadge name="Playing To Excel™" size="xs" />
          {view === 'list' && (
            <button type="button" onClick={() => setView('new')} className="ml-auto rounded-lg bg-[--primary-green] px-4 py-1.5 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
              + Log session
            </button>
          )}
          {view !== 'list' && (
            <button type="button" onClick={() => setView('list')} className="ml-auto rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
              ← Back
            </button>
          )}
        </header>

        {loading && <LoadingOverlay message="Loading sessions…" />}

        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">

            {view === 'list' && (
              sessions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center sm:p-12">
                  <p className="text-2xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">No sessions yet. Log your first one to get started.</p>
                  {!sessionsOnboardingDismissed && (
                    <CourtToonNudge
                      className="mx-auto mt-5 max-w-md"
                      characterSrc={nettyGuide}
                      characterName="Netty"
                      title="A quick guide"
                      message="This is where your session story lives. Log the first one, then take a look around."
                      onDismiss={() => {
                        saveNudgeDismissal(NUDGE_DISMISSALS.sessionsOnboarding);
                        setSessionsOnboardingDismissed(true);
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map(s => {
                    const typeCls = SESSION_TYPE_COLOURS[s.session_plan?.session_type] ?? 'bg-gray-100 text-gray-600';
                    const hasReflection = !!s.reflection_text;
                    return (
                      <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${typeCls}`}>
                            {SESSION_TYPES.find(t => t.value === s.session_plan?.session_type)?.label ?? s.session_plan?.session_type}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">{s.player_name ?? '—'}</p>
                            <p className="text-xs text-gray-400">{new Date(s.session_date).toLocaleDateString('en-GB')} · {s.duration_minutes}min</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => openReflection(s)}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green] transition-colors
                            ${hasReflection ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-[--primary-green]/10 text-[--primary-green] hover:bg-[--primary-green]/20'}`}>
                          {hasReflection ? '✓ View reflection' : '+ Add reflection'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {view === 'new' && (
              <div className="max-w-xl space-y-4">
                {[
                  { label: 'Player', el: (
                    <select id="session-player" name="playerId" value={newForm.player_id} onChange={e => setNewForm(f => ({...f, player_id: e.target.value}))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[--primary-green]" aria-label="Player">
                      <option value="">— Select player —</option>
                      {players.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  )},
                  { label: 'Session type', el: (
                    <select id="session-type" name="sessionType" value={newForm.session_type} onChange={e => setNewForm(f => ({...f, session_type: e.target.value}))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[--primary-green]" aria-label="Session type">
                      {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  )},
                ].map(f => (
                  <div key={f.label}>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{f.label}</label>
                    {f.el}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                    <input id="session-date" name="sessionDate" type="date" value={newForm.session_date} onChange={e => setNewForm(f => ({...f, session_date: e.target.value}))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" aria-label="Session date" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Duration (mins)</label>
                    <input id="session-duration" name="durationMinutes" type="number" min="15" max="240" step="15" value={newForm.duration_minutes} onChange={e => setNewForm(f => ({...f, duration_minutes: e.target.value}))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]" aria-label="Duration" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Pre-session notes</label>
                  <textarea id="session-plan-notes" name="sessionPlanNotes" value={newForm.session_plan_notes} onChange={e => setNewForm(f => ({...f, session_plan_notes: e.target.value}))}
                    rows={3} placeholder="Goals, focus areas, player state…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                    aria-label="Pre-session notes" />
                </div>
                <button type="button" onClick={handleCreateSession} disabled={saving || !newForm.player_id}
                  className="w-full rounded-lg bg-[--primary-green] py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                  {saving ? 'Saving…' : 'Log session'}
                </button>
              </div>
            )}

            {view === 'reflect' && selectedSession && (
              <div className="max-w-xl space-y-5">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                  <p className="font-semibold text-gray-800">{selectedSession.player_name ?? 'Session'}</p>
                  <p>{SESSION_TYPES.find(t => t.value === selectedSession.session_plan?.session_type)?.label ?? selectedSession.session_plan?.session_type} · {selectedSession.duration_minutes}min · {new Date(selectedSession.session_date).toLocaleDateString('en-GB')}</p>
                </div>
                <VoiceCapture sessionId={selectedSession.id} playerId={selectedSession.player_id} onCaptureSaved={() => fetchSessions()} />
                {selectedSession.is_group_session && (
                  <section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="standby-heading">
                    <div className="flex items-center justify-between gap-2">
                      <h3 id="standby-heading" className="text-sm font-semibold text-gray-700">Standby list</h3>
                      <span className="text-[10px] text-gray-400">Only sends when you choose</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => notifyStandby('next')} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Notify next standby player</button>
                      <button type="button" onClick={() => notifyStandby('whole_list')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Notify whole standby list</button>
                    </div>
                    {standbyResult?.length > 0 && <p className="mt-2 text-xs text-gray-500">Notification sent to {standbyResult.map(item => item.player_name).join(', ')}.</p>}
                  </section>
                )}
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-700">Trio Effect reflection</p>
                  </div>
                  <div className="space-y-4">
                    {TRIO_PROMPTS.map((p, i) => (
                      <div key={i} className="rounded-lg border border-[--primary-green]/20 bg-[#f0f7f3] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[--primary-green] mb-0.5">Step {i + 1} — {p.step}</p>
                        <p className="text-xs text-gray-600 mb-2 italic">{p.q}</p>
                        <textarea
                          id={`trio-${p.key}`}
                          name={p.key}
                          value={reflForm[p.key]}
                          onChange={e => setReflForm(f => ({ ...f, [p.key]: e.target.value }))}
                          rows={2} placeholder="Your thoughts…"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                          aria-label={`Trio step ${i + 1}: ${p.step}`} />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">General reflection</label>
                  <textarea id="general-reflection" name="reflectionText" value={reflForm.reflection_text} onChange={e => setReflForm(f => ({...f, reflection_text: e.target.value}))}
                    rows={4} placeholder="Overall session notes…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                    aria-label="General reflection" />
                </div>
                <button type="button" onClick={handleSaveReflection} disabled={saving}
                  className="w-full rounded-lg bg-[--primary-green] py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                  {saving ? 'Saving…' : 'Save reflection'}
                </button>
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="sessions" />
      {showFirstSessionNudge && (
        <CourtToonNudge
          className="fixed bottom-20 right-4 z-40 w-[min(330px,calc(100vw-2rem))] md:bottom-5"
          characterSrc={aceThumbsUp}
          characterName="Ace"
          title="First session logged"
          message="Nice one. First one's always the best one to look back on."
          onDismiss={() => {
            saveNudgeDismissal(NUDGE_DISMISSALS.firstSession);
            setShowFirstSessionNudge(false);
          }}
        />
      )}
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}