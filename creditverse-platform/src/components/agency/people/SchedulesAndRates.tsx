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
import { useWorkforce } from "@/lib/data/use-workforce";
import { usePayRates, useSchedules, useSetPayRate, useSetSchedule } from "@/lib/data/use-people";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useToast } from "@/hooks/use-toast";
import type { WorkSchedule } from "@/lib/data/people-management";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // ISO 1..7
const hhmm = (t: string) => t.slice(0, 5);

const describeSchedule = (s: WorkSchedule | undefined) =>
  s
    ? `${s.workDays.map((d) => DAY_LABELS[d - 1]).join("")} · ${hhmm(s.shiftStart)}–${hhmm(s.shiftEnd)} ${s.timezone}` +
      ` · lunch ${s.lunchMinutes}m · breaks ${s.breakMinutes}m · grace ${s.graceMinutes}m`
    : "No schedule — attendance says nothing about them";

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
                          ? `Rate: ${(r.rateCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${r.currency} ${r.rateType === "hourly" ? "/ hour" : "/ cutoff"}`
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
  const setSchedule = useSetSchedule();
  const setRate = useSetPayRate();
  const [days, setDays] = useState<number[]>(schedule?.workDays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(schedule ? hhmm(schedule.shiftStart) : "09:00");
  const [end, setEnd] = useState(schedule ? hhmm(schedule.shiftEnd) : "18:00");
  const [lunch, setLunch] = useState(String(schedule?.lunchMinutes ?? 60));
  const [breaks, setBreaks] = useState(String(schedule?.breakMinutes ?? 30));
  const [grace, setGrace] = useState(String(schedule?.graceMinutes ?? 5));
  const [tz, setTz] = useState(schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [rateType, setRateType] = useState<"hourly" | "per_cutoff">(rate?.rateType ?? "hourly");
  const [amount, setAmount] = useState(rate ? String(rate.rateCents / 100) : "");
  const [currency, setCurrency] = useState(rate?.currency ?? "USD");

  const toggleDay = (d: number) =>
    setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d].sort()));

  const saveSchedule = () =>
    setSchedule.mutate(
      {
        userId, workDays: days, shiftStart: start, shiftEnd: end,
        lunchMinutes: Number(lunch), breakMinutes: Number(breaks),
        graceMinutes: Number(grace), timezone: tz,
      },
      {
        onSuccess: () => { toast({ title: "Schedule set", description: "Attendance judges each day by the schedule in force that day." }); onDone(); },
        onError: (e) => toast({ title: "Could not set the schedule", description: (e as Error).message, variant: "destructive" }),
      },
    );

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
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <span>
          <span className="block text-muted-foreground">Days</span>
          <span className="mt-0.5 flex gap-1">
            {DAY_LABELS.map((l, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i + 1)}
                className={`h-7 w-7 rounded-md border text-[11px] font-semibold ${days.includes(i + 1) ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-800" : "border-border bg-card text-muted-foreground"}`}>
                {l}
              </button>
            ))}
          </span>
        </span>
        <label className="text-muted-foreground">Start
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-0.5 h-7 w-24 text-xs" />
        </label>
        <label className="text-muted-foreground">End
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-0.5 h-7 w-24 text-xs" />
        </label>
        <label className="text-muted-foreground">Lunch (m)
          <Input type="number" value={lunch} onChange={(e) => setLunch(e.target.value)} className="mt-0.5 h-7 w-16 text-xs" />
        </label>
        <label className="text-muted-foreground">Breaks (m)
          <Input type="number" value={breaks} onChange={(e) => setBreaks(e.target.value)} className="mt-0.5 h-7 w-16 text-xs" />
        </label>
        <label className="text-muted-foreground">Grace (m)
          <Input type="number" value={grace} onChange={(e) => setGrace(e.target.value)} className="mt-0.5 h-7 w-16 text-xs" />
        </label>
        <label className="text-muted-foreground">Timezone
          <Input value={tz} onChange={(e) => setTz(e.target.value)} className="mt-0.5 h-7 w-44 text-xs" />
        </label>
        <Button size="sm" className="h-7 text-xs" disabled={setSchedule.isPending || days.length === 0} onClick={saveSchedule}>
          {setSchedule.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save schedule
        </Button>
      </div>

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
          <label className="text-muted-foreground">Currency
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="mt-0.5 h-7 w-16 text-xs" />
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
