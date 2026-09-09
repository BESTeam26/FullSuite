/**
 * One Team Member, one canonical profile (Dee's People Hub doctrine,
 * 2026-09-09): "I need Rowell" opens Rowell — position, teams, access,
 * assignments, schedule, compensation, EOD and history in one place, every
 * tab a view over the SAME canonical records the rest of the platform
 * writes. No employee table was created to serve this page.
 *
 * Who may open it: the person themselves, someone with management authority,
 * or a lead of one of their teams. The tabs then narrow further — and the
 * narrowing that matters is the database's: rates, payslips and attendance
 * queries return nothing to a caller RLS refuses, whether or not a tab
 * rendered (§40).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, UserRound } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/agency/partner/partner-ui";
import { AgencyAccessPanel } from "@/components/agency/AgencyAccessPanel";
import {
  ActivityTab, AssignmentsTab, CompensationTab, DocumentsTab, EodTab, ScheduleTimeTab, WorkOrgTab,
} from "@/components/agency/people/MemberProfileTabs";
import { useAgencyMembers, useMemberActions } from "@/lib/data/use-agency-teams";
import { usePayRates, useSchedules } from "@/lib/data/use-people";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";

/* The four doors into operational work. */
const MODULE_KEYS = ["creditops.clients.view", "crm.projects.view", "fundingops.files.view", "talentops.view"] as const;
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { isAdminRole } from "@/lib/agency/navigation";
import { memberAccessLabel } from "@/lib/data/agency-invitations";
import { formatDate } from "@/lib/format-date";

