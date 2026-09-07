/**
 * The client work file's header bar.
 *
 * ── EVERYTHING HERE COMES FROM THE RECORD ──────────────────────────────────
 *
 * It did not. The right-hand side carried a hardcoded "Due 6/8/2026", "83d
 * overdue" and "SLA Status: DUE IN 36D", and the left carried a fixed "ADMIN"
 * chip and "TEAM: TEST CREDITOPS QA TEAM" — shown identically on EVERY client,
 * including a real one somebody had just created. Dee found it on a client
 * added five minutes earlier.
 *
 * A date is a promise about work. Inventing one is worse than showing nothing,
 * because somebody acts on it. So: the due date is the record's own, "no due
 * date" is written when there is none, and the SLA reads from
 * `slaHoursRemaining` or is absent.
 */

import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { useTeams } from "@/lib/data/use-teams";
import { formatDate } from "@/lib/format-date";

interface Props {
  client: FulfillmentClient;
  onBack: () => void;
}

/** Whole days between a due date and today, negative when it has passed. */
function daysUntil(due: string | null | undefined): number | null {
  if (!due) return null;
  const at = Date.parse(`${String(due).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((at - today) / 86_400_000);
}

export function ClientWorkHeader({ client, onBack }: Props) {
  const partner = getPartnerByScope(
    client.organizationId ?? client.outsourcingGroupId ?? "",
  );
  const teams = useTeams();
  const team = teams.teams.find((t) => t.id === client.teamId);

  const due = (client as FulfillmentClient & { dueAt?: string | null }).dueAt ?? null;
  const days = daysUntil(due);
  const sla = client.slaHoursRemaining;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-b border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="mr-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="text-base font-extrabold text-foreground">{client.name}</h1>

        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-700">
          {client.status}
        </span>

        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          {partner?.name ?? clientGroupLabel(client)}
        </span>

        {/* Only when the record names one. A team label nobody set is a lie
            about who owns the work. */}
        {team && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Team: {team.name}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {due ? (
          <span className="text-muted-foreground">
            Due {formatDate(due)}
            {days !== null && days < 0 && (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-bold text-status-danger">
                <AlertTriangle className="h-3 w-3" /> {Math.abs(days)}d overdue
              </span>
            )}
            {days !== null && days >= 0 && days <= 3 && (
              <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-800">
                {days === 0 ? "due today" : `${days}d left`}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">No due date set</span>
        )}

        {sla !== undefined && sla !== null && (
          <span className="rounded bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
            SLA:{" "}
            <strong className="text-foreground">
              {sla <= 0 ? "breached" : `${Math.round(sla)}h left`}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}
