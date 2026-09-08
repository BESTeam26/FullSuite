import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useLocation, type Location } from "react-router-dom";

/**
 * Hold the current screen on screen until the next one is ready to replace it.
 *
 * THE PROBLEM
 *
 * Every screen is code-split. Without this, clicking a menu tab unmounts the
 * screen you were reading and mounts a Suspense fallback in its place, so the
 * work area goes blank and then repopulates. That reads as a fault even when
 * it is fast, because content disappearing is how a browser signals something
 * went wrong.
 *
 * THE FIX
 *
 * React keeps the previous UI mounted when a state update is marked as a
 * transition and the new tree suspends. So the router's location is copied
 * into state inside `startTransition`, and `<Routes>` is rendered against the
 * copy. The URL and the sidebar's highlight follow the click immediately —
 * they read the router's own location, which is not deferred — while the work
 * area keeps showing the screen you were on until the next screen can be
 * shown in one piece.
 *
 * `pending` is what stops that from feeling like a click that did nothing: it
 * drives the progress bar at the top of the shell.
 */
export const useRouteTransition = (): {
  location: Location;
  pending: boolean;
} => {
  const live = useLocation();
  const [shown, setShown] = useState(live);
  const [pending, startTransition] = useTransition();

  /* Compare by identity, not by key: a `navigate(path, { replace: true })`
     keeps the key and would otherwise never swap the rendered screen. */
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (
      live.pathname === shownRef.current.pathname &&
      live.search === shownRef.current.search &&
      live.hash === shownRef.current.hash
    ) {
      return;
    }
    startTransition(() => setShown(live));
  }, [live]);

  return { location: shown, pending };
};

/**
 * The location whose screen is currently ON SCREEN.
 *
 * `useLocation()` answers a different question: where the address bar points,
 * which during a transition is already the destination. Anything that must act
 * when the new screen actually appears — resetting the work area's scroll, for
 * one — needs this instead, or it acts on the outgoing screen and the person
 * watches it jump before it leaves.
 */
export const ShownLocationContext = createContext<Location | null>(null);

/** The location currently rendered, falling back to the router's own. */
export const useShownLocation = (): Location => {
  const shown = useContext(ShownLocationContext);
  const live = useLocation();
  return shown ?? live;
};
