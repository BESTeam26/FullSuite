/**
 * Reviewing one person's attendance, and correcting it.
 *
 * Dee, 2026-09-18: "Managers must NEVER type or overwrite the employee's
 * quarterly score." So there is no score field here. A manager picks what a
 * DAY should be classified as; the engine derives the points from that, the
 * same way it does for every other day.
 *
 * The score shown at the top is read-only and recomputed — if a correction
 * does not move it, the correction was not what the manager thought.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, X } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  LABELS, POINTS, QUARTER_MAX_POINTS, STANDING_LABEL,
  type ActivityRow, type Classification, type QuarterScore,
} from "@/lib/attendance/attendance-score";

/** What a manager may set a day to. `none`/`grace` are not choices. */
const CHOICES: Classification[] = [
  "on_time", "approved_leave", "late", "half_day", "absent", "ncns",
];

const POINT_TONE = (p: number) =>
  p < 0 ? "bg-amber-500/10 text-amber-900" : "text-muted-foreground";

export function AttendanceReviewDrawer({
  name, score, busy, error, onCorrect, onClose,
}: {
  name: string;
  score: QuarterScore;
  busy: boolean;
  error: string | null;
  onCorrect: (v: { workDate: string; classification: Classification; reason: string }) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [to, setTo] = useState<Classification>("approved_leave");
  const [reason, setReason] = useState("");

  const open = (row: ActivityRow, preset?: Classification) => {
    setEditing(row);
    setTo(preset ?? (row.classification === "absent" ? "approved_leave" : "on_time"));
    setReason("");
  };

  const delta = editing ? POINTS[to] - POINTS[editing.classification] : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-charcoal/40"
      role="dialog" aria-modal="true" aria-label={`Attendance review for ${name}`}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">{name}</h2>
            <p className="text-[11px] text-muted-foreground">
              {score.quarter.replace("-Q", " · Quarter ")} ·
              {" "}<strong className="text-foreground">
                {score.score.toFixed(2).replace(/\.00$/, "")} / {QUARTER_MAX_POINTS}
              </strong>
              {" "}· {STANDING_LABEL[score.standing]} · {score.streakDays}-day streak
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            The score is derived and cannot be typed. Change what a DAY counts as and the
            points follow. Nothing is deleted — a correction is recorded beside the original.
          </span>
        </p>

        <ul className="divide-y divide-border/60 px-5 py-3">
          {score.activity.length === 0 && (
            <li className="py-8 text-center text-xs text-muted-foreground">
              No scheduled days recorded this quarter yet.
            </li>
          )}
          {score.activity.map((row) => (
            <li key={row.day} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {formatDate(row.day)} · {LABELS[row.classification]}
                    <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      row.source === "corrected"
                        ? "bg-blue-500/10 text-blue-800"
                        : "bg-muted text-muted-foreground")}>
                      {row.source === "corrected" ? "Corrected" : "Automatic"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{row.detail}</p>
                  {row.correction && (
                    <p className="text-[11px] text-muted-foreground">
                      Was {LABELS[row.originalClassification ?? "none"].toLowerCase()} ·
                      {" "}{row.correction.by} — “{row.correction.reason}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums", POINT_TONE(row.points))}>
                    {row.points.toFixed(2)}
                  </span>
                  {row.classification === "absent" && (
                    <button type="button" onClick={() => open(row, "ncns")}
                      className="rounded-lg border border-destructive/30 bg-status-danger-tint px-2 py-1 text-[11px] font-semibold text-status-danger transition-colors hover:bg-status-danger-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Mark NCNS
                    </button>
                  )}
                  <button type="button" onClick={() => open(row)}
                    className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Correct
                  </button>
                </div>
              </div>

              {editing?.day === row.day && (
                <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-[11px] font-bold text-foreground">
                    What should {formatDate(row.day)} count as?
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <OpsSelect size="field" value={to}
                      onValueChange={(v) => setTo(v as Classification)}
                      aria-label="New classification"
                      options={CHOICES.map((c) => ({
                        value: c,
                        label: `${LABELS[c]} · ${POINTS[c].toFixed(2)}`,
                      }))} />
                    <span className={cn("self-center rounded-lg px-2 py-1 text-xs font-bold tabular-nums",
                      delta > 0 ? "bg-emerald-500/10 text-emerald-800"
                        : delta < 0 ? "bg-status-danger-tint text-status-danger"
                        : "bg-muted text-muted-foreground")}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(2)} to their score
                    </span>
                  </div>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    aria-label="Reason for the correction"
                    placeholder="Why this is being corrected — the employee sees this."
                    className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  {to === "ncns" && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] text-status-danger">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      No call, no show is the heaviest deduction there is. Only for a missed
                      shift with no notice given.
                    </p>
                  )}
                  {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-status-danger">{error}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(null)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Cancel
                    </button>
                    <button type="button"
                      disabled={busy || reason.trim().length < 5 || to === row.classification}
                      onClick={() => onCorrect({ workDate: row.day, classification: to, reason: reason.trim() })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                      {to === "ncns" ? "Confirm NCNS" : "Record correction"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
