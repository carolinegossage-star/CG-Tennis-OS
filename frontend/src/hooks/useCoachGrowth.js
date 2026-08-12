import { useState, useCallback } from 'react';
export function useCoachGrowth() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep]             = useState(0);
  const [log, setLog]               = useState([]);
  const openDrawer  = useCallback(() => { setDrawerOpen(true); setStep(0); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const nextStep    = useCallback(() => setStep(s => s + 1), []);
  const addEntry    = useCallback((entry) => setLog(l => [{ ...entry, ts: new Date().toISOString() }, ...l]), []);
  return { drawerOpen, openDrawer, closeDrawer, step, nextStep, log, addEntry };
}
