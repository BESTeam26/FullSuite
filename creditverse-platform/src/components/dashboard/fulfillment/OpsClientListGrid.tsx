/**
 * OpsClientListGrid — the grid/card view of a division's Main Client List.
 *
 * CreditOps and FundingOps show the same card: avatar, name, email, mode badge,
 * status pill, assigned agent. They differ in only two spots, which the caller
 * supplies: the secondary field (dispute round vs requested amount) and the
 * open-work count label (open items vs open files).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OpsClient } from "@/lib/fulfillment/ops-client-domain";
import { Avatar, ModeBadge } from "./ops-client-list-helpers";

/* A card grid has no single column to virtualize, so it is bounded the
   other way (Dee, 2026-09-30: "virtualization or an equivalent bounded-
   render strategy"): a few screens of cards, then more as the reader nears
   the end. The count resets when the list changes, so a new filter starts
   at the top again. */
export const GRID_REVEAL_STEP = 60;

function useRevealedCount(total: number) {
  const [revealed, setRevealed] = useState(GRID_REVEAL_STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { setRevealed(GRID_REVEAL_STEP); }, [total]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || revealed >= total || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setRevealed((n) => Math.min(total, n + GRID_REVEAL_STEP));
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [revealed, total]);
  return { revealed: Math.min(revealed, total), sentinel, showMore: () => setRevealed((n) => Math.min(total, n + GRID_REVEAL_STEP)) };
}

interface OpsClientListGridProps<T extends OpsClient> {
  clients: T[];
  onOpenClient: (id: string) => void;
  /** Status chip for this division's vocabulary. */
  renderStatus: (client: T) => ReactNode;
  /** Right-hand value on the status row: round, or requested amount. */
  renderSecondary: (client: T) => ReactNode;
  /** Bottom-right open-work count, already labelled. */
  renderOpenCount: (client: T) => ReactNode;
}

export function OpsClientListGrid<T extends OpsClient>({
  clients,
  onOpenClient,
  renderStatus,
  renderSecondary,
  renderOpenCount,
}: OpsClientListGridProps<T>) {
  const { revealed, sentinel, showMore } = useRevealedCount(clients.length);
  return (
    <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clients.slice(0, revealed).map((c) => (
        <div
          key={c.id}
          onClick={() => onOpenClient(c.id)}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Avatar name={c.name} size="md" />
              <div>
                <p className="font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
            <ModeBadge client={c} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            {renderStatus(c)}
            {renderSecondary(c)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={c.assignedAgent ?? "Unassigned"} />{" "}
              {c.assignedAgent ?? "Unassigned"}
            </span>
            {renderOpenCount(c)}
          </div>
        </div>
      ))}
    </div>
    {revealed < clients.length && (
      <div ref={sentinel} className="flex justify-center py-3">
        {/* The button is the fallback where the observer cannot fire; it
            also tells a keyboard reader that the list continues. */}
        <button type="button" onClick={showMore}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Show more ({clients.length - revealed} remaining)
        </button>
      </div>
    )}
    </>
  );
}
