/**
 * Set one person's work schedule — the ONE edit path.
 *
 * Used by the People profile (beside pay) and by Team Management → Schedule.
 * The database decides who may save: management capability within the
 * caller's scope (`set_work_schedule`). Attendance judges each day by the
 * schedule in force that day, so saving adds a dated row and rewrites nothing.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetSchedule } from "@/lib/data/use-people";
import { useToast } from "@/hooks/use-toast";
import type { WorkSchedule } from "@/lib/data/people-management";
import { DAY_LETTER, hhmm } from "@/lib/time/schedule-format";

export function ScheduleEditor({ userId, schedule, onSaved }: {
  userId: string;
  schedule?: WorkSchedule;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const setSchedule = useSetSchedule();
  const [days, setDays] = useState<number[]>(schedule?.workDays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(schedule ? hhmm(schedule.shiftStart) : "09:00");
  const [end, setEnd] = useState(schedule ? hhmm(schedule.shiftEnd) : "18:00");
  const [lunch, setLunch] = useState(String(schedule?.lunchMinutes ?? 60));
  const [breaks, setBreaks] = useState(String(schedule?.breakMinutes ?? 30));
  const [grace, setGrace] = useState(String(schedule?.graceMinutes ?? 5));
  const [tz, setTz] = useState(schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);

  const toggleDay = (d: number) =>
    setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d].sort()));

  const save = () =>
    setSchedule.mutate(
      {
        userId, workDays: days, shiftStart: start, shiftEnd: end,
        lunchMinutes: Number(lunch), breakMinutes: Number(breaks),
        graceMinutes: Number(grace), timezone: tz,
      },
      {
        onSuccess: () => {
          toast({ title: "Schedule set", description: "Attendance judges each day by the schedule in force that day." });
          onSaved?.();
        },
        onError: (e) => toast({ title: "Could not set the schedule", description: (e as Error).message, variant: "destructive" }),
      },
    );

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <span>
        <span className="block text-muted-foreground">Days</span>
        <span className="mt-0.5 flex gap-1" role="group" aria-label="Work days">
          {DAY_LETTER.map((l, i) => {
            const on = days.includes(i + 1);
            return (
              <button key={i} type="button" onClick={() => toggleDay(i + 1)} aria-pressed={on}
                className={`h-7 w-7 rounded-md border text-[11px] font-semibold transition-colors ${on
                  ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"}`}>
                {l}
              </button>
            );
          })}
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
      <Button size="sm" className="h-7 text-xs" disabled={setSchedule.isPending || days.length === 0} onClick={save}>
        {setSchedule.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save schedule
      </Button>
    </div>
  );
}
