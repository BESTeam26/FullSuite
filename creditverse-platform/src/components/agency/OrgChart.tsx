/**
 * The org chart, drawn from the canonical records.
 *
 * Dee, §16: "Build the actual visual Org Chart. Do NOT hard-code JSON.
 * Generate from canonical records... Use hierarchy lines/branches. Support
 * expand/collapse. Click a node to open the real corresponding record."
 *
 * The SHAPE is decided by `buildOrgChart`, which is pure and tested — that is
 * where leadership-above-divisions and FundingOps-nested-under-CreditOps
 * live. This file only draws the tree it is handed, so a structural rule can
 * never be true in the picture and false in the data.
 *
 * Two views of the same tree (Dee, 2026-09-19: "view like an actual org
 * chart like family tree, give me view options, like list or org chart"):
 *
 *   Chart — top-down, siblings side by side, connector lines between a seat
 *           and what reports to it. Scrolls sideways on a narrow screen.
 *   List  — the indented outline with a left rule and an elbow per node, which
 *           reflows on a phone and reads at any depth.
 *
 * Lines are CSS borders rather than SVG or canvas in both: no measurement
 * pass, no redraw on resize, and every node stays a real link. The choice of
 * view is a per-viewer convenience kept in localStorage; it is never data.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, ChevronDown, ChevronRight, Crown, Layers, List, Network, UserCheck, UserX, Users,
} from "lucide-react";
import { buildOrgChart, countSeats, type OrgNode } from "@/lib/agency/org-chart";
import { useOrganizationTree } from "@/lib/data/use-organization-structure";
import { usePositions } from "@/lib/data/use-positions";
import { useQuery } from "@tanstack/react-query";
import { fetchAgencyBrand } from "@/lib/data/agencies";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

const ICON: Record<OrgNode["kind"], typeof Users> = {
  agency: Building2,
  leadership: Crown,
  division: Layers,
  department: Layers,
  team: Users,
  position: UserCheck,
};

/** Where a node's own record lives, so no node is a dead end. */
function hrefFor(node: OrgNode): string | null {
  switch (node.kind) {
    case "team":
      return `/app/people/structure?team=${node.recordId}`;
    case "leadership":
    case "division":
    case "department":
      return `/app/settings?section=structure`;
    case "position":
      return `/app/settings?section=positions&position=${node.recordId}`;
    default:
      return null;
  }
}

export function OrgChart() {
  const tree = useOrganizationTree();
  const positions = usePositions();
  const auth = useAuth();
  /* The company's own name, from the agency record. The chart's root is the
     company, so it should say the company's name rather than a label. */
  const brand = useQuery({
    queryKey: ["agency", "brand", auth.agencyId ?? ""],
    queryFn: () => fetchAgencyBrand(auth.agencyId!),
    enabled: !!auth.agencyId,
    staleTime: 300_000,
  });
  const agencyName = brand.data?.name ?? "";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<ChartView>(readView);
  const chooseView = (v: ChartView) => { setView(v); writeView(v); };

  const root = useMemo(
    () =>
      tree.data
        ? buildOrgChart({
            agencyName: agencyName || "BES Agency HQ",
            tree: tree.data,
            positions: positions.data ?? [],
          })
        : null,
    [tree.data, positions.data, agencyName],
  );
  const seats = useMemo(() => countSeats(positions.data ?? []), [positions.data]);
  /* The chart is wider than the screen; open it on the company, not on the
     leftmost branch. Runs when the chart first draws and when it is re-chosen. */
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chartRef.current;
    if (view === "chart" && el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [view, root]);

  if (tree.isLoading || positions.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading the company…</p>;
  }
  if (!root) {
    return <p className="p-4 text-sm text-muted-foreground">No structure to show yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
        <span className="font-bold text-foreground">{seats.total} positions</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5 text-status-success" /> {seats.filled} filled
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-amber-600" /> {seats.covered} covered
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <UserX className="h-3.5 w-3.5 text-muted-foreground" /> {seats.vacant} vacant
        </span>
        {seats.vacant > 0 && (
          /* A vacancy is a fact about the company, not an error to hide (§7). */
          <span className="text-[11px] text-muted-foreground">
            A vacant seat is a real seat nobody is in — not a missing record.
          </span>
        )}
        <span className="ml-auto inline-flex rounded-lg border border-border bg-muted/50 p-0.5" role="group" aria-label="View">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const on = view === v.key;
            return (
              <button key={v.key} type="button" onClick={() => chooseView(v.key)} aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {v.label}
              </button>
            );
          })}
        </span>
      </div>

      {view === "chart" ? (
        <div ref={chartRef} className="overflow-x-auto rounded-xl border border-border bg-card p-4">
          <div className="inline-flex min-w-full justify-center">
            <TreeNode node={root} collapsed={collapsed} onToggle={(id) =>
              setCollapsed((c) => ({ ...c, [id]: !c[id] }))} />
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
          <Node node={root} depth={0} collapsed={collapsed} onToggle={(id) =>
            setCollapsed((c) => ({ ...c, [id]: !c[id] }))} />
        </div>
      )}
    </div>
  );
}

type ChartView = "chart" | "list";
const VIEWS: { key: ChartView; label: string; icon: typeof List }[] = [
  { key: "chart", label: "Org chart", icon: Network },
  { key: "list", label: "List", icon: List },
];
const VIEW_KEY = "bes.org-chart.view";
/* A per-viewer convenience. Storage may be unavailable (private window,
   blocked site data); the chart must render either way. */
const readView = (): ChartView => {
  try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "chart"; } catch { return "chart"; }
};
const writeView = (v: ChartView) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* fine */ } };

