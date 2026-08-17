import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function BusinessDashboard() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, addToast, removeToast } = useToast();
  const [metrics, setMetrics]       = useState(null);
  const [weather, setWeather]       = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [biOpen, setBiOpen]         = useState(false);
  const [predLoading, setPredLoading] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('cgto_token')}` });

  const coachId = () => {
    try { const p = JSON.parse(atob(localStorage.getItem('cgto_token').split('.')[1])); return p.userId || p.id; }
    catch { return null; }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/business-metrics/${coachId()}`,       { headers: authHeaders() }),
        fetch(`${API_BASE}/weather/session-risk?lat=50.7156&lng=-2.4408&label=Dorset`, { headers: authHeaders() }),
      ]);
      if (mRes.ok) setMetrics(await mRes.json());
      if (wRes.ok) setWeather(await wRes.json());
    } catch (err) {
      addToast({ type: 'error', message: `Could not load business data: ${err.message}` });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchPrediction = async () => {
    const id = coachId();
    if (!id) return;
    setPredLoading(true);
    try {
      const res = await fetch(`${API_BASE}/predictive/generate/${id}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setPrediction(data.prediction);
    } catch (err) {
      addToast({ type: 'error', message: `Prediction failed: ${err.message}` });
    } finally { setPredLoading(false); }
  };

  const weatherSeverity = weather?.condition?.toLowerCase() ?? '';
  const weatherIsAlert  = ['rain','storm','thunder','snow','hail','sleet'].some(w => weatherSeverity.includes(w));

  const KPI = [
    { label: 'Monthly revenue',  value: metrics?.monthly_revenue != null ? `£${metrics.monthly_revenue.toLocaleString()}` : '—', trend: metrics?.revenue_trend },
    { label: 'Active players',   value: metrics?.active_players ?? '—', trend: null },
    { label: 'Sessions (month)', value: metrics?.sessions_this_month ?? '—', trend: null },
    { label: 'Avg retention',    value: metrics?.avg_retention_score != null ? `${Math.round(metrics.avg_retention_score)}%` : '—', trend: null },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="business" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" onClick={toggleSidebar} aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Business Dashboard</h1>
          <button type="button" onClick={fetchAll} className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Refresh">↻</button>
        </header>

        {loading && <LoadingOverlay message="Loading business data…" />}

        {!loading && (
          <main className="flex-1 overflow-y-auto p-4">

            {weather && weatherIsAlert && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="text-xl">⛈</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Weather alert</p>
                  <p className="text-xs text-amber-700">{weather.condition}{weather.temp_c != null ? ` · ${weather.temp_c}°C` : ''} — consider rescheduling outdoor sessions</p>
                </div>
                <span className="ml-auto text-[10px] text-amber-500">{weather.source ?? 'WeatherAPI'}</span>
              </div>
            )}

            {weather && !weatherIsAlert && (
              <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
                <span>☀️</span>
                <span>{weather.condition}{weather.temp_c != null ? ` · ${weather.temp_c}°C` : ''}</span>
              </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KPI.map(k => (
                <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-800">{k.value}</p>
                  {k.trend != null && (
                    <p className={`text-xs mt-0.5 ${k.trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {k.trend >= 0 ? '▲' : '▼'} {Math.abs(k.trend)}% vs last month
                    </p>
                  )}
                </div>
              ))}
            </div>

            {metrics?.at_risk_count > 0 && (
              <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
                <p className="font-semibold text-orange-800">{metrics.at_risk_count} player{metrics.at_risk_count !== 1 ? 's' : ''} at high/critical burnout risk</p>
                <p className="text-xs text-orange-600 mt-0.5">Check the Player Retention page for details.</p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setBiOpen(o => !o)}
                className="flex w-full items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
                aria-expanded={biOpen}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700 text-sm">Business Intelligence</span>
                </div>
                <span className="text-gray-400 text-sm">{biOpen ? '▲' : '▼'}</span>
              </button>

              {biOpen && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">Retention & revenue forecast</p>
                    <button type="button" onClick={fetchPrediction} disabled={predLoading}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]">
                      {predLoading ? 'Forecasting…' : 'Run forecast'}
                    </button>
                  </div>
                  {prediction ? (
                    <div className="rounded-lg bg-[#f0f7f3] border border-[--primary-green]/20 p-4 space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Retention forecast</p>
                          <p className="font-bold text-[--primary-green]">{prediction.retention_forecast}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Revenue forecast</p>
                          <p className="font-bold text-gray-800">{prediction.revenue_forecast}</p>
                        </div>
                      </div>
                      {prediction.top_action && (
                        <div className="border-t border-[--primary-green]/20 pt-2">
                          <p className="text-xs text-gray-400 mb-0.5">Top recommended action</p>
                          <p className="text-sm text-gray-700">{prediction.top_action}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Run the forecast to see AI-generated predictions for your academy.</p>
                  )}
                </div>
              )}
            </div>
          </main>
        )}
      </div>
      <BottomNav activePage="business" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}