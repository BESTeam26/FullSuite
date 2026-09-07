/**
 * The agency calendar: U.S. federal holidays and BES's own events.
 *
 * Holidays are visually distinct from everything else and cannot be edited —
 * a federal date is set by statute, and an admin who wants a different closure
 * adds their own event rather than rewriting it. That way the statutory date
 * stays correct and the agency's policy sits beside it instead of on top.
 */
import { useMemo, useState } from "react";
import { CalendarDays, Landmark, Lock, Plus, Star } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/auth-context";
import { useCalendarEvents, useHolidayUpkeep } from "@/lib/data/use-agency-calendar";
import { longDate } from "@/lib/data/agency-calendar";
import { businessToday, addDays } from "@/lib/calendar/us-federal-holidays";
import { atLeast, type AgencyRole } from "@/lib/agency/navigation";
import { requireSupabase } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const KIND_META = {
  us_federal_holiday: { label: "U.S. federal holiday", icon: Landmark, cls: "border-blue-500/30 bg-blue-500/5" },
  custom_holiday: { label: "BES holiday", icon: Star, cls: "border-emerald-500/30 bg-emerald-500/5" },
  company_event: { label: "Company event", icon: CalendarDays, cls: "border-border bg-card" },
  special_workday: { label: "Special workday", icon: CalendarDays, cls: "border-amber-500/30 bg-amber-500/5" },
} as const;

export const AgencyCalendarPage = () => {
  const { agencyId, agencyMembership } = useAuth();
  const role = (agencyMembership?.role as AgencyRole) ?? null;
  const canAdd = atLeast(role, "agency_manager");
  const qc = useQueryClient();
  useHolidayUpkeep();

  const today = businessToday();
  const [from, setFrom] = useState(today);
  const to = useMemo(() => addDays(from, 365), [from]);
  const events = useCalendarEvents(from, to);
  const [adding, setAdding] = useState(false);

  return (
    <HqPageShell
      title="Agency Calendar"
      description="U.S. federal holidays and BES events"
      icon={CalendarDays}
      actions={
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            aria-label="From" className="h-8 w-40" />
          {canAdd && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add event
            </Button>
          )}
        </div>
      }
    >
      <ContentCard title="Next 12 months">
        {events.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (events.data ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing in this range yet. Holidays are generated automatically.
          </p>
        ) : (
          <ul className="space-y-2">
            {(events.data ?? []).map((e) => {
              const meta = KIND_META[e.kind];
              const Icon = meta.icon;
              const isToday = e.observedDate === today;
              return (
                <li key={e.id} className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2",
                  meta.cls,
                  isToday && "ring-2 ring-primary/40",
                )}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {e.name}
                      {isToday && <span className="ml-2 text-xs font-bold text-primary">Today</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {longDate(e.observedDate)}
                      {e.observedDate !== e.eventDate && (
                        <> · falls on {longDate(e.eventDate)}, observed {longDate(e.observedDate)}</>
                      )}
                      {" · "}{meta.label}
                      {!e.nonWorking && " · working day"}
                    </p>
                    {e.notes && <p className="mt-0.5 text-xs italic text-muted-foreground">{e.notes}</p>}
                  </div>
                  {e.systemManaged && (
                    <span
                      title="Set by U.S. statute. Add a BES event instead of changing this."
                      className="mt-0.5 flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground"
                    >
                      <Lock className="h-3 w-3" /> Official
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ContentCard>

      {adding && agencyId && (
        <AddEventDialog
          open={adding}
          onOpenChange={setAdding}
          agencyId={agencyId}
          onSaved={() => { setAdding(false); void qc.invalidateQueries({ queryKey: ["agency", "calendar"] }); }}
        />
      )}
    </HqPageShell>
  );
};

function AddEventDialog({ open, onOpenChange, agencyId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; agencyId: string; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(businessToday());
  const [kind, setKind] = useState<"custom_holiday" | "company_event" | "special_workday">("company_event");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      const sb = requireSupabase();
      const { error: e } = await sb.from("agency_calendar_events").insert({
        agency_id: agencyId, kind, name: name.trim(),
        event_date: date, observed_date: date,
        /* A special workday is the agency saying "we ARE working" — the one
           event kind that is not a closure. */
        non_working: kind !== "special_workday",
        notes: notes.trim() || null,
        system_managed: false,
      } as never);
      if (e) throw e;
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The event could not be saved.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an agency event</DialogTitle>
          <DialogDescription>
            A BES closure, a company event, or a day the team is working when it
            normally would not. U.S. federal holidays are generated and cannot be changed here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="What is it?" aria-label="Event name" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <OpsSelect aria-label="Kind" size="sm" value={kind}
            onValueChange={(v) => setKind(v as typeof kind)}
            options={[
              { value: "company_event", label: "Company event" },
              { value: "custom_holiday", label: "BES holiday (office closed)" },
              { value: "special_workday", label: "Special workday (team working)" },
            ]} />
          <Input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)" aria-label="Notes" />
          {error && <p className="text-sm text-status-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
