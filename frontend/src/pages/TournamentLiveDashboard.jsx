// pages/TournamentLiveDashboard.jsx
// Route: /tournaments/events/:eventId/live
//
// Backend endpoints consumed (all confirmed mounted in server.js):
//   GET /tournament-events/:id/dashboard          -> coaching value + event summary
//   GET /tournament-matches/live?eventId=          -> matches currently in play
//   GET /tournament-matches/order-of-play?eventId= -> today's schedule
//   GET /tournament-matches/results?eventId=       -> completed matches
//
// match_status ENUM values (migrate_tournament_engine.sql) — used verbatim,
// nothing guessed: 'scheduled' | 'upcoming' | 'live' | 'suspended' |
// 'completed' | 'retired' | 'walkover' | 'cancelled'

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { useTournamentLive } from '../hooks/useTournamentLive';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const STATUS_BADGE = {
  draft:       'bg-gray-100 text-gray-500',
  published:   'bg-blue-100 text-blue-600',
  in_progress: 'bg-red-100 text-red-600 font-bold',
  paused:      'bg-amber-100 text-amber-600',
  completed:   'bg-green-100 text-green-600',
  archived:    'bg-gray-100 text-gray-400',
};

const MATCH_STATUS_CFG = {
  scheduled:  { label: 'Scheduled',  dot: 'bg-gray-400',   text: 'text-gray-500' },
  upcoming:   { label: 'Up Next',    dot: 'bg-blue-400',   text: 'text-blue-600' },
  live:       { label: 'LIVE',       dot: 'bg-red-500 animate-pulse', text: 'text-red-600 font-bold' },
  suspended:  { label: 'Suspended',  dot: 'bg-amber-400',  text: 'text-amber-600' },
  completed:  { label: 'Completed',  dot: 'bg-green-400',  text: 'text-green-600' },
  retired:    { label: 'Retired',    dot: 'bg-orange-400', text: 'text-orange-600' },
  walkover:   { label: 'Walkover',   dot: 'bg-purple-400', text: 'text-purple-600' },
  cancelled:  { label: 'Cancelled',  dot: 'bg-gray-300',   text: 'text-gray-400' },
};

