/**
 * FundingOps Operations Dashboard — Dee's design, visual: KPI tiles, files by
 * pipeline stage, waiting-on donut, team workload, lender distribution, and
 * the fourteen action queues as cards. Every number is a deterministic count
 * or sum over live rows the caller may see; nothing here is a forecast.
 */
import { useMemo } from "react";
import { AlertCircle, Banknote, BadgeDollarSign, CalendarClock, ClipboardList, Clock, DollarSign, FileCheck2, FilePlus2, FileSearch, FileSignature, FileWarning, Files, Landmark, ListChecks, Loader2, PenLine, RefreshCw, Send, TrendingUp, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { DonutLegend } from "@/components/dashboard/ops/DonutLegend";
import { HorizontalBars } from "@/components/dashboard/ops/HorizontalBars";
import { KpiTile, TONE_FILL, type KpiTone } from "@/components/dashboard/ops/KpiTile";
import { QueueCard } from "@/components/dashboard/ops/QueueCard";
import { StageBarChart } from "@/components/dashboard/ops/StageBarChart";
import { WorkloadList } from "@/components/dashboard/ops/WorkloadList";
import { useAgency } from "@/lib/agency-context";
import { useFundingQueueSignals } from "@/lib/data/use-funding-domain";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { QUEUES, queueMembers, waitingOnDistribution, type QueueKey } from "@/lib/funding/action-queues";
import { activeFiles, activeLenders, filesByStage, formatCompactMoney, fundedInMonth, lenderDistribution, totalApproved, totalRequested } from "@/lib/funding/dashboard-metrics";

const QUEUE_ICON: Record<QueueKey, { icon: LucideIcon; tone: KpiTone }> = {
  needs_client_action: { icon: ClipboardList, tone: "blue" },
  documents_missing: { icon: FileWarning, tone: "amber" },
  ready_for_file_review: { icon: FileSearch, tone: "purple" },
  ready_for_submission: { icon: Send, tone: "emerald" },
  lender_requirements_outstanding: { icon: ListChecks, tone: "amber" },
  offer_requires_review: { icon: BadgeDollarSign, tone: "green" },
  no_movement_48h: { icon: Clock, tone: "red" },
  overdue_tasks: { icon: AlertCircle, tone: "red" },
  closing_stipulations_outstanding: { icon: FileCheck2, tone: "amber" },
  awaiting_client_signature: { icon: PenLine, tone: "blue" },
  funding_confirmation_pending: { icon: Banknote, tone: "green" },
  renewal_review_due: { icon: RefreshCw, tone: "purple" },
  renewal_follow_up_due: { icon: CalendarClock, tone: "purple" },
  client_interested_new_file: { icon: FilePlus2, tone: "emerald" },
};
const WAITING_COLOR: Record<string, string> = { Client: TONE_FILL.emerald, "Internal Team": TONE_FILL.blue, Lender: TONE_FILL.amber, Documents: TONE_FILL.purple, "Third Party": TONE_FILL.green, Nothing: TONE_FILL.slate, Closing: TONE_FILL.red };

export default function FundingDashboard() {
  const { activeOrganization } = useAgency();
  const signals = useFundingQueueSignals();
  const { members } = useOrgMembers(activeOrganization?.id ?? null);
  const now = useMemo(() => new Date(), []);
  const data = signals.data;
  const input = useMemo(() => ({ files: data?.files ?? [], renewals: data?.renewals ?? [], overdueTasks: 0, now }), [data, now]);
  const members_ = useMemo(() => queueMembers(input), [input]);
  const needsAction = useMemo(() => new Set(Object.values(members_).flat()), [members_]);
  const active = useMemo(() => activeFiles(input.files), [input.files]);
  const waiting = useMemo(() => waitingOnDistribution(input.files), [input.files]);
  const stages = useMemo(() => filesByStage(input.files), [input.files]);
  const lenders = useMemo(() => lenderDistribution(data?.submissions ?? []), [data]);
  const workload = useMemo(() => {
    const by = new Map<string | null, { total: number; action: number; name: string | null }>();
    for (const f of active) { const row = by.get(f.assignedAgentId) ?? { total: 0, action: 0, name: f.assignedAgentName }; row.total += 1; if (needsAction.has(f.id)) row.action += 1; by.set(f.assignedAgentId, row); }
    return [...by.entries()].map(([id, v]) => ({ id: id ?? "unassigned", name: id ? v.name ?? members.find((m) => m.id === id)?.name ?? "Team member" : "Unassigned", total: v.total, action: v.action })).sort((a, b) => b.total - a.total);
  }, [active, needsAction, members]);
  const fileLabel = (id: string) => data?.fileNames[id] ?? id;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground">Funding fulfillment overview — every active Funding File at a glance.</p>
        </div>
        {signals.isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {signals.error && <p role="alert" className="text-xs text-status-danger">Could not load the dashboard.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <KpiTile label="Total Requested" value={formatCompactMoney(totalRequested(input.files))} icon={TrendingUp} tone="blue" />
        <KpiTile label="Total Approved" value={formatCompactMoney(totalApproved(data?.offers ?? []))} icon={Wallet} tone="emerald" hint="Open or accepted lender offers" />
        <KpiTile label="Active Files" value={active.length} icon={Files} tone="amber" />
        <KpiTile label="Needs Action" value={needsAction.size} icon={AlertCircle} tone="amber" attention={needsAction.size > 0} />
        <KpiTile label="Funded This Month" value={formatCompactMoney(fundedInMonth(data?.funded ?? [], now))} icon={DollarSign} tone="green" />
        <KpiTile label="Active Lenders" value={activeLenders(data?.submissions ?? [])} icon={Landmark} tone="purple" hint="With an open submission" />
        <KpiTile label="Team Members" value={workload.filter((w) => w.id !== "unassigned").length} icon={Users} tone="blue" hint="Carrying active files" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartCard title="Files by Pipeline Stage">
          <StageBarChart data={stages.map((s) => ({ label: s.stage, count: s.count }))} tone="emerald" />
        </ChartCard>
        <ChartCard title="Waiting On Distribution">
          <DonutLegend data={(Object.entries(waiting) as [string, number][]).map(([label, value]) => ({ label, value, color: WAITING_COLOR[label] ?? TONE_FILL.slate }))} emptyText="No active files" />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Team Workload" icon={Users}>
          <WorkloadList rows={workload} unit="file" emptyText="No active files." />
        </ChartCard>
        <ChartCard title="Lender Distribution" icon={Landmark}>
          <HorizontalBars data={lenders.map((l) => ({ label: l.lender, value: l.count }))} tone="blue" unit="Open submissions" emptyText="No open submissions yet." />
        </ChartCard>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><ClipboardList className="h-4 w-4 text-status-warning" /> Action Needed <span className="text-xs font-normal text-muted-foreground">Operational work queue — what requires attention now.</span></h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUEUES.map((q) => {
            const ids = members_[q.key];
            const { icon, tone } = QUEUE_ICON[q.key];
            return <QueueCard key={q.key} title={q.title} description={q.description} count={ids.length} icon={icon} tone={tone} items={ids.map((id) => ({ id, label: fileLabel(id), href: `/app/funding-files/${id}` }))} />;
          })}
        </div>
      </section>
    </div>
  );
}
