/**
 * Payroll — cutoffs, payslips, release.
 *
 * Nothing here is typed but the period, an optional adjustment (with its
 * reason), and the moment of release. Every figure is computed by
 * `generate_payroll` from the canonical time and leave records; a released
 * cutoff is frozen history and its total is already an agency expense the
 * instant the release lands (rule 9, rule 11).
 */
import { useState } from "react";
import { Banknote, Loader2, Lock } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCutoffs, usePayrollActions, usePayslips } from "@/lib/data/use-people";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import { formatDuration } from "@/lib/time-domain";

const money = (cents: number, currency: string) =>
  `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`;

export function PayrollPanel() {
  const perms = useAgencyPermissions();
  const canManage = perms.can("payroll.manage");
  const cutoffs = useCutoffs();
  const actions = usePayrollActions();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const rows = cutoffs.data ?? [];
  const active = rows.find((c) => c.id === selected) ?? rows[0] ?? null;

  return (
    <div className="space-y-3">
      {canManage && (
        <ContentCard title="New cutoff">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="text-muted-foreground">From
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-0.5 h-8 w-36 text-xs" />
            </label>
            <label className="text-muted-foreground">To
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-0.5 h-8 w-36 text-xs" />
            </label>
            <Button size="sm" disabled={!periodStart || !periodEnd || periodEnd < periodStart || actions.createCutoff.isPending}
              onClick={() => actions.createCutoff.mutate(
                { periodStart, periodEnd },
                {
                  onSuccess: () => { setPeriodStart(""); setPeriodEnd(""); },
                  onError: (e) => toast({ title: "Could not create the cutoff", description: (e as Error).message, variant: "destructive" }),
                },
              )}>
              Create
            </Button>
            <span className="text-[10px] text-muted-foreground">Cutoffs cannot overlap — the same hour is never paid twice.</span>
          </div>
        </ContentCard>
      )}

      <ContentCard title="Cutoffs">
        {cutoffs.isLoading ? (
          <p className="py-3 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No cutoffs yet. Create the first period above; payslips are computed from time and leave, never typed.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 px-1 py-2 text-left text-xs hover:bg-muted/40 ${active?.id === c.id ? "bg-muted/40" : ""}`}>
                  <span className="text-foreground">{formatDate(c.periodStart)} – {formatDate(c.periodEnd)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.status === "released" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800" : "border-amber-500/40 bg-amber-500/10 text-amber-800"}`}>
                    {c.status === "released" ? "Released — expensed" : "Draft"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>

      {active && <CutoffDetail cutoffId={active.id} released={active.status === "released"} canManage={canManage} />}
    </div>
  );
}

function CutoffDetail({ cutoffId, released, canManage }: { cutoffId: string; released: boolean; canManage: boolean }) {
  const slips = usePayslips(cutoffId);
  const actions = usePayrollActions();
  const { toast } = useToast();
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const rows = slips.data ?? [];
  const total = rows.reduce((s, p) => s + p.grossCents, 0);
  const currency = rows[0]?.currency ?? "USD";

  const err = (title: string) => (e: unknown) =>
    toast({ title, description: (e as Error).message, variant: "destructive" });

  return (
    <ContentCard
      title={<span className="flex items-center gap-2"><Banknote className="h-4 w-4 text-muted-foreground" /> Payslips{rows.length > 0 && <span className="font-normal text-muted-foreground">— total {money(total, currency)}</span>}</span>}
      action={canManage && !released && (
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actions.generate.isPending}
            onClick={() => actions.generate.mutate(cutoffId, {
              onSuccess: (n) => toast({ title: `Computed ${n} payslips`, description: "From work minutes and approved paid leave. Adjustments are re-entered after a regenerate." }),
              onError: err("Could not generate"),
            })}>
            {actions.generate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {rows.length > 0 ? "Regenerate" : "Generate"}
          </Button>
          {rows.length > 0 && (
            <Button size="sm" className="h-7 text-xs" disabled={actions.release.isPending}
              onClick={() => actions.release.mutate(cutoffId, {
                onSuccess: () => toast({ title: "Payroll released", description: "The total is now an agency expense, due at period end." }),
                onError: err("Could not release"),
              })}>
              {actions.release.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lock className="mr-1 h-3 w-3" />}
              Release
            </Button>
          )}
        </span>
      )}
    >
      {slips.isLoading ? (
        <p className="py-3 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nothing computed yet — press Generate. People without a rate are skipped and shown by their absence, never paid zero.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((p) => (
            <li key={p.id} className="py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground">
                  <span className="font-medium">{p.userName ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {" "}· {formatDuration(p.workMinutes)} worked
                    {p.paidLeaveMinutes > 0 ? ` + ${formatDuration(p.paidLeaveMinutes)} paid leave` : ""}
                    {" "}· {p.rateType === "hourly" ? `${money(p.rateCents, p.currency)}/h` : `${money(p.rateCents, p.currency)}/cutoff`}
                    {p.adjustmentCents !== 0 ? ` · adj ${money(p.adjustmentCents, p.currency)} (${p.adjustmentNote})` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{money(p.grossCents, p.currency)}</span>
                  {canManage && !released && (
                    <button type="button" className="text-[10px] text-primary underline-offset-2 hover:underline"
                      onClick={() => { setAdjusting(adjusting === p.id ? null : p.id); setAmount(""); setNote(""); }}>
                      Adjust
                    </button>
                  )}
                </span>
              </div>
              {adjusting === p.id && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="+/- amount" className="h-7 w-28 text-xs" />
                  <Input value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason (required)" className="h-7 w-56 text-xs" />
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    disabled={!amount || note.trim().length < 3 || actions.adjust.isPending}
                    onClick={() => actions.adjust.mutate(
                      { payslipId: p.id, cents: Math.round(Number(amount) * 100), note },
                      { onSuccess: () => setAdjusting(null), onError: err("Could not adjust") },
                    )}>
                    Save
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}
