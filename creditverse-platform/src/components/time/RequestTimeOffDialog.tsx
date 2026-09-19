/**
 * Requesting time off.
 *
 * Dee's mockup, 2026-09-18: type, dates, a DURATION the form works out for
 * itself, a reason, and a coverage note. The duration is the part worth
 * building carefully — "Oct 5 – Oct 9" is five calendar days and could be
 * three working ones, and a person counting weekends and holidays in their
 * head is a person who requests the wrong dates.
 *
 * It is computed from `businessDaysBetween`, the same federal-holiday calendar
 * the rest of the product uses, and shown read-only. Nobody types it, so it
 * cannot disagree with the dates above it (rule 9).
 *
 * The mockup also shows an attachment upload. It is NOT built here — see the
 * note by the reason field.
 */
import { useMemo, useState } from "react";
import { CalendarOff, Info, Loader2, X } from "lucide-react";
import { addDays, businessDaysBetween, businessToday } from "@/lib/calendar/us-federal-holidays";
import { formatDate } from "@/lib/format-date";
import { OpsSelect } from "@/components/ui/ops-select";
import { cn } from "@/lib/utils";

export interface LeaveTypeOption {
  id: string; label: string; paid: boolean;
  /** Days of warning this kind of leave needs. 0 for the unplannable ones. */
  minNoticeDays: number;
  /** What BES pays for it — never a balance (Dee, 2026-09-19). */
  compensation: "unpaid" | "reward";
  rewardKind: "birthday" | "attendance" | null;
  /** Spendable credits of that kind, for a reward type. */
  rewardDaysAvailable?: number;
}

