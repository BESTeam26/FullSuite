/**
 * Schedules & rates — the two facts payroll and attendance stand on.
 *
 * A schedule says what is EXPECTED (days, shift, lunch/break allowance,
 * grace, timezone); a rate says what an hour — or a cutoff — is worth.
 * Neither is computed and neither is guessed: a manager states them, the
 * database audits the change, and everything downstream (late marks,
 * over-break, payslips) is derived from these plus the canonical time
 * records. Rates are visible only with payroll access — a lead sees
 * schedules, never pay.
 */
import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { ScheduleEditor } from "@/components/time/ScheduleEditor";
import { useWorkforce } from "@/lib/data/use-workforce";
import { usePayRates, useSchedules, useSetPayRate } from "@/lib/data/use-people";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { PAY_CURRENCIES } from "@/lib/data/people-management";
import { formatCentsIn } from "@/lib/format-money";
import { useToast } from "@/hooks/use-toast";
import type { WorkSchedule } from "@/lib/data/people-management";
import { describeSchedule } from "@/lib/time/schedule-format";

export function SchedulesAndRates({ onlyUserId }: { onlyUserId?: string } = {}) {
  const wf = useWorkforce();
  const schedules = useSchedules();
  const rates = usePayRates();
  const perms = useAgencyPermissions();
  const canPayroll = perms.can("payroll.manage");
  const [editing, setEditing] = useState<string | null>(null);

  const scheduleByUser = new Map((schedules.data ?? []).map((s) => [s.userId, s]));
  const rateByUser = new Map((rates.data ?? []).map((r) => [r.userId, r]));
  /* The profile reuses this exact editor for ONE person — same component,
     same writers, so schedule and rate have one canonical edit path (§28). */
  const people = (wf.data?.people ?? []).filter((p) => !onlyUserId || p.userId === onlyUserId);

  return (
    <ContentCard title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /> Schedules &amp; rates</span>}>
      {wf.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {people.map((p) => {
            const s = scheduleByUser.get(p.userId);
            const r = rateByUser.get(p.userId);
            return (
              <li key={p.userId} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{p.name}</span>
                    <span className="block text-muted-foreground">{describeSchedule(s)}</span>
                    {canPayroll && (
                      <span className="block text-muted-foreground">
                        {r
                          ? `Rate: ${formatCentsIn(r.rateCents, r.currency)} ${r.rateType === "hourly" ? "/ hour" : "/ cutoff"}`
                          : "No rate — payroll will skip them until one is set"}
                      </span>
                    )}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => setEditing(editing === p.userId ? null : p.userId)}>
                    {editing === p.userId ? "Close" : "Edit"}
                  </Button>
                </div>
                {editing === p.userId && (
                  <PersonEditor userId={p.userId} schedule={s} canPayroll={canPayroll}
                    rate={r ? { rateType: r.rateType, rateCents: r.rateCents, currency: r.currency } : undefined}
                    onDone={() => setEditing(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ContentCard>
  );
}

function PersonEditor({ userId, schedule, rate, canPayroll, onDone }: {
  userId: string;
  schedule?: WorkSchedule;
  rate?: { rateType: "hourly" | "per_cutoff"; rateCents: number; currency: string };
  canPayroll: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const setRate = useSetPayRate();
  const [rateType, setRateType] = useState<"hourly" | "per_cutoff">(rate?.rateType ?? "hourly");
  const [amount, setAmount] = useState(rate ? String(rate.rateCents / 100) : "");
  const [currency, setCurrency] = useState(rate?.currency ?? "USD");

  const saveRate = () => {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setRate.mutate(
      { userId, rateType, rateCents: cents, currency },
      {
        onSuccess: () => toast({ title: "Rate set", description: "Payslips snapshot the rate in force at each cutoff's end." }),
        onError: (e) => toast({ title: "Could not set the rate", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {/* The same editor Team Management → Schedule uses: one edit path. */}
      <ScheduleEditor userId={userId} schedule={schedule} onSaved={onDone} />

      {canPayroll && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2 text-xs">
          <label className="text-muted-foreground">Rate type
            <select value={rateType} onChange={(e) => setRateType(e.target.value as "hourly" | "per_cutoff")}
              className="mt-0.5 block h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
              <option value="hourly">Per hour</option>
              <option value="per_cutoff">Fixed per cutoff</option>
            </select>
          </label>
          <label className="text-muted-foreground">Amount
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="15.00" className="mt-0.5 h-7 w-24 text-xs" />
          </label>
          {/* The person's OWN currency — a Manila processor in pesos, a US
              contractor in dollars. Payroll converts to the payout currency at
              the rate recorded in Finance → Payroll, and each payslip freezes
              the rate it used. */}
          <label className="text-muted-foreground">Currency
            <div className="mt-0.5">
              <OpsSelect size="sm" value={currency} onValueChange={setCurrency}
                options={PAY_CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
          </label>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={setRate.isPending || !amount} onClick={saveRate}>
            {setRate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save rate
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Hourly pays work + approved paid leave; fixed pays the amount each cutoff.
          </span>
        </div>
      )}
    </div>
  );
}
