import { useAgency } from "@/lib/agency-context";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { AgencyAccessPanel } from "@/components/agency/AgencyAccessPanel";
import { PeopleManager } from "@/components/agency/PeopleManager";
import { TeamsManager } from "@/components/agency/TeamsManager";
import { OrganizationStructure } from "@/components/agency/OrganizationStructure";
import { HqPageShell } from "@/pages/app/HqPages";
import { cn } from "@/lib/utils";
import { LiveCalendar } from "@/components/dashboard/LiveCalendar";
import { SubAccountInvoicingMetering } from "@/components/dashboard/SubAccountInvoicingMetering";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { Link } from "react-router-dom";
import { useWorkforce } from "@/lib/data/use-workforce";
import { SchedulesAndRates } from "@/components/agency/people/SchedulesAndRates";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { AnnouncementsBoard } from "@/components/intranet/AnnouncementsBoard";
import {
  Users,
  Network,
  Briefcase,
  Receipt,
  Megaphone,
  Calendar,
  LifeBuoy,
  CheckCircle2,
  DollarSign,
  Clock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* People                                                                */
/* ------------------------------------------------------------------ */

const AGENCY_ROLE_LABEL: Record<string, string> = { agency_owner: "Agency Owner", agency_admin: "Agency Admin", agency_manager: "Agency Manager", agency_team_lead: "Team Lead", agency_agent: "Agent" };
const DIVISION_LABEL: Record<string, string> = { creditops: "CreditOps", fundingops: "FundingOps", bes_crm: "BES CRM", talentops: "TalentOps", general: "General" };
const divisionLabel = (d: string | null) => (d ? DIVISION_LABEL[d] ?? d : null);
const fmtMinutes = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h > 0 ? `${h}h ${r}m` : `${r}m`; };

