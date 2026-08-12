import { useState, useEffect, useRef, useCallback } from 'react';
const POLL_INTERVAL_MS = 30000;
const API_BASE = import.meta.env.VITE_API_URL ?? '';
export function useTournamentLive(eventId) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollRef = useRef(null);
  const fetchDashboard = useCallback(async (silent = false) => {
    if (!eventId) return;
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('cgto_token');
      const res = await fetch(`${API_BASE}/tournament-events/${eventId}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setDashboard(await res.json());
      setLastUpdated(new Date());
      setError(null);
    } catch (err) { setError(err.message); }
    finally { if (!silent) setLoading(false); }
  }, [eventId]);
  useEffect(() => {
    fetchDashboard(false);
    pollRef.current = setInterval(() => fetchDashboard(true), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchDashboard]);
  const refresh = useCallback(() => fetchDashboard(false), [fetchDashboard]);
  return { dashboard, loading, error, lastUpdated, refresh };
}
