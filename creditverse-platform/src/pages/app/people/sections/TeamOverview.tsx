/**
 * People & Teams → Overview.
 *
 * Dee's mockup, 2026-09-19 ("I WANT THIS LATEST VIEW INSTEAD, Follow this
 * strictly"): five tiles; Team Performance, Attendance and EOD Compliance;
 * Upcoming Leave, Birthdays and Needs Attention; Recent Team Members; and
 * the selected person's column — profile, Quick Stats, Payroll, Documents.
 *
 * Every figure is derived (lib/people/overview-metrics.ts) from records the
 * other sections already read; nothing on this page is a stored number.
 * "Performance" here is the on-time rate, and the card says so. Quality Score
 * is the QA verdicts on the person's completed work (work_items.qa_result).
 * Performance Rating has no canonical record yet and says "Not tracked yet"
 * rather than a made-up figure (D-018).
 *
 * Four views, one component: `people` is the caller's management scope.
 * Positions and Payroll appear only where the caller may read them.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, Briefcase, Cake, CalendarOff, CheckCircle2, ClipboardCheck, FileText,
  Flag, Info, Mail, MapPin, MoreHorizontal, Network, Phone, TriangleAlert, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pill } from "@/components/agency/partner/partner-ui";
import { Donut } from "@/components/people/Donut";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import {
  addMix, attendanceMix, eodMix, lastActiveLabel, monthToDate, onTimeRate, previousMonth, qualityScore, rateChange,
  submissionRate, weekToDate, type AttendanceMix,
} from "@/lib/people/overview-metrics";
import { averageOf, personScore } from "@/lib/people/performance-metrics";
import { usePerformancePolicy } from "@/lib/people/use-performance-policy";
import { useCutoffs, usePendingLeave, useTeamUpcomingLeave } from "@/lib/data/use-people";
import { usePositions } from "@/lib/data/use-positions";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { useAgencyBirthdays } from "@/lib/data/use-greetings";
import { useEodSubmissionsRange } from "@/lib/data/use-eod-day";
import { useAgencyWork } from "@/lib/data/use-work";
import { useMemberDocuments, MEMBER_DOCUMENT_KINDS } from "@/lib/data/member-documents";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { AgencyMember } from "@/lib/data/agency-teams";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const EMPTY_MIX: AttendanceMix = { onTime: 0, late: 0, absent: 0, onLeave: 0 };

export function TeamOverview({ canSeePositions }: { canSeePositions: boolean }) {
  const team = useManagedTeam();
  const { people, todayRows, today, running, attendanceByUser, factsByUser, correctionsByUser, policy } = team;
  const members = useAgencyMembers();
  const workforce = useWorkforce();
  const teamLeave = useTeamUpcomingLeave();
  const pending = usePendingLeave();
  const positions = usePositions();
  const birthdays = useAgencyBirthdays();
  const work = useAgencyWork();
  const perms = useAgencyPermissions();
  const canPayroll = perms.can("payroll.view") || perms.can("payroll.manage");
  const week = weekToDate(today), month = monthToDate(today), lastMonth = previousMonth(today);
  /* The month's submissions cover the week too — one request serves the EOD
     ring, the Avg. Performance tile and the person's Quick Stats. */
  const eodMarks = useEodSubmissionsRange(month.from, month.to);
  const weighting = usePerformancePolicy();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ids = useMemo(() => new Set(people.map((p) => p.userId)), [people]);
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name ?? "Someone";
  const memberOf = useMemo(() => new Map((members.data ?? []).map((m) => [m.userId, m])), [members.data]);
  const inactive = (members.data ?? []).filter((m) => m.status === "inactive").length;
  const out = people.filter((p) => todayRows.find((d) => d.userId === p.userId)?.onLeave);

  /* Teams and divisions in scope. */
  const scopedTeams = team.teams.filter((t) => !t.archived && t.members.some((m) => ids.has(m.userId)));
  const divisionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of scopedTeams) for (const mem of t.members) if (t.division && !m.has(mem.userId)) m.set(mem.userId, t.division);
    return m;
  }, [scopedTeams]);
  const teamNameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of scopedTeams) for (const mem of t.members) if (!m.has(mem.userId)) m.set(mem.userId, t.name);
    return m;
  }, [scopedTeams]);
  const divisions = [...new Set([...divisionOf.values()])].sort();

  /* Attendance, bucketed — this week for the donut, this month and last for the rates. */
  const mixFor = (userId: string, range: { from: string; to: string }) =>
    attendanceMix(factsByUser.get(userId) ?? [], range, policy, correctionsByUser.get(userId) ?? []);
  const weekMix = people.reduce((acc, p) => addMix(acc, mixFor(p.userId, week)), EMPTY_MIX);
  /* Avg. Performance is the weighted overall (Quality 35 · Output 35 ·
     Compliance 20 · Attendance 10, policy data) — the same figure the
     Performance section shows, so the two pages cannot disagree. */
  const scoreFor = (userId: string, range: { from: string; to: string }) => personScore({
    userId, facts: factsByUser.get(userId) ?? [], corrections: correctionsByUser.get(userId) ?? [], policy,
    eodMarks: eodMarks.data ?? [], items: work.source === "live" ? work.items : [],
  }, range, weighting);
  const monthRate = averageOf(people.map((p) => scoreFor(p.userId, month)), "overall");
  const lastMonthRate = averageOf(people.map((p) => scoreFor(p.userId, lastMonth)), "overall");
  const change = rateChange(monthRate, lastMonthRate);
  const byDivision = divisions.map((d) => {
    const theirs = people.filter((p) => divisionOf.get(p.userId) === d);
    return { division: d, rate: averageOf(theirs.map((p) => scoreFor(p.userId, month)), "overall") };
  });

  /* EOD compliance this week over scheduled days. */
  const scheduledDays = useMemo(() => {
    const rows: { employeeId: string; day: string }[] = [];
    for (const p of people) for (const f of factsByUser.get(p.userId) ?? []) {
      if (f.scheduled && !f.approvedLeave && f.day <= today) rows.push({ employeeId: p.userId, day: f.day });
    }
    return rows;
  }, [people, factsByUser, today]);
  const eod = eodMix(eodMarks.data ?? [], scheduledDays, week);
  const eodToday = eodMix(eodMarks.data ?? [], scheduledDays, { from: today, to: today });

  /* Positions (admin only), leave and attention. */
  const livePositions = (positions.data ?? []).filter((p) => !p.archivedAt && p.status !== "closed");
  const filled = livePositions.filter((p) => p.state !== "vacant").length;
  const vacant = livePositions.filter((p) => p.state === "vacant");
  const pendingCount = (pending.data ?? []).filter((r) => ids.has(r.userId)).length;
  const upcoming = (teamLeave.data ?? [])
    .filter((r) => ids.has(r.userId) && r.status === "approved" && r.endsOn >= today)
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1)).slice(0, 4);
  const soonBirthdays = (birthdays.data ?? []).filter((b) => ids.has(b.id) && b.daysAway <= 7).slice(0, 4);
  const belowTarget = people.filter((p) => (attendanceByUser.get(p.userId)?.alerts.length ?? 0) > 0);

  /* Recent team members: whoever clocked in most recently this week. */
  const lastActive = useMemo(
    () => new Map((workforce.data?.time ?? []).map((t) => [t.employeeId, t.lastActiveAt])), [workforce.data]);
  const recent = useMemo(() => [...people]
    .sort((a, b) => ((lastActive.get(b.userId) ?? "") > (lastActive.get(a.userId) ?? "") ? 1 : -1))
    .slice(0, 5), [people, lastActive]);
  const positionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions.data ?? []) for (const h of p.holders) if (!m.has(h.userId)) m.set(h.userId, p.title);
    return m;
  }, [positions.data]);
  const titleOf = (userId: string) => positionOf.get(userId) ?? memberOf.get(userId)?.jobTitle ?? null;

  const selected = memberOf.get(selectedId ?? "") ?? memberOf.get(recent[0]?.userId ?? "") ?? null;
  const tasksDone = (userId: string) => work.items.filter((w) =>
    w.assignedTo === userId && !!w.completedAt && w.completedAt.slice(0, 10) >= month.from).length;

  if (!team.loading && people.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nobody is in your management scope yet. A team lead sees the members of the teams
        they lead; management sees its division or the company.
      </p>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-3">
        {/* ── Tiles ─────────────────────────────────────────────────────── */}
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", canSeePositions ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
          <Tile icon={Users} value={String(people.length + (canSeePositions ? inactive : 0))} label="Team Members"
            note={`${people.length} active${canSeePositions ? ` · ${inactive} inactive` : ""} · ${out.length} on leave`} to="/app/people/members" tone="text-status-success bg-status-success/10" />
          <Tile icon={Network} value={String(scopedTeams.length)} label="Teams"
            note={`Across ${divisions.length} ${divisions.length === 1 ? "division" : "divisions"}`}
            to={canSeePositions ? "/app/people/structure" : undefined} tone="text-blue-700 bg-blue-500/10" />
          {canSeePositions && (
            <Tile icon={Briefcase} value={String(livePositions.length)} label="Positions"
              note={`${filled} filled · ${livePositions.length - filled} open`} to="/app/people/positions" tone="text-primary bg-primary/10" />
          )}
          <Tile icon={CalendarOff} value={String(out.length)} label="On Leave Today"
            note={`${pendingCount} pending approval`} to="/app/people/time-off" tone="text-status-danger bg-status-danger-tint" />
          <Tile icon={BarChart3} value={pct(monthRate)} label="Avg. Performance"
            note={change === null ? "Weighted overall, this month" : `${change >= 0 ? "+" : ""}${change}% from last month`}
            to="/app/people/performance" tone="text-blue-700 bg-blue-500/10" />
        </div>

        {/* ── Performance · Attendance · EOD ────────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Card title="Team Performance" sub="(This Month)" more={{ to: "/app/people/performance", label: "View Details" }}>
            <p className="mb-2 text-[10px] text-muted-foreground">Weighted overall: Quality {weighting.weights.quality} · Output {weighting.weights.output} · Compliance {weighting.weights.compliance} · Attendance {weighting.weights.attendance}.</p>
            <ul className="space-y-2.5">
              {byDivision.length === 0 && <li className="text-xs text-muted-foreground">Nobody in your scope is on a team yet.</li>}
              {byDivision.map((d) => (
                <li key={d.division} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate font-medium text-foreground">{orgDivisionLabel(d.division)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar"
                    aria-valuenow={d.rate ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${orgDivisionLabel(d.division)} overall performance`}>
                    <span className="block h-full rounded-full bg-status-success transition-[width]" style={{ width: `${d.rate ?? 0}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">{pct(d.rate)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Attendance" sub="(This Week)" more={{ to: "/app/people/attendance", label: "View Details" }}>
            <div className="flex items-center gap-4">
              <Donut centre={pct(onTimeRate(weekMix))} caption="On Time" segments={[
                { label: "On Time", value: weekMix.onTime, className: "stroke-status-success" },
                { label: "Late", value: weekMix.late, className: "stroke-amber-500" },
                { label: "Absent", value: weekMix.absent, className: "stroke-status-danger" },
                { label: "On Leave", value: weekMix.onLeave, className: "stroke-blue-500" },
              ]} />
              <Legend rows={[
                ["bg-status-success", "On Time", weekMix.onTime], ["bg-amber-500", "Late", weekMix.late],
                ["bg-status-danger", "Absent", weekMix.absent], ["bg-blue-500", "On Leave", weekMix.onLeave],
              ]} />
            </div>
          </Card>

          <Card title="EOD Compliance" sub="(This Week)" more={{ to: "/app/people/eod", label: "View Details" }}>
            <div className="flex items-center gap-4">
              <Donut centre={pct(submissionRate(eod))} caption="Submitted" segments={[
                { label: "Submitted", value: eod.submitted, className: "stroke-status-success" },
                { label: "Late", value: eod.late, className: "stroke-amber-500" },
                { label: "Missing", value: eod.missing, className: "stroke-status-danger" },
              ]} />
              <Legend rows={[
                ["bg-status-success", "Submitted", eod.submitted], ["bg-amber-500", "Late", eod.late],
                ["bg-status-danger", "Missing", eod.missing],
              ]} />
            </div>
          </Card>
        </div>

        {/* ── Leave · Birthdays · Attention ─────────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-3">
          <Card title="Upcoming Leave" more={{ to: "/app/people/time-off", label: "View All" }}>
            <ul className="space-y-2">
              {upcoming.length === 0 && <li className="text-xs text-muted-foreground">Nothing booked ahead.</li>}
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center gap-2.5 text-xs">
                  <Avatar name={nameOf(r.userId)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{nameOf(r.userId)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}
                    </span>
                  </span>
                  {/* The KIND of leave, never the reason. */}
                  <Pill tone="border-blue-500/30 bg-blue-500/10 text-blue-800">{r.typeLabel}</Pill>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Birthdays" sub="(Next 7 Days)" more={{ to: "/app/calendar", label: "View All" }}>
            <ul className="space-y-2">
              {soonBirthdays.length === 0 && <li className="text-xs text-muted-foreground">No birthdays in the next week.</li>}
              {soonBirthdays.map((b) => (
                <li key={b.id} className="flex items-center gap-2.5 text-xs">
                  <Avatar name={b.name} />
                  <span className="flex-1 truncate font-semibold text-foreground">{b.name}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Cake className="h-3 w-3" aria-hidden />
                    {new Date(Date.UTC(2000, b.birthMonth - 1, b.birthDay)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Needs Attention" more={{ to: "/app/people/attendance", label: "View All" }}>
            <ul className="space-y-2 text-xs">
              {eodToday.missing === 0 && pendingCount === 0 && (!canSeePositions || vacant.length === 0) && belowTarget.length === 0 && (
                <li className="text-muted-foreground">Nothing outstanding.</li>
              )}
              {eodToday.missing > 0 && (
                <Attention icon={TriangleAlert} tone="bg-status-danger-tint text-status-danger" to="/app/people/eod"
                  title={`${eodToday.missing} ${eodToday.missing === 1 ? "EOD" : "EODs"} missing today`} detail="Follow up with team members" />
              )}
              {pendingCount > 0 && (
                <Attention icon={ClipboardCheck} tone="bg-amber-500/10 text-amber-700" to="/app/people/time-off"
                  title={`${pendingCount} leave ${pendingCount === 1 ? "request" : "requests"} pending`} detail="For your approval" />
              )}
              {canSeePositions && vacant.length > 0 && (
                <Attention icon={Info} tone="bg-blue-500/10 text-blue-700" to="/app/people/positions"
                  title={`${vacant.length} ${vacant.length === 1 ? "position" : "positions"} unfilled`}
                  detail={vacant.slice(0, 2).map((p) => p.title).join(", ") + (vacant.length > 2 ? "…" : "")} />
              )}
              {belowTarget.length > 0 && (
                <Attention icon={Flag} tone="bg-status-danger-tint text-status-danger" to="/app/people/attendance"
                  title="Attendance below target" detail={`${belowTarget.length} ${belowTarget.length === 1 ? "team member needs" : "team members need"} coaching`} />
              )}
            </ul>
          </Card>
        </div>

        {/* ── Recent team members ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 pt-3">
            <h3 className="text-sm font-bold text-foreground">Recent Team Members</h3>
            <More to="/app/people/members" label="View All" />
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="border-y border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Name</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Team</th><th className="px-3 py-2">Division</th><th className="px-3 py-2">Last Active</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recent.map((p) => {
                  const m = memberOf.get(p.userId);
                  const onLeave = todayRows.find((d) => d.userId === p.userId)?.onLeave;
                  const div = divisionOf.get(p.userId);
                  return (
                    <tr key={p.userId} onClick={() => setSelectedId(p.userId)}
                      className={cn("cursor-pointer transition-colors hover:bg-muted/40", selected?.userId === p.userId && "bg-primary/5")}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={p.name} />
                          <span className="min-w-0">
                            <Link to={`/app/people/${p.userId}`} onClick={(e) => e.stopPropagation()}
                              className="block truncate font-semibold text-foreground underline-offset-2 hover:underline">{p.name}</Link>
                            <span className="block truncate text-[11px] text-muted-foreground">{titleOf(p.userId) ?? m?.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Pill tone={onLeave ? "border-amber-500/40 bg-amber-500/10 text-amber-900" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"}>
                          {onLeave ? "On Leave" : "Active"}
                        </Pill>
                      </td>
                      <td className="px-3 py-2 text-foreground">{titleOf(p.userId) ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-foreground">{teamNameOf.get(p.userId) ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-foreground">{div ? orgDivisionLabel(div) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {running.has(p.userId) ? <span className="font-semibold text-status-success">Now</span> : lastActiveLabel(lastActive.get(p.userId) ?? null, today)}
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${p.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onSelect={() => setSelectedId(p.userId)}>Show details</DropdownMenuItem>
                            <DropdownMenuItem asChild><Link to={`/app/people/${p.userId}`}>Open full profile</Link></DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── The selected person ──────────────────────────────────────────── */}
      {selected && (
        <PersonColumn member={selected} title={titleOf(selected.userId)}
          onLeave={!!todayRows.find((d) => d.userId === selected.userId)?.onLeave}
          attendanceRate={onTimeRate(mixFor(selected.userId, month))}
          eodRate={submissionRate(eodMix(eodMarks.data ?? [], scheduledDays.filter((d) => d.employeeId === selected.userId), week))}
          tasksDone={work.source === "live" ? tasksDone(selected.userId) : null}
          quality={work.source === "live" ? qualityScore(work.items, selected.userId, month) : { score: null, reviewed: 0 }}
          canPayroll={canPayroll} />
      )}
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function PersonColumn({ member, title, onLeave, attendanceRate, eodRate, tasksDone, quality, canPayroll }: {
  member: AgencyMember; title: string | null; onLeave: boolean;
  attendanceRate: number | null; eodRate: number | null; tasksDone: number | null;
  quality: { score: number | null; reviewed: number }; canPayroll: boolean;
}) {
  const cutoffs = useCutoffs();
  const docs = useMemberDocuments(member.userId, true);
  const released = (cutoffs.data ?? []).filter((c) => c.status === "released").sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
  const draft = (cutoffs.data ?? []).filter((c) => c.status === "draft").sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1))[0];
  const kindLabel = (kind: string) => MEMBER_DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? kind;
  const stat = (icon: React.ElementType, label: string, value: string, muted = false) => {
    const Icon = icon;
    return (
      <li key={label} className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-status-success/10 text-status-success"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
          {label}
        </span>
        <span className={cn("font-bold tabular-nums", muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
      </li>
    );
  };
  return (
    <aside className="space-y-3 self-start" aria-label={`${member.name} details`}>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Avatar name={member.name} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{member.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{title ?? "No position yet"}</span>
            <span className="mt-1 inline-block">
              <Pill tone={member.status === "inactive" ? "border-destructive/30 bg-status-danger-tint text-status-danger"
                : onLeave ? "border-amber-500/40 bg-amber-500/10 text-amber-900" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"}>
                {member.status === "inactive" ? "Inactive" : onLeave ? "On Leave" : "Active"}
              </Pill>
            </span>
          </span>
          <Link to={`/app/people/${member.userId}`} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted">Edit</Link>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-foreground">
          <li className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> <span className="truncate">{member.email}</span></li>
          <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> {member.phone ?? <span className="text-muted-foreground">No phone on file</span>}</li>
          <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> <span className="text-muted-foreground">Location not recorded</span></li>
        </ul>
        <h4 className="mt-4 text-xs font-bold text-foreground">Quick Stats <span className="font-normal text-muted-foreground">(This Month)</span></h4>
        <ul className="mt-2 space-y-2">
          {stat(CheckCircle2, "Attendance", pct(attendanceRate))}
          {stat(ClipboardCheck, "EOD Submission", pct(eodRate))}
          {stat(CheckCircle2, "Tasks Completed", tasksDone === null ? "—" : String(tasksDone))}
          {stat(BarChart3, "Quality Score", quality.score === null ? "No QA reviews yet" : pct(quality.score), quality.score === null)}
          {stat(BarChart3, "Performance Rating", "Not tracked yet", true)}
        </ul>
        <Link to={`/app/people/${member.userId}`}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          View Full Profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {canPayroll && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground"><Wallet className="h-4 w-4 text-muted-foreground" aria-hidden /> Payroll</h3>
            <More to="/app/finance/payroll" label="View All" />
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            <li className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
              <span><span className="block text-muted-foreground">Last Payment</span><span className="font-semibold text-foreground">{released ? formatDate(released.payday ?? released.periodEnd) : "None released yet"}</span></span>
              {released && <Pill tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-800">Paid</Pill>}
            </li>
            <li className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
              <span><span className="block text-muted-foreground">Next Payment</span><span className="font-semibold text-foreground">{draft ? formatDate(draft.payday ?? draft.periodEnd) : "No cutoff open"}</span></span>
              {draft && <Pill tone="border-blue-500/40 bg-blue-500/10 text-blue-800">Scheduled</Pill>}
            </li>
          </ul>
          <div className="mt-2 flex justify-between text-[11px]">
            <More to="/app/finance/payroll" label="View Payslips" />
            <More to={`/app/people/${member.userId}`} label="View Compensation" />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground"><FileText className="h-4 w-4 text-muted-foreground" aria-hidden /> Documents &amp; Verification</h3>
          <More to={`/app/people/${member.userId}`} label="Manage" />
        </div>
        <ul className="mt-2 space-y-1.5 text-xs">
          {(docs.data ?? []).length === 0 && <li className="text-muted-foreground">No documents on file yet.</li>}
          {(docs.data ?? []).slice(0, 3).map((d) => (
            <li key={d.id} className="flex items-start gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{d.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{kindLabel(d.kind)} · {d.status}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Tile({ icon: Icon, value, label, note, to, tone }: {
  icon: React.ElementType; value: string; label: string; note: string; to?: string; tone: string;
}) {
  const body = (
    <div className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/40">
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}><Icon className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold leading-none tabular-nums text-foreground">{value}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{note}</span>
      </span>
    </div>
  );
  return to ? <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

function Card({ title, sub, more, children }: { title: string; sub?: string; more?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{title} {sub && <span className="font-normal text-muted-foreground">{sub}</span>}</h3>
        {more && <More to={more.to} label={more.label} />}
      </div>
      {children}
    </div>
  );
}

const More = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
    {label} <ArrowRight className="h-3 w-3" aria-hidden />
  </Link>
);

function Legend({ rows }: { rows: [string, string, number][] }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map(([dot, label, n]) => (
        <li key={label} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-foreground"><span className={cn("h-2.5 w-2.5 rounded-sm", dot)} aria-hidden /> {label}</span>
          <span className="font-bold tabular-nums text-foreground">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Attention({ icon: Icon, tone, to, title, detail }: { icon: React.ElementType; tone: string; to: string; title: string; detail: string }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-muted/50">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", tone)}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
        <span className="min-w-0"><span className="block font-semibold text-foreground">{title}</span><span className="block truncate text-[11px] text-muted-foreground">{detail}</span></span>
      </Link>
    </li>
  );
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary",
      size === "lg" ? "h-12 w-12 text-sm" : "h-8 w-8 text-[11px]")}>{initials(name)}</span>
  );
}
