/**
 * The canonical secondary navigation rail. One shell, every module.
 *
 * ── THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE ──────────────────────────────
 *
 * Dee, 2026-09-07, with a screenshot: the CreditOps rail collapsed to a thin
 * strip that was STILL RENDERING ITS FULL TEXT — a paragraph of explanation
 * wrapped one or two characters per line, a "3 active" badge crushed into a
 * corner, and no visible way back out. It read as permanently broken.
 *
 * Two separate mistakes, and this component refuses both by construction:
 *
 *   1. COLLAPSED IS A DIFFERENT LAYOUT, NOT A NARROWER ONE. The expanded tree
 *      is not rendered at all when collapsed — it is replaced by an icon rail.
 *      There is no width at which a sentence gets squeezed, because at that
 *      width there is no sentence.
 *
 *   2. THE WAY BACK IS ALWAYS ON SCREEN. The toggle is the first thing in the
 *      rail in both states and is never inside the part that gets hidden.
 *      "Collapse" must never be a one-way door.
 *
 *      PERMANENT UX RULE (Dee): every collapsible panel must always provide an
 *      obvious way to expand again.
 *
 * ── WHAT IS SHARED AND WHAT IS NOT ─────────────────────────────────────────
 *
 * The SHELL is canonical: widths, transition, the toggle, the persisted
 * preference, the mobile drawer, the collapsed icon rail. The TREE inside is
 * each module's own, because CreditOps stops at the Partner and FundingOps
 * drills Partner → Client → Deal, and forcing one shape on both would be a
 * worse abstraction than letting each render its own children (rule 13).
 *
 * ── ONE NAV MODEL, TWO PRESENTATIONS ───────────────────────────────────────
 *
 * `items` is the same authorized list the expanded tree renders, handed in by
 * the module (Dee, §28). Expanded shows icon + label + badge; collapsed shows
 * icon + tooltip + compact badge. Two lists would drift, and the way they
 * drift is an unauthorized destination surviving in the collapsed rail after
 * being removed from the expanded one.
 */
import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModuleRail } from "./use-module-rail";

/** One destination. Authorization has already been applied by the caller. */
export interface ModuleRailItem {
  id: string;
  /** Short and operational: "Main Client List", never a sentence. */
  label: string;
  icon: ElementType;
  badge?: number;
  /**
   * What the badge counts, for the tooltip and for screen readers. Both forms,
   * because "1 active clients" is the kind of thing nobody notices in review
   * and everybody notices on screen.
   */
  badgeLabel?: { one: string; many: string };
  active: boolean;
  onSelect: () => void;
}

export interface ModuleRailProps {
  /** Stable key for the remembered preference: "creditops", "fundingops". */
  module: string;
  /** Shown in the header when expanded. */
  title: string;
  /** The module's own icon, shown in the collapsed rail's header. */
  icon: ElementType;
  /** A count for the header, e.g. active clients. Omitted when not useful. */
  badge?: { value: number; label: string };
  /**
   * The flat list of destinations, used for the collapsed icon rail. Built
   * from the same authorized data the expanded tree renders.
   */
  items: readonly ModuleRailItem[];
  /** The module's own expanded tree. Not rendered while collapsed. */
  children: ReactNode;
}

const RAIL_EXPANDED = "w-64";
const RAIL_COLLAPSED = "w-14";

export function ModuleRail({
  module, title, icon: ModuleIcon, badge, items, children,
}: ModuleRailProps) {
  const rail = useModuleRail(module);

  return (
    <>
      {/* ── Small screens: a button and a drawer, never a permanent strip ──
          A 56px rail on a phone spends a tenth of the screen on navigation
          nobody can read (Dee, §15). */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => rail.setMenuOpen(true)}
          aria-label={`Open ${title} navigation`}
          className="flex w-full items-center gap-2 border-b border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="h-4 w-4 text-primary" />
          {title}
          {badge && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {badge.value} {badge.label}
            </span>
          )}
        </button>
        {rail.menuOpen && (
          <ModuleDrawer title={title} onClose={() => rail.setMenuOpen(false)}>
            {children}
          </ModuleDrawer>
        )}
      </div>

      {/* ── Desktop: expanded tree, or an icon rail. Never the tree squeezed. */}
      <nav
        aria-label={`${title} navigation`}
        className={cn(
          "hidden shrink-0 flex-col overflow-y-auto border-r border-border bg-card transition-[width] duration-200 ease-out md:flex",
          rail.collapsed ? `${RAIL_COLLAPSED} px-1.5 py-3` : `${RAIL_EXPANDED} p-4`,
        )}
      >
        <RailToggle collapsed={rail.collapsed} onToggle={rail.toggle}
          title={title} icon={ModuleIcon} badge={badge} />

        {rail.collapsed ? (
          <ul className="mt-3 space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <CollapsedItem item={item} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 space-y-4">{children}</div>
        )}
      </nav>
    </>
  );
}

/**
 * The toggle, and the only header.
 *
 * Outside every conditional above it on purpose: whatever else the rail is
 * doing, this control is on screen. `aria-expanded` states which way it goes,
 * so a screen-reader user is not told "Collapse" by a button that expands.
 */
function RailToggle({
  collapsed, onToggle, title, icon: ModuleIcon, badge,
}: {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  icon: ElementType;
  badge?: { value: number; label: string };
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-b border-border pb-3">
        <ModuleIcon className="h-4 w-4 text-primary" aria-hidden />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`Expand ${title} navigation`}
          title={`Expand ${title} navigation`}
          className="rounded p-1 text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        {badge && (
          /* Just the number: "3 active" does not fit and wrapping it is the
             defect this component exists to prevent (Dee, §20). */
          <span
            title={`${badge.value} ${badge.label}`}
            aria-label={`${badge.value} ${badge.label}`}
            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
          >
            {badge.value}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        aria-label={`Collapse ${title} navigation`}
        className="flex min-w-0 items-center gap-2 rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <PanelLeftClose className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-xs font-bold uppercase tracking-wider text-foreground">
          {title}
        </span>
      </button>
      {badge && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          {badge.value} {badge.label}
        </span>
      )}
    </div>
  );
}

/** An icon in the collapsed rail. The label survives as a tooltip, never as text. */
function CollapsedItem({ item }: { item: ModuleRailItem }) {
  const Icon = item.icon;
  const noun = item.badgeLabel
    ? (item.badge === 1 ? item.badgeLabel.one : item.badgeLabel.many)
    : null;
  const badgeText = item.badge !== undefined && item.badge > 0
    ? `${item.badge}${noun ? ` ${noun}` : ""}`
    : null;
  return (
    <button
      type="button"
      onClick={item.onSelect}
      title={badgeText ? `${item.label} — ${badgeText}` : item.label}
      aria-label={badgeText ? `${item.label}, ${badgeText}` : item.label}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "relative flex h-9 w-full items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        item.active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {badgeText && (
        /* Positioned over the corner rather than beside the icon, so a badge
           can never widen the rail (Dee, §20). */
        <span
          aria-hidden
          className={cn(
            "absolute right-0 top-0 min-w-[15px] rounded-full px-1 text-[9px] font-bold leading-[15px]",
            item.active ? "bg-primary-foreground text-primary" : "bg-primary/15 text-primary",
          )}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

/**
 * The small-screen drawer. Deliberately the EXPANDED tree — a phone has the
 * width for labels once the drawer is over the content rather than beside it.
 */
function ModuleDrawer({
  title, onClose, children,
}: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="Close navigation" onClick={onClose}
        className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-label={`${title} navigation`}
        className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close navigation"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4" onClick={onClose}>{children}</div>
      </div>
    </div>
  );
}
