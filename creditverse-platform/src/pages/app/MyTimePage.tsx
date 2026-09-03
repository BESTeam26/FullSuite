/**
 * My Time — clock in/out and the current week's timesheet.
 *
 * Renders only. Every figure comes from `useTimesheet`, which sums through the
 * `time-domain` rules; nothing here computes elapsed time (rules 5 and 9).
 *
 * Extracted from HqPages when it was wired to real data: that file already held
 * six unrelated pages, and adding data loading to one of them would have made a
 * 520-line module worse (rule 13).
 */
import { useState } from "react";
import { Clock, PlayCircle, PauseCircle, AlertTriangle } from "lucide-react";
import {
  ContentCard,
  DivisionTable,
  StatCard,
} from "@/components/dashboard/DivisionLayout";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { OpsSelect } from "@/components/ui/ops-select";
import { HqPageShell } from "@/pages/app/HqPages";
import { useTimesheet } from "@/lib/data/use-time";
import {
  DIVISION_LABELS,
  divisionLabel,
  entryMinutes,
  formatDuration,
} from "@/lib/time-domain";

const DIVISION_OPTIONS = Object.entries(DIVISION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export const MyTimePage = () => {
  const t = useTimesheet();
  const [division, setDivision] = useState("creditops");
  const [taskNote, setTaskNote] = useState("");

  const running = Boolean(t.openEntry);

  // Only the two busiest divisions get a card; the rest are in the table. Four
  // fixed division cards would show three zeroes for most people.
  const topDivisions = t.byDivision.slice(0, 2);

  return (
    <HqPageShell
      title="My Time"
      description="Track your hours across divisions and tasks"
      icon={Clock}
    >
      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={t.source} />
        {t.source === "demo" && (
          <span className="text-xs text-muted-foreground">
            Sign in to track real time.
          </span>
        )}
      </div>

      {t.error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Today"
          value={formatDuration(t.todayMinutes)}
          icon={Clock}
        />
        <StatCard
          label="This Week"
          value={formatDuration(t.weekMinutes)}
          icon={Clock}
        />
        {topDivisions.map((d) => (
          <StatCard
            key={d.divisionId}
            label={divisionLabel(d.divisionId)}
            value={formatDuration(d.minutes)}
            icon={Clock}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {running ? (
          <button
            onClick={t.clockOut}
            disabled={t.isMutating}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <PauseCircle className="h-4 w-4" /> Clock Out
          </button>
        ) : (
          <>
            <button
              onClick={() => t.clockIn(division, taskNote || undefined)}
              disabled={t.isMutating || !t.entries || t.source === "demo"}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" /> Clock In
            </button>
            <OpsSelect
              value={division}
              onValueChange={setDivision}
              options={DIVISION_OPTIONS}
              aria-label="Division"
            />
            <input
              value={taskNote}
              onChange={(e) => setTaskNote(e.target.value)}
              placeholder="What are you working on? (optional)"
              className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </>
        )}
        {running && t.openEntry && (
          <span className="text-xs text-muted-foreground">
            Running since {clockTime(t.openEntry.startedAt)} ·{" "}
            {divisionLabel(t.openEntry.divisionId)}
            {t.openEntry.taskNote ? ` · ${t.openEntry.taskNote}` : ""}
          </span>
        )}
      </div>

      {t.actionError && (
        <p className="mt-2 text-xs font-semibold text-red-600">
          {t.actionError}
        </p>
      )}

      <ContentCard title="This Week's Time Entries">
        {t.isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : t.entries.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">
            {t.source === "demo"
              ? "No sample entries — sign in to track time."
              : "No time recorded this week yet."}
          </p>
        ) : (
          <DivisionTable
            columns={["Date", "Started", "Division", "Task", "Duration"]}
            rows={t.entries.map((e) => [
              e.workDate,
              clockTime(e.startedAt),
              divisionLabel(e.divisionId),
              e.taskNote ?? "—",
              e.endedAt
                ? formatDuration(e.durationMinutes)
                : `${formatDuration(entryMinutes(e))} (running)`,
            ])}
          />
        )}
      </ContentCard>
    </HqPageShell>
  );
};
