/**
 * The organisation's day, by team.
 *
 * Only for management, and the gate is in `eod_org_rollup` rather than here —
 * the function returns nothing to anybody without `ops.manage`, so this panel
 * simply has no rows for them (rule 1: never rely on hidden UI).
 *
 * A team with no lead is called out rather than left blank. That is the single
 * most actionable thing on the screen: an unled team's reports route nowhere,
 * and three of them are in exactly that state today.
 */
import { AlertTriangle, Building2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import { useEodOrgRollup } from "@/lib/data/use-eod-org-rollup";
import { cn } from "@/lib/utils";

const time = (m: number | null) => (m === null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const num = (n: number | null) => (n === null ? "—" : String(n));

export function EodOrgRollup({ date, enabled }: { date: string; enabled: boolean }) {
  const org = useEodOrgRollup(date, enabled);
  if (!enabled) return null;

  if (!hasRows(org)) {
    return (
      <ContentCard title="By team">
        <PanelState query={org} empty={
          <p className="text-sm text-muted-foreground">No teams to roll up.</p>} />
      </ContentCard>
    );
  }

  const rows = org.data ?? [];
  const unled = rows.filter((r) => r.teamId && !r.leadName);

  return (
    <ContentCard title="By team">
      {unled.length > 0 && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">{unled.length} team{unled.length === 1 ? "" : "s"} have no lead.</span>{" "}
            Reports from {unled.map((r) => r.teamName).join(", ")} route to nobody until one is set.
          </span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 pr-3 font-semibold">Team</th>
              <th className="py-1.5 pr-3 font-semibold">Lead</th>
              <th className="py-1.5 pr-3 font-semibold">Submitted</th>
              <th className="py-1.5 pr-3 font-semibold">Awaiting review</th>
              <th className="py-1.5 pr-3 font-semibold">Blockers</th>
              <th className="py-1.5 pr-3 font-semibold">Production</th>
              <th className="py-1.5 pr-3 font-semibold">Completed</th>
              <th className="py-1.5 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId ?? "none"} className="border-b border-border/40 last:border-b-0">
                <td className="py-1.5 pr-3">
                  <span className="block font-medium text-foreground">{r.teamName}</span>
                  {r.department && <span className="block text-[10px] text-muted-foreground">{r.department}</span>}
                </td>
                <td className={cn("py-1.5 pr-3", r.leadName ? "text-foreground" : "text-amber-700")}>
                  {r.leadName ?? (r.teamId ? "No lead set" : "—")}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {r.submitted}/{r.members}
                  {r.missing > 0 && <span className="ml-1 text-amber-700">({r.missing} missing)</span>}
                </td>
                <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{r.needsReview}</td>
                <td className={cn("py-1.5 pr-3 tabular-nums", r.withBlockers > 0 && "font-semibold text-amber-700")}>
                  {r.withBlockers}
                </td>
                <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{num(r.production)}</td>
                <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{num(r.completed)}</td>
                <td className="py-1.5 tabular-nums text-muted-foreground">{time(r.minutesLogged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A dash means nobody on that team reported the figure — not that it is zero.
        Somebody on two teams is counted under each.
      </p>
    </ContentCard>
  );
}
