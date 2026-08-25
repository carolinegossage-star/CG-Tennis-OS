import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const RISK_CONFIG = {
  low: { className: 'bg-green-100 text-green-700', label: 'Low risk' },
  medium: { className: 'bg-amber-100 text-amber-700', label: 'Medium risk' },
  high: { className: 'bg-orange-100 text-orange-700', label: 'High risk' },
  critical: { className: 'bg-red-100 text-red-700', label: 'Critical' },
};

const EMPTY_FORM = {
  name: '',
  date_of_birth: '',
  gender: '',
  nationality: '',
  email: '',
  phone: '',
  parent_name: '',
  parent_email: '',
  parent_phone: '',
  ranking_current: '',
  lta_id: '',
  itf_id: '',
  notes: '',
};

const QUICK_TAGS = ['Forehand depth', 'Serve placement', 'Great effort'];

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('cgto_token')}` };
}

function jsonHeaders() {
  return { ...authHeaders(), 'Content-Type': 'application/json' };
}

function playerInitials(name) {
  return (name ?? 'P').split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
}

function formatDate(value) {
  if (!value) return 'Not logged yet';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function playerAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function formattedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}/10` : '—';
}

function riskFor(player) {
  const risks = [player.burnout_risk_level, player.dropout_risk_level];
  if (risks.includes('critical')) return 'critical';
  if (risks.includes('high')) return 'high';
  if (risks.includes('medium')) return 'medium';
  return 'low';
}

function modalClassName() {
  return 'fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 p-0 sm:items-center sm:p-4';
}

