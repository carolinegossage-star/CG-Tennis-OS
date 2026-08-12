import React, { useEffect } from 'react';
export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);
  const colours = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-500' };
  return (
    <div className={`fixed bottom-20 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colours[toast.type] ?? colours.info}`}>
      <span>{toast.message}</span>
      <button type="button" onClick={() => onDismiss(toast.id)} className="ml-2 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
    </div>
  );
}
