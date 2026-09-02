import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Password reveal hook with auto-hide.
 * Passwords are hidden by default. When revealed, they auto-hide
 * after `timeoutMs` (default 8s) to limit exposure.
 */
export function usePasswordReveal(timeoutMs = 8000) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reveal = useCallback(
    (id: string) => {
      setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
      if (!revealed[id]) {
        if (timers.current[id]) clearTimeout(timers.current[id]);
        timers.current[id] = setTimeout(() => {
          setRevealed((prev) => ({ ...prev, [id]: false }));
        }, timeoutMs);
      } else {
        if (timers.current[id]) clearTimeout(timers.current[id]);
      }
    },
    [revealed, timeoutMs],
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return { revealed, reveal };
}

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};