function Modal({ children, onClose, labelledBy, wide = false }) {
  return (
    <div className={modalClassName()} role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
        onMouseDown={event => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

function RiskPill({ level }) {
  const risk = RISK_CONFIG[level] ?? RISK_CONFIG.low;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${risk.className}`}>{risk.label}</span>;
}

function PlayerForm({ player, programmes, submitting, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => Object.assign({}, EMPTY_FORM, player, {
    programme_ids: player?.programme_ids ?? player?.programmes?.map(programme => programme.id) ?? [],
  }));

  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const submit = event => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(EMPTY_FORM).map(([field]) => [field, form[field] ?? '']));
    payload.name = payload.name.trim();
    payload.ranking_current = payload.ranking_current === '' ? null : Number(payload.ranking_current);
    Object.keys(payload).forEach(field => {
      if (typeof payload[field] === 'string') payload[field] = payload[field].trim() || null;
    });
    payload.programme_ids = form.programme_ids ?? [];
    onSubmit(payload);
  };

  const inputClass = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[--primary-green] focus:ring-2 focus:ring-[--primary-green]/20';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-500';

  return (
    <form onSubmit={submit} className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="player-form-title" className="text-lg font-bold text-gray-900">{player ? 'Edit player record' : 'Add a player'}</h2>
          <p className="mt-1 text-sm text-gray-500">Keep player, guardian and coaching details together in one secure record.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Close player form">✕</button>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-bold text-gray-800">Player details</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>Full name<span className="ml-1 text-red-500">*</span><input id="player-name" name="name" value={form.name ?? ''} onChange={event => update('name', event.target.value)} className={inputClass} required maxLength="255" autoComplete="name" /></label>
          <label className={labelClass}>Date of birth<input id="player-date-of-birth" name="date_of_birth" type="date" value={form.date_of_birth ? String(form.date_of_birth).slice(0, 10) : ''} onChange={event => update('date_of_birth', event.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Gender<select id="player-gender" name="gender" value={form.gender ?? ''} onChange={event => update('gender', event.target.value)} className={inputClass}><option value="">Not specified</option><option value="Female">Female</option><option value="Male">Male</option><option value="Non-binary">Non-binary</option><option value="Prefer not to say">Prefer not to say</option></select></label>
          <label className={labelClass}>Nationality<input id="player-nationality" name="nationality" value={form.nationality ?? ''} onChange={event => update('nationality', event.target.value)} className={inputClass} maxLength="100" autoComplete="country-name" /></label>
          <label className={labelClass}>Player email<input id="player-email" name="email" type="email" value={form.email ?? ''} onChange={event => update('email', event.target.value)} className={inputClass} autoComplete="email" /></label>
          <label className={labelClass}>Player phone<input id="player-phone" name="phone" type="tel" value={form.phone ?? ''} onChange={event => update('phone', event.target.value)} className={inputClass} autoComplete="tel" /></label>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-gray-100 pt-5">
        <legend className="text-sm font-bold text-gray-800">Coaching Programmes</legend>
        <p className="mt-1 text-xs leading-5 text-gray-500">Select the existing Programmes this player attends. Hold Ctrl or Command to choose more than one.</p>
        <label className={`${labelClass} mt-3`}>Assigned Programmes
          <select id="player-programmes" name="programmeIds" multiple value={form.programme_ids ?? []} onChange={event => update('programme_ids', Array.from(event.target.selectedOptions, option => option.value))} className={`${inputClass} h-32`} aria-describedby="player-programmes-help">
            {programmes.map(programme => <option key={programme.id} value={programme.id}>{programme.name} · {programme.programme_type}</option>)}
          </select>
        </label>
        <p id="player-programmes-help" className="mt-2 text-xs text-gray-500">{programmes.length ? 'Programme assignments are structured links, not free-text notes.' : 'Create a Coaching Programme first, then return here to assign it.'}</p>
      </fieldset>

      <fieldset className="mt-6 border-t border-gray-100 pt-5">
        <legend className="text-sm font-bold text-gray-800">Parent or guardian</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>Name<input id="player-parent-name" name="parent_name" value={form.parent_name ?? ''} onChange={event => update('parent_name', event.target.value)} className={inputClass} maxLength="255" autoComplete="name" /></label>
          <label className={labelClass}>Email<input id="player-parent-email" name="parent_email" type="email" value={form.parent_email ?? ''} onChange={event => update('parent_email', event.target.value)} className={inputClass} autoComplete="email" /></label>
          <label className={labelClass}>Phone<input id="player-parent-phone" name="parent_phone" type="tel" value={form.parent_phone ?? ''} onChange={event => update('parent_phone', event.target.value)} className={inputClass} autoComplete="tel" /></label>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-gray-100 pt-5">
        <legend className="text-sm font-bold text-gray-800">Tennis profile</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={labelClass}>Current ranking<input id="player-ranking" name="ranking_current" type="number" min="1" step="1" value={form.ranking_current ?? ''} onChange={event => update('ranking_current', event.target.value)} className={inputClass} /></label>
          <label className={labelClass}>LTA ID<input id="player-lta-id" name="lta_id" value={form.lta_id ?? ''} onChange={event => update('lta_id', event.target.value)} className={inputClass} maxLength="100" /></label>
          <label className={labelClass}>ITF ID<input id="player-itf-id" name="itf_id" value={form.itf_id ?? ''} onChange={event => update('itf_id', event.target.value)} className={inputClass} maxLength="100" /></label>
        </div>
        <label className={`${labelClass} mt-4`}>Coaching notes<textarea id="player-notes" name="notes" rows="4" value={form.notes ?? ''} onChange={event => update('notes', event.target.value)} className={`${inputClass} resize-y`} maxLength="5000" /></label>
      </fieldset>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Cancel</button>
        <button type="submit" disabled={submitting} className="rounded-lg bg-[--primary-green] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">{submitting ? 'Saving…' : player ? 'Save changes' : 'Create player'}</button>
      </div>
    </form>
  );
}

export default function PlayerRetention() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [players, setPlayers] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [stats, setStats] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState('all');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formPlayer, setFormPlayer] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftTags, setDraftTags] = useState([]);
  const [draftLoading, setDraftLoading] = useState(false);

  const fetchPlayers = useCallback(async () => {
    const response = await fetch(`${API_BASE}/players?limit=100`, { headers: authHeaders() });
    if (!response.ok) throw new Error(`Could not load players (${response.status})`);
    const data = await response.json();
    setPlayers(Array.isArray(data) ? data : (data.players ?? []));
  }, []);

  const fetchProgrammes = useCallback(async () => {
    const response = await fetch(`${API_BASE}/programmes`, { headers: authHeaders() });
    if (!response.ok) throw new Error(`Could not load Programmes (${response.status})`);
    const data = await response.json();
    setProgrammes(data.programmes ?? []);
  }, []);

  const fetchStats = useCallback(async () => {
    const response = await fetch(`${API_BASE}/players/analytics/retention`, { headers: authHeaders() });
    if (response.ok) setStats(await response.json());
  }, []);

  const fetchFlags = useCallback(async () => {
    const response = await fetch(`${API_BASE}/coach/retention-flags`, { headers: authHeaders() });
    if (response.ok) setFlags((await response.json()).flags ?? []);
  }, []);

  const refreshDatabase = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      await Promise.all([fetchPlayers(), fetchProgrammes(), fetchStats(), fetchFlags()]);
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [addToast, fetchFlags, fetchPlayers, fetchProgrammes, fetchStats]);

  useEffect(() => { refreshDatabase(); }, [refreshDatabase]);

  const filteredPlayers = useMemo(() => players.filter(player => {
    const normalizedSearch = search.trim().toLowerCase();
    const playerRisk = riskFor(player);
    return (filterRisk === 'all' || playerRisk === filterRisk)
      && (!normalizedSearch || [player.name, player.email, player.parent_name].some(value => value?.toLowerCase().includes(normalizedSearch)));
  }), [filterRisk, players, search]);

  const atRiskCount = players.filter(player => ['high', 'critical'].includes(riskFor(player))).length;
  const averageEngagement = stats?.summary?.avg_engagement;

  const closePlayerPanel = () => {
    setSelectedPlayer(null);
    setDraft(null);
    setDraftTags([]);
    setShowArchiveConfirm(false);
  };

  const openPlayer = async player => {
    setSelectedPlayer(player);
    setDetailLoading(true);
    setDraft(null);
    setDraftTags([]);
    try {
      const response = await fetch(`${API_BASE}/players/${player.id}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`Could not load player profile (${response.status})`);
      setSelectedPlayer(await response.json());
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const savePlayer = async payload => {
    setSaving(true);
    const isEditing = Boolean(formPlayer?.id);
    try {
      const response = await fetch(`${API_BASE}/players${isEditing ? `/${formPlayer.id}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.errors?.[0]?.msg || 'Could not save player');
      setFormPlayer(undefined);
      if (isEditing) setSelectedPlayer(current => current?.id === result.id ? { ...current, ...result } : current);
      addToast({ type: 'success', message: isEditing ? 'Player record updated' : 'Player added to the database' });
      await refreshDatabase({ quiet: true });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const archivePlayer = async () => {
    if (!selectedPlayer) return;
    setArchiving(true);
    try {
      const response = await fetch(`${API_BASE}/players/${selectedPlayer.id}`, { method: 'DELETE', headers: authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not archive player');
      closePlayerPanel();
      addToast({ type: 'success', message: 'Player profile archived' });
      await refreshDatabase({ quiet: true });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setArchiving(false);
    }
  };

  const handleFlag = async (flagId, action) => {
    try {
      const response = await fetch(`${API_BASE}/coach/retention-flags/${flagId}/${action}`, { method: 'POST', headers: authHeaders() });
      if (!response.ok) throw new Error('Could not update early warning');
      setFlags(current => current.filter(flag => flag.id !== flagId));
      addToast({ type: 'success', message: action === 'resolve' ? 'Follow-up recorded' : 'Warning dismissed for 14 days' });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    }
  };

  const generateDraft = async () => {
    if (!selectedPlayer || draftLoading) return;
    setDraftLoading(true);
    try {
      const response = await fetch(`${API_BASE}/coach/parent-draft`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          player_id: selectedPlayer.id,
          tags: draftTags,
          include_retention_context: flags.some(flag => flag.player_id === selectedPlayer.id),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create draft');
      setDraft(result);
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setDraftLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!draft?.content) return;
    try {
      await navigator.clipboard.writeText(draft.content);
      if (draft.id) await fetch(`${API_BASE}/coach/parent-draft/${draft.id}/approve`, { method: 'POST', headers: authHeaders() });
      addToast({ type: 'success', message: 'Draft copied. Review and send it manually.' });
    } catch {
      addToast({ type: 'error', message: 'Could not copy the draft' });
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="players" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <button type="button" className="rounded p-1 text-gray-600 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Open navigation">☰</button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">Player database</h1>
              <FrameworkBadge name="Playing To Excel™" size="xs" />
            </div>
            <p className="hidden text-xs text-gray-500 sm:block">A clear coaching record for every player.</p>
          </div>
          <button type="button" onClick={() => setFormPlayer(null)} className="ml-auto rounded-lg bg-[--primary-green] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">+ Add player</button>
        </header>

        {loading && <LoadingOverlay message="Loading player database…" />}

        {!loading && (
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {flags.length > 0 && (
              <section className="mb-6" aria-labelledby="player-warnings-title">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 id="player-warnings-title" className="text-sm font-bold text-gray-900">Early warnings</h2>
                    <p className="mt-0.5 text-xs text-gray-500">Signals that need your coaching judgement.</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{flags.length}</span>
                </div>
                <div className="space-y-3">
                  {flags.map(flag => (
                    <article key={flag.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-amber-950">{flag.player_name} may need a check-in</p>
                          <p className="mt-1 text-sm leading-5 text-amber-900">{flag.flag_reason || `${flag.context?.daysSinceLastSession ?? 21} days since the last logged session.`}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => handleFlag(flag.id, 'resolve')} className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">Follow-up complete</button>
                          <button type="button" onClick={() => handleFlag(flag.id, 'dismiss')} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">Dismiss</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Player database summary">
              {[
                { label: 'Active players', value: players.length, className: 'text-gray-900' },
                { label: 'Need a check-in', value: atRiskCount, className: atRiskCount ? 'text-orange-600' : 'text-gray-900' },
                { label: 'Avg engagement', value: formattedScore(averageEngagement), className: 'text-[--primary-green]' },
                { label: 'Open warnings', value: flags.length, className: flags.length ? 'text-amber-700' : 'text-gray-900' },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className={`text-2xl font-bold ${item.className}`}>{item.value}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">{item.label}</p>
                </div>
              ))}
            </section>

            <section aria-labelledby="player-list-title">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 id="player-list-title" className="text-base font-bold text-gray-900">Players</h2>
                  <p className="mt-0.5 text-sm text-gray-500">{filteredPlayers.length} of {players.length} active profile{players.length === 1 ? '' : 's'}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="sr-only" htmlFor="player-search">Search players</label>
                  <input id="player-search" name="playerSearch" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player or guardian…" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[--primary-green] focus:ring-2 focus:ring-[--primary-green]/20 sm:w-60" />
                  <label className="sr-only" htmlFor="player-risk-filter">Filter by risk level</label>
                  <select id="player-risk-filter" name="riskLevel" value={filterRisk} onChange={event => setFilterRisk(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-[--primary-green] focus:ring-2 focus:ring-[--primary-green]/20">
                    <option value="all">All risk levels</option>
                    <option value="critical">Critical</option>
                    <option value="high">High risk</option>
                    <option value="medium">Medium risk</option>
                    <option value="low">Low risk</option>
                  </select>
                </div>
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
                  <p className="text-base font-semibold text-gray-700">No player profiles match this view.</p>
                  <p className="mt-1 text-sm text-gray-500">Change your search or add a new player to begin building the database.</p>
                  {players.length === 0 && <button type="button" onClick={() => setFormPlayer(null)} className="mt-4 rounded-lg bg-[--primary-green] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Add first player</button>}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {filteredPlayers.map(player => {
                    const age = playerAge(player.date_of_birth);
                    const risk = riskFor(player);
                    return (
                      <button key={player.id} type="button" onClick={() => openPlayer(player)} className="group rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[--primary-green] text-sm font-bold text-white">{playerInitials(player.name)}</span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-900">{player.name}</p>
                              <p className="mt-0.5 truncate text-xs text-gray-500">{[age != null ? `Age ${age}` : null, player.gender, player.nationality].filter(Boolean).join(' · ') || 'Profile details to complete'}</p>
                            </div>
                          </div>
                          <RiskPill level={risk} />
                        </div>
                        <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3">
                          <div className="pr-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Engagement</p><p className="mt-1 text-sm font-bold text-gray-800">{formattedScore(player.current_engagement ?? player.engagement_score)}</p></div>
                          <div className="px-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">This month</p><p className="mt-1 text-sm font-bold text-gray-800">{player.sessions_this_month ?? 0} sessions</p></div>
                          <div className="pl-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Last session</p><p className="mt-1 text-sm font-bold text-gray-800">{player.last_session_date ? formatDate(player.last_session_date).replace(/ \d{4}$/, '') : '—'}</p></div>
                        </div>
                        {player.programmes?.length > 0 && <p className="mt-3 truncate text-xs text-gray-500"><span className="font-semibold text-gray-700">Programmes:</span> {player.programmes.map(programme => programme.name).join(' · ')}</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </main>
        )}
      </div>

      {selectedPlayer && (
        <Modal onClose={closePlayerPanel} labelledBy="player-detail-title">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[--primary-green] text-base font-bold text-white">{playerInitials(selectedPlayer.name)}</span>
                <div className="min-w-0">
                  <h2 id="player-detail-title" className="truncate text-lg font-bold text-gray-900">{selectedPlayer.name}</h2>
                  <p className="mt-0.5 text-sm text-gray-500">{[playerAge(selectedPlayer.date_of_birth) != null ? `Age ${playerAge(selectedPlayer.date_of_birth)}` : null, selectedPlayer.gender, selectedPlayer.nationality].filter(Boolean).join(' · ') || 'Player profile'}</p>
                </div>
              </div>
              <button type="button" onClick={closePlayerPanel} className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Close player profile">✕</button>
            </div>

            {detailLoading ? <div className="py-12 text-center text-sm text-gray-500">Loading complete player record…</div> : <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Engagement', value: formattedScore(selectedPlayer.engagement_score) },
                  { label: 'Sessions logged', value: selectedPlayer.total_sessions ?? 0 },
                  { label: 'This month', value: selectedPlayer.sessions_this_month ?? 0 },
                  { label: 'Last session', value: selectedPlayer.last_session_date ? formatDate(selectedPlayer.last_session_date).replace(/ \d{4}$/, '') : '—' },
                ].map(item => <div key={item.label} className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{item.label}</p><p className="mt-1 text-sm font-bold text-gray-800">{item.value}</p></div>)}
              </div>

              <section className="mt-5 border-t border-gray-100 pt-5" aria-labelledby="player-contact-title">
                <h3 id="player-contact-title" className="text-sm font-bold text-gray-900">Contact and tennis profile</h3>
                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {[
                    ['Player email', selectedPlayer.email], ['Player phone', selectedPlayer.phone],
                    ['Parent / guardian', selectedPlayer.parent_name], ['Parent email', selectedPlayer.parent_email],
                    ['Parent phone', selectedPlayer.parent_phone], ['Current ranking', selectedPlayer.ranking_current],
                    ['LTA ID', selectedPlayer.lta_id], ['ITF ID', selectedPlayer.itf_id],
                  ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-0.5 break-words text-gray-700">{value}</dd></div>)}
                  {!selectedPlayer.email && !selectedPlayer.phone && !selectedPlayer.parent_name && !selectedPlayer.ranking_current && <p className="text-sm text-gray-500">Contact and ranking details have not been added yet.</p>}
                </dl>
              </section>

              <section className="mt-5 border-t border-gray-100 pt-5" aria-labelledby="player-programmes-title"><h3 id="player-programmes-title" className="text-sm font-bold text-gray-900">Coaching Programmes</h3>{selectedPlayer.programmes?.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedPlayer.programmes.map(programme => <span key={programme.id} className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-[--primary-green]">{programme.name} · {programme.programme_type}</span>)}</div> : <p className="mt-2 text-sm text-gray-500">No Programmes assigned. Edit the record to link this player to a coaching schedule.</p>}</section>

              {selectedPlayer.notes && <section className="mt-5 border-t border-gray-100 pt-5" aria-labelledby="player-notes-title"><h3 id="player-notes-title" className="text-sm font-bold text-gray-900">Coaching notes</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{selectedPlayer.notes}</p></section>}

              <section className="mt-5 border-t border-gray-100 pt-5" aria-labelledby="parent-draft-title">
                <div className="flex items-center justify-between gap-3"><div><h3 id="parent-draft-title" className="text-sm font-bold text-gray-900">Parent progress update</h3><p className="mt-0.5 text-xs text-gray-500">Draft only. Copy and review before sending manually.</p></div><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">Draft only</span></div>
                <div className="mt-3 flex flex-wrap gap-2">{QUICK_TAGS.map(tag => <button key={tag} type="button" onClick={() => setDraftTags(tags => tags.includes(tag) ? tags.filter(current => current !== tag) : [...tags, tag])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green] ${draftTags.includes(tag) ? 'border-[--primary-green] bg-green-50 text-[--primary-green]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>{tag}</button>)}</div>
                <button type="button" onClick={generateDraft} disabled={draftLoading} className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-800">{draftLoading ? 'Writing draft…' : draft ? 'Regenerate draft' : 'Create a draft'}</button>
                {draft?.content && <div className="mt-3 rounded-xl bg-gray-50 p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{draft.content}</p><button type="button" onClick={copyDraft} className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Copy text</button></div>}
              </section>

              <div className="mt-6 flex flex-col gap-2 border-t border-gray-100 pt-5 sm:flex-row">
                <button type="button" onClick={() => setFormPlayer(selectedPlayer)} className="rounded-lg bg-[--primary-green] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Edit record</button>
                <button type="button" onClick={() => setShowArchiveConfirm(true)} className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Archive profile</button>
              </div>

              {showArchiveConfirm && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-900">Archive {selectedPlayer.name}?</p><p className="mt-1 text-sm text-red-800">The profile will be removed from the active database. You can retain the underlying record for historical reporting.</p><div className="mt-3 flex gap-2"><button type="button" disabled={archiving} onClick={archivePlayer} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">{archiving ? 'Archiving…' : 'Archive player'}</button><button type="button" onClick={() => setShowArchiveConfirm(false)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Cancel</button></div></div>}
            </>}
          </div>
        </Modal>
      )}

      {formPlayer !== undefined && <Modal onClose={() => setFormPlayer(undefined)} labelledBy="player-form-title" wide><PlayerForm player={formPlayer} programmes={programmes} submitting={saving} onCancel={() => setFormPlayer(undefined)} onSubmit={savePlayer} /></Modal>}

      <BottomNav activePage="players" />
      {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={removeToast} />)}
    </div>
  );
}