/** Descendant count, for the badge on a collapsed branch. */
const countBelow = (n: OrgNode): number => n.children.reduce((s, c) => s + 1 + countBelow(c), 0);

/**
 * One node of the top-down chart: the card, then its children side by side
 * beneath it. Connectors are three rules — a stem down from the parent, a
 * horizontal bar across the siblings (clipped to the first and last child's
 * centre), and a stub up from each child — all CSS, all from `border`.
 */
function TreeNode({ node, collapsed, onToggle }: {
  node: OrgNode;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = !collapsed[node.id];
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} />
      {hasChildren && (
        <button type="button" onClick={() => onToggle(node.id)} aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.label}`}
          className="z-10 -mt-2 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-border bg-card px-1 text-[10px] font-bold text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {isOpen ? <ChevronDown className="h-3 w-3" aria-hidden /> : <>{countBelow(node)} <ChevronRight className="h-3 w-3" aria-hidden /></>}
        </button>
      )}
      {hasChildren && isOpen && (
        <div className="relative pt-5">
          {/* The stem from this node down to the siblings' bar. */}
          <span aria-hidden className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-border" />
          <ul className="flex items-start gap-4">
            {node.children.map((child, i) => {
              const first = i === 0, last = i === node.children.length - 1;
              return (
                <li key={child.id} className="relative flex flex-col items-center pt-5">
                  {/* The bar across the siblings, clipped at the ends. */}
                  {node.children.length > 1 && (
                    <span aria-hidden className="absolute top-0 h-px bg-border"
                      style={{ left: first ? "50%" : 0, right: last ? "50%" : 0 }} />
                  )}
                  {/* The stub up from this child to the bar. */}
                  <span aria-hidden className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-border" />
                  <TreeNode node={child} collapsed={collapsed} onToggle={onToggle} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The card itself — the same facts and the same link as the list view. */
function NodeCard({ node }: { node: OrgNode }) {
  const Icon = ICON[node.kind];
  const href = hrefFor(node);
  const label = href ? (
    <Link to={href}
      className="text-xs font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {node.label}
    </Link>
  ) : (
    <span className="text-xs font-bold text-foreground">{node.label}</span>
  );
  return (
    <div className={cn(
      "w-44 rounded-xl border px-3 py-2 text-center shadow-sm",
      node.kind === "agency" && "border-primary/40 bg-primary/5",
      node.kind === "leadership" && "border-amber-500/40 bg-amber-500/5",
      node.kind === "division" && "border-border bg-muted/40",
      (node.kind === "department" || node.kind === "team") && "border-border bg-card",
      node.kind === "position" && node.state === "filled" && "border-status-success/40 bg-status-success/5",
      node.kind === "position" && node.state === "covered" && "border-amber-500/40 bg-amber-500/5",
      node.kind === "position" && node.state === "vacant" && "border-dashed border-border bg-card",
    )}>
      <Icon className={cn("mx-auto mb-1 h-4 w-4", node.kind === "leadership" ? "text-amber-600" : "text-muted-foreground")} aria-hidden />
      <span className="block truncate" title={node.label}>{label}</span>
      {node.detail && (
        <span className={cn("block truncate text-[11px]",
          node.state === "vacant" ? "font-semibold text-muted-foreground" : "text-muted-foreground")} title={node.detail}>
          {node.detail}
        </span>
      )}
      {node.coverage && (
        <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          Acting: {node.coverage}
        </span>
      )}
    </div>
  );
}

function Node({
  node, depth, collapsed, onToggle,
}: {
  node: OrgNode;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const Icon = ICON[node.kind];
  const hasChildren = node.children.length > 0;
  const isOpen = !collapsed[node.id];
  const href = hrefFor(node);

  return (
    <div className={cn(depth > 0 && "relative ml-4 border-l border-border pl-4")}>
      {depth > 0 && (
        /* The elbow. A single absolutely-positioned rule per node, so the
           branch reads at any depth without measuring anything. */
        <span aria-hidden className="absolute left-0 top-3.5 h-px w-4 bg-border" />
      )}

      <div className="flex items-start gap-1.5 py-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.label}`}
            className="mt-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="mt-0.5 w-[18px]" aria-hidden />
        )}

        <span
          className={cn(
            "min-w-0 flex-1 rounded-lg border px-2.5 py-1.5",
            node.kind === "agency" && "border-primary/40 bg-primary/5",
            node.kind === "leadership" && "border-amber-500/40 bg-amber-500/5",
            node.kind === "division" && "border-border bg-muted/40",
            (node.kind === "department" || node.kind === "team") && "border-border bg-card",
            node.kind === "position" && node.state === "filled" && "border-status-success/40 bg-status-success/5",
            node.kind === "position" && node.state === "covered" && "border-amber-500/40 bg-amber-500/5",
            node.kind === "position" && node.state === "vacant" && "border-dashed border-border bg-card",
          )}
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Icon className={cn("h-3.5 w-3.5 shrink-0 translate-y-0.5",
              node.kind === "leadership" ? "text-amber-600" : "text-muted-foreground")} aria-hidden />
            {href ? (
              <Link to={href}
                className="text-sm font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {node.label}
              </Link>
            ) : (
              <span className="text-sm font-bold text-foreground">{node.label}</span>
            )}
            {node.detail && (
              <span className={cn("text-[11px]",
                node.state === "vacant" ? "font-semibold text-muted-foreground" : "text-muted-foreground")}>
                {node.detail}
              </span>
            )}
            {node.coverage && (
              /* §8 — the cover shows on the seat it covers. */
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                Acting: {node.coverage}
              </span>
            )}
          </span>
        </span>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1}
              collapsed={collapsed} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
