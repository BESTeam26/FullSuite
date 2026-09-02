import { useState } from "react";
import {
  History,
  Download,
  AlertTriangle,
  Send,
  Mail,
  Inbox,
  CheckCircle2,
  Search,
  ShieldQuestion,
  Package,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClientWorkspace } from "@/lib/client-workspace-context";

const timeline = [
  {
    date: "May 02",
    text: "Imported from SmartCredit",
    icon: Download,
    cls: "text-slate-500",
  },
  {
    date: "May 03",
    text: "Potential balance inconsistency detected",
    icon: AlertTriangle,
    cls: "text-amber-600",
  },
  {
    date: "May 05",
    text: "Round 1 dispute generated",
    icon: Send,
    cls: "text-indigo-600",
  },
  { date: "May 06", text: "Mailed USPS", icon: Mail, cls: "text-slate-500" },
  {
    date: "May 09",
    text: "Delivered",
    icon: CheckCircle2,
    cls: "text-emerald-600",
  },
  {
    date: "Jun 02",
    text: "CRA response received",
    icon: Inbox,
    cls: "text-slate-500",
  },
  {
    date: "Jun 03",
    text: "Result: VERIFIED",
    icon: AlertTriangle,
    cls: "text-amber-600",
  },
  {
    date: "Jun 03",
    text: "AI compared response against dispute",
    icon: Search,
    cls: "text-slate-500",
  },
  {
    date: "Jun 04",
    text: "Human processor reviewed",
    icon: CheckCircle2,
    cls: "text-slate-500",
  },
  {
    date: "Jun 05",
    text: "Method of Verification requested",
    icon: Send,
    cls: "text-indigo-600",
  },
  {
    date: "Jun 28",
    text: "New credit report imported",
    icon: Download,
    cls: "text-slate-500",
  },
  {
    date: "Jun 28",
    text: "STATUS: DELETED",
    icon: CheckCircle2,
    cls: "text-emerald-600",
  },
];

const accounts = [
  {
    id: "AC-118",
    name: "Portfolio Recovery",
    balance: "$3,418",
    status: "DELETED",
    cls: "bg-emerald-500/10 text-emerald-600",
  },
  {
    id: "AC-117",
    name: "Midland Funding",
    balance: "$4,820",
    status: "IN PROGRESS",
    cls: "bg-amber-500/10 text-amber-600",
  },
  {
    id: "AC-116",
    name: "Capital One",
    balance: "$1,240",
    status: "VERIFIED",
    cls: "bg-slate-500/10 text-slate-600",
  },
];

const workOrder = {
  client: "John Smith",
  company: "ABC Credit Solutions",
  task: "Round 2 Processing",
  sla: "24 Hours",
  checklist: [
    "Report imported",
    "Analysis complete",
    "Documents complete",
    "Agreement signed",
  ],
};

const Cases = ({ embedded = false }: { embedded?: boolean }) => {
  const [activeId, setActiveId] = useState("AC-118");
  const [sent, setSent] = useState(false);
  const { setTab } = useClientWorkspace();

  return (
    <div className={embedded ? "" : "p-6 md:p-8"}>
      <div className={embedded ? "mb-6" : "mb-8"}>
        <h1 className="text-2xl font-bold tracking-tight">
          Case Timeline & Fulfillment
        </h1>
        <p className="text-sm text-muted-foreground">
          Every account carries a permanent investigation record — import,
          detection, dispute, mailing, response, and result. Send work to your
          processing team with a single click.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Accounts
          </h2>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveId(a.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                activeId === a.id
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.name}</span>
                <span className="text-sm font-semibold">{a.balance}</span>
              </div>
              <div className="mt-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}
                >
                  {a.status}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold">
                Investigation record · Portfolio Recovery
              </h2>
            </div>
            <ol className="mt-5 space-y-4">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted/40 ${t.cls}`}
                    >
                      <t.icon className="h-4 w-4" />
                    </div>
                    {i < timeline.length - 1 && (
                      <div className="mt-1 h-full w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="pb-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t.date}
                    </p>
                    <p className="text-sm">{t.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-6 text-emerald-50 shadow-sm">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-400" />
              <h2 className="font-semibold text-emerald-200">
                Send to processing team
              </h2>
              <Badge className="ml-auto border-emerald-400/30 bg-emerald-900/50 text-emerald-200">
                Fulfillment
              </Badge>
            </div>
            <p className="mt-2 text-sm text-emerald-100/90 leading-relaxed">
              Software-only customers can hand work to your outsourced
              processing team. Your SaaS creates customers for your fulfillment
              service — and fulfillment creates sticky SaaS customers.
            </p>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                New work order
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Client</p>
                  <p className="font-medium">{workOrder.client}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Company</p>
                  <p className="font-medium">{workOrder.company}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Task</p>
                  <p className="font-medium">{workOrder.task}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3 w-3" /> SLA
                  </p>
                  <p className="font-medium">{workOrder.sla}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                {workOrder.checklist.map((c) => (
                  <p
                    key={c}
                    className="flex items-center gap-2 text-sm text-slate-200"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {c}
                  </p>
                ))}
              </div>
            </div>

            <Button
              onClick={() => setSent(true)}
              disabled={sent}
              className="mt-5 bg-gradient-emerald text-white hover:opacity-90 disabled:opacity-60"
            >
              {sent ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Work order sent to
                  processing
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" /> Send to processing team
                </>
              )}
            </Button>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-5">
            <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">
              The case timeline is the credit investigation record — every
              import, detection, dispute, mailing, response, and result is
              preserved immutably. For outsourcing, this is what makes work
              auditable across processors, checkers, and tenants.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cases;
