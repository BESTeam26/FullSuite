/**
 * Holds a value back until it stops changing.
 *
 * Exists for one reason: a server-side search must not fire once per
 * keystroke. Rule 14 forbids request waterfalls, and "metro" typed at normal
 * speed is five requests of which four are thrown away. This turns it into
 * one, when the typing settles.
 *
 * Client-side filtering over a list a screen already holds does NOT need
 * this — that costs nothing per keystroke. Reach for it only where the change
 * causes a request.
 */
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
