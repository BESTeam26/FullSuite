import {
  Workflow,
  ClipboardList,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Home,
  Timer,
  Lock,
  Eye,
} from "lucide-react";
import {
  PortalShell,
  type PortalNavItem,
} from "@/components/portals/PortalShell";
import { PermissionScopeCard } from "@/components/portals/PermissionScopeCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSeo } from "@/lib/use-seo";

const nav: PortalNavItem[] = [
  { label: "My Queue", href: "/outsourcing", icon: Home },
  { label: "Assigned Cases", href: "/outsourcing", icon: ClipboardList },
  { label: "QA Review", href: "/outsourcing", icon: ShieldCheck },
  { label: "SLA Tracker", href: "/outsourcing", icon: Timer },
];

const stats = [
  {
    label: "Assigned to me",
    value: "16",
    icon: ClipboardList,
    tone: "text-blue-600",
  },
  { label: "Due today", value: "4", icon: Clock, tone: "text-amber-600" },
  {
    label: "In QA review",
    value: "6",
    icon: ShieldCheck,
    tone: "text-purple-600",
  },
  {
    label: "First-pass QA rate",
    value: "96.2%",
    icon: CheckCircle2,
    tone: "text-emerald-600",
  },
];

const queue = [
  {
    client: "Client #A-4482",
    tenant: "Apex Credit Co.",
    stage: "Draft Letter",
    task: "Round 2 — Factual dispute (Balance)",
    due: "Today, 3:00 PM",
    priority: "High",
  },
  {
    client: "Client #A-1190",
    tenant: "Apex Credit Co.",
    stage: "Evidence Review",
    task: "Verify settlement document upload",
    due: "Today, 5:00 PM",
    priority: "Medium",
  },
  {
    client: "Client #A-7723",
    tenant: "Summit Credit Solutions",
    stage: "QA",
    task: "Round 1 letter — awaiting checker",
    due: "Tomorrow",
    priority: "Medium",
  },
  {
    client: "Client #A-2201",
    tenant: "Apex Credit Co.",
    stage: "Response Processing",
    task: "Classify CRA response letter",
    due: "Aug 31",
    priority: "Low",
  },
];

const priorityTone: Record<string, string> = {
  High: "bg-red-500/10 text-red-600",
  Medium: "bg-amber-500/10 text-amber-600",
  Low: "bg-slate-500/10 text-slate-600",
};

const OutsourcingPortal = () => {
  useSeo({
    title: "Outsourcing Portal — BES",
    description: "Outsourcing operations portal.",
    canonical: "/outsourcing",
    noindex: true,
  });
  return (
    <PortalShell
      title="Outsourcing Portal"
      subtitle="Managed operations console"
      icon={Workflow}
      gradientClass="bg-gradient-to-br from-indigo-500 to-blue-600"
      nav={nav}
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, Maria
          </h1>
          <p className="text-sm text-muted-foreground">
            Your assigned work queue — client identity fields are redacted per
            delegated access policy.
          </p>
        </div>
        <Badge className="flex items-center gap-1.5 bg-blue-500/10 px-3 py-1.5 text-blue-600">
          <Lock className="h-3.5 w-3.5" /> Delegated scope active
        </Badge>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <s.icon className={`h-4 w-4 ${s.tone}`} />
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="h-4 w-4 text-emerald-600" /> My work queue
          </h2>
          <Badge className="bg-muted text-muted-foreground">
            {queue.length} tasks
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {queue.map((q) => (
            <div
              key={q.client}
              className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{q.client}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {q.tenant}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{q.task}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={priorityTone[q.priority]}>{q.priority}</Badge>
                <span className="text-xs text-muted-foreground">{q.stage}</span>
                <span className="flex items-center gap-1 text-xs font-medium">
                  <Clock className="h-3 w-3" /> {q.due}
                </span>
                <Button disabled title="Sample content — this action connects when the live data model behind it exists"
                  size="sm"
                  className="bg-gradient-emerald text-white hover:opacity-90"
                >
                  Open task
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-700">
              Redacted view is active
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Full SSNs, payment methods, and tenant billing data are hidden
              from processor accounts. Contact a tenant admin if a task requires
              escalated access — every escalation is logged to the audit trail.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8 flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Eye className="h-4 w-4 text-emerald-600" />
        Access is time-limited to assigned tasks only — completed cases roll off
        your queue automatically after checker approval.
      </div>

      <PermissionScopeCard role="outsourcing" />
    </PortalShell>
  );
};

export default OutsourcingPortal;
