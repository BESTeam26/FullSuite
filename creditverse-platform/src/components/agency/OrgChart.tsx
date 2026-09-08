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
 * Lines are CSS borders rather than SVG: an indented tree with a left rule and
 * an elbow per node reads correctly at any depth, reflows on a phone, and
 * needs no measurement pass. A drawn-to-canvas chart looks better in a
 * screenshot and is unusable on the width Dee actually opens it at.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, ChevronDown, ChevronRight, Crown, Layers, UserCheck, UserX, Users,
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
      return `/app/teams?team=${node.recordId}`;
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
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <Node node={root} depth={0} collapsed={collapsed} onToggle={(id) =>
          setCollapsed((c) => ({ ...c, [id]: !c[id] }))} />
      </div>
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
