/**
 * A light the pointer carries across a panel.
 *
 * The sign-in artwork sits under a heavy scrim so the quote on top of it stays
 * readable. This lets somebody look underneath: wherever the pointer is, a
 * soft circle of the picture comes up to full brightness, and the rest of the
 * panel stays exactly as dark as it was. Dee's brief — clear what is under the
 * cursor, not the whole image.
 *
 * ── WHY IT WRITES CSS VARIABLES AND NOT REACT STATE ────────────────────────
 *
 * `pointermove` fires on every frame the mouse is moving. Held in state, that
 * is a re-render per frame of a component that also owns the sign-in form —
 * hundreds of renders to move a gradient (rules 7 and 14). Writing two custom
 * properties straight onto the element skips React entirely: the browser
 * repaints the mask and nothing above it is touched.
 *
 * Coalesced into `requestAnimationFrame` for the same reason. A mouse can
 * report faster than the screen refreshes, and paints the display will never
 * show are pure cost.
 *
 * The element keeps `--spot-x` / `--spot-y` after the pointer leaves, so the
 * circle fades out where it was rather than jumping back to the middle first.
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface PointerSpotlight {
  /** Attach to the element the spotlight moves across. */
  ref: React.RefObject<HTMLElement>;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function usePointerSpotlight(): PointerSpotlight {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<number | null>(null);
  const next = useRef<{ x: number; y: number } | null>(null);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    /* A pen or a finger has no hover state to speak of: it would light the
       spot at the moment of a tap and leave it there. Mouse only. */
    if (e.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    next.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const p = next.current;
      if (!p || !ref.current) return;
      ref.current.style.setProperty("--spot-x", `${p.x}px`);
      ref.current.style.setProperty("--spot-y", `${p.y}px`);
    });
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { ref, onPointerMove };
}
