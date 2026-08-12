import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { BottomNav } from '../components/BottomNav';
import { FrameworkBadge } from '../components/FrameworkBadge';
import { useSidebar } from '../hooks/useSidebar';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
export default function Dashboard() {
  const { sidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { toasts, removeToast } = useToast();
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activePage="dashboard" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button type="button" onClick={toggleSidebar} className="md:hidden p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="Toggle sidebar">☰</button>
          <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
          <FrameworkBadge name="Playing To Excel™" size="xs" />
        </header>
        <main className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-[--primary-green]/30 bg-[#f0f7f3] p-6 text-center">
            <p className="text-2xl mb-2">🎾</p>
            <p className="font-semibold text-gray-800">CG Tennis OS™ is running</p>
            <p className="text-sm text-gray-500 mt-1">All routes active. Use the sidebar to navigate.</p>
          </div>
        </main>
      </div>
      <BottomNav activePage="dashboard" />
      {toasts.map(t => <Toast key={t.id} toast={t} onDismiss={removeToast} />)}
    </div>
  );
}