export default function TournamentLiveDashboard() {
  const { eventId } = useParams();
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const { dashboard, loading, error, lastUpdated, refresh } = useTournamentLive(eventId);

  const [liveMatches, setLiveMatches]       = useState([]);
  const [orderOfPlay, setOrderOfPlay]       = useState([]);
  const [results, setResults]               = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [selectedMatch, setSelectedMatch]   = useState(null);
  const [activeTab, setActiveTab]           = useState('live');

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('cgto_token')}` });

  const fetchMatches = useCallback(async () => {
    if (!eventId) return;
    setMatchesLoading(true);
    try {
      const [liveRes, scheduleRes, resultsRes] = await Promise.all([
        fetch(`${API_BASE}/tournament-matches/live?eventId=${eventId}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/tournament-matches/order-of-play?eventId=${eventId}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/tournament-matches/results?eventId=${eventId}`, { headers: authHeaders() }),
      ]);
      if (liveRes.ok)     setLiveMatches(await liveRes.json());
      if (scheduleRes.ok) setOrderOfPlay(await scheduleRes.json());
      if (resultsRes.ok)  setResults(await resultsRes.json());
    } catch (err) {
      addToast({ type: 'error', message: `Could not load matches: ${err.message}` });
    } finally { setMatchesLoading(false); }
  }, [eventId]); // eslint-disable-line

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { if (lastUpdated) fetchMatches(); }, [lastUpdated]); // eslint-disable-line

  const myPlayerIds = (dashboard?.myPlayers ?? []).map(p => p.id);
  const eventStatus = dashboard?.event?.status ?? 'published';
  const upcomingMatches = orderOfPlay.filter(m => m.status === 'scheduled' || m.status === 'upcoming');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="tournaments" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 flex-wrap">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <Link to="/tournaments" className="text-sm text-[--primary-green] hover:underline">← Tournaments</Link>
          <h1 className="text-lg font-bold text-gray-800">{loading ? 'Loading…' : (dashboard?.event?.title ?? 'Live Event')}</h1>
          {!loading && dashboard?.event && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_BADGE[eventStatus] ?? STATUS_BADGE.published}`}>
              {eventStatus.replace('_', ' ')}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden md:block text-xs text-gray-400">
                Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button type="button" onClick={() => { refresh(); fetchMatches(); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
              aria-label="Refresh dashboard">
              ↻ Refresh
            </button>
          </div>
        </header>

        {loading && <LoadingOverlay message="Loading live event…" />}

        {error && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            Failed to load event: {error}
            <button type="button" onClick={refresh} className="ml-3 underline">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <main className="flex-1 overflow-y-auto p-4">

            <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-500">
              {dashboard?.event?.level     && <Chip label={dashboard.event.level} />}
              {dashboard?.event?.category  && <Chip label={dashboard.event.category} />}
              {dashboard?.event?.surface   && <Chip label={dashboard.event.surface} />}
              {dashboard?.event?.host_club && <Chip label={dashboard.event.host_club} icon="📍" />}
              {dashboard?.event?.venue_name && <Chip label={dashboard.event.venue_name} icon="🏟" />}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Live now"   value={liveMatches.length}    colour="text-red-600" />
              <StatTile label="Upcoming"   value={upcomingMatches.length} colour="text-blue-600" />
              <StatTile label="Completed"  value={results.length}        colour="text-green-600" />
              <StatTile label="My players" value={myPlayerIds.length}    colour="text-[--primary-green]" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
              <section>
                <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
                  {[
                    { key: 'live',     label: `Live${liveMatches.length ? ` (${liveMatches.length})` : ''}` },
                    { key: 'schedule', label: 'Schedule' },
                    { key: 'results',  label: `Results${results.length ? ` (${results.length})` : ''}` },
                  ].map(tab => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {matchesLoading ? (
                  <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 rounded-lg bg-gray-100" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {activeTab === 'live' && (liveMatches.length
                      ? liveMatches.map(m => <MatchCard key={m.id} match={m} myPlayerIds={myPlayerIds} onSelect={setSelectedMatch} />)
                      : <EmptyState message="No matches live right now." />
                    )}
                    {activeTab === 'schedule' && (orderOfPlay.length
                      ? orderOfPlay.map(m => <MatchCard key={m.id} match={m} myPlayerIds={myPlayerIds} onSelect={setSelectedMatch} />)
                      : <EmptyState message="No matches scheduled yet." />
                    )}
                    {activeTab === 'results' && (results.length
                      ? results.map(m => <MatchCard key={m.id} match={m} myPlayerIds={myPlayerIds} onSelect={setSelectedMatch} />)
                      : <EmptyState message="No completed matches yet." />
                    )}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Your players</h2>
                  <FrameworkBadge name="Playing To Excel™" size="xs" />
                </div>
                {(dashboard?.myPlayers ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-400">No players from your roster in this event.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.myPlayers.map(p => (
                      <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[--primary-green] text-xs font-bold text-white">
                            {p.full_name?.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase()}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{p.full_name}</p>
                            <p className="text-xs text-gray-400">Rank {p.ranking_current ?? '—'}</p>
                          </div>
                        </div>
                        {p.today_prep_notes?.length > 0 && (
                          <p className="mt-2 text-xs text-gray-500 border-l-2 border-[--primary-green]/40 pl-2">
                            {p.today_prep_notes[0].notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {dashboard?.upcomingMatches?.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next up for your players</p>
                    <div className="space-y-1.5">
                      {dashboard.upcomingMatches.map(m => (
                        <div key={m.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                          <span className="font-medium text-gray-700">
                            {m.player1_name ?? 'TBD'} <span className="text-gray-400 font-normal">vs</span> {m.player2_name ?? 'TBD'}
                          </span>
                          <span className="text-xs text-gray-400">{m.court_label ? `Court ${m.court_label}` : m.round_label ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </main>
        )}
      </div>

      {selectedMatch && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={() => setSelectedMatch(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Match detail</h3>
              <button type="button" onClick={() => setSelectedMatch(null)} className="rounded-full p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Close">✕</button>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div>
                <p className="font-semibold text-gray-800">{selectedMatch.player1_name ?? 'TBD'}</p>
                <p className="text-2xl font-bold text-[--primary-green]">{selectedMatch.score_p1 ?? '—'}</p>
              </div>
              <p className="text-xs text-gray-400 font-medium">VS</p>
              <div>
                <p className="font-semibold text-gray-800">{selectedMatch.player2_name ?? 'TBD'}</p>
                <p className="text-2xl font-bold text-[--primary-green]">{selectedMatch.score_p2 ?? '—'}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-gray-500">
              {selectedMatch.round_label       && <p><span className="font-medium text-gray-700">Round:</span> {selectedMatch.round_label}</p>}
              {selectedMatch.court_label       && <p><span className="font-medium text-gray-700">Court:</span> {selectedMatch.court_label}</p>}
              {selectedMatch.scheduled_time    && <p><span className="font-medium text-gray-700">Time:</span> {new Date(selectedMatch.scheduled_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>}
              {selectedMatch.status            && <p><span className="font-medium text-gray-700">Status:</span> {selectedMatch.status}</p>}
              {selectedMatch.retirement_reason && <p><span className="font-medium text-gray-700">Note:</span> {selectedMatch.retirement_reason}</p>}
            </div>
            <button type="button" onClick={() => setSelectedMatch(null)}
              className="mt-5 w-full rounded-lg bg-[--primary-green] py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
              Close
            </button>
          </div>
        </div>
      )}

      <BottomNav activePage="tournaments" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}

function MatchCard({ match: m, myPlayerIds, onSelect }) {
  const cfg = MATCH_STATUS_CFG[m.status] ?? MATCH_STATUS_CFG.scheduled;
  const hasMyPlayer = myPlayerIds.includes(m.player1_id) || myPlayerIds.includes(m.player2_id);
  return (
    <button type="button" onClick={() => onSelect(m)}
      className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]
        ${hasMyPlayer ? 'border-[--primary-green] bg-[#f0f7f3]' : 'border-gray-200 bg-white'}
        ${m.status === 'cancelled' ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-xs ${cfg.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />{cfg.label}
        </span>
        <span className="text-xs text-gray-400">{m.court_label ? `Court ${m.court_label}` : ''}{m.round_label ? ` · ${m.round_label}` : ''}</span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <p className={`truncate text-sm ${myPlayerIds.includes(m.player1_id) ? 'font-semibold text-[--primary-green]' : 'text-gray-700'}`}>{m.player1_name ?? 'TBD'}</p>
        <span className="text-xs font-semibold text-gray-400">vs</span>
        <p className={`truncate text-sm text-right ${myPlayerIds.includes(m.player2_id) ? 'font-semibold text-[--primary-green]' : 'text-gray-700'}`}>{m.player2_name ?? 'TBD'}</p>
      </div>
      {(m.status === 'completed' || m.status === 'live') && m.score_p1 != null && (
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs font-mono text-gray-500">
          <p>{m.score_p1}</p><p className="text-gray-300">—</p><p className="text-right">{m.score_p2}</p>
        </div>
      )}
      {hasMyPlayer && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[--primary-green] px-2 py-0.5 text-[10px] font-semibold text-white">★ Your player</span>}
    </button>
  );
}

function Chip({ label, icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
      {icon && <span>{icon}</span>}{label}
    </span>
  );
}

function StatTile({ label, value, colour }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <p className={`text-2xl font-bold ${colour}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
