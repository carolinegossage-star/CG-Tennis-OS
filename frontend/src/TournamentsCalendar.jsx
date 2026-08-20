import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { useTournaments, groupByMonth, ENTRY_STATUS_LABELS, ENTRY_STATUS_COLOURS } from '../hooks/useTournaments';

export default function TournamentsCalendar() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, removeToast }                       = useToast();
  const { tournaments, loading, error, refetch }      = useTournaments();
  const [view, setView]                 = useState('calendar');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch]             = useState('');

  const filtered = useMemo(() => {
    return tournaments
      .filter(t => {
        if (filterStatus !== 'all' && t.entry_status !== filterStatus) return false;
        if (search && !t.name?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => new Date(a.start_date ?? a.entry_deadline ?? 0) - new Date(b.start_date ?? b.entry_deadline ?? 0));
  }, [tournaments, filterStatus, search]);

  const calendarGroups = useMemo(() => groupByMonth(filtered), [filtered]);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="tournaments" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Tournament Calendar</h1>
          <span className="text-xs text-gray-400">World tournament finder powered by TennisAtlas</span>
          <span className="ml-auto text-sm text-gray-400">{filtered.length} tournaments</span>
        </header>

        {loading && <LoadingOverlay message="Loading tournaments…" />}

        {error && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            Failed to load tournaments: {error}
            <button type="button" onClick={refetch} className="ml-3 underline">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <main className="flex-1 overflow-y-auto p-4">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <input id="tournament-search" name="tournamentSearch" type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search tournaments…"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green] w-48"
                aria-label="Search tournaments" />
              <select id="tournament-entry-status" name="entryStatus" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                aria-label="Filter by entry status">
                <option value="all">All statuses</option>
                {Object.entries(ENTRY_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <div className="ml-auto flex rounded-lg bg-gray-100 p-0.5">
                {[{ key: 'calendar', icon: '📅', label: 'Calendar' }, { key: 'list', icon: '☰', label: 'List' }].map(v => (
                  <button key={v.key} type="button" onClick={() => setView(v.key)} aria-pressed={view === v.key}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === v.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
                <p className="text-2xl mb-2">🎾</p>
                <p className="text-sm text-gray-400">{search || filterStatus !== 'all' ? 'No tournaments match your filter.' : 'No tournaments added yet.'}</p>
              </div>
            )}

            {view === 'calendar' && filtered.length > 0 && (
              <div className="space-y-8">
                {[...calendarGroups.entries()].map(([month, items]) => (
                  <section key={month}>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{month}</h2>
                    <div className="space-y-2">
                      {items.map(t => <TournamentCard key={t.id} tournament={t} />)}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {view === 'list' && filtered.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Tournament</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Date</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Deadline</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {t.name}
                          {t.venue && <span className="block text-xs text-gray-400">{t.venue}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{formatDate(t.start_date)}</td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                          <DeadlinePill deadline={t.entry_deadline} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ENTRY_STATUS_COLOURS[t.entry_status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {ENTRY_STATUS_LABELS[t.entry_status] ?? t.entry_status ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {t.live_event_id
                            ? <Link to={`/tournaments/events/${t.live_event_id}/live`} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">🔴 Go Live</Link>
                            : <Link to={`/tournaments/${t.id}`} className="text-xs text-[--primary-green] hover:underline">View →</Link>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        )}
      </div>
      <BottomNav activePage="tournaments" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}

function TournamentCard({ tournament: t }) {
  const daysUntilDeadline = t.entry_deadline
    ? Math.ceil((new Date(t.entry_deadline) - Date.now()) / 86_400_000) : null;
  const deadlineUrgent = daysUntilDeadline != null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800 truncate">{t.name}</h3>
            {t.grade && <span className="text-xs text-gray-400">{t.grade}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            {t.venue && <span>📍 {t.venue}</span>}
            {t.start_date && <span>📅 {formatDate(t.start_date)}{t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ''}</span>}
            {t.surface && <span>🎾 {t.surface.charAt(0).toUpperCase() + t.surface.slice(1)}</span>}
          </div>
          {daysUntilDeadline != null && (
            <p className={`mt-1.5 text-xs ${deadlineUrgent ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
              {daysUntilDeadline < 0 ? 'Deadline passed' : daysUntilDeadline === 0 ? '⚠ Deadline today' : `Entry deadline: ${formatDate(t.entry_deadline)} (${daysUntilDeadline}d)`}
            </p>
          )}
          {t.entered_players?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {t.entered_players.map(p => (
                <span key={p.id} className="rounded-full bg-[--primary-green]/10 px-2 py-0.5 text-[10px] font-medium text-[--primary-green]">
                  {p.full_name ?? p.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ENTRY_STATUS_COLOURS[t.entry_status] ?? 'bg-gray-100 text-gray-500'}`}>
            {ENTRY_STATUS_LABELS[t.entry_status] ?? t.entry_status ?? '—'}
          </span>
          {t.live_event_id
            ? <Link to={`/tournaments/events/${t.live_event_id}/live`} className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">🔴 Go Live</Link>
            : <Link to={`/tournaments/${t.id}`} className="text-xs text-[--primary-green] hover:underline">View →</Link>
          }
        </div>
      </div>
    </div>
  );
}

function DeadlinePill({ deadline }) {
  if (!deadline) return <span className="text-gray-300">—</span>;
  const days = Math.ceil((new Date(deadline) - Date.now()) / 86_400_000);
  if (days < 0)  return <span className="text-gray-400">Passed</span>;
  if (days === 0) return <span className="text-red-500 font-semibold">Today</span>;
  if (days <= 7)  return <span className="text-orange-500 font-medium">{formatDate(deadline)} ⚠</span>;
  return <span>{formatDate(deadline)}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}