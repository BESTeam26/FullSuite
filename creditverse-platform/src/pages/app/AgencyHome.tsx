/**
 * Home, for the person looking at it.
 *
 * A regular team member's Home is their day: what is due, what is late, what
 * is stuck, what they finished, whether their EOD is in. A manager's adds the
 * team's version of the same. Neither is the owner's control plane, and the
 * numbers on this page are the viewer's own work — company-wide management
 * figures are not shown to people who are not authorized to see them (§23).
 *
 * This replaced a dashboard of hardcoded figures — "Need review 42", "Ready
 * for QA 31" — that were shown to everyone as though they were real. A number
 * nobody can act on is worse than no number, because people plan around it.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CalendarClock, CheckCircle2, CircleSlash, ClipboardCheck,
  ListTodo, Megaphone, Timer, Users,
} from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { HomeFinanceStrip } from "@/components/agency/finance/HomeFinanceStrip";
import { HolidayBanner, UpcomingHolidaysCard } from "@/components/agency/HolidayBanner";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyWork } from "@/lib/data/use-work";
import { useEodDay, useTeamEod, todayLocal } from "@/lib/data/use-eod-day";
import { useHolidayUpkeep } from "@/lib/data/use-agency-calendar";
import { useAnnouncements } from "@/lib/data/use-intranet";
import { submissionKind, SUBMISSION_LABEL } from "@/lib/data/eod-day";
import { bucketForManager, bucketMyWork, workloadBy } from "@/lib/agency/team-views";
import { atLeast, type AgencyRole } from "@/lib/agency/navigation";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

function Tile({ to, icon: Icon, label, value, tone }: {
  to: string; icon: typeof ListTodo; label: string; value: number; tone?: string;
}) {
  return (
    <Link to={to} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone ?? "text-muted-foreground")} />
        <span className="text-2xl font-black text-foreground">{value}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{label}</p>
    </Link>
  );
}

export const AgencyHome = () => {
  const { user, displayName, agencyMembership } = useAuth();
  const role = (agencyMembership?.role as AgencyRole) ?? null;
  const isManager = atLeast(role, "agency_team_lead");

  /* Idempotent: keeps the holiday rows and notices current without a cron. */
  useHolidayUpkeep();

  const work = useAgencyWork();
  const date = todayLocal();
  const eod = useEodDay(date);
  /* Null organization = BES internal, which is staff-only by policy. */
  const announcements = useAnnouncements(null);

  const mine = useMemo(
    () => work.items.filter((i) => i.assignedTo === user?.id),
    [work.items, user?.id],
  );
  const buckets = useMemo(() => bucketMyWork(mine), [mine]);
  const kind = eod.data ? submissionKind(eod.data) : "not_submitted";

  const firstName = (displayName ?? "").split(" ")[0] || "there";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground">Good to see you, {firstName}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
        </div>

        <HolidayBanner />

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">My day</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile to="/app/team-workspace" icon={CalendarClock} label="Due today" value={buckets.dueToday.length} />
                <Tile to="/app/team-workspace" icon={AlertTriangle} label="Overdue" value={buckets.overdue.length} tone="text-status-danger" />
                <Tile to="/app/team-workspace" icon={CircleSlash} label="Blocked" value={buckets.blocked.length} tone="text-amber-600" />
                <Tile to="/app/team-workspace" icon={CheckCircle2} label="Done today" value={buckets.completedToday.length} tone="text-status-success" />
              </div>
            </section>

            {/* Renders nothing without the finance capability — the strip is
                not part of the page for anybody else. */}
            <HomeFinanceStrip />

            <ContentCard
              title={<span className="flex items-center gap-2"><Timer className="h-4 w-4 text-muted-foreground" /> My End of Day</span>}
              action={<Link to="/app/eod" className="text-xs font-medium text-primary hover:underline">Open</Link>}
            >
              <p className={cn(
                "text-sm font-semibold",
                kind === "submitted_by_person" ? "text-status-success"
                  : kind === "auto_submitted" ? "text-amber-700" : "text-foreground",
              )}>
                {SUBMISSION_LABEL[kind]}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {kind === "not_submitted"
                  ? "Your report is already built from today's work. Review it and submit."
                  : kind === "auto_submitted"
                    ? "The system submitted this at the cutoff. It is not recorded as your submission."
                    : "Thanks — that is today's report in."}
              </p>
            </ContentCard>

            {isManager && <ManagerSection date={date} />}
          </div>

          <div className="space-y-4">
            <UpcomingHolidaysCard />

            <ContentCard
              title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-muted-foreground" /> Announcements</span>}
              action={<Link to="/app/announcements" className="text-xs font-medium text-primary hover:underline">All</Link>}
            >
              {announcements.isLoading ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>
              ) : announcements.announcements.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Nothing new.</p>
              ) : (
                <ul className="space-y-2">
                  {announcements.announcements.slice(0, 4).map((a) => (
                    <li key={a.id}>
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ContentCard>
          </div>
        </div>
      </div>
    </div>
  );
};

/** The team's version of the same day. Only for a lead and above. */
function ManagerSection({ date }: { date: string }) {
  const work = useAgencyWork();
  const team = useTeamEod(date);
  const manager = useMemo(() => bucketForManager(work.items), [work.items]);
  const missing = (team.data ?? []).filter((r) => !r.submittedAt).length;
  const load = useMemo(
    () => workloadBy(work.items, (i) => i.assignedTo, (k) => k).slice(0, 6),
    [work.items],
  );

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">My team</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile to="/app/team-workspace" icon={CalendarClock} label="Team due today" value={manager.dueToday.length} />
        <Tile to="/app/team-workspace" icon={AlertTriangle} label="Team overdue" value={manager.overdue.length} tone="text-status-danger" />
        <Tile to="/app/team-workspace" icon={CircleSlash} label="Blocked" value={manager.blocked.length} tone="text-amber-600" />
        <Tile to="/app/team-eod" icon={ClipboardCheck} label="Missing EOD" value={missing} tone="text-status-danger" />
      </div>

      {load.length > 0 && (
        <div className="mt-3">
          <ContentCard title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Workload</span>}>
            <p className="mb-2 text-xs text-muted-foreground">
              Open task counts — not a performance measure.
            </p>
            <ul className="space-y-1">
              {load.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{r.label === r.key ? "Team member" : r.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.open} open{r.overdue > 0 && <span className="font-semibold text-status-danger"> · {r.overdue} overdue</span>}
                  </span>
                </li>
              ))}
            </ul>
          </ContentCard>
        </div>
      )}
    </section>
  );
}
