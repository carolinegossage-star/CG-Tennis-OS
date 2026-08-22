import React from 'react';

/**
 * A small, presentational coach-facing nudge. The caller owns the trigger and
 * dismissal state so this component does not create application or backend state.
 */
export function CourtToonNudge({
  characterSrc,
  characterName,
  message,
  onDismiss,
  title,
  className = '',
}) {
  return (
    <aside
      className={`courttoon-nudge courttoon-nudge-enter relative flex min-w-0 items-end gap-2 overflow-hidden rounded-xl border border-[#2f6f61]/20 bg-[#f6f4e8] p-3 pr-10 text-left shadow-[0_12px_28px_rgba(32,37,31,0.12)] ${className}`}
      aria-live="polite"
      aria-label={`${characterName} tip`}
    >
      <img
        src={characterSrc}
        alt=""
        aria-hidden="true"
        className="h-20 w-16 shrink-0 object-contain object-bottom"
      />
      <div className="min-w-0 pb-0.5">
        {title && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2f6f61]">{title}</p>}
        <p className="m-0 text-sm leading-5 text-gray-700">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-sm leading-none text-gray-500 transition-colors hover:bg-[#e5eadc] hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
        aria-label={`Dismiss ${characterName} tip`}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
