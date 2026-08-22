import React from 'react';
import { Link } from 'react-router-dom';
const NAV = [
  { key: 'dashboard',   href: '/dashboard',          icon: '⊞', label: 'Home' },
  { key: 'players',     href: '/players',             icon: '👥', label: 'Players' },
  { key: 'tournaments', href: '/tournaments',         icon: '🏆', label: 'Tournaments' },
  { key: 'sessions',    href: '/sessions/reflection', icon: '📋', label: 'Sessions' },
  { key: 'alerts',      href: '/alerts',              icon: '🔔', label: 'Alerts' },
];
export function BottomNav({ activePage }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex gap-1 border-t border-gray-200 bg-gray-50 p-2 shadow-[0_-6px_18px_rgba(31,41,55,0.06)] md:hidden" aria-label="Main navigation">
      {NAV.map(n => (
        <Link key={n.key} to={n.href}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-[background-color,color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green] active:scale-[0.97]
            ${activePage === n.key ? 'bg-white text-[--primary-green] shadow-sm' : 'bg-gray-100/80 text-gray-500 hover:bg-white hover:text-gray-700'}`}
          aria-current={activePage === n.key ? 'page' : undefined}
        >
          <span className="text-xl leading-none">{n.icon}</span>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
