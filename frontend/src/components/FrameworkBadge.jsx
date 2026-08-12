import React, { useState } from 'react';
const COLOURS = {
  'Playing To Excel™':        { bg: '#ECFDF5', text: '#065F46', border: '#6EE7B7' },
  'TennisNLP™':               { bg: '#EFF6FF', text: '#1E40AF', border: '#93C5FD' },
  'TennisMindset™':           { bg: '#F5F3FF', text: '#5B21B6', border: '#C4B5FD' },
  'Fearless Futures™ Tennis': { bg: '#FFF7ED', text: '#9A3412', border: '#FDC08A' },
  'The Concord Framework™':   { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  'Apex Domain Engine™':      { bg: '#FDF4FF', text: '#6B21A8', border: '#E879F9' },
};
export function FrameworkBadge({ name, size = 'sm' }) {
  const [tip, setTip] = useState(false);
  const c = COLOURS[name] ?? { bg: '#F9FAFB', text: '#374151', border: '#D1D5DB' };
  const pad = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs';
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setTip(t => !t)}
        style={{ background: c.bg, color: c.text, borderColor: c.border }}
        className={`rounded-full border font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 ${pad}`}
        aria-label={`${name} — proprietary CG Tennis Academies framework`}
      >
        {name}
      </button>
      {tip && (
        <span className="absolute bottom-full left-0 mb-1 z-50 w-48 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-600 shadow-lg">
          Proprietary CG Tennis Academies framework. <button type="button" className="ml-1 text-gray-400 hover:text-gray-600" onClick={() => setTip(false)}>✕</button>
        </span>
      )}
    </span>
  );
}
