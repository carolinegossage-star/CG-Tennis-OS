import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Toast } from '../components/Toast';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { useTournaments } from '../hooks/useTournaments';

export default function TournamentsCalendar() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, removeToast } = useToast();
  
  const [filters, setFilters] = useState({
    search: '',
    location_country: '',
    category: '',
    surface_type: '',
    age_group: '',
    entry_open: 'false'
  });

  const { tournaments, total, loading, error } = useTournaments(filters);

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 'true' : 'false') : value
    }));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="tournaments" />
      
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggleSidebar} className="md:hidden p-1" aria-label="Toggle sidebar">☰</button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">World Tournament Finder</h1>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Powered by WorldMonitor™ Engine</p>
            </div>
          </div>
          <FrameworkBadge name="Global Discovery" size="sm" />
        </header>

        <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Filters Sidebar */}
          <aside className="w-full md:w-64 bg-white border-r border-gray-200 p-6 overflow-y-auto hidden md:block">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Discovery Filters</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Search</label>
                <input 
                  type="text" 
                  name="search"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="Name or location..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Country</label>
                <select 
                  name="location_country"
                  value={filters.location_country}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                >
                  <option value="">All Countries</option>
                  <option value="GBR">United Kingdom</option>
                  <option value="USA">United States</option>
                  <option value="FRA">France</option>
                  <option value="ESP">Spain</option>
                  <option value="AUS">Australia</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Category</label>
                <select 
                  name="category"
                  value={filters.category}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                >
                  <option value="">All Categories</option>
                  <option value="ITF">ITF World Tour</option>
                  <option value="LTA">LTA National</option>
                  <option value="UTR">UTR Pro Tennis</option>
                  <option value="ATP">ATP Challenger</option>
                  <option value="WTA">WTA 125</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Surface</label>
                <select 
                  name="surface_type"
                  value={filters.surface_type}
                  onChange={handleFilterChange}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[--primary-green]"
                >
                  <option value="">All Surfaces</option>
                  <option value="hard">Hard Court</option>
                  <option value="clay">Clay Court</option>
                  <option value="grass">Grass Court</option>
                  <option value="indoor_hard">Indoor Hard</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  name="entry_open"
                  id="entry_open"
                  checked={filters.entry_open === 'true'}
                  onChange={handleFilterChange}
                  className="h-4 w-4 rounded border-gray-300 accent-[--primary-green]"
                />
                <label htmlFor="entry_open" className="text-sm font-medium text-gray-700">Entries Open Only</label>
              </div>
            </div>
          </aside>

          {/* Results Area */}
          <div className="flex-1 overflow-y-auto p-6 relative">
            {loading && <LoadingOverlay message="Monitoring global tournaments..." />}
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Found {total} Tournaments
              </h2>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-white border border-gray-200 text-xs font-bold shadow-sm">LIST VIEW</button>
                <button className="px-3 py-1 rounded bg-gray-100 border border-transparent text-xs font-bold text-gray-400">MAP VIEW (BETA)</button>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-6">
                Error: {error}
              </div>
            )}

            <div className="grid gap-4">
              {tournaments.length === 0 && !loading ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                  <p className="text-gray-400">No tournaments match your search criteria.</p>
                </div>
              ) : (
                tournaments.map(t => (
                  <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gray-50 flex flex-col items-center justify-center border border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{new Date(t.start_date).toLocaleString('default', { month: 'short' })}</span>
                        <span className="text-lg font-bold text-gray-900 leading-none">{new Date(t.start_date).getDate()}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{t.name}</h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">📍 {t.location_name}, {t.location_country}</span>
                          <span className="flex items-center gap-1">🎾 {t.surface_type}</span>
                          <span className="flex items-center gap-1">🏆 {t.category}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 border-t md:border-t-0 pt-4 md:pt-0">
                      {t.deadline_urgent && (
                        <span className="px-2 py-1 rounded bg-red-50 text-[10px] font-bold text-red-500 uppercase tracking-wider animate-pulse">
                          Urgent: {t.days_until_entry_deadline}d left
                        </span>
                      )}
                      <div className="text-right hidden md:block">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Entry Fee</p>
                        <p className="text-sm font-bold text-gray-900">{t.currency} {t.entry_fee}</p>
                      </div>
                      <a 
                        href={t.registration_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-[--primary-green] text-xs font-bold text-white hover:bg-[#1a7a4a] transition-colors"
                      >
                        VIEW DETAILS
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      <BottomNav activePage="tournaments" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}
