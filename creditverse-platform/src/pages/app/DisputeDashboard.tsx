/**
 * CreditOps Dispute Dashboard — visual, same shape as the FundingOps
 * Operations Dashboard: KPI tiles, clients by round, letters by status, team
 * workload, open letters by bureau, and the twelve action queues as cards.
 * Counts over live rows the caller may see; the clocks are the statutory
 * timers recorded when letters were mailed — the dashboard invents none.
 */
import { useMemo } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Eye, FileClock, FileSearch, FileWarning, Hourglass, Loader2, Mail, MailQuestion, PenLine, RotateCcw, ScanSearch, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ops/ChartCard";
import { DonutLegend } from "@/components/dashboard/ops/DonutLegend";
import { HorizontalBars } from "@/components/dashboard/ops/HorizontalBars";
import { KpiTile, TONE_FILL, type KpiTone } from "@/components/dashboard/ops/KpiTile";
import { QueueCard } from "@/components/dashboard/ops/QueueCard";
import { StageBarChart } from "@/components/dashboard/ops/StageBarChart";
import { WorkloadList } from "@/components/dashboard/ops/WorkloadList";
import { useAgency } from "@/lib/agency-context";
import { useDisputeSignals } from "@/lib/data/use-dispute-dashboard";
import { useOrgMembers } from "@/lib/data/use-workspaces";
import { clientsByRound, clientsNeedingAction, DISPUTE_QUEUES, disputeQueueMembers, lettersByStatus, type DisputeQueueKey } from "@/lib/dispute/dispute-queues";

const QUEUE_ICON: Record<DisputeQueueKey, { icon: LucideIcon; tone: KpiTone }> = {
  drafts_awaiting_attestation: { icon: PenLine, tone: "blue" },
  ready_for_approval: { icon: ShieldCheck, tone: "purple" },
  approved_not_mailed: { icon: Mail, tone: "emerald" },
  reinvestigation_due_soon: { icon: Hourglass, tone: "amber" },
  response_overdue: { icon: AlertCircle, tone: "red" },
  responses_to_review: { icon: MailQuestion, tone: "green" },
  findings_need_review: { icon: ScanSearch, tone: "purple" },
  round_complete: { icon: CheckCircle2, tone: "emerald" },
  no_report_on_file: { icon: FileWarning, tone: "amber" },
  no_movement: { icon: FileClock, tone: "red" },
  awaiting_response_no_clock: { icon: CalendarClock, tone: "amber" },
  reinsertion_watch: { icon: Eye, tone: "slate" },
};
const LETTER_STATUS: { key: "draft" | "approved" | "printed" | "mailed" | "responded"; label: string; color: string }[] = [
  { key: "draft", label: "Draft", color: TONE_FILL.slate }, { key: "approved", label: "Approved", color: TONE_FILL.purple }, { key: "printed", label: "Printed", color: TONE_FILL.blue },
  { key: "mailed", label: "Mailed — awaiting response", color: TONE_FILL.emerald }, { key: "responded", label: "Responded", color: TONE_FILL.green },
];
const BUREAU_LABEL: Record<string, string> = { EQ: "Equifax", EX: "Experian", TU: "TransUnion" };
const DAY = 86_400_000;

