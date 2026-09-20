/**
 * People & Teams — the one management workspace.
 *
 * Dee, 2026-09-19, locking the Workforce IA: "Me" is Time & Attendance; "my
 * people / BES people" is here. Team Management and Teams are gone as
 * destinations; their working pieces are the sections of this page. The
 * sections nest under the parent in the global sidebar AND appear as tabs
 * here — the same rows (`people-sections.ts`) drive both.
 *
 * Role-adaptive: a Team Lead sees the operational sections over their team, a
 * Division Manager the same over their division plus the Org Chart, an
 * Executive everything. An Agent is never offered the page. What each section
 * SHOWS is the database's scope (`managed_people()` and the row policies);
 * this file only decides which sections are drawn.
 *
 * A segment nobody may open and a segment that does not exist get the SAME
 * answer — the module root — because a "not allowed" page tells somebody the
 * section exists.
 */
import { Suspense, lazy, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Loader2, UserPlus, Users } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AgencyTeamInvites, PendingInvitationsList } from "@/components/settings/sections/AgencyTeamInvites";
import { ManagementSeats } from "@/components/agency/people/ManagementSeats";
import { InviteTeamMemberWizard } from "@/components/agency/people/InviteTeamMemberWizard";
import { PeopleManager } from "@/components/agency/PeopleManager";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";
import { groupedPeopleSections, isPeopleSectionSlug, peopleSectionFor, visiblePeopleSections } from "@/lib/people/people-sections";
import { TeamOverview } from "@/pages/app/people/sections/TeamOverview";
import { TeamAttendance } from "@/pages/app/people/sections/TeamAttendance";
import { TeamTimeOff } from "@/pages/app/people/sections/TeamTimeOff";
import { TeamScheduleSection } from "@/pages/app/people/sections/TeamScheduleSection";
import { TeamPerformance } from "@/pages/app/people/sections/TeamPerformance";
import { TeamEod } from "@/pages/app/people/sections/TeamEod";
import { cn } from "@/lib/utils";

/* Structure, Positions and the Org Chart are administration — heavier and
   rarer than the operational sections, so their code loads only when opened
   (rule 14: do not load hidden tabs). */
const OrganizationStructure = lazy(() => import("@/components/agency/OrganizationStructure").then((m) => ({ default: m.OrganizationStructure })));
const TeamsManager = lazy(() => import("@/components/agency/TeamsManager").then((m) => ({ default: m.TeamsManager })));
const PositionsSection = lazy(() => import("@/components/settings/sections/PositionsSection").then((m) => ({ default: m.PositionsSection })));
const OrgChart = lazy(() => import("@/components/agency/OrgChart").then((m) => ({ default: m.OrgChart })));
const PayrollPanel = lazy(() => import("@/components/agency/finance/PayrollPanel").then((m) => ({ default: m.PayrollPanel })));
const CompensationRoster = lazy(() => import("@/components/agency/people/CompensationRoster").then((m) => ({ default: m.CompensationRoster })));

const TeamMemberProfilePage = lazy(() => import("@/pages/app/TeamMemberProfilePage"));

/** The context every People & Teams decision reads — the route guard's own. */
export function usePeopleAudience() {
  const { ctx } = useAgencyAccessContext();
  const administers = ctx.role === "agency_admin";
  return {
    administers,
    manages: administers || ctx.can("ops.manage"),
    leadsTeam: ctx.leadsTeam,
    payroll: ctx.can("payroll.view") || ctx.can("payroll.manage"),
  };
}

/**
 * /app/people/:key is a SECTION when the key is one, and a person's profile
 * otherwise — one route, two screens, decided by the registry rather than by
 * guessing at the shape of the string.
 */
export const PeopleKeyRoute = () => {
  const { key = "" } = useParams();
  if (isPeopleSectionSlug(key)) return <PeopleTeamsPage />;
  return (
    <Suspense fallback={<Loading />}>
      <TeamMemberProfilePage />
    </Suspense>
  );
};

export const PeopleTeamsPage = () => {
  const { key: slug } = useParams();
  const audience = usePeopleAudience();
  const sections = visiblePeopleSections(audience);
  const groups = groupedPeopleSections(audience);
  const section = peopleSectionFor(slug, audience);

  /* Not offered the page at all: home, not a locked door. */
  if (sections.length === 0) return <Navigate to="/app" replace />;
  if (!section) return <Navigate to="/app/people" replace />;

  return (
    <HqPageShell
      title="People & Teams"
      description={section.description}
      icon={Users}
      actions={audience.administers ? <InviteButton /> : undefined}
    >
      {/* Dee, 2026-09-20: eleven equal tabs in one wrapping row read as a
          pile. They are the same eleven destinations, in the same order, now
          drawn under the question each one answers. A cluster with nothing in
          it for this person is not drawn at all, so a Team Lead sees two
          headings where an executive sees four. */}
      <nav aria-label="People & Teams sections" className="mb-3 border-b border-border">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          {groups.map((g) => (
            <div key={g.key} className="min-w-0">
              <p className="px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {g.sections.map((s) => {
                  const active = s.slug === section.slug;
                  return (
                    <Link key={s.slug} to={s.slug ? `/app/people/${s.slug}` : "/app/people"}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                      )}>
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <Suspense fallback={<Loading />}>
        {section.slug === "" && <TeamOverview canSeePositions={audience.administers} />}
        {section.slug === "members" && (
          <div className="space-y-3">
            <PeopleManager />
            {audience.administers && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <PendingInvitationsList />
              </div>
            )}
          </div>
        )}
        {section.slug === "structure" && (
          <div className="space-y-4">
            <ManagementSeats />
            <OrganizationStructure />
            <TeamsManager />
          </div>
        )}
        {section.slug === "positions" && <PositionsSection />}
        {section.slug === "org-chart" && <OrgChart />}
        {section.slug === "schedule" && <TeamScheduleSection canEdit={audience.manages} />}
        {section.slug === "attendance" && <TeamAttendance />}
        {section.slug === "time-off" && <TeamTimeOff />}
        {section.slug === "eod" && <TeamEod />}
        {section.slug === "performance" && <TeamPerformance />}
        {/* Pay before payroll: "what are we paying this person?" is the
            question asked far more often than "generate the cutoff". */}
        {section.slug === "payroll" && (
          <div className="space-y-3">
            <CompensationRoster />
            <PayrollPanel />
          </div>
        )}
      </Suspense>
    </HqPageShell>
  );
};

const InviteButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite Team Member</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(96vw,64rem)] max-w-none overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Add someone to BES and place them in the organization. Their access follows their placement.
          </DialogDescription>
        </DialogHeader>
        <InviteTeamMemberWizard onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
};

const Loading = () => (
  <p className="py-8 text-center text-sm text-muted-foreground">
    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
  </p>
);

export default PeopleTeamsPage;