export default function TeamMemberProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const members = useAgencyMembers();
  const wf = useWorkforce();
  const actions = useMemberActions();
  const [tab, setTab] = useState("overview");

  const member = (members.data ?? []).find((m) => m.userId === userId) ?? null;
  const people = wf.data?.people ?? [];
  const teams = useMemo(() => wf.data?.teams ?? [], [wf.data?.teams]);
  const time = wf.data?.time ?? [];

  const isSelf = auth.user?.id === userId;
  const isAdmin = isAdminRole(auth.agencyMembership?.role);
  const manages = isAdmin || perms.can("ops.manage");
  const leadsThisPerson = useMemo(() => {
    const led = new Set(auth.ledTeamIds ?? []);
    return teams.some((t) => led.has(t.id) && t.members.some((m) => m.userId === userId));
  }, [auth.ledTeamIds, teams, userId]);
  const mayOpen = isSelf || manages || leadsThisPerson;
  /* Editing stays a management act; a lead reads their people, a person reads
     themselves. The database re-checks every write regardless. */
  const mayManage = manages;

  const myTeams = teams.filter((t) => !t.archived && t.members.some((m) => m.userId === userId));
  const leadOf = myTeams.filter((t) => t.members.some((m) => m.userId === userId && m.isLead));
  const week = time.find((t) => t.employeeId === userId);
  const schedules = useSchedules();
  const hasSchedule = (schedules.data ?? []).some((sch) => sch.userId === userId);
  const rates = usePayRates();
  const hasRate = (rates.data ?? []).some((r) => r.userId === userId);
  /* Does anything let them into an operational module? Admins always; an
     Agency User only through a deliberate grant (no profile gives one). */
  const myAccess = useAgencyAccessContext();
  const hasModule = isSelf
    ? MODULE_KEYS.some((k) => myAccess.ctx.can(k))
    : MODULE_KEYS.some((k) => member?.moduleGrants?.includes(k) ?? false);
  const canMoney = perms.can("payroll.view") || perms.can("payroll.manage");
  const canDocs = perms.can("people.documents.manage");
  const seesOwnDocs = isSelf && !canDocs;

  if (members.isLoading || wf.isLoading || perms.loading) {
    return (
      <HqPageShell title="Team member" description="Loading…" icon={UserRound}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }
  if (!member || !mayOpen) {
    /* Unknown id and unauthorized id read the same — a profile that is not
       yours to open does not confirm it exists (rule 1). */
    return (
      <HqPageShell title="Team member" description="" icon={UserRound}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          This person could not be found, or is not yours to view.
        </p>
        <p className="text-center">
          <Button variant="outline" size="sm" onClick={() => navigate("/app/people")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to People
          </Button>
        </p>
      </HqPageShell>
    );
  }

  /* §32 — the lightweight onboarding read: derived from the records, never a
     second checklist table. */
  const checklist: { label: string; done: boolean; why?: string }[] = [
    { label: "Account activated", done: member.status === "active" },
    { label: "Position assigned", done: !!member.jobTitle },
    { label: "Team assigned", done: myTeams.length > 0 },
    { label: "Access profile set", done: member.role === "agency_admin" || (!!member.accessProfile && member.accessProfile !== "custom") },
    /* The one that decides whether they can do their JOB: without a module
       grant an Agency User has a workspace and nothing to work in. An admin
       needs none — the role carries them all. */
    { label: "Module access granted", done: member.role === "agency_admin" || hasModule,
      why: "Without one they can log time and see their day, but no CreditOps, BES CRM or TalentOps." },
    { label: "Schedule configured", done: hasSchedule,
      why: "Attendance, lateness and paid breaks are all derived from it." },
    { label: "Pay rate set", done: hasRate, why: "Payroll skips anybody without one." },
  ];

  return (
    <HqPageShell
      title={member.name}
      description={member.email}
      icon={UserRound}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="border-border bg-muted text-foreground">{memberAccessLabel(member.role, member.accessProfile)}</Pill>
          {member.isOwner && <Pill tone="border-primary/40 bg-primary/10 text-foreground">Owner</Pill>}
          <Pill tone={member.status === "active" ? "border-status-success/40 bg-status-success/10 text-foreground" : "border-border bg-muted text-muted-foreground"}>
            {member.status === "active" ? "Active" : `Left ${member.deactivatedAt ? formatDate(member.deactivatedAt) : ""}`}
          </Pill>
          {mayManage && member.status === "active" && !isSelf && !member.isOwner && (
            <Button size="sm" variant="outline"
              onClick={() => actions.setStatus.mutate({ membershipId: member.membershipId, status: "inactive" })}>
              Deactivate
            </Button>
          )}
          {mayManage && member.status === "inactive" && (
            <Button size="sm" variant="outline"
              onClick={() => actions.setStatus.mutate({ membershipId: member.membershipId, status: "active" })}>
              Reactivate
            </Button>
          )}
        </div>
      }
    >
      <p className="mb-3 text-xs">
        <Link to="/app/people" className="text-muted-foreground hover:text-foreground hover:underline">
          ← People
        </Link>
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 flex-wrap bg-muted/60">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          {mayManage && <TabsTrigger value="work" className="text-[11px]">Work &amp; Organization</TabsTrigger>}
          {isAdmin && <TabsTrigger value="access" className="text-[11px]">Access</TabsTrigger>}
          {(mayManage || leadsThisPerson) && <TabsTrigger value="assignments" className="text-[11px]">Assignments</TabsTrigger>}
          {(mayManage || leadsThisPerson || isSelf) && <TabsTrigger value="time" className="text-[11px]">Schedule &amp; Time</TabsTrigger>}
          {canMoney && <TabsTrigger value="compensation" className="text-[11px]">Compensation</TabsTrigger>}
          {(canDocs || seesOwnDocs) && <TabsTrigger value="documents" className="text-[11px]">Documents</TabsTrigger>}
          {(mayManage || leadsThisPerson || isSelf) && <TabsTrigger value="eod" className="text-[11px]">EOD</TabsTrigger>}
          {mayManage && <TabsTrigger value="activity" className="text-[11px]">Activity</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Snapshot</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Position</dt>
                  <dd className="text-foreground">{member.jobTitle ?? "Not recorded"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Teams</dt>
                  <dd className="text-foreground">{myTeams.map((t) => t.name).join(", ") || "None"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Leads</dt>
                  <dd className="text-foreground">{leadOf.map((t) => t.name).join(", ") || "—"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Reports to</dt>
                  <dd className="text-foreground">{people.find((p) => p.userId === member.managerId)?.name ?? "Nobody"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Since</dt>
                  <dd className="text-foreground">{formatDate(member.since)}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">This week</dt>
                  <dd className="text-foreground">
                    {week ? `${Math.floor(week.minutes / 60)}h ${week.minutes % 60}m${week.running ? " · clocked in" : ""}` : "No time yet"}
                  </dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Onboarding</h3>
              <ul className="mt-3 space-y-1.5 text-xs">
                {checklist.map((c) => (
                  <li key={c.label} className={c.done ? "text-foreground" : "text-muted-foreground"}>
                    {c.done ? "✓" : "○"} {c.label}
                    {!c.done && c.why && (
                      <span className="block pl-3 text-[10px] text-muted-foreground">{c.why}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </TabsContent>

        {mayManage && (
          <TabsContent value="work" className="mt-3">
            <WorkOrgTab member={member} people={people} teams={teams} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="access" className="mt-3">
            <AgencyAccessPanel lockedUserId={member.userId} />
          </TabsContent>
        )}
        {(mayManage || leadsThisPerson) && (
          <TabsContent value="assignments" className="mt-3">
            <AssignmentsTab member={member} teams={teams} />
          </TabsContent>
        )}
        {(mayManage || leadsThisPerson || isSelf) && (
          <TabsContent value="time" className="mt-3">
            <ScheduleTimeTab member={member} />
          </TabsContent>
        )}
        {canMoney && (
          <TabsContent value="compensation" className="mt-3">
            <CompensationTab member={member} />
          </TabsContent>
        )}
        {(canDocs || seesOwnDocs) && (
          <TabsContent value="documents" className="mt-3">
            <DocumentsTab member={member} agencyId={auth.agencyId ?? ""} />
          </TabsContent>
        )}
        {(mayManage || leadsThisPerson || isSelf) && (
          <TabsContent value="eod" className="mt-3">
            <EodTab member={member} />
          </TabsContent>
        )}
        {mayManage && (
          <TabsContent value="activity" className="mt-3">
            <ActivityTab member={member} />
          </TabsContent>
        )}
      </Tabs>
    </HqPageShell>
  );
}
