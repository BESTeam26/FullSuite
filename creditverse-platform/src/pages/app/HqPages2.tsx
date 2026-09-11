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
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PositionsSection } from "@/components/settings/sections/PositionsSection";
import { OrgChart } from "@/components/agency/OrgChart";
import { useWorkforce } from "@/lib/data/use-workforce";
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
/* Teams                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Teams answers "how is BES organized?" (Dee §5, §48): divisions, departments,
 * teams and leads, with Positions and the org chart as subviews of the same
 * structure rather than unrelated Settings destinations. Person management
 * is Team Members; this page reads the same canonical relationships.
 */
const TEAM_TABS = new Set(["structure", "positions", "org-chart"]);
export const TeamsPage = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") ?? "";
  const tab = TEAM_TABS.has(requested) ? requested : "structure";
  return (
    <HqPageShell
      title="Teams"
      description="Divisions, departments, teams and positions — the one structure Team Members, Work, EOD, production and partner assignment all read"
      icon={Network}
    >
      <Tabs value={tab} onValueChange={(v) => setParams(v === "structure" ? {} : { tab: v }, { replace: true })}>
        <TabsList className="h-8 flex-wrap bg-muted/60">
          <TabsTrigger value="structure" className="text-[11px]">Structure</TabsTrigger>
          <TabsTrigger value="positions" className="text-[11px]">Positions</TabsTrigger>
          <TabsTrigger value="org-chart" className="text-[11px]">Org chart</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="mt-3">
          <OrganizationStructure />
          <div className="mt-4">
            <TeamsManager />
          </div>
        </TabsContent>
        <TabsContent value="positions" className="mt-3"><PositionsSection /></TabsContent>
        <TabsContent value="org-chart" className="mt-3"><OrgChart /></TabsContent>
      </Tabs>
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
