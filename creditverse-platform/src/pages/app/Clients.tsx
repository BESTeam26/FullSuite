import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  Plus,
  MoreHorizontal,
  Sparkles,
  ArrowUpRight,
  CircleAlert,
  Clock,
  Send,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMonitoringStatus, statusLabel } from "@/lib/monitoring-status";

type Client = {
  id: string;
  name: string;
  email: string;
  score: number;
  change: number;
  trend: number[];
  status: "Active" | "Onboarding" | "Dispute" | "Paused";
  round: string;
  roundProgress: number;
  disputes: number;
  deletions: number;
  lastActivity: string;
  nextAction: string;
  nextActionTone: "ready" | "attention" | "waiting";
  leadSource: "BES DIY Credit" | "Direct" | "Partner Referral" | "Inbound";
};

const clients: Client[] = [
  {
    id: "1",
    name: "Maria Gonzalez",
    email: "maria.g@email.com",
    score: 712,
    change: 58,
    trend: [640, 651, 662, 671, 684, 698, 712],
    status: "Active",
    round: "Round 3",
    roundProgress: 80,
    disputes: 14,
    deletions: 9,
    lastActivity: "2h ago",
    nextAction: "Ready to bill",
    nextActionTone: "ready",
    leadSource: "BES DIY Credit",
  },
  {
    id: "2",
    name: "James Whitaker",
    email: "jwhitaker@email.com",
    score: 648,
    change: 31,
    trend: [605, 611, 619, 624, 630, 639, 648],
    status: "Active",
    round: "Round 2",
    roundProgress: 55,
    disputes: 8,
    deletions: 4,
    lastActivity: "1d ago",
    nextAction: "Awaiting CRA response",
    nextActionTone: "waiting",
    leadSource: "BES DIY Credit",
  },
  {
    id: "3",
    name: "Tanya Brooks",
    email: "tanya.b@email.com",
    score: 689,
    change: 44,
    trend: [630, 640, 651, 660, 668, 678, 689],
    status: "Onboarding",
    round: "Intake",
    roundProgress: 20,
    disputes: 3,
    deletions: 0,
    lastActivity: "4h ago",
    nextAction: "Documents required",
    nextActionTone: "attention",
    leadSource: "Partner Referral",
  },
  {
    id: "4",
    name: "Devon Park",
    email: "devon.p@email.com",
    score: 601,
    change: 12,
    trend: [598, 596, 601, 599, 603, 600, 601],
    status: "Dispute",
    round: "Round 1",
    roundProgress: 35,
    disputes: 11,
    deletions: 6,
    lastActivity: "31d ago",
    nextAction: "Stalled — needs review",
    nextActionTone: "attention",
    leadSource: "Direct",
  },
  {
    id: "5",
    name: "Lena Ortiz",
    email: "lena.o@email.com",
    score: 734,
    change: 67,
    trend: [672, 685, 696, 704, 715, 726, 734],
    status: "Active",
    round: "Round 4",
    roundProgress: 95,
    disputes: 17,
    deletions: 13,
    lastActivity: "3h ago",
    nextAction: "Ready to bill",
    nextActionTone: "ready",
    leadSource: "Inbound",
  },
  {
    id: "6",
    name: "Marcus Lee",
    email: "marcus.l@email.com",
    score: 622,
    change: 24,
    trend: [600, 604, 609, 612, 615, 619, 622],
    status: "Paused",
    round: "Round 1",
    roundProgress: 10,
    disputes: 6,
    deletions: 2,
    lastActivity: "12d ago",
    nextAction: "Subscription paused",
    nextActionTone: "waiting",
    leadSource: "Direct",
  },
];

const statusVariant: Record<Client["status"], string> = {
  Active: "bg-emerald-500/10 text-emerald-600",
  Onboarding: "bg-blue-500/10 text-blue-600",
  Dispute: "bg-amber-500/10 text-amber-600",
  Paused: "bg-slate-500/10 text-slate-600",
};

const actionTone: Record<Client["nextActionTone"], string> = {
  ready: "bg-emerald-500/10 text-emerald-600",
  attention: "bg-red-500/10 text-red-600",
  waiting: "bg-slate-500/10 text-slate-600",
};

const actionIcon: Record<Client["nextActionTone"], typeof CheckCircle2> = {
  ready: CheckCircle2,
  attention: CircleAlert,
  waiting: Clock,
};

