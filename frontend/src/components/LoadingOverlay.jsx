import React from 'react';
export function LoadingOverlay({ message = 'Loading…' }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/80">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[--primary-green]" />
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}