export function RequestTimeOffDialog({
  types, busy, error, onSubmit, onClose,
}: {
  types: LeaveTypeOption[];
  busy: boolean;
  error: string | null;
  onSubmit: (v: { typeId: string; startsOn: string; endsOn: string; reason?: string; coverageNote?: string }) => void;
  onClose: () => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [coverage, setCoverage] = useState("");

  /* The end date follows the start when it would otherwise be impossible,
     rather than leaving a form that refuses to submit without saying why. */
  const setStart = (v: string) => {
    setStartsOn(v);
    if (endsOn && v && endsOn < v) setEndsOn(v);
  };

  const workingDays = useMemo(() => businessDaysBetween(startsOn, endsOn), [startsOn, endsOn]);
  const datesChosen = Boolean(startsOn && endsOn && endsOn >= startsOn);

  /*
   * Dee, 2026-09-18: "DO NOT Allow Leave Submission 7 days before the leave
   * request date." The database is the authority — this is so somebody is told
   * the rule while they are picking a date, instead of being refused after
   * filling the whole form in.
   *
   * The notice comes from the TYPE, because some leave cannot be planned:
   * sickness, an emergency and bereavement carry 0 and can be filed same-day.
   */
  const chosenType = types.find((t) => t.id === typeId);
  const notice = chosenType?.minNoticeDays ?? 0;
  const earliest = useMemo(
    () => (notice > 0 ? addDays(businessToday(), notice) : businessToday()),
    [notice],
  );
  const tooSoon = Boolean(startsOn) && startsOn < earliest;

  /* A range of nothing but weekend is not a leave request — the database would
     take it and it would excuse no attendance at all. */
  /* A reward type with no credit left is not submittable: approving it would
     have nothing to spend, and the refusal belongs here rather than at a
     lead's desk. */
  const rewardShort = chosenType?.compensation === "reward"
    && (chosenType.rewardDaysAvailable ?? 0) <= 0;
  const canSubmit = Boolean(typeId) && datesChosen && workingDays > 0
    && !tooSoon && !rewardShort && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-charcoal/40 p-4 sm:items-center"
      role="dialog" aria-modal="true" aria-label="Request time off">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <CalendarOff className="h-4 w-4 text-muted-foreground" aria-hidden /> Request time off
          </h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Leave type">
            <OpsSelect size="field" value={typeId} onValueChange={setTypeId}
              aria-label="Leave type"
              /* The PAID ones are marked, not the unpaid ones: almost
                 everything at BES is unpaid, so tagging those is noise and
                 tagging the rewards is the useful signal. */
              options={types.map((t) => ({
                value: t.id,
                label: t.compensation === "reward" ? `${t.label} · paid reward` : t.label,
              }))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" value={startsOn} min={earliest}
                onChange={(e) => setStart(e.target.value)}
                aria-label="First day away"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </Field>
            <Field label="To">
              <input type="date" value={endsOn} min={startsOn || undefined}
                onChange={(e) => setEndsOn(e.target.value)}
                aria-label="Last day away"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </Field>
          </div>

          {/*
            * Dee, 2026-09-19: "FullSuite changes the fields and displays the
            * treatment before submission… Approved does not automatically mean
            * paid." So the consequence is stated where the choice is made,
            * not discovered afterwards.
            */}
          {chosenType && (
            <div className="grid grid-cols-2 gap-2">
              <span className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Compensation
                </span>
                <span className={cn("block text-xs font-bold",
                  chosenType.compensation === "reward" ? "text-status-success" : "text-foreground")}>
                  {chosenType.compensation === "reward" ? "Paid reward" : "Unpaid"}
                </span>
              </span>
              <span className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Attendance
                </span>
                <span className="block text-xs font-bold text-foreground">
                  Excused once approved
                </span>
              </span>
            </div>
          )}

          {chosenType?.compensation === "reward" && (
            <p className={cn("rounded-lg border px-3 py-2 text-[11px]",
              (chosenType.rewardDaysAvailable ?? 0) > 0
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900"
                : "border-amber-500/40 bg-amber-500/10 text-amber-900")}>
              {(chosenType.rewardDaysAvailable ?? 0) > 0
                ? <>You have <strong>{chosenType.rewardDaysAvailable}</strong> paid
                    {" "}{chosenType.rewardDaysAvailable === 1 ? "day" : "days"} of this kind.
                    Approving this request uses one.</>
                : <>You have no {chosenType.label.toLowerCase()} credits available. Earn one
                    through attendance, or request unpaid time off instead.</>}
            </p>
          )}

          {notice > 0 && (
            <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              {chosenType?.label} needs at least {notice} days&apos; notice, so the earliest
              you can start is <strong className="text-foreground">{formatDate(earliest)}</strong>.
            </p>
          )}

          {tooSoon && (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-900">
              That start date is inside the {notice}-day notice period. Pick {formatDate(earliest)}
              {" "}or later, or talk to your lead.
            </p>
          )}

          <Field label="Duration">
            <p aria-live="polite"
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
              <span className="min-w-0 flex-1">
                {!datesChosen
                  ? "Pick both dates and this fills in."
                  : workingDays === 0
                    ? "No working days in that range — it is all weekend or holiday."
                    : `${workingDays} working day${workingDays === 1 ? "" : "s"}`}
              </span>
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </p>
            {datesChosen && workingDays > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDate(startsOn)} to {formatDate(endsOn)}. Weekends and US federal
                holidays in that range are not counted against you.
              </p>
            )}
          </Field>

          <Field label="Reason" hint="Optional">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              aria-label="Reason"
              placeholder="Family vacation"
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>

          {/* Dee's mockup has a file upload here. Not built in this pass: an
              attachment needs a storage bucket with its own policies, and a
              medical note is exactly the kind of file that must not be
              readable by anyone who can see the request. Left out rather than
              shipped with the access question unanswered. */}

          <Field label="Coverage / handoff" hint="Optional">
            <textarea value={coverage} onChange={(e) => setCoverage(e.target.value)} rows={3}
              aria-label="Coverage or handoff"
              placeholder="All ongoing client tasks are updated. JM will cover urgent items."
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              What happens to your work while you are away. This is usually what your
              lead is deciding on.
            </p>
          </Field>

          {error && <p role="alert" className="text-xs font-semibold text-status-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Cancel
          </button>
          <button type="button" disabled={!canSubmit}
            onClick={() => onSubmit({
              typeId, startsOn, endsOn,
              reason: reason.trim() || undefined,
              coverageNote: coverage.trim() || undefined,
            })}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Submit request
          </button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1 flex items-baseline gap-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </p>
    {children}
  </div>
);
