/**
 * What everyone is paid, on one page.
 *
 * Dee, 2026-09-20: "I don't see a direct way I can easily see the
 * compensation." It was only reachable by opening a person, finding the
 * Compensation tab, and reading one arrangement at a time — fine for checking
 * somebody, useless for answering "what are we paying?".
 *
 * BES cost and margin appear only when the database returns them. A person
 * with payroll permission sees what each worker earns and nothing about what
 * BES pays for them, which is the separation Dee asked for, enforced in the
 * row and column grants rather than here.
 */
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { useArrangementRoster } from "@/lib/data/use-compensation";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { formatCentsIn } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";

const BASIS: Record<string, string> = {
  hourly: "per hour", daily: "per day", monthly: "per month", per_cutoff: "per cutoff",
};

export function CompensationRoster() {
  const roster = useArrangementRoster();
  const members = useAgencyMembers();

  const rows = (roster.data ?? []).slice().sort((a, b) =>
    (a.personName ?? "").localeCompare(b.personName ?? ""));
  const priced = new Set(rows.map((r) => r.userId));
  /* Named, not counted: an unpriced person gets no payslip at all, so the
     useful thing is knowing WHO. */
  const unpriced = (members.data ?? [])
    .filter((m) => m.status === "active" && !priced.has(m.userId))
    .map((m) => m.name || m.email);
  const anyCost = rows.some((r) => r.besCostCents !== null);

  return (
    <ContentCard title="What each person is paid">
      {roster.isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">
          Nobody has a compensation arrangement yet. Open a person under Team Members and set one on their
          Compensation tab.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Person</th>
                <th className="py-1.5 pr-3 text-right font-medium">Worker earns</th>
                <th className="py-1.5 pr-3 font-medium">Paid by</th>
                <th className="py-1.5 pr-3 text-right font-medium">BES pays</th>
                <th className="py-1.5 pr-3 text-right font-medium">Margin</th>
                <th className="py-1.5 font-medium">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={r.id} className="text-foreground">
                  <td className="py-1.5 pr-3">
                    <Link to={`/app/people/${r.userId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {r.personName ?? "Unnamed"}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium">
                    {formatCentsIn(r.agentRateCents, r.currency)}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">{BASIS[r.basis] ?? r.basis}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {r.arrangementType === "managing_partner" ? (r.managingPartnerName ?? "A managing partner") : "BES directly"}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {r.besCostCents === null ? "—" : formatCentsIn(r.besCostCents, r.currency)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {r.marginCents === null ? "—" : formatCentsIn(r.marginCents, r.currency)}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{formatDate(r.effectiveFrom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!anyCost && rows.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden />
          What BES pays, and any managing partner&apos;s margin, need the internal cost permission.
        </p>
      )}

      {unpriced.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">No rate on file yet:</span> {unpriced.join(", ")}.
          Payroll skips them until one is set, so they get no payslip rather than a payslip for nothing.
        </p>
      )}
    </ContentCard>
  );
}
