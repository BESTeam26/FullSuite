import {
  UserCheck,
  Users,
  Briefcase,
  Clock,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
  Star,
  Activity,
} from "lucide-react";
import {
  DivisionLayout,
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
  EmptyTab,
  type DivisionTab,
} from "@/components/dashboard/DivisionLayout";

const agents = [
  ["Maria Santos", "CreditOps Processor", "Apex Credit Co.", "Active", "4.8"],
  ["Juan Dela Cruz", "Funding Admin", "CreditFix Solutions", "Active", "4.6"],
  ["Ana Reyes", "Appointment Setter", "Pioneer Credit", "Active", "4.9"],
  ["Carlos Tan", "VA — General", "Vantage Funding", "On Leave", "4.3"],
  ["Liza Garcia", "Sales Support", "Apex Credit Co.", "Active", "4.7"],
];

export default function TalentOps() {
  const tabs: DivisionTab[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: BarChart3,
      render: () => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Assigned Agents" value={18} icon={UserCheck} />
            <StatCard label="Active Placements" value={14} icon={Briefcase} />
            <StatCard label="Open Roles" value={5} icon={Users} />
            <StatCard
              label="Avg Performance"
              value="4.6/5"
              icon={Star}
              trend="+0.2"
            />
          </div>
          <ContentCard title="Assigned Agents">
            <DivisionTable
              columns={["Agent", "Role", "Partner Org", "Status", "Rating"]}
              rows={agents.map((r) => [
                r[0],
                r[1],
                r[2],
                <StatusPill status={r[3] as string} />,
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-status-warning fill-amber-500" />
                  {r[4]}
                </span>,
              ])}
            />
          </ContentCard>
          <div className="grid gap-4 md:grid-cols-2">
            <ContentCard title="Workload Distribution">
              <div className="space-y-2">
                {[
                  ["CreditOps Processing", 6],
                  ["FundingOps Admin", 4],
                  ["Appointment Setting", 3],
                  ["Sales Support", 3],
                  ["General VA", 2],
                ].map(([label, count]) => (
                  <div
                    key={label as string}
                    className="flex items-center gap-3"
                  >
                    <span className="flex-1 text-sm text-foreground">
                      {label}
                    </span>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${((count as number) / 6) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-sm font-medium text-foreground">
                      {count as number}
                    </span>
                  </div>
                ))}
              </div>
            </ContentCard>
            <ContentCard title="Open Roles">
              <div className="space-y-2">
                {[
                  ["CreditOps Processor — Pioneer Credit", "Hiring"],
                  ["Funding Admin — Empire Capital", "Hiring"],
                  ["2x VA — Apex Credit Co.", "Screening"],
                ].map(([label, status]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-sm text-foreground">{label}</span>
                    <StatusPill status={status} />
                  </div>
                ))}
              </div>
            </ContentCard>
          </div>
        </div>
      ),
    },
    {
      id: "partners",
      label: "Partners",
      icon: Users,
      render: () => (
        <ContentCard title="TalentOps Partner Organizations">
          <DivisionTable
            columns={[
              "Organization",
              "Assigned Agents",
              "Open Roles",
              "Status",
            ]}
            rows={[
              ["Apex Credit Co.", 4, 0, <StatusPill status="Active" />],
              ["Pioneer Credit", 2, 1, <StatusPill status="Active" />],
              ["CreditFix Solutions", 3, 0, <StatusPill status="Active" />],
              ["Vantage Funding", 2, 1, <StatusPill status="Active" />],
              ["Empire Capital", 1, 2, <StatusPill status="Active" />],
            ]}
          />
        </ContentCard>
      ),
    },
    {
      id: "agents",
      label: "Assigned Agents",
      icon: UserCheck,
      render: () => (
        <ContentCard title="Agent Roster">
          <DivisionTable
            columns={["Agent", "Role", "Partner Org", "Status", "Rating"]}
            rows={agents.map((r) => [
              r[0],
              r[1],
              r[2],
              <StatusPill status={r[3] as string} />,
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-status-warning fill-amber-500" />
                {r[4]}
              </span>,
            ])}
          />
        </ContentCard>
      ),
    },
    {
      id: "work",
      label: "Work",
      icon: Activity,
      render: () => <EmptyTab label="Agent work assignments & task tracking" />,
    },
    {
      id: "workload",
      label: "Workload",
      icon: Briefcase,
      render: () => (
        <EmptyTab label="Workload distribution & capacity planning" />
      ),
    },
    {
      id: "escalations",
      label: "Escalations",
      icon: AlertTriangle,
      render: () => (
        <ContentCard title="Active Escalations">
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              <span className="text-sm text-foreground">
                Performance concern — Carlos Tan (Vantage Funding)
              </span>
            </div>
          </div>
        </ContentCard>
      ),
    },
    {
      id: "quality",
      label: "Quality",
      icon: ShieldCheck,
      render: () => <EmptyTab label="Quality scores & QA reviews" />,
    },
    {
      id: "time",
      label: "Time",
      icon: Clock,
      render: () => <EmptyTab label="Agent time tracking & attendance" />,
    },
    {
      id: "performance",
      label: "Performance",
      icon: Star,
      render: () => <EmptyTab label="Performance reviews & ratings" />,
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      render: () => <EmptyTab label="TalentOps operational reports" />,
    },
  ];

  return (
    <DivisionLayout
      title="TalentOps"
      description="Managed staffing & agent delivery — VAs, processors, appointment setters, sales support"
      icon={UserCheck}
      stats={[
        { label: "Assigned Agents", value: 18, icon: UserCheck },
        { label: "Active Placements", value: 14, icon: Briefcase },
        { label: "Open Roles", value: 5, icon: Users },
        { label: "Avg Performance", value: "4.6/5", icon: Star, trend: "+0.2" },
      ]}
      tabs={tabs}
    />
  );
}
