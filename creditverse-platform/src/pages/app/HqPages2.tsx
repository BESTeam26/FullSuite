import { useAgency } from "@/lib/agency-context";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { HqPageShell } from "@/pages/app/HqPages";
import { cn } from "@/lib/utils";
import { SampleContentNotice } from "@/components/dashboard/SampleContentNotice";
import { LiveCalendar } from "@/components/dashboard/LiveCalendar";
import { useAgencySettings } from "@/lib/agency-settings-context";
import { Link } from "react-router-dom";
import { useWorkforce } from "@/lib/data/use-workforce";
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

export const PeoplePage = () => {
  const wf = useWorkforce();
  const people = wf.data?.people ?? [];
  const time = new Map((wf.data?.time ?? []).map((t) => [t.employeeId, t]));
  const leadOf = new Map<string, string[]>();
  for (const t of wf.data?.teams ?? []) for (const m of t.members) leadOf.set(m.userId, [...(leadOf.get(m.userId) ?? []), t.name]);
  return (
    <HqPageShell title="People" description="BES agency staff — roles, teams and this week's time, from the live roster" icon={Users}>
      <ContentCard title={`Agency staff · ${people.length}`}>
        {wf.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading the roster…</p> : wf.error ? <p className="py-6 text-center text-sm text-status-danger">Could not load the roster.</p> : people.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No BES staff visible to you.</p> : (
          <DivisionTable
            columns={["Name", "Email", "Role", "Teams", "This week"]}
            rows={people.map((u) => [
              u.name,
              u.email,
              <StatusPill status={AGENCY_ROLE_LABEL[u.role] ?? u.role} />,
              (leadOf.get(u.userId) ?? []).join(", ") || "—",
              time.get(u.userId) ? `${fmtMinutes(time.get(u.userId)!.minutes)}${time.get(u.userId)!.running ? " · clocked in" : ""}` : "—",
            ])}
          />
        )}
      </ContentCard>
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* Teams                                                                 */
/* ------------------------------------------------------------------ */

export const TeamsPage = () => {
  const wf = useWorkforce();
  const teams = (wf.data?.teams ?? []).filter((t) => !t.archived);
  const names = new Map((wf.data?.people ?? []).map((p) => [p.userId, p.name]));
  return (
    <HqPageShell title="Teams" description="BES teams by division and department, with their leads and members" icon={Network}>
      {wf.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading teams…</p> : teams.length === 0 ? <ContentCard title="Teams"><p className="py-6 text-center text-sm text-muted-foreground">No BES teams yet. Create them in Agency Settings → Divisions / Teams.</p></ContentCard> : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((t) => {
            const leads = t.members.filter((m) => m.isLead).map((m) => names.get(m.userId) ?? "Team member");
            return (
              <ContentCard key={t.id} title={t.name}>
                <p className="text-xs text-muted-foreground">{[divisionLabel(t.division), t.department].filter(Boolean).join(" · ") || "No department"}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team lead</p><p className="font-medium text-foreground">{leads.join(", ") || "—"}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Members</p><p className="font-medium text-foreground">{t.members.length}</p></div>
                </div>
              </ContentCard>
            );
          })}
        </div>
      )}
    </HqPageShell>
  );
};

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
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* Billing & Revenue                                                     */
/* ------------------------------------------------------------------ */

export const BillingPage = () => (
  <HqPageShell
    title="Billing & Revenue"
    description="Platform MRR, usage metering, DFY fulfillment fees, and invoicing"
    icon={Receipt}
  >
    <SampleContentNotice what="These revenue figures illustrate the billing view; live MRR, metering and invoices arrive with the Authorize.Net connection and the plan catalogue." />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Platform MRR"
        value="$31,650"
        icon={DollarSign}
        trend="+14.2%"
      />
      <StatCard label="Usage / Metering" value="$6,624" icon={Receipt} />
      <StatCard label="DFY Fulfillment" value="$11,250" icon={Briefcase} />
      <StatCard label="DIY / Other" value="$5,281" icon={DollarSign} />
    </div>
    <div className="mt-5">
      <ContentCard
        title="Revenue Mix"
        action={
          <button type="button" disabled title="Live billing data arrives with the payment connection" className="text-xs font-medium text-muted-foreground">
            Export
          </button>
        }
      >
        <div className="space-y-3">
          {[
            ["Platform SaaS Subscriptions", "$8,495", "27%"],
            ["Usage / Metering", "$6,624", "21%"],
            ["DFY Fulfillment Fees", "$11,250", "36%"],
            ["DIY Credit & Other", "$5,281", "16%"],
          ].map(([label, amount, pct]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-foreground">{label}</span>
              <span className="w-20 text-right text-sm font-bold text-foreground">
                {amount}
              </span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-gold"
                  style={{ width: `${pct}` }}
                />
              </div>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {pct}
              </span>
            </div>
          ))}
        </div>
      </ContentCard>
    </div>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Announcements                                                         */
/* ------------------------------------------------------------------ */

export const AnnouncementsPage = () => (
  <HqPageShell
    title="Announcements"
    description="Company-wide updates and internal communications"
    icon={Megaphone}
  >
    <SampleContentNotice what="These announcements illustrate the format; company announcements will be posted here once the announcements model exists." />
    <div className="space-y-3">
      {[
        {
          title: "SOP Update v2.3",
          date: "Aug 31, 2026",
          body: "Updated dispute processing SOP with new Metro 2 field analysis workflow. All processors must review before next round.",
          tag: "Operations",
        },
        {
          title: "Output Benchmark — August",
          date: "Aug 29, 2026",
          body: "CreditOps division achieved 96.2% QA pass rate this month, up from 94.1% in July.",
          tag: "Performance",
        },
        {
          title: "System Release — v3.1",
          date: "Aug 28, 2026",
          body: "New PDF OCR report parser deployed. Manual HTML import now supports all 5 monitoring providers.",
          tag: "Product",
        },
      ].map((a) => (
        <ContentCard
          key={a.title}
          title={a.title}
          action={
            <span className="text-xs text-muted-foreground">{a.date}</span>
          }
        >
          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary mb-2">
            {a.tag}
          </span>
          <p className="text-sm text-muted-foreground">{a.body}</p>
        </ContentCard>
      ))}
    </div>
  </HqPageShell>
);

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
