import { useAgency } from "@/lib/agency-context";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { AgencyAccessPanel } from "@/components/agency/AgencyAccessPanel";
import { HqPageShell } from "@/pages/app/HqPages";
import { cn } from "@/lib/utils";
import { LiveCalendar } from "@/components/dashboard/LiveCalendar";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { Link } from "react-router-dom";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/auth/use-permission";
import { AnnouncementsBoard } from "@/components/intranet/AnnouncementsBoard";
import {
  Users,
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
/* ------------------------------------------------------------------ */
/* Billing & Revenue                                                     */
/* ------------------------------------------------------------------ */

/**
 * Billing & Revenue.
 *
 * Twice now this page has shown money that did not exist. First a set of
 * hardcoded figures ("$31,650 platform MRR"). Then the panel that replaced
 * them, which was described as reading the database and did not: it multiplied
 * each organization by a price list written into the component, invented an
 * invoice number and a due date, and offered a "Dispatch Stripe Invoice"
 * button that only raised a toast — for a provider that is not in the stack.
 *
 * Dee moved invoicing to GoHighLevel on 2026-09-22 and had the platform's own
 * invoices deleted. So this page now says exactly that, and shows nothing.
 * The engine behind it is untouched and paused, not removed: the tables,
 * functions, the dunning policy and PayInvoicePanel are all still there, and
 * the five billing cron jobs are deactivated rather than unscheduled
 * (migration 20260922019000). A figure returns here when it is measured.
 */
export const BillingPage = () => (
  <HqPageShell
    title="Billing & Revenue"
    description="Invoicing runs in GoHighLevel."
    icon={Receipt}
  >
    <ContentCard title="The platform is not invoicing right now">
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          BES invoices partners through GoHighLevel. This platform is not
          generating invoices, not sending payment reminders, and not charging
          cards on file. The invoices created here before 22 September 2026
          were deleted.
        </p>
        <p>
          Nothing was removed — invoicing, reminders and card payment are
          switched off and can be switched back on. Until then, what a partner
          owes lives in GoHighLevel, not here.
        </p>
      </div>
    </ContentCard>
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