const tabs = ["All", "Active", "Onboarding", "Dispute", "Paused"] as const;

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 64;
      const y = 22 - ((v - min) / range) * 20;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "hsl(160 84% 39%)" : "hsl(0 84% 60%)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const Clients = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const { getState } = useMonitoringStatus();

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: clients.length };
    for (const cl of clients) c[cl.status] = (c[cl.status] ?? 0) + 1;
    return c;
  }, []);

  const readyToBill = clients.filter(
    (c) => c.nextActionTone === "ready",
  ).length;
  const needsAttention = clients.filter(
    (c) => c.nextActionTone === "attention",
  ).length;

  const filtered = clients.filter(
    (c) =>
      (tab === "All" || c.status === tab) &&
      c.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              Portfolio Management
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1 text-foreground">
            Client Workspaces ({clients.length})
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Active portfolio — prioritized by Lina AI next actions and
            compliance events.
          </p>
        </div>
        <Button className="bg-gradient-emerald text-white font-semibold shadow-sm hover:opacity-90">
          <Plus className="h-4 w-4 mr-1.5" /> Add Client
        </Button>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/80 p-5 text-emerald-50 shadow-sm">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-200">
            Portfolio insight
          </p>
          <p className="mt-0.5 text-sm text-emerald-100/90 leading-relaxed">
            <span className="font-semibold text-emerald-300">
              {readyToBill} clients
            </span>{" "}
            have a compliant billing event ready to invoice, and{" "}
            <span className="font-semibold text-red-300">
              {needsAttention} clients
            </span>{" "}
            have stalled disputes or missing documents that need review today.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          Review queue <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-gradient-emerald text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === t ? "bg-white/20" : "bg-muted"
                }`}
              >
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <SlidersHorizontal className="h-4 w-4" /> Smart filters
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Client</th>
              <th className="px-6 py-3 font-medium">Lead source</th>
              <th className="px-6 py-3 font-medium">Score trend</th>
              <th className="px-6 py-3 font-medium">Round progress</th>
              <th className="px-6 py-3 font-medium">Next best action</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Monitoring</th>
              <th className="px-6 py-3 font-medium">Active</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => {
              const ActionIcon = actionIcon[c.nextActionTone];
              const monitoring = getState(c.id);
              return (
                <tr
                  key={c.email}
                  onClick={() => navigate(`/app/clients/${c.id}`)}
                  className="group cursor-pointer hover:bg-muted/30"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-emerald text-xs font-semibold text-white">
                        {c.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.leadSource === "BES DIY Credit"
                          ? "bg-amber-500/10 text-amber-700"
                          : c.leadSource === "Partner Referral"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-slate-500/10 text-slate-600"
                      }`}
                    >
                      {c.leadSource}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Sparkline data={c.trend} positive={c.change >= 0} />
                      <div>
                        <p className="font-semibold">{c.score}</p>
                        <p className="text-xs font-medium text-emerald-600">
                          +{c.change}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {c.round}
                    </p>
                    <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-emerald"
                        style={{ width: `${c.roundProgress}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${actionTone[c.nextActionTone]}`}
                    >
                      <ActionIcon className="h-3.5 w-3.5" />
                      {c.nextAction}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusVariant[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        monitoring.status === "monitoring-issue"
                          ? "bg-red-500/10 text-red-600"
                          : monitoring.status === "needs-review"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {monitoring.status === "monitoring-issue" && (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {statusLabel(monitoring.status)}
                      {monitoring.attempts > 0 && (
                        <span className="rounded-full bg-black/10 px-1.5 text-[10px]">
                          {monitoring.attempts}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">
                    {c.lastActivity}
                  </td>
                  <td
                    className="px-6 py-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigate(`/app/clients/${c.id}`)}
                        >
                          Open client workspace
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          Open in Strategy Engine
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Send className="h-3.5 w-3.5" /> Send to processing
                        </DropdownMenuItem>
                        <DropdownMenuItem>Message client</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-1 py-16 text-center">
            <p className="font-medium">No clients match this view</p>
            <p className="text-sm text-muted-foreground">
              Try a different tab or search term.
            </p>
          </div>
        )}
      </div>

      <button className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5" /> Load more clients
      </button>
    </div>
  );
};

export default Clients;
