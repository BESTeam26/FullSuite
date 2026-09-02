import { useAgency } from "@/lib/agency-context";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { HqPageShell } from "@/pages/app/HqPages";
import { cn } from "@/lib/utils";
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

export const PeoplePage = () => {
  const { agencyUsers = [] } = useAgency() || {};
  const users =
    agencyUsers.length > 0
      ? agencyUsers
      : [
          {
            id: "ag-1",
            name: "Platform Admin",
            email: "admin@bes.io",
            role: "agency_owner",
          },
          {
            id: "ag-2",
            name: "Carlos Mendoza",
            email: "carlos@bes.io",
            role: "agency_team_lead",
          },
          {
            id: "ag-3",
            name: "Keila Betancourt",
            email: "keila@bes.io",
            role: "agency_agent",
          },
        ];
  return (
    <HqPageShell
      title="People"
      description="BES Agency employees — manage roles, scopes, and assignments"
      icon={Users}
    >
      <ContentCard title="Agency Employees">
        <DivisionTable
          columns={["Name", "Email", "Role", "Status"]}
          rows={users.map((u) => [
            u.name,
            u.email,
            u.role
              ?.replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            <StatusPill status="Active" />,
          ])}
        />
      </ContentCard>
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* Teams                                                                 */
/* ------------------------------------------------------------------ */

export const TeamsPage = () => (
  <HqPageShell
    title="Teams"
    description="Organizational teams and department structure"
    icon={Network}
  >
    <div className="grid gap-4 md:grid-cols-2">
      {[
        { name: "CreditOps Division", members: 6, lead: "Carlos Mendoza" },
        { name: "FundingOps Division", members: 4, lead: "Dana Pierce" },
        { name: "BES CRM Team", members: 3, lead: "Daniel Reyes" },
        { name: "TalentOps Team", members: 5, lead: "Liza Garcia" },
      ].map((team) => (
        <ContentCard key={team.name} title={team.name}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Team Lead</p>
              <p className="font-medium text-foreground">{team.lead}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Members</p>
              <p className="text-right text-lg font-bold text-foreground">
                {team.members}
              </p>
            </div>
          </div>
        </ContentCard>
      ))}
    </div>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Workforce                                                             */
/* ------------------------------------------------------------------ */

export const WorkforcePage = () => (
  <HqPageShell
    title="Workforce"
    description="Capacity, workload distribution, and workforce utilization"
    icon={Briefcase}
  >
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Total Agents" value={18} icon={Users} />
      <StatCard label="Available Now" value={12} icon={CheckCircle2} />
      <StatCard label="On Leave" value={2} icon={Clock} />
      <StatCard label="Utilization" value="82%" icon={Briefcase} />
    </div>
    <ContentCard title="Workload by Division">
      <div className="space-y-3">
        {[
          ["CreditOps", 6, 82],
          ["FundingOps", 4, 75],
          ["BES CRM", 3, 90],
          ["TalentOps", 5, 68],
        ].map(([div, count, util]) => (
          <div key={div as string} className="flex items-center gap-3">
            <span className="w-28 text-sm font-medium text-foreground">
              {div}
            </span>
            <span className="w-12 text-sm text-muted-foreground">
              {count as number} agents
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  (util as number) > 85
                    ? "bg-red-500"
                    : (util as number) > 70
                      ? "bg-amber-500"
                      : "bg-emerald-600",
                )}
                style={{ width: `${util}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm font-medium text-foreground">
              {util as string}%
            </span>
          </div>
        ))}
      </div>
    </ContentCard>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Billing & Revenue                                                     */
/* ------------------------------------------------------------------ */

export const BillingPage = () => (
  <HqPageShell
    title="Billing & Revenue"
    description="Platform MRR, usage metering, DFY fulfillment fees, and invoicing"
    icon={Receipt}
  >
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
          <button className="text-xs font-medium text-primary hover:underline">
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
    description="Upcoming deadlines, meetings, and operational events"
    icon={Calendar}
  >
    <ContentCard title="This Week">
      <div className="space-y-2">
        {[
          {
            day: "Today",
            time: "10:00 AM",
            title: "CreditOps Round 2 SLA — Maria Gonzalez",
            type: "Deadline",
          },
          {
            day: "Today",
            time: "2:00 PM",
            title: "QA Review — Anthony Ramos CFPB",
            type: "Review",
          },
          {
            day: "Tomorrow",
            time: "9:00 AM",
            title: "Weekly Workforce Standup",
            type: "Meeting",
          },
          {
            day: "Wed",
            time: "11:00 AM",
            title: "Apex Credit — Quarterly Business Review",
            type: "Meeting",
          },
          {
            day: "Thu",
            time: "3:00 PM",
            title: "FD-2002 Offer deadline — Triton Capital",
            type: "Deadline",
          },
          {
            day: "Fri",
            time: "5:00 PM",
            title: "EOD — Monthly close",
            type: "Deadline",
          },
        ].map((e) => (
          <div
            key={e.title}
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5"
          >
            <div className="w-16 shrink-0">
              <p className="text-xs font-bold text-foreground">{e.day}</p>
              <p className="text-[11px] text-muted-foreground">{e.time}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{e.title}</p>
            </div>
            <StatusPill
              status={
                e.type === "Deadline"
                  ? "Attention"
                  : e.type === "Review"
                    ? "Review"
                    : "Active"
              }
            />
          </div>
        ))}
      </div>
    </ContentCard>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* Support                                                               */
/* ------------------------------------------------------------------ */

export const SupportPage = () => (
  <HqPageShell
    title="Support"
    description="Get help, browse documentation, or contact the BES team"
    icon={LifeBuoy}
  >
    <div className="grid gap-4 md:grid-cols-3">
      {[
        {
          title: "Knowledge Base",
          desc: "SOPs, guides, and operational documentation",
          icon: "📚",
          link: "/app/education",
        },
        {
          title: "Contact Support",
          desc: "support@bes.io · (817) 985-3536",
          icon: "💬",
          link: "#",
        },
        {
          title: "System Status",
          desc: "All systems operational",
          icon: "✅",
          link: "#",
        },
        {
          title: "Release Notes",
          desc: "Latest platform updates and changelog",
          icon: "📝",
          link: "/app/announcements",
        },
        {
          title: "Video Tutorials",
          desc: "Watch walkthroughs of key workflows",
          icon: "🎬",
          link: "#",
        },
        {
          title: "Report a Bug",
          desc: "Submit an issue for engineering review",
          icon: "🐛",
          link: "#",
        },
      ].map((card) => (
        <a
          key={card.title}
          href={card.link}
          className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <div className="mb-3 text-2xl">{card.icon}</div>
          <h3 className="font-semibold text-foreground">{card.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
        </a>
      ))}
    </div>
  </HqPageShell>
);
