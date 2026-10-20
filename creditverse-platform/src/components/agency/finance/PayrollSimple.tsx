/**
 * Payroll, simply (Dee, 2026-10-20).
 *
 * "The payroll creation and payslip is too chaotic … I want it simple:
 * Agent Name · Running Hours · Rate · Generate Payslip. On the admin view."
 *
 * One table for the pay period in progress. Every figure comes from the
 * database in one request (`payroll_period_summary`): payable minutes from
 * the time records, the rate in force, the draft payslip if one exists. The
 * row button computes that one person's payslip; when the period's cutoff
 * does not exist yet it is created first, exactly as the manual form would.
 * Who appears is `payroll_people()`'s answer — the people this caller may
 * pay — never a list the screen decides. Release and adjustments stay in
 * the detailed panel below, which is unchanged.
 */
import { useState } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { PageLoadError } from "@/components/common/QueryState";
import { useCutoffs, usePayrollActions, usePayrollPeriodSummary, usePayrollSettings } from "@/lib/data/use-people";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { useToast } from "@/hooks/use-toast";
import { formatCentsIn } from "@/lib/format-money";
import { formatDate } from "@/lib/format-date";
import { currentPayPeriod, describeRate } from "@/lib/payroll/pay-period";

const easternToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

export function PayrollSimple() {
  const perms = useAgencyPermissions();
  const access = useAgencyAccessContext();
  const canManage = perms.can("payroll.manage");
  const mayWork = canManage || access.ctx.leadsTeam || (access.ctx.holdsSeat ?? false);
  const settings = usePayrollSettings();
  const cutoffs = useCutoffs();
  const actions = usePayrollActions();
  const { toast } = useToast();
  const [busyFor, setBusyFor] = useState<string | null>(null);

  const period = settings.data ? currentPayPeriod(easternToday(), settings.data.splitDay) : null;
  const cutoff = period ? (cutoffs.data ?? []).find((c) => c.periodStart === period.start && c.periodEnd === period.end) ?? null : null;
  const summary = usePayrollPeriodSummary(period?.start ?? null, period?.end ?? null, cutoff?.id ?? null);

  const generate = async (userId: string, name: string) => {
    if (!period) return;
    setBusyFor(userId);
    try {
      let cutoffId = cutoff?.id ?? null;
      if (!cutoffId) {
        await actions.createCutoff.mutateAsync({ periodStart: period.start, periodEnd: period.end });
        const fresh = await cutoffs.refetch();
        cutoffId = (fresh.data ?? []).find((c) => c.periodStart === period.start && c.periodEnd === period.end)?.id ?? null;
        if (!cutoffId) throw new Error("The cutoff was created but could not be found. Reload and try again.");
      }
      await actions.generateFor.mutateAsync({ cutoffId, userId });
      toast({ title: `Payslip computed for ${name}`, description: "From the hours worked and the rate in force. Adjust or release it in the panel below." });
    } catch (e) {
      toast({ title: "Could not generate the payslip", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyFor(null);
    }
  };

  if (settings.isError || summary.isError) return <PageLoadError what="payroll" />;
  const rows = summary.data ?? [];
  const priced = rows.filter((r) => r.basis !== null);
  const unpriced = rows.filter((r) => r.basis === null);

  return (
    <ContentCard
      title={period ? `Payroll · ${formatDate(period.start)} – ${formatDate(period.end)}` : "Payroll"}
      action={cutoff && (
        <span className={cutoff.status === "released"
          ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
          : "rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"}>
          {cutoff.status === "released" ? "Released" : "Draft"}
        </span>
      )}
    >
      {summary.isPending || settings.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading payroll">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
        </div>
      ) : priced.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody with a rate on file is in your payroll scope.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Agent</th>
                <th className="py-1.5 pr-3 text-right font-medium">Running hours</th>
                <th className="py-1.5 pr-3 font-medium">Rate</th>
                <th className="py-1.5 pr-3 text-right font-medium">Payslip</th>
                <th className="py-1.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {priced.map((r) => (
                <tr key={r.userId} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-semibold text-foreground">{r.fullName}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{hours(r.workMinutes)}</td>
                  <td className="py-2 pr-3 text-foreground">{describeRate(r.basis, r.rateCents, r.currency, r.hourlyCents, formatCentsIn)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {r.grossCents !== null && r.currency
                      ? <span className="font-semibold text-foreground">{formatCentsIn(r.grossCents, r.currency)}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{r.payslipStatus}</span></span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 text-right">
                    {mayWork && cutoff?.status !== "released" && (
                      <Button size="sm" variant={r.payslipId ? "outline" : "default"} className="h-7 text-xs"
                        disabled={busyFor !== null} onClick={() => void generate(r.userId, r.fullName)}>
                        {busyFor === r.userId ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ReceiptText className="mr-1 h-3 w-3" />}
                        {r.payslipId ? "Regenerate payslip" : "Generate payslip"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unpriced.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No rate on file, so no payslip: {unpriced.map((r) => r.fullName).join(", ")}. Set one under Compensation below.
        </p>
      )}
    </ContentCard>
  );
}
