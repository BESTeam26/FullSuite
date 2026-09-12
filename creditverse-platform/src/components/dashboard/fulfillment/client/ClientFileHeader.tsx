/**
 * One header. Everything an agent needs before they decide what to do.
 *
 * Dee, 2026-09-12, locked the contents: client, partner, round, the Active
 * badge, then the current work — department, work status, due/SLA, assigned
 * agent — and three controls: Complete Work, Report Blocker, More.
 *
 * ── WHAT IT REPLACED ───────────────────────────────────────────────────────
 *
 * A header, then a Lifecycle panel, then a Credit Status panel, then a link
 * row — four bands of chrome before any work. The lifecycle is a badge now and
 * its controls live under More; the credit status is a badge and changing it
 * is a work action.
 *
 * ── THE SLA IS A SENTENCE ──────────────────────────────────────────────────
 *
 * "4d remaining", never "902.4h". Dee ruled the raw arithmetic out twice, and
 * the one helper that formats it is shared with every queue so they cannot
 * word the same fact differently.
 */
import { ArrowLeft, MoreHorizontal, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { readSla, SLA_TONE_CLASS } from "@/lib/fulfillment/sla-display";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";

const Badge = ({ children, tone }: { children: React.ReactNode; tone: string }) => (
  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>
);

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <div className="mt-0.5 truncate text-xs font-semibold text-foreground">{children}</div>
  </div>
);

export function ClientFileHeader({
  client,
  current,
  canWork,
  canManage,
  onBack,
  onCompleteWork,
  onManage,
}: {
  client: FulfillmentClient;
  current: DepartmentStatus | null;
  canWork: boolean;
  canManage: boolean;
  onBack: () => void;
  onCompleteWork: () => void;
  onManage: () => void;
}) {
  const due = (client as FulfillmentClient & { dueAt?: string | null }).dueAt ?? null;
  const sla = readSla(client.slaHoursRemaining);
  const lifecycle = client.lifecycle ?? "active";

  return (
    <header className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to clients
          </button>
          <h1 className="truncate text-lg font-bold text-foreground">{client.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{clientGroupLabel(client)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="border-border bg-muted text-muted-foreground">{client.status}</Badge>
          <Badge tone="border-border bg-muted text-foreground">{client.round}</Badge>
          {/* Lifecycle is a badge, not a panel. Managing it is under More. */}
          <Badge
            tone={lifecycle === "active"
              ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
              : "border-border bg-muted text-muted-foreground"}
          >
            {lifecycle === "active" ? "Active" : lifecycle}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-t border-border px-4 py-3">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Current work">
            {current ? `${current.department} · ${current.status}` : <span className="text-muted-foreground">No open work</span>}
          </Fact>
          <Fact label="Due">
            {due ? formatDate(due) : <span className="text-muted-foreground">—</span>}
          </Fact>
          <Fact label="SLA">
            <span className={SLA_TONE_CLASS[sla.tone]}>{sla.label}</span>
          </Fact>
          <Fact label="Assigned to">
            {current?.assignee && current.assignee !== "Unassigned"
              ? current.assignee
              : <span className="text-muted-foreground">Unassigned</span>}
          </Fact>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canWork && <Button size="sm" onClick={onCompleteWork}>Complete Work</Button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="More">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">This client</DropdownMenuLabel>
              {canManage ? (
                <DropdownMenuItem className="text-xs" onSelect={onManage}>
                  <ShieldAlert className="mr-2 h-3.5 w-3.5" /> Manage client
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="text-xs">
                  Management controls need the ops.manage capability
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
                Client ID {client.id.slice(0, 8)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