export default function DisputeDashboard() {
  const { activeOrganization } = useAgency();
  const signals = useDisputeSignals();
  const { members } = useOrgMembers(activeOrganization?.id ?? null);
  const now = useMemo(() => new Date(), []);
  const d = signals.data;
  const input = useMemo(() => ({ clients: d?.clients ?? [], letters: d?.letters ?? [], timers: d?.timers ?? [], findings: d?.findings ?? [], openRounds: d?.openRounds ?? [], now }), [d, now]);
  const queueMembers = useMemo(() => disputeQueueMembers(input), [input]);
  const needsAction = useMemo(() => clientsNeedingAction(queueMembers), [queueMembers]);
  const rounds = useMemo(() => clientsByRound(input.clients), [input.clients]);
  const letterStatus = useMemo(() => lettersByStatus(input.letters), [input.letters]);
  const active = useMemo(() => input.clients.filter((c) => c.lifecycle === "active"), [input.clients]);
  const clientName = useMemo(() => Object.fromEntries(input.clients.map((c) => [c.id, `${c.name}${c.publicId ? ` · ${c.publicId}` : ""}`])), [input.clients]);
  const mailedThisMonth = input.letters.filter((l) => l.mailedAt && new Date(l.mailedAt).getUTCFullYear() === now.getUTCFullYear() && new Date(l.mailedAt).getUTCMonth() === now.getUTCMonth()).length;
  const clocksDueSoon = input.timers.filter((t) => t.kind === "reinvestigation" && Date.parse(t.dueAt) >= now.getTime() && Date.parse(t.dueAt) <= now.getTime() + 7 * DAY).length;
  const byBureau = useMemo(() => {
    const by = new Map<string, number>();
    for (const l of input.letters) if (l.status !== "closed") { const k = l.bureau ? BUREAU_LABEL[l.bureau] ?? l.bureau : l.recipientKind === "cra" ? "Bureau (unspecified)" : "Furnisher / other"; by.set(k, (by.get(k) ?? 0) + 1); }
    return [...by.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [input.letters]);
  const workload = useMemo(() => {
    const by = new Map<string | null, { total: number; action: number; name: string | null }>();
    for (const c of active) { const row = by.get(c.assignedAgentId) ?? { total: 0, action: 0, name: c.assignedAgentName }; row.total += 1; if (needsAction.has(c.id)) row.action += 1; by.set(c.assignedAgentId, row); }
    return [...by.entries()].map(([id, v]) => ({ id: id ?? "unassigned", name: id ? v.name ?? members.find((m) => m.id === id)?.name ?? "Team member" : "Unassigned", total: v.total, action: v.action })).sort((a, b) => b.total - a.total);
  }, [active, needsAction, members]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dispute Dashboard</h1>
          <p className="text-sm text-muted-foreground">CreditOps overview — every active client, round, letter and statutory clock at a glance.</p>
        </div>
        {signals.isLoading && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {signals.error && <p role="alert" className="text-xs text-status-danger">Could not load the dashboard.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <KpiTile label="Active Clients" value={active.length} icon={Users} tone="blue" />
        <KpiTile label="Needs Action" value={needsAction.size} icon={AlertCircle} tone="amber" attention={needsAction.size > 0} />
        <KpiTile label="Letters Mailed This Month" value={mailedThisMonth} icon={Mail} tone="emerald" />
        <KpiTile label="Awaiting Response" value={letterStatus.mailed} icon={MailQuestion} tone="purple" hint="Mailed letters, no response yet" />
        <KpiTile label="Clocks Due in 7 Days" value={clocksDueSoon} icon={Hourglass} tone="amber" attention={clocksDueSoon > 0} hint="30-day reinvestigation" />
        <KpiTile label="Findings to Review" value={input.findings.length} icon={FileSearch} tone="purple" />
        <KpiTile label="Rounds in Progress" value={input.openRounds.length} icon={RotateCcw} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <ChartCard title="Active Clients by Round">
          <StageBarChart data={rounds.map((r) => ({ label: r.round, count: r.count }))} tone="blue" height={240} />
        </ChartCard>
        <ChartCard title="Open Letters by Status">
          <DonutLegend data={LETTER_STATUS.map((s) => ({ label: s.label, value: letterStatus[s.key], color: s.color }))} emptyText="No open letters" />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Team Workload" icon={Users}>
          <WorkloadList rows={workload} unit="client" emptyText="No active clients." />
        </ChartCard>
        <ChartCard title="Open Letters by Recipient" icon={Mail}>
          <HorizontalBars data={byBureau} tone="purple" unit="Letters" emptyText="No open letters yet." />
        </ChartCard>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-foreground"><ClipboardList className="h-4 w-4 text-status-warning" /> Action Needed <span className="text-xs font-normal text-muted-foreground">Operational work queue — what requires attention now.</span></h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {DISPUTE_QUEUES.map((q) => {
            const ids = queueMembers[q.key];
            const { icon, tone } = QUEUE_ICON[q.key];
            return <QueueCard key={q.key} title={q.title} description={q.description} count={ids.length} icon={icon} tone={tone} informational={q.key === "reinsertion_watch"} items={ids.map((id) => ({ id, label: clientName[id] ?? id, href: `/app/creditops/cases/${id}` }))} />;
          })}
        </div>
      </section>
    </div>
  );
}
