/**
 * A panel the user can drag, that remembers where they left it.
 *
 * Remembered PER USER, not per browser: two people sharing a machine each get
 * their own width, and signing out does not hand your layout to the next
 * person. The key includes the user id for that reason.
 *
 * Storage is best-effort. A private window, cleared site data, or a browser
 * that refuses storage all mean the same thing here — the default width, which
 * is a perfectly good width. Nothing about the layout is worth an error.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PanelWidthOptions {
  /** Distinguishes one draggable panel from another. */
  id: string;
  /** Whose preference this is. Anonymous falls back to a shared key. */
  userId?: string | null;
  defaultWidth: number;
  min: number;
  max: number;
}

const key = (id: string, userId?: string | null) => `bes.panel.${id}.${userId ?? "anon"}`;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function read(k: string, fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return fallback;
    const n = Number(raw);
    /* A stored width outside today's limits is clamped, not discarded: the
       limits may have changed since it was saved, and the user's intent
       ("wide" / "narrow") still holds. */
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  } catch {
    return fallback;
  }
}

export interface PanelWidth {
  width: number;
  /** Set directly — used by the keyboard nudge on the drag handle. */
  setWidth: (w: number) => void;
  /** Attach to the drag handle. Pointer events, so touch and pen work too. */
  onPointerDown: (e: React.PointerEvent) => void;
  dragging: boolean;
  reset: () => void;
}

export function usePanelWidth({ id, userId, defaultWidth, min, max }: PanelWidthOptions): PanelWidth {
  const storageKey = key(id, userId);
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: defaultWidth });

  /* Read after mount, not during render: server-rendered or hydrated markup
     must not depend on a value only this browser has. */
  useEffect(() => {
    setWidth(read(storageKey, defaultWidth, min, max));
  }, [storageKey, defaultWidth, min, max]);

  const persist = useCallback((w: number) => {
    try { window.localStorage.setItem(storageKey, String(Math.round(w))); } catch { /* layout is not worth an error */ }
  }, [storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    start.current = { x: e.clientX, w: width };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      setWidth(clamp(start.current.w + (ev.clientX - start.current.x), min, max));
    };
    const up = (ev: PointerEvent) => {
      const final = clamp(start.current.w + (ev.clientX - start.current.x), min, max);
      setWidth(final);
      persist(final);
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    /* A cancelled pointer (a system gesture, a lost capture) must end the drag
       too, or the handle keeps following the mouse with no button held. */
    window.addEventListener("pointercancel", up);
  }, [width, min, max, persist]);

  const reset = useCallback(() => {
    setWidth(defaultWidth);
    persist(defaultWidth);
  }, [defaultWidth, persist]);

  const set = useCallback((w: number) => {
    const next = clamp(w, min, max);
    setWidth(next);
    persist(next);
  }, [min, max, persist]);

  return { width, setWidth: set, onPointerDown, dragging, reset };
}
