import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const PROGRAMME_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'group', label: 'Group' },
  { value: 'pair', label: 'Pair' },
];

const DAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 0, short: 'Sun', label: 'Sunday' },
];

const TYPE_STYLE = {
  individual: 'bg-blue-100 text-blue-700',
  group: 'bg-purple-100 text-purple-700',
  pair: 'bg-amber-100 text-amber-700',
};

const EMPTY_FORM = {
  name: '',
  programme_type: 'individual',
  days_of_week: [],
  start_time: '',
  duration_minutes: 60,
  location: '',
  capacity: '',
  notes: '',
};

function headers(json = false) {
  return {
    Authorization: `Bearer ${localStorage.getItem('cgto_token')}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

function weekdayLabel(days) {
  const order = Array.isArray(days) ? days : [];
  return order.length ? DAYS.filter(day => order.includes(day.value)).map(day => day.short).join(' · ') : 'Schedule not set';
}

function formattedTime(time) {
  if (!time) return 'Time not set';
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function Modal({ children, onClose, labelledBy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/45 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl" onMouseDown={event => event.stopPropagation()}>
        {children}
      </section>
    </div>
  );
}

function ProgrammeForm({ programme, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => Object.assign({}, EMPTY_FORM, programme, { days_of_week: programme?.days_of_week ?? [] }));
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const toggleDay = day => setForm(current => ({
    ...current,
    days_of_week: current.days_of_week.includes(day)
      ? current.days_of_week.filter(value => value !== day)
      : [...current.days_of_week, day].sort((a, b) => a - b),
  }));

  const submit = event => {
    event.preventDefault();
    onSubmit({
      ...form,
      name: form.name.trim(),
      duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  const inputClass = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[--primary-green] focus:ring-2 focus:ring-[--primary-green]/20';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-500';

  return (
    <form className="p-5 sm:p-6" onSubmit={submit}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="programme-form-title" className="text-lg font-bold text-gray-900">{programme ? 'Edit Programme' : 'Create Programme'}</h2>
          <p className="mt-1 text-sm text-gray-500">This structured schedule can be assigned to players and linked to each session.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Close Programme form">✕</button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>Programme name<span className="ml-1 text-red-500">*</span><input id="programme-name" name="name" required maxLength="255" value={form.name} onChange={event => update('name', event.target.value)} className={inputClass} placeholder="e.g. Wednesday Advanced Group" /></label>
        <label className={labelClass}>Programme type<select id="programme-type" name="programmeType" value={form.programme_type} onChange={event => update('programme_type', event.target.value)} className={inputClass}>{PROGRAMME_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label className={labelClass}>Capacity<input id="programme-capacity" name="capacity" type="number" min="1" step="1" value={form.capacity ?? ''} onChange={event => update('capacity', event.target.value)} className={inputClass} placeholder={form.programme_type === 'individual' ? '1' : 'Optional'} /></label>
      </div>

      <fieldset className="mt-6 border-t border-gray-100 pt-5">
        <legend className="text-sm font-bold text-gray-900">Recurring schedule</legend>
        <p className="mt-1 text-xs text-gray-500">Select the days on which this Programme normally runs. This is a schedule, not a record of attendance.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map(day => <label key={day.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition ${form.days_of_week.includes(day.value) ? 'border-[--primary-green] bg-green-50 text-[--primary-green]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}><input type="checkbox" className="sr-only" checked={form.days_of_week.includes(day.value)} onChange={() => toggleDay(day.value)} /><span aria-hidden="true">{day.short}</span><span className="sr-only">{day.label}</span></label>)}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>Start time<input id="programme-start-time" name="startTime" type="time" value={form.start_time ? form.start_time.slice(0, 5) : ''} onChange={event => update('start_time', event.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Duration (minutes)<input id="programme-duration" name="durationMinutes" type="number" min="15" max="480" step="15" value={form.duration_minutes ?? ''} onChange={event => update('duration_minutes', event.target.value)} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Location<input id="programme-location" name="location" value={form.location ?? ''} onChange={event => update('location', event.target.value)} className={inputClass} placeholder="e.g. Court 3, Riverside Tennis Club" maxLength="255" /></label>
        </div>
      </fieldset>

      <label className={`${labelClass} mt-6 border-t border-gray-100 pt-5`}>Coach notes<textarea id="programme-notes" name="notes" rows="4" value={form.notes ?? ''} onChange={event => update('notes', event.target.value)} className={`${inputClass} resize-y`} placeholder="Any practical scheduling or delivery details…" maxLength="5000" /></label>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-[--primary-green] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">{saving ? 'Saving…' : programme ? 'Save changes' : 'Create Programme'}</button>
      </div>
    </form>
  );
}

export default function CoachingProgrammes() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [programmes, setProgrammes] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formProgramme, setFormProgramme] = useState(undefined);
  const [archiveCandidate, setArchiveCandidate] = useState(null);

  const loadProgrammes = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [programmeResponse, analyticsResponse] = await Promise.all([
        fetch(`${API_BASE}/programmes`, { headers: headers() }),
        fetch(`${API_BASE}/programmes/analytics/activity`, { headers: headers() }),
      ]);
      if (!programmeResponse.ok) throw new Error(`Could not load Programmes (${programmeResponse.status})`);
      const programmeData = await programmeResponse.json();
      setProgrammes(programmeData.programmes ?? []);
      if (analyticsResponse.ok) setAnalytics(await analyticsResponse.json());
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadProgrammes(); }, [loadProgrammes]);

  const saveProgramme = async payload => {
    setSaving(true);
    const editing = Boolean(formProgramme?.id);
    try {
      const response = await fetch(`${API_BASE}/programmes${editing ? `/${formProgramme.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: headers(true),
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Could not save Programme');
      setFormProgramme(undefined);
      addToast({ type: 'success', message: editing ? 'Programme updated' : 'Programme created' });
      await loadProgrammes({ quiet: true });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const archiveProgramme = async () => {
    if (!archiveCandidate) return;
    try {
      const response = await fetch(`${API_BASE}/programmes/${archiveCandidate.id}`, { method: 'DELETE', headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not archive Programme');
      setArchiveCandidate(null);
      addToast({ type: 'success', message: 'Programme archived. Historical sessions remain linked.' });
      await loadProgrammes({ quiet: true });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    }
  };

  const summary = analytics?.summary ?? {};

  return (
    <div className="flex min-h-screen bg-gray-50 pb-20 md:pb-0">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="programmes" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <button type="button" className="rounded p-1 text-gray-600 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Open navigation">☰</button>
          <div><h1 className="text-lg font-bold text-gray-900">Coaching Programmes</h1><p className="hidden text-xs text-gray-500 sm:block">Structured schedules that connect players, sessions and activity.</p></div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2" aria-label="Player and Programme actions">
            <Link to="/players" className="rounded-lg border border-[--primary-green] bg-green-50 px-3 py-2 text-sm font-bold text-[--primary-green] transition hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Players</Link>
            <Link to="/programmes" aria-current="page" className="rounded-lg border border-violet-300 bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Programmes</Link>
            <button type="button" onClick={() => setFormProgramme(null)} className="rounded-lg bg-[--primary-green] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">+ Create Programme</button>
          </div>
        </header>

        {loading && <LoadingOverlay message="Loading Coaching Programmes…" />}
        {!loading && <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Programme activity summary">
            {[
              ['Active Programmes', summary.active_programmes ?? 0, 'text-gray-900'],
              ['Players assigned', summary.assigned_players ?? 0, 'text-[--primary-green]'],
              ['Sessions · 30 days', summary.sessions_last_30_days ?? 0, 'text-gray-900'],
              ['Completed · 30 days', summary.completed_sessions_last_30_days ?? 0, 'text-purple-700'],
            ].map(([label, value, colour]) => <div key={label} className="rounded-xl border border-gray-200 bg-white p-4"><p className={`text-2xl font-bold ${colour}`}>{value}</p><p className="mt-1 text-xs font-medium text-gray-500">{label}</p></div>)}
          </section>

          {programmes.length === 0 ? <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><h2 className="text-base font-bold text-gray-800">Create your first Coaching Programme</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-500">Programmes give recurring coaching activity a structured home. Assign them to players, then select one while logging a session.</p><button type="button" onClick={() => setFormProgramme(null)} className="mt-5 rounded-lg bg-[--primary-green] px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Create Programme</button></section> : <section aria-labelledby="programme-list-title"><div className="mb-4"><h2 id="programme-list-title" className="text-base font-bold text-gray-900">Active Programmes</h2><p className="mt-0.5 text-sm text-gray-500">Each card reflects its current roster and the last 30 days of linked session activity.</p></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{programmes.map(programme => <article key={programme.id} className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold text-gray-900">{programme.name}</h3><p className="mt-1 text-sm text-gray-500">{weekdayLabel(programme.days_of_week)} · {formattedTime(programme.start_time)}{programme.duration_minutes ? ` · ${programme.duration_minutes} mins` : ''}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_STYLE[programme.programme_type] ?? 'bg-gray-100 text-gray-600'}`}>{PROGRAMME_TYPES.find(type => type.value === programme.programme_type)?.label ?? programme.programme_type}</span></div><div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-3"><div className="pr-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Roster</p><p className="mt-1 text-sm font-bold text-gray-800">{programme.active_player_count}{programme.capacity ? ` / ${programme.capacity}` : ''}</p></div><div className="px-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">30 day sessions</p><p className="mt-1 text-sm font-bold text-gray-800">{programme.sessions_last_30_days}</p></div><div className="pl-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Completed</p><p className="mt-1 text-sm font-bold text-gray-800">{programme.completed_sessions_last_30_days}</p></div></div>{programme.location && <p className="mt-3 text-sm text-gray-600"><span className="font-semibold text-gray-700">Location:</span> {programme.location}</p>}{programme.last_session_date && <p className="mt-1 text-xs text-gray-500">Last linked session: {new Date(programme.last_session_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setFormProgramme(programme)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">Edit schedule</button><button type="button" onClick={() => setArchiveCandidate(programme)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Archive</button></div></article>)}</div></section>}
        </main>}
      </div>

      {formProgramme !== undefined && <Modal onClose={() => setFormProgramme(undefined)} labelledBy="programme-form-title"><ProgrammeForm programme={formProgramme} saving={saving} onCancel={() => setFormProgramme(undefined)} onSubmit={saveProgramme} /></Modal>}
      {archiveCandidate && <Modal onClose={() => setArchiveCandidate(null)} labelledBy="archive-programme-title"><div className="p-5 sm:p-6"><h2 id="archive-programme-title" className="text-lg font-bold text-gray-900">Archive {archiveCandidate.name}?</h2><p className="mt-2 text-sm leading-6 text-gray-600">This removes the Programme from new player assignments and new session logs. Existing session history stays intact and linked for analytics.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setArchiveCandidate(null)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button><button type="button" onClick={archiveProgramme} className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Archive Programme</button></div></div></Modal>}

      <BottomNav activePage="programmes" />
      {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={removeToast} />)}
    </div>
  );
}