export const PeoplePage = () => (
  <HqPageShell
    title="People"
    description="BES agency staff — who is here, what they may do, and what they may see"
    icon={Users}
  >
    <PeopleManager />
    {/* Owner and administrator only; the panel renders nothing for anybody
        else rather than a locked version of itself. */}
    <div className="mt-4">
      <AgencyAccessPanel />
    </div>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Teams                                                                 */
/* ------------------------------------------------------------------ */

export const TeamsPage = () => (
  <HqPageShell
    title="Teams"
    description="Divisions, departments and teams — the one structure People, Work, EOD, production and partner assignment all read"
    icon={Network}
  >
    <OrganizationStructure />
    <div className="mt-4">
      <TeamsManager />
    </div>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Workforce                                                             */
/* ------------------------------------------------------------------ */

export const WorkforcePage = () => {
  const wf = useWorkforce();
  const people = wf.data?.people ?? [];
  const time = wf.data?.time ?? [];
  const clockedIn = time.filter((t) => t.running).length;
  const logged = time.reduce((s, t) => s + t.minutes, 0);
  const capacity = people.length * 40 * 60;
  const utilization = capacity > 0 ? Math.round((logged / capacity) * 100) : null;
  const byDivision = new Map<string, { agents: Set<string>; minutes: number }>();
  for (const t of wf.data?.teams ?? []) { const key = divisionLabel(t.division) ?? "Unassigned"; const row = byDivision.get(key) ?? { agents: new Set<string>(), minutes: 0 }; for (const m of t.members) { row.agents.add(m.userId); row.minutes += time.find((x) => x.employeeId === m.userId)?.minutes ?? 0; } byDivision.set(key, row); }
  return (
    <HqPageShell title="Workforce" description="Capacity and this week's logged time across BES staff — counts from time entries, never estimates" icon={Briefcase}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="BES staff" value={people.length} icon={Users} />
        <StatCard label="Clocked in now" value={clockedIn} icon={CheckCircle2} />
        <StatCard label="Logged this week" value={fmtMinutes(logged)} icon={Clock} />
        <StatCard label="Utilization (of 40h)" value={utilization === null ? "—" : `${utilization}%`} icon={Briefcase} />
      </div>
      <div className="mt-5">
        <ContentCard title="Time by division (this week)">
          {byDivision.size === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No BES teams yet — divisions appear once teams exist.</p> : (
            <div className="space-y-3">
              {[...byDivision.entries()].map(([div, row]) => (
                <div key={div} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">{div}</span>
                  <span className="text-muted-foreground">{row.agents.size} staff · {fmtMinutes(row.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </ContentCard>
      </div>
      <div className="mt-5">
        <SchedulesAndRates />
      </div>
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* Billing & Revenue                                                     */
/* ------------------------------------------------------------------ */

/**
 * Billing & Revenue.
 *
 * The figures that used to be here — "$31,650 platform MRR", "$6,624 usage",
 * "$11,250 fulfillment", "$5,281 DIY" — were written into the page. What is
 * actually measured today is per-organization seats and active records, and
 * AI credit usage; both are shown by the metering panel, which reads the
 * database. Invoices and MRR arrive with the payment connection.
 */
export const BillingPage = () => (
  <HqPageShell
    title="Billing & Revenue"
    description="What each organization is using today. Invoicing and revenue reporting arrive with the payment connection."
    icon={Receipt}
  >
    <SubAccountInvoicingMetering />
  </HqPageShell>
);

export const AnnouncementsPage = () => {
  const agency = useAgency();
  const auth = useAuth();
  const permissions = usePermissions();
  const organizationView = agency.viewMode === "subaccount" && !!agency.activeOrganization;
  const organizationId = organizationView ? agency.activeOrganization!.id : null;
  /* BES HQ posts to every organization or to BES staff only; an organization
     posts to its own team. The database function re-checks either way. */
  const canWrite = organizationView ? permissions.canAsMember("settings.manage") : auth.isAgencyStaff;
  return (
    <HqPageShell
      title="Announcements"
      description={organizationView ? "Updates for everyone in your organization, and notices from BES." : "Notices to every organization, and BES-internal announcements."}
      icon={Megaphone}
    >
      <AnnouncementsBoard
        organizationId={organizationId}
        canWrite={canWrite}
        audienceChoices={
          organizationView
            ? [{ value: "organization", label: "Your team" }]
            : [{ value: "all_organizations", label: "Every organization" }, { value: "bes_internal", label: "BES internal only" }]
        }
      />
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* Calendar                                                              */
/* ------------------------------------------------------------------ */

export const CalendarPage = () => (
  <HqPageShell
    title="Calendar"
    description="Real deadlines for the next two weeks — work items due, statutory letter clocks and renewal follow-ups — from the records you may see."
    icon={Calendar}
  >
    <LiveCalendar />
  </HqPageShell>
);

export const SupportPage = () => {
  const { agency } = useAgencySettings();
  const email = agency.supportEmail?.trim();
  const phone = agency.supportPhone?.trim();
  const cards: { title: string; desc: string; icon: string; link?: string; pending?: string }[] = [
    { title: "Knowledge Base", desc: "SOPs, guides, and operational documentation", icon: "📚", link: "/app/education" },
    { title: "Contact Support", desc: [email, phone].filter(Boolean).join(" · ") || "Set the support email and phone in Agency Settings → Agency & Branding", icon: "💬", link: email ? `mailto:${email}` : undefined },
    { title: "Release Notes", desc: "What changed in the platform, release by release", icon: "📝", link: "/app/announcements" },
    { title: "Report a Bug", desc: "Send engineering what you saw, where, and what you expected", icon: "🐛", link: email ? `mailto:${email}?subject=${encodeURIComponent("BES bug report")}` : undefined },
    { title: "System Status", desc: "Live status arrives with platform monitoring", icon: "✅", pending: "Not connected yet" },
    { title: "Video Tutorials", desc: "Walkthroughs of key workflows", icon: "🎬", pending: "Recorded with the Knowledge Base build" },
  ];
  return (
    <HqPageShell title="Support" description="Get help, browse documentation, or contact the BES team" icon={LifeBuoy}>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const body = (
            <>
              <div className="mb-3 text-2xl">{card.icon}</div>
              <h3 className="font-semibold text-foreground">{card.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
              {card.pending && <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{card.pending}</p>}
            </>
          );
          const cls = "block rounded-xl border border-border bg-card p-5 transition-colors";
          if (!card.link) return <div key={card.title} className={`${cls} opacity-80`}>{body}</div>;
          return card.link.startsWith("/") ? (
            <Link key={card.title} to={card.link} className={`${cls} hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</Link>
          ) : (
            <a key={card.title} href={card.link} className={`${cls} hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>{body}</a>
          );
        })}
      </div>
    </HqPageShell>
  );
};
