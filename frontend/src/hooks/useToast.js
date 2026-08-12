import React, { createContext, useContext, useState, useCallback } from 'react';
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast    = useCallback(({ type = 'info', message }) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, type, message }]);
  }, []);
  const removeToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  return React.createElement(ToastContext.Provider, { value: { toasts, addToast, removeToast } }, children);
}
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
