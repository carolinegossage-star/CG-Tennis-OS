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
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white md:hidden" aria-label="Main navigation">
      {NAV.map(n => (
        <Link key={n.key} to={n.href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]
            ${activePage === n.key ? 'text-[--primary-green]' : 'text-gray-400 hover:text-gray-600'}`}
          aria-current={activePage === n.key ? 'page' : undefined}
        >
          <span className="text-lg leading-none">{n.icon}</span>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
