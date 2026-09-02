import {
  Workflow,
  FolderKanban,
  Wrench,
  ShieldCheck,
  Eye,
  BookOpen,
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
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

const projects = [
  [
    "PRJ-101",
    "Apex Credit Co.",
    "GHL CRM Build",
    "In Progress",
    "Carlos M.",
    "60%",
  ],
  [
    "PRJ-102",
    "Pioneer Credit",
    "Automation Build",
    "QA Review",
    "Keila B.",
    "90%",
  ],
  [
    "PRJ-103",
    "Vantage Funding",
    "Website + Funnel",
    "In Progress",
    "Daniel R.",
    "35%",
  ],
  [
    "PRJ-104",
    "CreditFix Solutions",
    "AI Integration",
    "Draft",
    "Unassigned",
    "5%",
  ],
  [
    "PRJ-105",
    "Apex Credit Co.",
    "Maintenance Plan",
    "Completed",
    "Carlos M.",
    "100%",
  ],
];

export default function BesCrm() {
  const tabs: DivisionTab[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: BarChart3,
      render: () => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Active Projects" value={12} icon={FolderKanban} />
            <StatCard label="In Progress" value={7} icon={Clock} />
            <StatCard label="QA Review" value={3} icon={ShieldCheck} />
            <StatCard
              label="Completed Builds"
              value={28}
              icon={CheckCircle2}
              trend="+3 this month"
            />
          </div>
          <ContentCard title="Active Projects">
            <DivisionTable
              columns={[
                "Project",
                "Partner",
                "Type",
                "Status",
                "Owner",
                "Progress",
              ]}
              rows={projects.map((r) => [
                r[0],
                r[1],
                r[2],
                <StatusPill status={r[3] as string} />,
                r[4],
                <span className="font-medium">{r[5]}</span>,
              ])}
            />
          </ContentCard>
        </div>
      ),
    },
    {
      id: "partners",
      label: "Partners",
      icon: Users,
      render: () => (
        <ContentCard title="CRM Build Partners">
          <DivisionTable
            columns={["Organization", "Active Projects", "Completed", "Status"]}
            rows={[
              ["Apex Credit Co.", 2, 8, <StatusPill status="Active" />],
              ["Pioneer Credit", 1, 3, <StatusPill status="Active" />],
              ["Vantage Funding", 1, 2, <StatusPill status="Active" />],
              ["CreditFix Solutions", 1, 5, <StatusPill status="Active" />],
            ]}
          />
        </ContentCard>
      ),
    },
    {
      id: "projects",
      label: "Projects",
      icon: FolderKanban,
      render: () => (
        <ContentCard title="All Projects">
          <DivisionTable
            columns={[
              "Project",
              "Partner",
              "Type",
              "Status",
              "Owner",
              "Progress",
            ]}
            rows={projects.map((r) => [
              r[0],
              r[1],
              r[2],
              <StatusPill status={r[3] as string} />,
              r[4],
              <span className="font-medium">{r[5]}</span>,
            ])}
          />
        </ContentCard>
      ),
    },
    {
      id: "my-builds",
      label: "My Builds",
      icon: Wrench,
      render: () => (
        <ContentCard title="My Active Builds">
          <DivisionTable
            columns={["Project", "Partner", "Type", "Progress"]}
            rows={[
              ["PRJ-101", "Apex Credit Co.", "GHL CRM Build", "60%"],
              ["PRJ-105", "Apex Credit Co.", "Maintenance Plan", "100%"],
            ]}
          />
        </ContentCard>
      ),
    },
    {
      id: "qa",
      label: "QA / Review",
      icon: ShieldCheck,
      render: () => (
        <ContentCard title="QA Review Queue">
          <DivisionTable
            columns={["Project", "Partner", "Type", "Reviewer", "Status"]}
            rows={[
              [
                "PRJ-102",
                "Pioneer Credit",
                "Automation Build",
                "Keila B.",
                <StatusPill status="Review" />,
              ],
            ]}
          />
        </ContentCard>
      ),
    },
    {
      id: "monitoring",
      label: "Monitoring",
      icon: Eye,
      render: () => (
        <EmptyTab label="Active monitoring & maintenance contracts" />
      ),
    },
    {
      id: "resources",
      label: "Resources",
      icon: BookOpen,
      render: () => (
        <EmptyTab label="Build templates, snippets & resource library" />
      ),
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      render: () => <EmptyTab label="CRM build delivery reports" />,
    },
  ];

  return (
    <DivisionLayout
      title="BES CRM"
      description="Project-based CRM & automation delivery — GHL builds, websites, funnels, integrations"
      icon={Workflow}
      stats={[
        { label: "Active Projects", value: 12, icon: FolderKanban },
        { label: "In Progress", value: 7, icon: Clock },
        { label: "QA Review", value: 3, icon: ShieldCheck },
        {
          label: "Completed Builds",
          value: 28,
          icon: CheckCircle2,
          trend: "+3 this month",
        },
      ]}
      tabs={tabs}
    />
  );
}
