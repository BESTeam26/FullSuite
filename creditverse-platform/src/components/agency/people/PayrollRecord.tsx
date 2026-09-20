/**
 * A person's Payroll Record — Dee's layout, 2026-09-20.
 *
 * The screen has two halves and they say different things on purpose:
 *
 *   Pay Period Details   the internal picture. Contractor pay, BES cost, and
 *                        the managing partner's margin, each labelled as
 *                        internal, and each shown ONLY when the database
 *                        returns it.
 *   Payslip Preview      what the contractor will see. Their pay, their
 *                        hours, nothing about what BES paid for them.
 *
 * The preview is not a styling choice. It is the same shape the worker's own
 * `my_payslips` view returns, so what a manager previews here is what the
 * worker actually gets. The internal figures arrive as `null` when the caller
 * lacks compensation.bes_cost.view — the gate is the database's, and this
 * file only decides how an absent number reads (rule 1).
 */
import { useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { OpsSelect } from "@/components/ui/ops-select";
import { usePayrollRecord } from "@/lib/data/use-compensation";
import { yearToDate, type PayrollRecordRow } from "@/lib/data/compensation";
import { formatDate } from "@/lib/format-date";
import { formatCentsIn } from "@/lib/format-money";
import { formatDuration } from "@/lib/time-domain";

const BASIS_LABEL: Record<string, string> = {
  hourly: "per hour", daily: "per day", monthly: "per month", per_cutoff: "per cutoff",
};

export function PayrollRecord({ userId }: { userId: string }) {
  const record = usePayrollRecord(userId);
  const rows = useMemo(() => record.data ?? [], [record.data]);
  const [periodId, setPeriodId] = useState<string>("");
  const current = rows.find((r) => r.payslipId === periodId) ?? rows[0] ?? null;
  const year = Number((current?.periodEnd ?? new Date().toISOString()).slice(0, 4));
  const ytd = useMemo(() => yearToDate(rows, year), [rows, year]);

  if (record.isLoading) {
    return <ContentCard title="Payroll Record">
      <p className="py-6 text-center text-xs text-muted-foreground">
        <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…
      </p>
    </ContentCard>;
  }
  if (!current) {
    return <ContentCard title="Payroll Record">
      <p className="py-4 text-xs text-muted-foreground">
        No payroll has been generated for this person yet. Periods appear here once a cutoff is generated
        under Finance → Payroll.
      </p>
    </ContentCard>;
  }

  const minutes = current.workMinutes + current.paidLeaveMinutes + current.paidBreakMinutes;

  return (
    <div className="space-y-3">
      <ContentCard
        title="Payroll Record"
        action={
          <OpsSelect
            aria-label="Pay period"
            value={current.payslipId}
            onValueChange={setPeriodId}
            options={rows.map((r) => ({
              value: r.payslipId,
              label: `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}${r.status === "draft" ? " (draft)" : ""}`,
            }))}
          />
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Hours worked" value={formatDuration(minutes)}
            note={`${current.paidDays} paid scheduled ${current.paidDays === 1 ? "day" : "days"}`} />
          <Figure label="Contractor pay (agent)" value={formatCentsIn(current.grossCents, current.currency)}
            note={`${formatCentsIn(current.rateCents, current.currency)} ${BASIS_LABEL[current.basis] ?? current.basis}`}
            emphasis />
          <Internal label="BES cost" cents={current.besTotalCents} currency={current.currency} />
          <Internal label="Managing partner margin" cents={current.marginCents} currency={current.currency}
            note={current.managingPartnerName ? `To ${current.managingPartnerName}` : undefined} />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_20rem]">
          <div>
            <Heading>Earnings</Heading>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/50">
                <Line label="Base pay" detail={describeBase(current)} cents={current.baseCents} currency={current.currency} />
                {current.adjustmentCents !== 0 && (
                  <Line label="Adjustment" detail={current.adjustmentNote ?? "Manual adjustment"}
                    cents={current.adjustmentCents} currency={current.currency} />
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2 font-semibold text-foreground">Net pay to contractor</td>
                  <td className="py-2 text-right font-semibold text-foreground">
                    {formatCentsIn(current.grossCents, current.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Deductions are not withheld by BES for contractors. Any agreed deduction is recorded as an
              adjustment above, with its reason, so the payslip always explains itself.
            </p>
          </div>

          {/* What the worker receives. Deliberately the shorter panel. */}
          <aside className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payslip preview</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">This is what the contractor will see.</p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <Row term="Period" value={`${formatDate(current.periodStart)} – ${formatDate(current.periodEnd)}`} />
              <Row term="Hours" value={formatDuration(minutes)} />
              <Row term="Rate" value={`${formatCentsIn(current.rateCents, current.currency)} ${BASIS_LABEL[current.basis] ?? ""}`} />
              <Row term="Base pay" value={formatCentsIn(current.baseCents, current.currency)} />
              {current.adjustmentCents !== 0 && (
                <Row term="Adjustment" value={formatCentsIn(current.adjustmentCents, current.currency)} />
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
                <dt className="text-xs font-semibold text-foreground">Net pay</dt>
                <dd className="text-base font-semibold text-foreground">
                  {formatCentsIn(current.grossCents, current.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {current.payday ? `Payable ${formatDate(current.payday)}.` : "Payable on the cutoff's payday."}
              {current.status === "draft" ? " Draft — not yet released." : ""}
            </p>
          </aside>
        </div>
      </ContentCard>

      <ContentCard title={`Year to date — ${year}`}>
        {ytd.periods === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">No released periods yet this year.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Released periods" value={String(ytd.periods)} />
            <Figure label="Hours" value={formatDuration(ytd.minutes)} />
            <Figure label="Contractor pay" value={formatCentsIn(ytd.grossCents, ytd.currency)} emphasis />
            <Internal label="BES cost" cents={ytd.besTotalCents} currency={ytd.currency} />
          </div>
        )}
      </ContentCard>

      <ContentCard title="Recent payroll history">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Period</th>
                <th className="py-1.5 pr-3 font-medium">Hours</th>
                <th className="py-1.5 pr-3 text-right font-medium">Contractor pay</th>
                <th className="py-1.5 pr-3 text-right font-medium">BES cost</th>
                <th className="py-1.5 pr-3 text-right font-medium">Partner margin</th>
                <th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={r.payslipId} className="text-foreground">
                  <td className="py-1.5 pr-3">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {formatDuration(r.workMinutes + r.paidLeaveMinutes + r.paidBreakMinutes)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium">{formatCentsIn(r.grossCents, r.currency)}</td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {r.besTotalCents === null ? "—" : formatCentsIn(r.besTotalCents, r.currency)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {r.marginCents === null ? "—" : formatCentsIn(r.marginCents, r.currency)}
                  </td>
                  <td className="py-1.5 capitalize text-muted-foreground">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
    </div>
  );
}

const describeBase = (r: PayrollRecordRow) =>
  r.basis === "hourly"
    ? `${formatDuration(r.workMinutes + r.paidLeaveMinutes + r.paidBreakMinutes)} at ${formatCentsIn(r.rateCents, r.currency)}/hour`
    : r.basis === "monthly"
      ? `Monthly package, shared over ${r.paidDays} paid scheduled ${r.paidDays === 1 ? "day" : "days"}`
      : r.basis === "daily"
        ? `${r.paidDays} paid scheduled ${r.paidDays === 1 ? "day" : "days"} at ${formatCentsIn(r.rateCents, r.currency)}`
        : "Fixed amount for the cutoff";

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
);

const Row = ({ term, value }: { term: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-muted-foreground">{term}</dt>
    <dd className="text-right font-medium text-foreground">{value}</dd>
  </div>
);

const Line = ({ label, detail, cents, currency }: { label: string; detail: string; cents: number; currency: string }) => (
  <tr>
    <td className="py-1.5 pr-3">
      <span className="font-medium text-foreground">{label}</span>
      <span className="block text-[11px] text-muted-foreground">{detail}</span>
    </td>
    <td className="py-1.5 text-right align-top font-medium text-foreground">{formatCentsIn(cents, currency)}</td>
  </tr>
);

const Figure = ({ label, value, note, emphasis }: { label: string; value: string; note?: string; emphasis?: boolean }) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    <p className={emphasis ? "mt-0.5 text-lg font-semibold text-foreground" : "mt-0.5 text-base font-semibold text-foreground"}>{value}</p>
    {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
  </div>
);

/**
 * An internal figure, or an honest statement that it is not yours to see.
 *
 * A dash would read as zero. "Not shown" says the number exists and this
 * account does not open it, which is the true thing to say.
 */
const Internal = ({ label, cents, currency, note }: { label: string; cents: number | null; currency: string | null; note?: string }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
    <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    {cents === null ? (
      <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden /> Not shown
      </p>
    ) : (
      <p className="mt-0.5 text-base font-semibold text-foreground">{formatCentsIn(cents, currency)}</p>
    )}
    <p className="mt-0.5 text-[11px] text-muted-foreground">{cents === null ? "Needs the internal cost permission" : (note ?? "For internal tracking")}</p>
  </div>
);
