import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_START = `${TODAY.slice(0, 7)}-01`;
const RECEIVED_VIA = [
  { value: 'bank_transfer', label: 'Bank transfer', className: 'bg-indigo-100 text-indigo-800' },
  { value: 'cash', label: 'Cash', className: 'bg-emerald-100 text-emerald-800' },
  { value: 'card_reader', label: 'Card reader', className: 'bg-violet-100 text-violet-800' },
  { value: 'cheque', label: 'Cheque', className: 'bg-amber-100 text-amber-800' },
  { value: 'other', label: 'Other', className: 'bg-slate-100 text-slate-700' },
];
const EMPTY_FORM = { player_id: '', amount: '', received_date: TODAY, received_via: 'bank_transfer', note: '' };

function authHeaders(json = false) {
  return { Authorization: `Bearer ${localStorage.getItem('cgto_token')}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount) : '£0.00';
}
function dateLabel(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function viaConfig(value) {
  return RECEIVED_VIA.find(item => item.value === value) ?? RECEIVED_VIA.at(-1);
}
function Modal({ children, onClose }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="income-form-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onMouseDown={event => event.stopPropagation()}>{children}</section></div>;
}

function IncomeForm({ record, players, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => record ? {
    player_id: record.player_id, amount: record.amount, received_date: String(record.received_date).slice(0, 10), received_via: record.received_via, note: record.note ?? '',
  } : EMPTY_FORM);
  const selectedPlayer = players.find(player => player.id === form.player_id);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = event => {
    event.preventDefault();
    onSubmit({ ...form, amount: Number(form.amount), note: form.note.trim() || null });
  };
  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-500';
  return <form onSubmit={submit} className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Manual bookkeeping</p><h2 id="income-form-title" className="mt-1 text-xl font-black tracking-tight text-slate-950">{record ? 'Edit income record' : 'Record income received'}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Log money you have already received. This form does not take a payment, send an invoice, discount a fee, or contact Stripe.</p></div><button type="button" onClick={onCancel} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" aria-label="Close income form">✕</button></div><div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}>Player<span className="ml-1 text-rose-600">*</span><select value={form.player_id} onChange={event => update('player_id', event.target.value)} required className={fieldClass}><option value="">Select a Player Register entry</option>{players.map(player => <option key={player.id} value={player.id}>{player.name}{player.is_active === false ? ' · inactive' : ''}</option>)}</select></label><label className={labelClass}>Amount received<span className="ml-1 text-rose-600">*</span><div className="relative"><span className="pointer-events-none absolute left-3 top-3 text-sm font-bold text-slate-400">£</span><input type="number" min="0.01" max="1000000" step="0.01" value={form.amount} onChange={event => update('amount', event.target.value)} required placeholder="0.00" className={`${fieldClass} pl-7`} /></div></label><label className={labelClass}>Date received<span className="ml-1 text-rose-600">*</span><input type="date" value={form.received_date} onChange={event => update('received_date', event.target.value)} required className={fieldClass} /></label><label className={labelClass}>Received via<select value={form.received_via} onChange={event => update('received_via', event.target.value)} className={fieldClass}>{RECEIVED_VIA.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={labelClass}>Note<textarea value={form.note} onChange={event => update('note', event.target.value)} rows={2} maxLength="2000" placeholder="e.g. half-term programme fee" className={`${fieldClass} resize-y`} /></label></div>{selectedPlayer && <aside className={`mt-5 rounded-xl border p-4 ${Number(selectedPlayer.open_credit_minutes) > 0 ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start gap-3"><span className="mt-0.5 text-lg" aria-hidden="true">◷</span><div><p className="text-sm font-bold text-slate-900">Session Credit context for {selectedPlayer.name}</p><p className="mt-1 text-xs leading-5 text-slate-600">{Number(selectedPlayer.open_credit_minutes) > 0 ? `${selectedPlayer.open_credit_minutes} minutes of make-up time are currently owed.` : 'No open make-up time is recorded.'} This is shown for awareness only: recording income never applies, offsets, resolves, or changes this balance automatically.</p></div></div></aside>}<div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">{saving ? 'Saving record…' : record ? 'Save correction' : 'Record income'}</button></div></form>;
}

export default function IncomeTracking() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, record_count: 0 });
  const [creditSummary, setCreditSummary] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formRecord, setFormRecord] = useState(undefined);
  const [filters, setFilters] = useState({ player_id: '', from: MONTH_START, to: TODAY });

  const fetchLedger = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.player_id) params.set('player_id', filters.player_id);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const [incomeRes, playerRes, creditRes] = await Promise.all([
        fetch(`${API_BASE}/income-records?${params}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/players?limit=100&active=all`, { headers: authHeaders() }),
        fetch(`${API_BASE}/income-records/summary`, { headers: authHeaders() }),
      ]);
      const incomeData = await incomeRes.json();
      if (!incomeRes.ok) throw new Error(incomeData.error || 'Could not load income records');
      setRecords(incomeData.records ?? []);
      setSummary(incomeData.summary ?? { total_amount: 0, record_count: 0 });
      if (playerRes.ok) {
        const playerData = await playerRes.json();
        setPlayers(Array.isArray(playerData) ? playerData : (playerData.players ?? []));
      }
      if (creditRes.ok) setCreditSummary(await creditRes.json());
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [addToast, filters]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const saveIncome = async payload => {
    setSaving(true);
    const editing = Boolean(formRecord?.id);
    try {
      const response = await fetch(`${API_BASE}/income-records${editing ? `/${formRecord.id}` : ''}`, { method: editing ? 'PUT' : 'POST', headers: authHeaders(true), body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Could not save income record');
      setFormRecord(undefined);
      addToast({ type: 'success', message: editing ? 'Income record corrected' : 'Income recorded in your bookkeeping ledger' });
      await fetchLedger({ quiet: true });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally { setSaving(false); }
  };

  const selectedPlayerName = players.find(player => player.id === filters.player_id)?.name;
  return <div className="flex min-h-screen bg-slate-50 pb-20 md:pb-0"><Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="income" /><div className="flex min-w-0 flex-1 flex-col"><header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6"><button type="button" className="rounded p-1 text-slate-600 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={toggleSidebar} aria-label="Open navigation">☰</button><div><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">Business records</p><h1 className="text-lg font-black tracking-tight text-slate-950">Income ledger</h1></div><button type="button" onClick={() => fetchLedger()} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">↻ Refresh</button><button type="button" onClick={() => setFormRecord(null)} className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">+ Record income</button></header>{loading && <LoadingOverlay message="Loading income records…" />}{!loading && <main className="flex-1 overflow-y-auto p-4 sm:p-6"><section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-800 px-5 py-6 text-white shadow-lg sm:px-7"><div className="relative z-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">Coach-controlled bookkeeping</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Record what has already been received.</h2><p className="mt-2 text-sm leading-6 text-emerald-50">A clear ledger for cash, bank transfers and other real-world payments—without payment collection, invoices or automated fee decisions.</p><button type="button" onClick={() => setFormRecord(null)} className="mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-extrabold text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40">Record income now</button></div><span className="pointer-events-none absolute -right-10 -top-16 text-[180px] font-black text-white/10" aria-hidden="true">£</span></section><section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Income summary"><article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Received in this view</p><p className="mt-1 text-3xl font-black tracking-tight text-emerald-950">{money(summary.total_amount)}</p><p className="mt-1 text-xs font-medium text-emerald-700">{summary.record_count} manual record{summary.record_count === 1 ? '' : 's'}</p></article><article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Selected period</p><p className="mt-1 text-xl font-black tracking-tight text-indigo-950">{filters.from ? dateLabel(filters.from) : 'All time'}</p><p className="mt-1 text-xs font-medium text-indigo-700">{filters.to ? `to ${dateLabel(filters.to)}` : 'No end date'}</p></article><article className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-sky-700">Session Credit owed</p><p className="mt-1 text-3xl font-black tracking-tight text-sky-950">{creditSummary?.open_credit_minutes ?? 0}<span className="ml-1 text-base font-bold">mins</span></p><p className="mt-1 text-xs font-medium text-sky-700">Informational only · coach decides manually</p></article></section>{Number(creditSummary?.open_credit_minutes) > 0 && <aside className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3"><p className="text-sm font-extrabold text-sky-950">◷ {creditSummary.open_credit_count} open Session Credit record{Number(creditSummary.open_credit_count) === 1 ? '' : 's'} across your Player Register</p><p className="mt-1 text-xs leading-5 text-sky-800">These minutes are displayed while you record income so you can make an informed manual decision. They never change an amount, create a discount or trigger a payment action.</p></aside>}<section className="mt-6 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-base font-black text-slate-950">Income records</h2><p className="mt-1 text-sm text-slate-500">{selectedPlayerName ? `Showing records for ${selectedPlayerName}.` : 'Filter by a Player Register entry or time period.'}</p></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Player<select value={filters.player_id} onChange={event => setFilters(current => ({ ...current, player_id: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"><option value="">All players</option>{players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">From<input type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">To<input type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label></div></div>{records.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400"><th className="pb-3 pr-4">Received</th><th className="pb-3 pr-4">Player</th><th className="pb-3 pr-4">Method</th><th className="pb-3 pr-4">Note</th><th className="pb-3 text-right">Amount</th><th className="w-20 pb-3" /></tr></thead><tbody>{records.map(record => { const via = viaConfig(record.received_via); return <tr key={record.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4 text-sm font-semibold text-slate-700">{dateLabel(record.received_date)}</td><td className="py-3 pr-4"><p className="text-sm font-bold text-slate-900">{record.player_name}</p>{Number(record.open_credit_minutes) > 0 && <p className="mt-0.5 text-xs font-semibold text-sky-700">◷ {record.open_credit_minutes} mins credit owed</p>}</td><td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${via.className}`}>{via.label}</span></td><td className="max-w-xs truncate py-3 pr-4 text-sm text-slate-500">{record.note || '—'}</td><td className="py-3 text-right text-base font-black text-emerald-700">{money(record.amount)}</td><td className="py-3 pl-3 text-right"><button type="button" onClick={() => setFormRecord(record)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Edit</button></td></tr>; })}</tbody></table></div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"><p className="text-base font-black text-slate-700">No income records in this view.</p><p className="mt-1 text-sm text-slate-500">Start the ledger with money you have already received from a player.</p><button type="button" onClick={() => setFormRecord(null)} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200">Record first income</button></div>}</section></main>}</div>{formRecord !== undefined && <Modal onClose={() => setFormRecord(undefined)}><IncomeForm record={formRecord} players={players} saving={saving} onCancel={() => setFormRecord(undefined)} onSubmit={saveIncome} /></Modal>}<BottomNav activePage="business" />{toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={removeToast} />)}</div>;
}
