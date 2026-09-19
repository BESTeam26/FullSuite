/**
 * One Team Member, one canonical profile (Dee's People Hub doctrine,
 * 2026-09-09): "I need Rowell" opens Rowell — position, teams, access,
 * assignments, schedule, compensation, EOD and history in one place, every
 * tab a view over the SAME canonical records the rest of the platform
 * writes. No employee table was created to serve this page.
 *
 * Redrawn to Dee's Agent Profile mockup (2026-09-19): the header with photo,
 * quote, position, team and lead; the five weighted performance tiles and the
 * Overview cards; Performance, QA Reviews, Production, Feedback, Goals and
 * Training beside the management tabs. Where a card's record does not exist
 * yet (scorecard workmanship, dispute results, sampling) the card says so.
 *
 * Who may open it: the person themselves, someone with management authority,
 * or a lead of one of their teams. The tabs then narrow further — and the
 * narrowing that matters is the database's: rates, payslips and attendance
 * queries return nothing to a caller RLS refuses, whether or not a tab
 * rendered (§40).
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2, UserRound } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileHeader } from "@/components/people/profile/ProfileHeader";
import { ProfileOverview } from "@/components/people/profile/ProfileOverview";
import {
  FeedbackTab, GoalsTab, PersonPerformanceTab, ProductionPeriodCard, QaReviewsTab, TrainingTab,
} from "@/components/people/profile/ProfileTabs";
import { usePositions } from "@/lib/data/use-positions";
import { MemberAttendanceScore } from "@/components/attendance/MemberAttendanceScore";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/agency/partner/partner-ui";
import { AgencyAccessPanel } from "@/components/agency/AgencyAccessPanel";
import {
  ActivityTab, AssignmentsTab, CompensationTab, DocumentsTab, EodTab, ScheduleTimeTab, WorkOrgTab, WorkPerformanceTab,
} from "@/components/agency/people/MemberProfileTabs";
import { useAgencyMembers, useMemberActions } from "@/lib/data/use-agency-teams";
import { useMemberLeave, usePayRates, useSchedules } from "@/lib/data/use-people";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";

/* The four doors into operational work. */
/* Division codes as the team rows carry them, shown as names (§44). */
const DIVISION_LABELS: Record<string, string> = {
  creditops: "CreditOps", fundingops: "FundingOps", bes_crm: "BES CRM", talentops: "TalentOps", general: "General",
};
const divisionLabel = (code: string | null) => (code ? DIVISION_LABELS[code] ?? code : null);
const MODULE_KEYS = ["creditops.clients.view", "crm.projects.view", "fundingops.files.view", "talentops.view"] as const;
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { isAdminRole } from "@/lib/agency/navigation";
import { memberAccessLabel } from "@/lib/data/agency-invitations";
import { formatDate } from "@/lib/format-date";

