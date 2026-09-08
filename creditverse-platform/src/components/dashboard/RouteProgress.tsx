import { useEffect, useState } from "react";

/**
 * A thin bar across the top of the window while the next screen loads.
 *
 * Holding the previous screen in place (see `useRouteTransition`) removes the
 * blank flash, but on its own it makes a slow navigation look like a click
 * that was ignored. This is the acknowledgement: it appears only if the wait
 * is long enough to notice, so a warm chunk — the normal case once a route has
 * been prefetched — navigates with no chrome at all.
 */
const NOTICEABLE_MS = 120;

export const RouteProgress = ({ active }: { active: boolean }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), NOTICEABLE_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        className={`h-full w-full origin-left bg-gradient-gold transition-opacity duration-200 ${
          visible ? "animate-route-progress opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};
