import { useEffect, useState } from "react";

/**
 * A selection that shows the moment it is clicked, while the navigation
 * that makes it real runs as a transition.
 *
 * Chrome flagged the CreditOps tree leaf (`span.flex-1.truncate.text-left`):
 * the click handler navigated, and the navigation rendered the whole client
 * list before the browser could paint — 245 ms to 1.2 s with nothing on
 * screen changing (2026-09-30). The rule: immediate visual feedback on every
 * click. So the node the user chose is highlighted from local state at once,
 * and that local choice is dropped as soon as the URL says the same thing —
 * the URL stays the truth; this is only what is shown in between.
 */
export function useImmediateSelection<T>(
  current: T,
  same: (a: T, b: T) => boolean,
): [shown: T, choose: (next: T) => void] {
  const [pending, setPending] = useState<T | null>(null);
  useEffect(() => {
    if (pending !== null && same(pending, current)) setPending(null);
  }, [pending, current, same]);
  return [pending ?? current, setPending];
}
