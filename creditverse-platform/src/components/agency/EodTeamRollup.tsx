/**
 * Part 2 of a Team Lead's own EOD.
 *
 * Dee, 2026-09-16: *"Do NOT replace the Team Lead's individual report with the
 * department report."* So this sits BELOW their own day, never instead of it,
 * and renders nothing at all for somebody who leads nobody — an empty "your
 * team" panel on an agent's screen is a question about why it is there.
 *
 * ── NOT AVAILABLE IS NOT ZERO ──────────────────────────────────────────────
 *
 * Every figure here can be null, and null is rendered as "—" with the reason
 * available in the row beside it. A team whose members have not reported has
 * not produced nothing; nobody has said yet. Printing 0 for both is how a lead
 * chases the wrong person.
 */
import { AlertTriangle, Users } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import { useEodTeamRollup, rollupTotals, type RollupRow } from "@/lib/data/use-eod-rollup";
import { cn } from "@/lib/utils";

/** Minutes as somebody would say them, or an honest dash. */
const time = (minutes: number | null): string => {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const num = (n: number | null): string => (n === null ? "—" : String(n));

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-lg border border-border bg-background px-3 py-2">
    <p className={cn("text-lg font-black tabular-nums text-foreground", tone)}>{value}</p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
  </div>
);

function PersonLine({ r }: { r: RollupRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{r.employeeName}</span>
        <span className={cn("ml-1.5 text-[11px]",
          r.submitted ? "text-status-success" : "text-muted-foreground")}>
          {r.submitted ? (r.autoSubmitted ? "Auto-submitted" : "Submitted ✓") : "Not submitted"}
        </span>
        {/* Dee: "Include important blockers/help requests prominently." Under
            the person's name, not folded away behind a click. */}
        {(r.blockers || r.helpNeeded) && (
          <span className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{[r.blockers, r.helpNeeded].filter(Boolean).join(" · ")}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        Production {num(r.production)} · Completed {num(r.completed)}
        {r.blocked ? ` · Blocked ${r.blocked}` : ""} · {time(r.minutesLogged)}
      </span>
    </li>
  );
}

export function EodTeamRollup({ date }: { date: string }) {
  const rollup = useEodTeamRollup(date);

  /* Leads nobody: the panel is absent, not empty. */
  if (!rollup.isPending && !rollup.isError && (rollup.data ?? []).length === 0) return null;

  if (!hasRows(rollup)) {
    return (
      <ContentCard title="My team today">
        <PanelState query={rollup} empty={<p className="text-sm text-muted-foreground">Nobody to report on.</p>} />
      </ContentCard>
    );
  }

  const rows = rollup.data ?? [];
  const t = rollupTotals(rows);

  return (
    <ContentCard title="My team today">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        This is your team's day. Your own report is above it, not replaced by it.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Submitted" value={`${t.submitted}/${t.members}`} />
        <Stat label="Missing" value={String(t.missing)}
          tone={t.missing > 0 ? "text-amber-700" : undefined} />
        <Stat label="Production" value={num(t.production)} />
        <Stat label="Completed" value={num(t.completed)} />
        <Stat label="Blocked" value={num(t.blocked)}
          tone={(t.blocked ?? 0) > 0 ? "text-amber-700" : undefined} />
        <Stat label="Time logged" value={time(t.minutesLogged)} />
      </div>
      <ul>
        {rows.map((r) => <PersonLine key={r.employeeId} r={r} />)}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A dash means nobody has reported that figure yet — not that it is zero.
      </p>
    </ContentCard>
  );
}
