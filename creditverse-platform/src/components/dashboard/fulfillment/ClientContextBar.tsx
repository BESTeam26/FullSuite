/**
 * Whose file am I working on?
 *
 * Dee's locked UX rule: WHEN AN OPERATOR IS WORKING DEEP INSIDE A CLIENT
 * FILE, THE SYSTEM MUST ALWAYS SHOW WHOSE FILE THEY ARE WORKING ON.
 *
 * The screenshot that prompted this showed an operator at the bottom of a
 * long file, in Complete Work, with the client's name several screens above
 * them — recording production against a person they could not see the name
 * of.
 *
 * ── HOW IT STICKS, AND WHY THAT MATTERS ────────────────────────────────────
 *
 * §26: "Do not apply position: sticky blindly if an ancestor overflow setting
 * prevents it from working."
 *
 * The scrolling element is `div.flex-1.overflow-y-auto` in CreditOps.tsx —
 * not the window. `position: sticky` attaches to the nearest scrolling
 * ancestor, so a `sticky top-0` inside that container sticks to the top of
 * the container. That is exactly right and needs no arithmetic against the
 * global header or the module rail: the container already begins below both,
 * so collapsing the rail or resizing the window cannot put this bar over
 * them (§17, §41). There is no z-index race either, because the global chrome
 * is outside this container entirely.
 *
 * ── WHY A SENTINEL AND NOT JUST A SECOND HEADER ────────────────────────────
 *
 * §16: "Do NOT freeze the entire large Client page header... When at top:
 * normal full header may display. After user scrolls: use a compact sticky
 * version."
 *
 * So a zero-height sentinel sits above the full header and an
 * IntersectionObserver watches it. While the sentinel is on screen the full
 * header is doing its job and this bar stays out of the way. The moment the
 * sentinel leaves, the compact bar appears. Measuring the header's own height
 * would work too and would break the first time somebody added a line to it.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 *
 * §22: read-only. No status editor, no round editor, no lifecycle control.
 * Orientation is not another editing surface — a second place to change the
 * status is a second place for the two to disagree.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Briefcase } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { daysUntil } from "./ClientRowEditors";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { cn } from "@/lib/utils";

/**
 * Whether the full header has scrolled out of view.
 *
 * Exported so the workspace can render the sentinel where the header starts
 * rather than this component guessing where that is.
 */
export function useHeaderOutOfView(sentinel: RefObject<HTMLElement>): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    /* No observer (older webview, jsdom): the bar simply never appears, and
       the full header still does its job. A missing nicety, not a break. */
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setGone(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinel]);
  return gone;
}

export interface ClientContextBarProps {
  client: FulfillmentClient;
  /** The department the operator is logging work as, when they are (§21). */
  workingAs?: string | null;
  visible: boolean;
  onBack?: () => void;
}

export function ClientContextBar({
  client, workingAs, visible, onBack,
}: ClientContextBarProps) {
  const partner = client.outsourcingGroupName ?? client.organizationName ?? null;
  const days = daysUntil(client.dueAt);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        /* Sticky to the SCROLL CONTAINER, which starts below the global header
           and the CreditOps tabs. Nothing to offset, nothing to overlap. */
        "sticky top-0 z-20 -mx-4 mb-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur transition-all duration-150",
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none absolute -translate-y-1 opacity-0",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to the client list"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Name and partner together, always. Two partners can have a client
            with the same name, and the name alone is not an identification
            (§20). */}
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight text-foreground">
            {client.name}
          </span>
          {partner && (
            <span className="block truncate text-[10px] leading-tight text-muted-foreground">
              {partner}
            </span>
          )}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* Read-only summary. Compact enough to survive a phone (§24). */}
          <Chip label={client.status} tone="status" />
          {client.round && <Chip label={client.round} tone="muted" />}
          {client.dueAt && (
            <Chip
              label={
                days === null
                  ? `Due ${formatDate(client.dueAt)}`
                  : days < 0
                    ? `${Math.abs(days)}d overdue`
                    : days === 0
                      ? "Due today"
                      : `Due in ${days}d`
              }
              tone={days !== null && days < 0 ? "danger" : "muted"}
            />
          )}
          {workingAs && (
            /* §21 — so nobody logs actions under the wrong department. */
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Briefcase className="h-3 w-3" /> {workingAs}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: "status" | "muted" | "danger" }) {
  return (
    <span
      className={cn(
        "max-w-[14rem] truncate rounded-full px-2 py-0.5 text-[10px] font-bold",
        tone === "status" && "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "danger" && "bg-status-danger/10 text-status-danger",
      )}
      title={label}
    >
      {label}
    </span>
  );
}

/** The sentinel the observer watches. Rendered where the full header starts. */
export function ClientHeaderSentinel({ innerRef }: { innerRef: RefObject<HTMLDivElement> }) {
  return <div ref={innerRef} aria-hidden className="h-px w-full" />;
}

/** Convenience for the workspace: one ref, one flag, one bar. */
export function useClientContextBar() {
  const sentinel = useRef<HTMLDivElement>(null);
  const outOfView = useHeaderOutOfView(sentinel);
  return { sentinel, outOfView };
}
