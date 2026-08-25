import React from 'react';
import { Link } from 'react-router-dom';
const NAV = [
  { key: 'dashboard',    href: '/dashboard',          icon: '⊞', label: 'Dashboard' },
  { key: 'players',      href: '/players',             icon: '👥', label: 'Players' },
  { key: 'programmes',   href: '/programmes',          icon: '🗓', label: 'Programmes' },
  { key: 'tournaments',  href: '/tournaments',         icon: '🏆', label: 'Tournaments' },
  { key: 'sessions',     href: '/sessions/reflection', icon: '📋', label: 'Sessions' },
  { key: 'identity',     href: '/identity',            icon: '🎯', label: 'Identity' },
  { key: 'business',     href: '/business',            icon: '📊', label: 'Business' },
  { key: 'income',       href: '/income',              icon: '£',  label: 'Income' },
  { key: 'community',    href: '/community',           icon: '🌐', label: 'Community' },
  { key: 'checklists',   href: '/checklists',          icon: '✅', label: 'Safety' },
  { key: 'alerts',       href: '/alerts',              icon: '🔔', label: 'Alerts' },
  { key: 'ai-assistant', href: '/ai-assistant',        icon: '🤖', label: 'Ask CG' },
];
export function Sidebar({ isOpen, onClose, activePage }) {
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside className={`fixed top-0 left-0 z-30 h-full w-56 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:flex`}>
        <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-100">
          <Link to="/dashboard" onClick={onClose} className="rounded text-lg font-bold text-[--primary-green] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]" aria-label="CG Tennis OS Dashboard">
            CG Tennis OS™
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Sidebar navigation">
          {NAV.map(n => (
            <Link key={n.key} to={n.href} onClick={onClose}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]
                ${activePage === n.key ? 'bg-[--primary-green]/10 text-[--primary-green]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}
              aria-current={activePage === n.key ? 'page' : undefined}
            >
              <span>{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-100 text-[10px] text-gray-400">
          © 2026 CG Tennis Academies
        </div>
      </aside>
    </>
  );
}
