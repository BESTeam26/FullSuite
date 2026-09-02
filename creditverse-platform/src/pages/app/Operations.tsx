import { useState } from "react";
import {
  Workflow,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Gauge,
  BellRing,
  Send,
  Sparkles,
  MessageSquare,
  Mail,
  Smartphone,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const queue = [
  {
    id: "WK-2207",
    client: "Maria Gonzalez",
    tenant: "Apex Credit Co.",
    issue: "Balance mismatch",
    stage: "QA",
    due: "Today",
    worker: "Analyst: R. Cruz",
    sla: "on",
  },
  {
    id: "WK-2206",
    client: "Devon Park",
    tenant: "Summit Credit",
    issue: "Responsibility",
    stage: "Drafting",
    due: "Today",
    worker: "Analyst: M. Tan",
    sla: "on",
  },
  {
    id: "WK-2205",
    client: "Lena Ortiz",
    tenant: "Apex Credit Co.",
    issue: "Account status",
    stage: "QA",
    due: "Tomorrow",
    worker: "Analyst: R. Cruz",
    sla: "on",
  },
  {
    id: "WK-2204",
    client: "James Whitaker",
    tenant: "BlueLine Repair",
    issue: "DOFD",
    stage: "Drafting",
    due: "Overdue 2d",
    worker: "Analyst: M. Tan",
    sla: "over",
  },
  {
    id: "WK-2203",
    client: "Tanya Brooks",
    tenant: "Summit Credit",
    issue: "Duplicate tradeline",
    stage: "QA",
    due: "Today",
    worker: "Checker: S. Patel",
    sla: "on",
  },
];

const metrics = [
  { label: "First-pass QA rate", value: "94%", icon: CheckCircle2 },
  { label: "Evidence-complete", value: "88%", icon: Eye },
  { label: "Avg turnaround", value: "1.8d", icon: Clock },
  { label: "Over-SLA", value: "3", icon: AlertTriangle },
];

const throughput = [
  { d: "Mon", qa: 18, draft: 12 },
  { d: "Tue", qa: 22, draft: 15 },
  { d: "Wed", qa: 19, draft: 14 },
  { d: "Thu", qa: 27, draft: 18 },
  { d: "Fri", qa: 24, draft: 16 },
];

const stageColor: Record<string, string> = {
  Drafting: "bg-indigo-500/10 text-indigo-600",
  QA: "bg-amber-500/10 text-amber-600",
};

const Operations = () => {
  const [testSent, setTestSent] = useState<string | null>(null);

  const simulateTrigger = (triggerName: string) => {
    setTestSent(triggerName);
    setTimeout(() => setTestSent(null), 4000);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="border-b border-border/60 pb-5">
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold px-2.5 py-0.5 shadow-sm">
            <Workflow className="h-3.5 w-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />{" "}
            Fulfillment Operations
          </Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1.5 text-foreground">
          Managed Operations & Workflow Automations
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cross-tenant work queues with maker-checker QA, SLAs, and automated
          notification triggers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <m.icon className="h-5 w-5" />
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">
              {m.value}
            </p>
            <p className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
              {m.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Priority work queue</h2>
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Worker</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-emerald-600">
                      {t.id}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.tenant}
                    </td>
                    <td className="px-4 py-3">{t.issue}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${stageColor[t.stage]}`}
                      >
                        {t.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.worker}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          t.sla === "over"
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {t.due}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Daily throughput</h2>
          </div>
          <div className="mt-6 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughput}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="d"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar dataKey="draft" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="qa" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AutoFox Workflow Notification Triggers */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <BellRing className="h-5 w-5 text-purple-600" /> Automated
              Workflow Notification Triggers
            </h2>
            <p className="text-sm text-muted-foreground">
              Multi-channel client notifications (SMS, Email, Portal) fired
              automatically on round milestones, progress reports, & monitoring
              events.
            </p>
          </div>
          <Badge className="bg-purple-500/10 text-purple-600 border-none">
            Active Triggers
          </Badge>
        </div>

        {testSent && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700 flex items-center gap-2 animate-in fade-in">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>
              Simulated Trigger Success: <strong>{testSent}</strong> dispatched
              via SMS & Client Portal.
            </span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Round 1 Mailed</span>
              <Badge variant="outline" className="text-[10px]">
                Auto SMS + Portal
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Sends client immediate notification once Round 1 TRAP filing is
              completed and uploaded/mailed.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateTrigger("Round 1 Mailed SMS")}
              className="w-full text-xs"
            >
              <Send className="h-3 w-3 mr-1.5" /> Test Dispatch
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                Progress Report Ready
              </span>
              <Badge variant="outline" className="text-[10px]">
                Auto SMS + Email
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Fires AI progress summary with total score increase, deletions
              confirmed, and Portal link.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateTrigger("Progress Report Alert")}
              className="w-full text-xs"
            >
              <Send className="h-3 w-3 mr-1.5" /> Test Dispatch
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-red-600">
                Monitoring Issue Alert
              </span>
              <Badge
                variant="outline"
                className="text-[10px] text-red-600 border-red-500/30"
              >
                Immediate Priority
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Triggers when credit monitoring login fails or password changes,
              guiding client to update credentials.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateTrigger("Monitoring Password Alert")}
              className="w-full text-xs text-red-600 border-red-500/30 hover:bg-red-500/10"
            >
              <ShieldAlert className="h-3 w-3 mr-1.5" /> Test Dispatch
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm text-muted-foreground">
          Outsourced workers get time-limited delegated scopes (CASE_READ,
          ISSUE_REVIEW, LETTER_DRAFT, LETTER_QA) — never full SSN, payment, or
          tenant billing access. No worker can both draft and send without a
          separate checker.
        </p>
      </div>
    </div>
  );
};

export default Operations;
