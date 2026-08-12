import { useState, useEffect, useRef } from 'react';
export function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning]     = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(ref.current); setRunning(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [running]);
  const start = () => { setRemaining(seconds); setRunning(true); };
  const stop  = () => { clearInterval(ref.current); setRunning(false); };
  const reset = () => { stop(); setRemaining(seconds); };
  return { remaining, running, start, stop, reset };
}
