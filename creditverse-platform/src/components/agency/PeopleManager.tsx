/**
 * Team Members — the directory, and the one place a person's access, teams
 * and status are changed.
 *
 * Dee's mockup, 2026-09-19 ("FOLLOW THIS EXACTLY"): a filterable table —
 * Name · Status · Position · Team · Division · Manager — ten to a page, with
 * the selected person's card on the right. Every fact is a canonical record:
 * memberships, workforce teams, positions and their holders, today's
 * attendance, the running timer. Nothing here is typed in twice.
 *
 * Scope is the DATABASE's answer plus yourself: `managed_people()` (a lead's
 * team, a manager's division, an admin's company) and your own row, because
 * a directory that hides you from yourself reads as broken.
 *
 * Actions stay where they were: the security role and access profile, adding
 * and removing teams, deactivating and (owner only) deleting. They moved from
 * inline cells into the selected person's card so the table stays readable.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, ChevronLeft, ChevronRight, Loader2, MoreHorizontal, Search, Undo2, UserMinus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { OwnerDeleteButton } from "@/components/agency/OwnerDeleteButton";
import { useAgencyMembers, useMemberActions, useTeamActions } from "@/lib/data/use-agency-teams";
import { useManagedPeople } from "@/lib/data/use-managed-people";
import { usePositions } from "@/lib/data/use-positions";
import { useManagedTeam } from "@/lib/people/use-managed-team";
import { useAuth } from "@/lib/auth/auth-context";
import { orgDivisionLabel } from "@/lib/agency/division-label";
import { formatDate } from "@/lib/format-date";
import { shiftLabel } from "@/lib/time/schedule-format";
import { cn } from "@/lib/utils";
import type { AgencyMember } from "@/lib/data/agency-teams";
import type { Enums } from "@/lib/supabase/database.types";
import { ACCESS_PROFILES, ACCESS_PROFILE_LABELS, memberAccessLabel } from "@/lib/data/agency-invitations";

const ROLES: { value: Enums<"agency_role">; label: string }[] = [
  { value: "agency_admin", label: "Agency Admin" },
  { value: "agency_user", label: "Agency User" },
];
const PROFILE_OPTIONS = ACCESS_PROFILES.map((v) => ({ value: v, label: ACCESS_PROFILE_LABELS[v] }));
const PAGE_SIZE = 10;

type MemberStatus = "active" | "on_leave" | "invited" | "inactive";
const STATUS_LABEL: Record<MemberStatus, string> = { active: "Active", on_leave: "On Leave", invited: "Pending activation", inactive: "Inactive" };
const STATUS_TONE: Record<MemberStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  on_leave: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  /* A real workforce record awaiting first sign-in — not an error state. */
  invited: "border-primary/40 bg-primary/10 text-foreground",
  inactive: "border-destructive/30 bg-status-danger-tint text-status-danger",
};
const ALL = "__all__";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function PeopleManager() {
  const auth = useAuth();
  const canManage = auth.agencyRole === "agency_admin";
  const members = useAgencyMembers();
  const managed = useManagedPeople();
  const team = useManagedTeam();
  const positions = usePositions();
  const actions = useMemberActions();
  const teamActions = useTeamActions();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [division, setDivision] = useState(ALL);
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveTeams = useMemo(() => team.teams.filter((t) => !t.archived), [team.teams]);
  const teamsOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string; isLead: boolean; division: string | null; department: string | null }[]>();
    for (const t of liveTeams) for (const mem of t.members) {
      m.set(mem.userId, [...(m.get(mem.userId) ?? []), { id: t.id, name: t.name, isLead: mem.isLead, division: t.division, department: t.department }]);
    }
    return m;
  }, [liveTeams]);
  /* The seat somebody holds, from positions — the canonical answer. The
     membership's free-text job title is the fallback for people not yet
     assigned a seat. */
  const positionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions.data ?? []) for (const h of p.holders) if (!m.has(h.userId)) m.set(h.userId, p.title);
    return m;
  }, [positions.data]);

  const statusOf = (m: AgencyMember): MemberStatus => {
    if (m.status === "inactive") return "inactive";
    /* Invited people are in the directory with their Agent ID from day one;
       they are never "on leave" or "active" until they activate. */
    if (m.status === "invited") return "invited";
    if (team.todayRows.find((d) => d.userId === m.userId)?.onLeave) return "on_leave";
    return "active";
  };

  /* Scope: the database's list, plus yourself. */
  const inScope = useMemo(() => {
    const all = members.data ?? [];
    if (!managed.data) return [];
    return all.filter((m) => managed.data!.has(m.userId) || m.userId === auth.user?.id);
  }, [members.data, managed.data, auth.user?.id]);
  const nameOf = useMemo(() => new Map((members.data ?? []).map((m) => [m.userId, m.name])), [members.data]);

  const divisions = useMemo(() => [...new Set(liveTeams.map((t) => t.division).filter((d): d is string => !!d))].sort(), [liveTeams]);
  const positionTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const m of inScope) { const t = positionOf.get(m.userId) ?? m.jobTitle; if (t) titles.add(t); }
    return [...titles].sort();
  }, [inScope, positionOf]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => inScope.filter((m) => {
    const theirTeams = teamsOf.get(m.userId) ?? [];
    const title = positionOf.get(m.userId) ?? m.jobTitle ?? "";
    if (needle && !`${m.name} ${m.email} ${title} ${theirTeams.map((t) => t.name).join(" ")}`.toLowerCase().includes(needle)) return false;
    if (status !== ALL && statusOf(m) !== status) return false;
    if (division !== ALL && !theirTeams.some((t) => t.division === division)) return false;
    if (teamFilter !== ALL && !theirTeams.some((t) => t.id === teamFilter)) return false;
    if (positionFilter !== ALL && title !== positionFilter) return false;
    return true;
  }).sort((a, b) => {
    /* Active first, then the inactive, alphabetical within each. */
    const rank = (m: AgencyMember) => (m.status === "inactive" ? 1 : 0);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statusOf closes over team.todayRows, listed
  }), [inScope, teamsOf, positionOf, needle, status, division, teamFilter, positionFilter, team.todayRows]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selected = rows.find((m) => m.userId === selectedId) ?? pageRows[0] ?? null;

  const change = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const loading = members.isLoading || managed.isLoading || team.loading;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-8 pl-8 text-xs" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Search people by name, role, team or skill…" aria-label="Search people" />
          </div>
          <OpsSelect aria-label="Status" size="sm" value={status} onValueChange={resetPage(setStatus)}
            options={[{ value: ALL, label: "All statuses" }, ...(["active", "on_leave", "invited", "inactive"] as MemberStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
          <OpsSelect aria-label="Division" size="sm" value={division} onValueChange={resetPage(setDivision)}
            options={[{ value: ALL, label: "All divisions" }, ...divisions.map((d) => ({ value: d, label: orgDivisionLabel(d) }))]} />
          <OpsSelect aria-label="Team" size="sm" value={teamFilter} onValueChange={resetPage(setTeamFilter)}
            options={[{ value: ALL, label: "All teams" }, ...liveTeams.map((t) => ({ value: t.id, label: t.name }))]} />
          <OpsSelect aria-label="Position" size="sm" value={positionFilter} onValueChange={resetPage(setPositionFilter)}
            options={[{ value: ALL, label: "All positions" }, ...positionTitles.map((t) => ({ value: t, label: t }))]} />
        </div>

        {error && <p className="text-xs text-status-danger">{error}</p>}

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading the roster…
            </p>
          ) : rows.length === 0 ? (
            <Empty title={needle || status !== ALL || division !== ALL || teamFilter !== ALL || positionFilter !== ALL ? "Nobody matches" : "Nobody is in your scope yet"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Position</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Division</th>
                    <th className="px-3 py-2">Manager</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pageRows.map((m) => {
                    const st = statusOf(m);
                    const theirTeams = teamsOf.get(m.userId) ?? [];
                    const isSelected = selected?.userId === m.userId;
                    return (
                      <tr key={m.membershipId} onClick={() => setSelectedId(m.userId)}
                        className={cn("cursor-pointer transition-colors hover:bg-muted/40", isSelected && "bg-primary/5")}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                              {initials(m.name)}
                            </span>
                            <span className="min-w-0">
                              <Link to={`/app/people/${m.userId}`} onClick={(e) => e.stopPropagation()}
                                className="block truncate font-semibold text-foreground underline-offset-2 hover:underline">{m.name}</Link>
                              <span className="block truncate text-[11px] text-muted-foreground">{m.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2"><Pill tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Pill></td>
                        <td className="px-3 py-2 text-foreground">{positionOf.get(m.userId) ?? m.jobTitle ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-foreground">
                          {theirTeams.length ? theirTeams.map((t) => t.name + (t.isLead ? " (Lead)" : "")).join(", ") : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {theirTeams[0]?.division ? orgDivisionLabel(theirTeams[0].division) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {m.managerId ? nameOf.get(m.managerId) ?? "—" : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <RowActions member={m} canManage={canManage} selfId={auth.user?.id}
                            onSelect={() => setSelectedId(m.userId)}
                            onStatus={(s) => change(() => actions.setStatus.mutateAsync({ membershipId: m.membershipId, status: s }))} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span>Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of {rows.length} team members</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous page" disabled={current === 1}
                  onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <Button key={n} variant={n === current ? "default" : "outline"} size="sm" className="h-7 w-7 px-0 text-xs"
                    aria-current={n === current ? "page" : undefined} onClick={() => setPage(n)}>{n}</Button>
                ))}
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next page" disabled={current === pages}
                  onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </span>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <PersonCard member={selected} status={statusOf(selected)} canManage={canManage} selfId={auth.user?.id}
          position={positionOf.get(selected.userId) ?? selected.jobTitle}
          teams={teamsOf.get(selected.userId) ?? []} allTeams={liveTeams}
          managerName={selected.managerId ? nameOf.get(selected.managerId) ?? null : null}
          managerPosition={selected.managerId ? positionOf.get(selected.managerId) ?? null : null}
          running={team.running.has(selected.userId)}
          schedule={team.schedules.find((s) => s.userId === selected.userId)}
          leaveToday={team.todayRows.find((d) => d.userId === selected.userId)?.leaveLabel ?? null}
          onRole={(role) => change(() => actions.setRole.mutateAsync({ membershipId: selected.membershipId, role }))}
          onProfile={(profile) => change(() => actions.setProfile.mutateAsync({ membershipId: selected.membershipId, profile }))}
          onAddTeam={(teamId) => change(() => teamActions.addMember.mutateAsync({ teamId, userId: selected.userId }))}
          onRemoveTeam={(teamId) => change(() => teamActions.removeMember.mutateAsync({ teamId, userId: selected.userId }))}
          onStatus={(s) => change(() => actions.setStatus.mutateAsync({ membershipId: selected.membershipId, status: s }))} />
      )}
    </div>
  );
}

function RowActions({ member, canManage, selfId, onSelect, onStatus }: {
  member: AgencyMember; canManage: boolean; selfId: string | undefined;
  onSelect: () => void; onStatus: (s: "active" | "inactive") => void;
}) {
  const mayChange = canManage && member.userId !== selfId && !member.isOwner;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${member.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        <DropdownMenuItem onSelect={onSelect}>Show details</DropdownMenuItem>
        <DropdownMenuItem asChild><Link to={`/app/people/${member.userId}`}>Open full profile</Link></DropdownMenuItem>
        {mayChange && member.status === "active" && (
          <DropdownMenuItem onSelect={() => onStatus("inactive")} className="text-status-danger focus:text-status-danger">
            <UserMinus className="mr-1.5 h-3.5 w-3.5" /> Deactivate
          </DropdownMenuItem>
        )}
        {mayChange && member.status === "inactive" && (
          <DropdownMenuItem onSelect={() => onStatus("active")}><Undo2 className="mr-1.5 h-3.5 w-3.5" /> Bring back</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonCard({
  member, status, canManage, selfId, position, teams, allTeams, managerName, managerPosition,
  running, schedule, leaveToday, onRole, onProfile, onAddTeam, onRemoveTeam, onStatus,
}: {
  member: AgencyMember; status: MemberStatus; canManage: boolean; selfId: string | undefined;
  position: string | null; teams: { id: string; name: string; isLead: boolean; division: string | null; department: string | null }[];
  allTeams: { id: string; name: string }[]; managerName: string | null; managerPosition: string | null;
  running: boolean; schedule: { shiftStart: string; shiftEnd: string } | undefined; leaveToday: string | null;
  onRole: (r: Enums<"agency_role">) => void; onProfile: (p: Enums<"access_profile">) => void;
  onAddTeam: (teamId: string) => void; onRemoveTeam: (teamId: string) => void; onStatus: (s: "active" | "inactive") => void;
}) {
  const primary = teams[0];
  const mayChange = canManage && member.userId !== selfId && !member.isOwner;
  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{value}</dd>
    </div>
  );
  return (
    <aside className="space-y-3 self-start" aria-label={`${member.name} details`}>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials(member.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{member.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{position ?? memberAccessLabel(member.role, member.accessProfile)}</span>
            <span className="mt-1 inline-block"><Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill></span>
          </span>
        </div>
        <p className="mt-3 truncate text-xs text-muted-foreground">{member.email}</p>
        <dl className="mt-3 divide-y divide-border/60 border-t border-border/60">
          {fact("Position", position ?? "—")}
          {fact("Division", primary?.division ? orgDivisionLabel(primary.division) : "—")}
          {fact("Department", primary?.department ?? "—")}
          {fact("Team", teams.length ? teams.map((t) => t.name).join(", ") : "—")}
          {fact("Reports to", managerName
            ? <span>{managerName}{managerPosition && <span className="block text-[11px] font-normal text-muted-foreground">{managerPosition}</span>}</span>
            : "—")}
          {fact("Start date", formatDate(member.since))}
          {fact("Access", memberAccessLabel(member.role, member.accessProfile))}
        </dl>
        <Link to={`/app/people/${member.userId}`}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          View Full Profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground">Today</h3>
        <ul className="mt-2 space-y-1.5 text-xs">
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Clock</span>
            <span className={cn("font-semibold", running ? "text-status-success" : "text-foreground")}>
              {running ? "Clocked in" : "Not clocked in"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Shift</span>
            <span className="font-medium text-foreground">{shiftLabel(schedule as never)}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Leave</span>
            <span className="font-medium text-foreground">{leaveToday ?? "No leave today"}</span>
          </li>
        </ul>
      </div>

      {canManage && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">Access &amp; teams</h3>
          <div className="mt-2 space-y-2 text-xs">
            <label className="block text-muted-foreground">Security role
              <div className="mt-0.5">
                <OpsSelect aria-label={`Security role for ${member.name}`} size="sm" value={member.role}
                  onValueChange={(v) => onRole(v as Enums<"agency_role">)} options={ROLES} />
              </div>
            </label>
            {member.role === "agency_user" && (
              <label className="block text-muted-foreground">Access profile
                <div className="mt-0.5">
                  <OpsSelect aria-label={`Access profile for ${member.name}`} size="sm" value={member.accessProfile ?? "custom"}
                    onValueChange={(v) => onProfile(v as Enums<"access_profile">)} options={PROFILE_OPTIONS} />
                </div>
              </label>
            )}
            <div>
              <span className="block text-muted-foreground">Teams</span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {teams.map((t) => (
                  <span key={t.id} className="flex items-center gap-0.5">
                    <Pill tone="border-border bg-muted text-foreground">{t.name}{t.isLead && " · lead"}</Pill>
                    <button type="button" aria-label={`Take ${member.name} off ${t.name}`}
                      className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onRemoveTeam(t.id)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <OpsSelect aria-label={`Add ${member.name} to a team`} size="inline" value="__add__"
                  onValueChange={(teamId) => { if (teamId !== "__add__") onAddTeam(teamId); }}
                  options={[{ value: "__add__", label: "+ team" },
                    ...allTeams.filter((t) => !teams.some((x) => x.id === t.id)).map((t) => ({ value: t.id, label: t.name }))]} />
              </span>
            </div>
            {mayChange && (
              <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                {member.status === "invited" ? (
                  <span className="text-[11px] text-muted-foreground">
                    Pending activation — they hold {member.employeeCode ?? "an Agent ID"} and appear in the directory,
                    but count as nobody's headcount until they sign in.
                  </span>
                ) : member.status === "active" ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onStatus("inactive")}>
                    <UserMinus className="mr-1 h-3.5 w-3.5" /> Deactivate
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onStatus("active")}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Bring back
                  </Button>
                )}
                {/* Owner only, and absent for everybody else — Dee's rule. */}
                <OwnerDeleteButton table="agency_memberships" id={member.membershipId} name={member.name} className="h-7 px-2 text-xs" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Deactivating keeps everything they ever did — it only takes them out of the roster,
              the pickers and the team lists. Nobody is deleted, and history never changes hands.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