export default function TeamMemberProfilePage() {
  /* Mounted from /app/people/:key (PeopleKeyRoute decides section vs person)
     and, historically, /app/people/:userId — accept either name. */
  const params = useParams<{ key?: string; userId?: string }>();
  const userId = params.userId ?? params.key;
  const navigate = useNavigate();
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const members = useAgencyMembers();
  const wf = useWorkforce();
  const actions = useMemberActions();
  const [tab, setTab] = useState("overview");
  const [confirmReactivate, setConfirmReactivate] = useState(false);

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
  /* Dee, 2026-09-19: the performance profile — weighted scores, QA, sampling,
     production, payroll — is a MANAGER'S view. A person's own identity lives
     in Settings → My Profile; opening their own page lands there. */
  const mayOpen = manages || leadsThisPerson;
  const selfOnly = isSelf && !mayOpen;
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
  const positions = usePositions();
  const positionTitle = (id: string) => (positions.data ?? []).find((p) => p.holders.some((h) => h.userId === id))?.title ?? null;
  const nameOf = (id: string) => (members.data ?? []).find((m) => m.userId === id)?.name ?? "Someone";
  /* The lead of the person's first team, other than themselves — a relationship, not a rank. */
  const leadMember = useMemo(() => {
    const leadId = myTeams.flatMap((t) => t.members).find((m) => m.isLead && m.userId !== userId)?.userId;
    return leadId ? (members.data ?? []).find((m) => m.userId === leadId) ?? null : null;
  }, [myTeams, members.data, userId]);
  const canEditGoals = isSelf || mayManage || leadsThisPerson;

  if (members.isLoading || wf.isLoading || perms.loading) {
    return (
      <HqPageShell title="Team member" description="Loading…" icon={UserRound}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      </HqPageShell>
    );
  }
  if (selfOnly) return <Navigate to="/app/settings?section=account" replace />;
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
    <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/app/people" className="hover:text-foreground hover:underline">People</Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link to="/app/people/members" className="hover:text-foreground hover:underline">Team Members</Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="text-foreground">{member.name}</span>
        <span className="ml-auto flex items-center gap-2">
          {mayManage && member.status === "active" && !isSelf && !member.isOwner && (
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => actions.setStatus.mutate({ membershipId: member.membershipId, status: "inactive" })}>
              Deactivate
            </Button>
          )}
          {mayManage && member.status === "inactive" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmReactivate(true)}>Reactivate</Button>
          )}
        </span>
      </nav>

      <ProfileHeader member={member} position={positionTitle(member.userId) ?? member.jobTitle}
        division={myTeams[0]?.division ?? null} team={myTeams[0]?.name ?? null}
        leadName={leadMember?.name ?? null} isSelf={isSelf} canEdit={isSelf || mayManage} />

      {confirmReactivate && (
        <ReactivateConfirm
          member={member}
          teams={myTeams.map((t) => t.name)}
          onCancel={() => setConfirmReactivate(false)}
          onConfirm={() => {
            actions.setStatus.mutate({ membershipId: member.membershipId, status: "active" });
            setConfirmReactivate(false);
          }}
        />
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-3">
        {/* Dee's list, 2026-09-19. Whoever may OPEN this page (management in
            scope, or the lead of one of this person's teams) sees the
            person's own tabs; Compensation, Documents, Access and Activity
            keep their capability gates. A person opening themselves never
            reaches here — Settings › My Profile is their door. */}
        <TabsList className="h-8 flex-wrap bg-muted/60">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          <TabsTrigger value="organization" className="text-[11px]">Organization</TabsTrigger>
          <TabsTrigger value="assignments" className="text-[11px]">Assignments</TabsTrigger>
          <TabsTrigger value="attendance" className="text-[11px]">Time &amp; Attendance</TabsTrigger>
          <TabsTrigger value="time-off" className="text-[11px]">Time Off</TabsTrigger>
          <TabsTrigger value="eod" className="text-[11px]">EOD</TabsTrigger>
          <TabsTrigger value="performance" className="text-[11px]">Performance</TabsTrigger>
          <TabsTrigger value="qa" className="text-[11px]">QA Reviews</TabsTrigger>
          <TabsTrigger value="production" className="text-[11px]">Production</TabsTrigger>
          <TabsTrigger value="feedback" className="text-[11px]">Feedback &amp; Coaching</TabsTrigger>
          <TabsTrigger value="training" className="text-[11px]">Training</TabsTrigger>
          {canMoney && <TabsTrigger value="compensation" className="text-[11px]">Compensation</TabsTrigger>}
          {(canDocs || seesOwnDocs) && <TabsTrigger value="documents" className="text-[11px]">Documents</TabsTrigger>}
          {isAdmin && <TabsTrigger value="access" className="text-[11px]">Access</TabsTrigger>}
          {mayManage && <TabsTrigger value="activity" className="text-[11px]">Activity</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <ProfileOverview member={member} nameOf={nameOf} canEditGoals={canEditGoals}
            onOpenTab={(t) => setTab(t === "goals" ? "feedback" : t)}
            lead={leadMember ? { userId: leadMember.userId, name: leadMember.name, title: positionTitle(leadMember.userId) ?? leadMember.jobTitle, avatarPath: leadMember.avatarPath } : null} />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-foreground">Snapshot</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Work email</dt>
                  <dd className="truncate text-foreground">{member.email}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Status</dt>
                  <dd className="text-foreground">{member.status === "active" ? "Active" : "Deactivated"}</dd></div>
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

        <TabsContent value="organization" className="mt-3 space-y-3">
          {/* Management places people; a lead reads where their person sits. */}
          {mayManage ? (
            <WorkOrgTab member={member} people={people} teams={teams} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Organization</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Position</dt>
                  <dd className="text-foreground">{positionTitle(member.userId) ?? member.jobTitle ?? "Not recorded"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Division</dt>
                  <dd className="text-foreground">{divisionLabel(myTeams[0]?.division ?? null) ?? "—"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Teams</dt>
                  <dd className="text-foreground">{myTeams.map((t) => t.name).join(", ") || "None"}</dd></div>
                <div><dt className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Reports to</dt>
                  <dd className="text-foreground">{leadMember?.name ?? people.find((p) => p.userId === member.managerId)?.name ?? "Nobody"}</dd></div>
              </dl>
              <p className="mt-3 text-[10px] text-muted-foreground">Placement is changed by management from People &amp; Teams.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="mt-3 space-y-3">
          <AssignmentsTab member={member} teams={teams} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-3 space-y-3">
          {/* Dee's attendance policy, 2026-09-18: "Score + violations +
              patterns, not a complicated analytics dashboard." */}
          <MemberAttendanceScore userId={member.userId} />
          <ScheduleTimeTab member={member} />
        </TabsContent>

        <TabsContent value="time-off" className="mt-3">
          <MemberTimeOff userId={member.userId} />
        </TabsContent>

        <TabsContent value="eod" className="mt-3"><EodTab member={member} /></TabsContent>

        <TabsContent value="performance" className="mt-3">
          <PersonPerformanceTab member={member} title={positionTitle(member.userId) ?? member.jobTitle} teamName={myTeams[0]?.name ?? null} nameOf={nameOf} />
        </TabsContent>
        <TabsContent value="qa" className="mt-3"><QaReviewsTab member={member} nameOf={nameOf} /></TabsContent>
        <TabsContent value="production" className="mt-3 space-y-3">
          <ProductionPeriodCard member={member} />
          <WorkPerformanceTab member={member} />
        </TabsContent>
        <TabsContent value="feedback" className="mt-3 space-y-3">
          <FeedbackTab member={member} nameOf={nameOf} />
          <GoalsTab member={member} canEdit={canEditGoals} />
        </TabsContent>
        <TabsContent value="training" className="mt-3"><TrainingTab member={member} /></TabsContent>
        {canMoney && (
          <TabsContent value="compensation" className="mt-3"><CompensationTab member={member} /></TabsContent>
        )}
        {(canDocs || seesOwnDocs) && (
          <TabsContent value="documents" className="mt-3">
            <DocumentsTab member={member} agencyId={auth.agencyId ?? ""} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="access" className="mt-3">
            <AgencyAccessPanel lockedUserId={member.userId} />
          </TabsContent>
        )}
        {mayManage && (
          <TabsContent value="activity" className="mt-3">
            <ActivityTab member={member} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** One person's time-off history, as management sees it. RLS scopes the rows. */
function MemberTimeOff({ userId }: { userId: string }) {
  const leave = useMemberLeave(userId);
  const tone = (status: string) =>
    status === "approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
      : status === "pending" ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
        : "border-border bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Time Off</h3>
        <Link to="/app/people/time-off" className="text-[11px] font-semibold text-primary hover:underline">Open Time Off</Link>
      </div>
      {leave.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (leave.data ?? []).length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">No time-off requests on file.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60 text-xs">
          {(leave.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="block font-medium text-foreground">{r.typeLabel}</span>
                <span className="block text-muted-foreground">{formatDate(r.startsOn)}{r.endsOn !== r.startsOn ? ` – ${formatDate(r.endsOn)}` : ""}</span>
              </span>
              <Pill tone={tone(r.status)}>{r.status}</Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reactivation must not silently restore what should have ended (Dee §33).
 * Say what comes back — teams and any still-standing assignments — before it
 * does. Nothing here decides; the person reactivating does.
 */
function ReactivateConfirm({ member, teams, onCancel, onConfirm }: {
  member: { name: string; role: string; accessProfile: string | null };
  teams: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Reactivate team member">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm font-semibold text-foreground">Reactivate {member.name}?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Their sign-in and access come back exactly as they were left: <span className="text-foreground">{memberAccessLabel(member.role as never, member.accessProfile as never)}</span>
          {teams.length > 0 ? <>, on {teams.join(", ")}</> : ", on no team"}. Partner assignments and module access that were never
          ended are still in place. Check the Assignments and Access tabs after reactivating if anything should have ended.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onConfirm}>Reactivate</Button>
        </div>
      </div>
    </div>
  );
}
