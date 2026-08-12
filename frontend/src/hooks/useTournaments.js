import { useState, useEffect, useCallback } from 'react';
const API_BASE = import.meta.env.VITE_API_URL ?? '';
export function useTournaments(filters = {}) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [total, setTotal]             = useState(0);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('cgto_token');
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, val]) => {
        if (val) queryParams.append(key, val);
      });

      const res = await fetch(`${API_BASE}/tournaments?${queryParams.toString()}`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [JSON.stringify(filters)]);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);
  return { tournaments, total, loading, error, refetch: fetchTournaments };
}
export function groupByMonth(tournaments) {
  const map = new Map();
  for (const t of tournaments) {
    const raw = t.start_date ?? t.entry_deadline;
    if (!raw) { const key = 'No date set'; if (!map.has(key)) map.set(key, []); map.get(key).push(t); continue; }
    const d = new Date(raw);
    const key = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (!map.has(key)) map.set(key, []); map.get(key).push(t);
  }
  return map;
}
// Real entry_status ENUM values, confirmed against migrate.sql:
// 'pending' | 'confirmed' | 'withdrawn' | 'waitlisted'
export const ENTRY_STATUS_LABELS = { pending: 'Pending', confirmed: 'Confirmed', withdrawn: 'Withdrawn', waitlisted: 'Waitlisted' };
export const ENTRY_STATUS_COLOURS = { pending: 'bg-blue-100 text-blue-700', confirmed: 'bg-green-100 text-green-700', withdrawn: 'bg-red-100 text-red-600', waitlisted: 'bg-amber-100 text-amber-700' };
