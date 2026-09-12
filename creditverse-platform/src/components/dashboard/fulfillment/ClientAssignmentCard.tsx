/**
 * Round, assignee, and — for a Team Lead — the due date.
 *
 * Dee, 2026-09-11: "I also don't see a way to update the current Round,
 * Status, Assignee, SLA manual update."
 *
 * ── WHY THE DUE DATE IS NOT HERE FOR EVERYBODY ─────────────────────────────
 *
 * Round and assignee are ordinary operational facts an agent working the file
 * should be able to correct. A due date is not: it is the output of the SLA
 * policy, and letting anyone retype it turns a rule into a suggestion. So the
 * override sits behind `ops.manage`, requires a reason, and keeps the
 * system's own date beside it — Dee: "I do not want silent date edits that
 * destroy the original SLA logic."
 *
 * The credit status has its own control above (ClientStatusControl), which
 * owns the vocabulary and the legal moves between statuses. This does not
 * duplicate it.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { updateClientAssignee, updateClientField } from "@/lib/data/fulfillment-clients";
import { clearDueOverride, markMailed, setDueOverride } from "@/lib/data/client-workflow";
import { readSla, SLA_TONE_CLASS } from "@/lib/fulfillment/sla-display";
import type { Enums } from "@/lib/supabase/database.types";

const ROUNDS: Enums<"fulfillment_round">[] = [
  "Pre-Round", "Round 1", "Round 2", "Round 3", "Round 4+", "Round 5", "Round 6",
  "Round 7", "Round 8", "Round 9", "Round 10", "Round 11", "Round 12", "Round 13",
  "Completed",
];

export function ClientAssignmentCard({ clientId }: { clientId: string }) {
  const store = useCreditOpsStore();
  const client = store.clients.find((c) => c.id === clientId);
  const perms = useAgencyPermissions();
  const workforce = useWorkforce();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const canEdit = perms.can("creditops.clients.edit");
  const canOverride = perms.can("ops.manage");
  if (!client) return null;

  const people = workforce.data?.people ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["creditops"] });
    void qc.invalidateQueries({ queryKey: ["client-progress", clientId] });
    void qc.invalidateQueries({ queryKey: ["work"] });
  };
  const guard = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); refresh(); toast({ title: ok }); }
    catch (e) { toast({ title: "Could not save that", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const sla = readSla(client.slaHoursRemaining);

  return (
    <ContentCard title="Assignment & dates">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground">Current round</span>
          <OpsSelect
            size="field"
            aria-label="Current round"
            value={client.round ?? "Pre-Round"}
            onValueChange={(v) =>
              void guard("round",
                () => updateClientField({ clientId, round: v as Enums<"fulfillment_round"> }),
                "Round updated")
            }
            options={ROUNDS.map((r) => ({ value: r, label: r }))}
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground">Assigned agent</span>
          <OpsSelect
            size="field"
            aria-label="Assigned agent"
            value={client.assignedAgentId ?? "__none__"}
            onValueChange={(v) =>
              void guard("agent", () => updateClientAssignee(clientId, v === "__none__" ? null : v),
                v === "__none__" ? "Unassigned" : "Assigned")
            }
            options={[
              { value: "__none__", label: "Unassigned" },
              ...people.map((p) => ({ value: p.userId, label: p.name })),
            ]}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground">Processed date</span>
          <Input
            type="date"
            disabled={!canEdit || busy !== null}
            defaultValue={client.processedOn ?? ""}
            aria-label="Processed date"
            className="h-9 text-xs"
            onBlur={(e) => {
              const v = e.target.value || null;
              if (v === (client.processedOn ?? null)) return;
              void guard("processed", () => updateClientField({ clientId, processedOn: v }),
                v ? "Processed date saved" : "Processed date cleared");
            }}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            When this round was actually worked.
          </span>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-foreground">Mailed date</span>
          <Input
            type="date"
            disabled={!canEdit || busy !== null}
            aria-label="Mailed date"
            className="h-9 text-xs"
            onBlur={(e) => {
              if (!e.target.value) return;
              /* Setting the mailed date IS marking it mailed: the same event,
                 so it starts the same 30-day clock and releases the agent.
                 A date field that quietly did less than the button would be
                 two ways to record one fact. */
              void guard("mailed",
                () => markMailed(clientId, new Date(`${e.target.value}T12:00:00`).toISOString()),
                "Mailed date saved — 30-day wait starts from it");
            }}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Starts the 30-day wait and releases the agent.
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Due</span>
          <span className="font-medium text-foreground">{formatDate(client.dueAt)}</span>
          <span className={SLA_TONE_CLASS[sla.tone]}>{sla.label}</span>
        </div>
        {!canOverride && (
          <span className="text-[11px] text-muted-foreground">
            Calculated from the workflow
          </span>
        )}
      </div>

      {canOverride && (
        <details className="mt-3 rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Adjust dates / SLA
          </summary>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The calculated date is kept beside any override, and the change is recorded with
            your name and reason.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
            <Input
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              aria-label="Override due date"
              className="h-9 text-xs"
            />
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Why is this date different?"
              aria-label="Reason for the override"
              className="h-9 text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!overrideDate || !overrideReason.trim() || busy !== null}
                onClick={() =>
                  void guard("override",
                    () => setDueOverride(clientId, "Dispute", overrideDate, overrideReason.trim()),
                    "Due date overridden")
                }
              >
                {busy === "override" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void guard("clear", () => clearDueOverride(clientId, "Dispute"),
                    "Back to the calculated date")
                }
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> System
              </Button>
            </div>
          </div>
        </details>
      )}

      {!canEdit && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          You can see this file but not change its assignment.
        </p>
      )}
    </ContentCard>
  );
}
