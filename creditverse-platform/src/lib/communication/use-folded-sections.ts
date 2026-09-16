/**
 * Which partner sections this viewer has folded away.
 *
 * Per-person and per-browser: which partners somebody keeps collapsed is a
 * preference about their own screen, not something the other nine people
 * should inherit, so it lives in localStorage rather than in a table.
 *
 * Every read and write is guarded. A private window, blocked site data or a
 * preview can make `localStorage` throw or come back empty, and a rail that
 * throws is considerably worse than one that forgets a fold.
 */
import { useCallback, useState } from "react";

const FOLDED_KEY = "bes.communication.folded";

function readFolded(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FOLDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function useFoldedSections() {
  const [folded, setFolded] = useState<Set<string>>(readFolded);
  const toggle = useCallback((key: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { folded, toggle };
}
