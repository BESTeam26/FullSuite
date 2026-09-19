/**
 * Teams & Members — the team tree, and whoever is in the team you picked.
 *
 * Dee's mockup, 2026-09-18. Everything here is DERIVED from records that
 * already exist: teams and their membership from the workforce batch,
 * today's status and hours from `attendance_for`, the shift from
 * `work_schedules`. No new store, and nothing is written from this screen —
 * it is a read of the team, with the actions that already have homes.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, ChevronDown, ChevronRight, Coffee, Search, UserRound, Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/time-domain";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import type { AgencyPerson, AgencyTeam } from "@/lib/data/agency-workforce";
import type { AttendanceDay, WorkSchedule } from "@/lib/data/people-management";
import { shiftLabel } from "@/lib/time/schedule-format";

export type MemberStatus = "working" | "on_break" | "on_leave" | "offline";

export const STATUS_LABEL: Record<MemberStatus, string> = {
  working: "Working", on_break: "On break", on_leave: "On leave", offline: "Offline",
};
const STATUS_TONE: Record<MemberStatus, string> = {
  working: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  on_break: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  on_leave: "border-blue-500/40 bg-blue-500/10 text-blue-800",
  offline: "border-border bg-muted text-muted-foreground",
};

/** One person's state right now, from the records rather than a stored flag. */
export function statusOf(
  userId: string,
  day: AttendanceDay | undefined,
  running: boolean,
  onBreak: boolean,
): MemberStatus {
  if (day?.onLeave) return "on_leave";
  if (onBreak) return "on_break";
  if (running) return "working";
  return "offline";
}

export function TeamsAndMembers({
  teams, people, attendanceToday, schedules, running, onBreak,
}: {
  teams: AgencyTeam[];
  people: AgencyPerson[];
  attendanceToday: AttendanceDay[];
  schedules: WorkSchedule[];
  /** Who has a timer going, by user id. */
  running: Set<string>;
  /** …and of those, who is on a break or at lunch. */
  onBreak: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [openDivisions, setOpenDivisions] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const live = useMemo(() => teams.filter((t) => !t.archived), [teams]);

  /* Division → teams, the shape the tree draws. A team with no division still
     appears, under a heading that says so, rather than vanishing. */
  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q ? live.filter((t) => t.name.toLowerCase().includes(q)) : live;
    const byDivision = new Map<string, AgencyTeam[]>();
    for (const t of matching) {
      /* The division's NAME, not its key: "creditops" is an identifier, and a
         heading that says it is a heading nobody wrote. */
      const key = orgDivisionLabel(t.division) ?? "Other teams";
      byDivision.set(key, [...(byDivision.get(key) ?? []), t]);
    }
    return [...byDivision.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [live, query]);

  const current = live.find((t) => t.id === selected) ?? live[0] ?? null;

  const byId = new Map(people.map((p) => [p.userId, p]));
  const dayOf = new Map(attendanceToday.map((d) => [d.userId, d]));
  const scheduleOf = new Map(schedules.map((s) => [s.userId, s]));

  const members = (current?.members ?? [])
    .map((m) => ({ ...m, person: byId.get(m.userId) }))
    .filter((m) => m.person)
    .filter((m) => !memberQuery.trim()
      || m.person!.name.toLowerCase().includes(memberQuery.trim().toLowerCase()));

  const counted = members.map((m) =>
    statusOf(m.userId, dayOf.get(m.userId), running.has(m.userId), onBreak.has(m.userId)));
  const tally = (s: MemberStatus) => counted.filter((c) => c === s).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      {/* ── The tree ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="relative mb-2">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label="Search teams" placeholder="Search teams…" className="h-8 pl-8 text-xs" />
        </div>
        <ul className="space-y-0.5">
          {tree.map(([division, group]) => {
            const open = openDivisions[division] ?? true;
            const heads = group.reduce((n, t) => n + t.members.length, 0);
            return (
              <li key={division}>
                <button type="button"
                  onClick={() => setOpenDivisions((s) => ({ ...s, [division]: !open }))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{division}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{heads}</span>
                </button>
                {open && (
                  <ul className="ml-4 space-y-0.5 border-l border-border pl-2">
                    {group.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setSelected(t.id)}
                          aria-current={current?.id === t.id}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            current?.id === t.id
                              ? "bg-primary/10 font-semibold text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          <span className="shrink-0 tabular-nums">{t.members.length}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {tree.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">No team matches that.</li>
          )}
        </ul>
      </div>

      {/* ── The team you picked ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4">
        {!current ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-foreground">{current.name}</h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[orgDivisionLabel(current.division), current.department].filter(Boolean).join(" › ") || "No division"}
                </p>
              </div>
              <Link to="/app/people/structure"
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Manage this team
              </Link>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([["Total", members.length], ["Working", tally("working")],
                 ["On leave", tally("on_leave")], ["On break", tally("on_break")],
                 ["Offline", tally("offline")]] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="text-lg font-extrabold tabular-nums text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-3">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)}
                aria-label="Search team members" placeholder="Search team members…"
                className="h-8 pl-8 text-xs" />
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Schedule</th>
                    <th className="px-2 py-2 text-right">Today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {members.map((m) => {
                    const day = dayOf.get(m.userId);
                    const status = statusOf(m.userId, day, running.has(m.userId), onBreak.has(m.userId));
                    return (
                      <tr key={m.userId}>
                        <td className="px-2 py-2">
                          <Link to={`/app/people/${m.userId}`}
                            className="flex min-w-0 items-center gap-1.5 font-medium text-foreground underline-offset-2 hover:underline">
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">{m.person!.name}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {m.isLead ? "Team lead" : "Member"}
                        </td>
                        <td className="px-2 py-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_TONE[status])}>
                            {status === "on_break" && <Coffee className="h-3 w-3" aria-hidden />}
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {shiftLabel(scheduleOf.get(m.userId))}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">
                          {day?.workMinutes ? formatDuration(day.workMinutes) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {members.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                      <Users className="mx-auto mb-1 h-4 w-4" aria-hidden />
                      Nobody on this team yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
