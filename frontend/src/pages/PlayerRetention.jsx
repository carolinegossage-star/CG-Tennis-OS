import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const BURNOUT_CFG = {
  low:      { cls: 'bg-green-100 text-green-700',  label: 'Low risk' },
  medium:   { cls: 'bg-amber-100 text-amber-700',  label: 'Medium risk' },
  high:     { cls: 'bg-orange-100 text-orange-700',label: 'High risk' },
  critical: { cls: 'bg-red-100 text-red-700 font-bold', label: 'Critical' },
};
const retentionColour = (score) => {
  if (score == null) return 'text-gray-400';
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-500';
};

export default function PlayerRetention() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [players, setPlayers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterRisk, setFilterRisk]   = useState('all');
  const [selectedPlayer, setSelected] = useState(null);
  const [stats, setStats]             = useState(null);
  const [flags, setFlags]             = useState([]);
  const [draft, setDraft]             = useState(null);
  const [draftTags, setDraftTags]     = useState([]);
  const [draftLoading, setDraftLoading] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('cgto_token')}` });

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/players`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : (data.players ?? []));
    } catch (err) {
      addToast({ type: 'error', message: `Could not load players: ${err.message}` });
    } finally { setLoading(false); }
  }, []);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/coach/retention-flags`, { headers: authHeaders() });
      if (res.ok) setFlags((await res.json()).flags ?? []);
    } catch {}
  }, []);

  const dismissFlag = async (flagId) => {
    try {
      const res = await fetch(`${API_BASE}/coach/retention-flags/${flagId}/dismiss`, {
        method: 'POST', headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Could not dismiss warning');
      setFlags(current => current.filter(flag => flag.id !== flagId));
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const generateDraft = async () => {
    if (!selectedPlayer || draftLoading) return;
    setDraftLoading(true);
    try {
      const res = await fetch(`${API_BASE}/coach/parent-draft`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: selectedPlayer.id, tags: draftTags, include_retention_context: flags.some(flag => flag.player_id === selectedPlayer.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate draft');
      setDraft(data);
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally { setDraftLoading(false); }
  };

  const copyDraft = async () => {
    if (!draft?.content) return;
    await navigator.clipboard.writeText(draft.content);
    if (draft.id) {
      await fetch(`${API_BASE}/coach/parent-draft/${draft.id}/approve`, { method: 'POST', headers: authHeaders() });
    }
    addToast({ type: 'success', message: 'Draft copied. Review it and send manually.' });
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/players/analytics/retention`, { headers: authHeaders() });
      if (!res.ok) return;
      setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchPlayers(); fetchStats(); fetchFlags(); }, [fetchPlayers, fetchStats, fetchFlags]);

  const filtered = useMemo(() => players.filter(p => {
    if (filterRisk !== 'all' && p.burnout_risk_level !== filterRisk) return false;
    if (search && !(p.full_name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [players, search, filterRisk]);

  const atRisk    = players.filter(p => p.burnout_risk_level === 'high' || p.burnout_risk_level === 'critical').length;
  const attrition = players.filter(p => (p.retention_score ?? 100) < 50).length;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="players" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Player Retention</h1>
          <FrameworkBadge name="Playing To Excel™" size="xs" />
          <span className="ml-auto text-sm text-gray-400">{players.length} players</span>
        </header>

        {loading && <LoadingOverlay message="Loading players…" />}

        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">
            {flags.length > 0 && (
              <section className="mb-5 space-y-3" aria-labelledby="retention-warnings-heading">
                <div className="flex items-center justify-between">
                  <h2 id="retention-warnings-heading" className="text-sm font-bold text-gray-800">Early warnings</h2>
                  <span className="text-xs text-gray-400">Needs your judgement</span>
                </div>
                {flags.map(flag => (
                  <article key={flag.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-amber-900">{flag.player_name} may need a check-in</p>
                        <p className="mt-1 text-sm text-amber-800">
                          {flag.player_name} has {flag.context?.daysSinceLastSession ?? 21} days since the last logged session. {flag.flag_reason}.
                        </p>
                      </div>
                      <button type="button" onClick={() => dismissFlag(flag.id)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                        Dismiss for 14 days
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total players',  value: players.length,  colour: 'text-gray-800' },
                { label: 'At risk',        value: atRisk,          colour: 'text-orange-500' },
                { label: 'Low retention',  value: attrition,       colour: 'text-red-500' },
                { label: 'Avg retention',  value: stats?.avg_retention_score != null ? `${Math.round(stats.avg_retention_score)}%` : '—', colour: 'text-[--primary-green]' },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-3 text-center">
                  <p className={`text-2xl font-bold ${s.colour}`}>{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              <input id="player-search" name="playerSearch" type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search players…"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green] w-48"
                aria-label="Search players" />
              <select id="player-risk-filter" name="riskLevel" value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                aria-label="Filter by risk level">
                <option value="all">All risk levels</option>
                <option value="critical">Critical</option>
                <option value="high">High risk</option>
                <option value="medium">Medium risk</option>
                <option value="low">Low risk</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-2xl mb-2">🎾</p>
                <p className="text-sm text-gray-400">No players match your filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(p => {
                  const burnout = BURNOUT_CFG[p.burnout_risk_level] ?? BURNOUT_CFG.low;
                  return (
                    <button key={p.id} type="button" onClick={() => setSelected(p)}
                      className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[--primary-green] text-sm font-bold text-white">
                            {p.full_name?.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase()}
                          </span>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm">{p.full_name}</p>
                            <p className="text-xs text-gray-400">{p.age ? `Age ${p.age}` : ''}{p.gender ? ` · ${p.gender}` : ''}</p>
                          </div>
                        </div>
                        {p.burnout_risk_level && p.burnout_risk_level !== 'low' && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${burnout.cls}`}>{burnout.label}</span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Retention</p>
                          <p className={`text-lg font-bold ${retentionColour(p.retention_score)}`}>{p.retention_score != null ? `${p.retention_score}%` : '—'}</p>
                        </div>
                        {p.ranking_current && (
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Ranking</p>
                            <p className="text-lg font-bold text-gray-700">{p.ranking_current}</p>
                          </div>
                        )}
                      </div>
                      {p.sessions_this_month != null && (
                        <p className="mt-1 text-xs text-gray-400">{p.sessions_this_month} session{p.sessions_this_month !== 1 ? 's' : ''} this month</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        )}
      </div>

      {selectedPlayer && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[--primary-green] font-bold text-white">
                  {selectedPlayer.full_name?.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase()}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-800">{selectedPlayer.full_name}</h3>
                  <p className="text-xs text-gray-400">{selectedPlayer.age ? `Age ${selectedPlayer.age}` : ''}{selectedPlayer.gender ? ` · ${selectedPlayer.gender}` : ''}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-full p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Close">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Retention score', value: selectedPlayer.retention_score != null ? `${selectedPlayer.retention_score}%` : '—' },
                { label: 'Burnout risk', value: BURNOUT_CFG[selectedPlayer.burnout_risk_level]?.label ?? '—' },
                { label: 'Ranking', value: selectedPlayer.ranking_current ?? '—' },
                { label: 'Sessions (month)', value: selectedPlayer.sessions_this_month ?? '—' },
              ].map(r => (
                <div key={r.label}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">{r.label}</p>
                  <p className="text-sm font-medium text-gray-700">{r.value}</p>
                </div>
              ))}
            </div>
            <section className="mt-5 border-t border-gray-100 pt-4" aria-labelledby="parent-draft-heading">
              <div className="flex items-center justify-between gap-2">
                <h4 id="parent-draft-heading" className="text-sm font-semibold text-gray-800">Parent progress update</h4>
                <span className="text-[10px] text-gray-400">Draft only</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Forehand depth', 'Serve placement', 'Great effort'].map(tag => (
                  <button key={tag} type="button" onClick={() => setDraftTags(tags => tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag])} className={`rounded-full border px-2.5 py-1 text-xs ${draftTags.includes(tag) ? 'border-[--primary-green] bg-green-50 text-[--primary-green]' : 'border-gray-200 text-gray-500'}`}>{tag}</button>
                ))}
              </div>
              <button type="button" onClick={generateDraft} disabled={draftLoading} className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{draftLoading ? 'Writing…' : draft ? 'Regenerate draft' : 'Draft update'}</button>
              {draft?.content && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700">
                  <p className="whitespace-pre-wrap">{draft.content}</p>
                  <button type="button" onClick={copyDraft} className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Copy text</button>
                </div>
              )}
            </section>
            <button type="button" onClick={() => { setSelected(null); setDraft(null); setDraftTags([]); }} className="mt-4 w-full rounded-lg bg-[--primary-green] py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Close</button>
          </div>
        </div>
      )}

      <BottomNav activePage="players" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}