import { useState, useCallback } from 'react';
export function useSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);
  const closeSidebar  = useCallback(() => setSidebarOpen(false), []);
  return { sidebarOpen, toggleSidebar, closeSidebar };
}
