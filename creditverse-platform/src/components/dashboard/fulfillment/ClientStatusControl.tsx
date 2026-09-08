/**
 * The client's master status. The one place it changes.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Dee's locked doctrine: Complete Work records production, actions and the
 * next-step handoff, and does NOT change the master status. I removed the
 * selector from Complete Work for exactly that reason — and §12 said "the
 * dedicated Status control elsewhere may continue working", which I took on
 * trust instead of checking.
 *
 * There wasn't one. The header showed the status as a BADGE and the only
 * other control on the page was Lifecycle, which is a different thing
 * entirely (Active / Archived / Completed / Graduated). So removing the wrong
 * control left no right one, and Dee could not move a file out of Onboarding
 * at all.
 *
 * This is that control: deliberate, on its own, and nowhere near Complete
 * Work.
 *
 * ── THE VOCABULARY IS NOT MINE ────────────────────────────────────────────
 *
 * §12: "Do NOT touch fulfillment_client_status, status enums, status labels,
 * round-status migrations, approved dispute vocabulary."
 *
 * So the options are read from `Constants.public.Enums.fulfillment_client_status`
 * — the generated mirror of the database enum. Not a hand-written list beside
 * it. A value the database accepts is a value this offers, and adding one is
 * a migration plus a regenerate, never an edit here. This is the same file
 * that lost Dee's vocabulary once before by substituting a "cleaner" list.
 *
 * ── STATUS IS NOT LIFECYCLE, AND NOT A DEPARTMENT ─────────────────────────
 *
 * Three separate things, and the panel says so, because Dee asked to move a
 * file to "Round 1 or processing or complaints" and only two of those are
 * statuses. Complaints is a DEPARTMENT — opened by handing off in Complete
 * Work, and shown in Department Progress. Conflating them is what the
 * doctrine exists to prevent.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { updateClientStatus } from "@/lib/data/fulfillment-clients";
import { Constants } from "@/lib/supabase/database.types";
import { creditStatuses, creditStatusOptionsFor } from "@/lib/fulfillment/department-domain";
import { isStatusAutoSynced } from "@/lib/fulfillment/ops-client-domain";
import type { FulfillmentClient, FulfillmentClientStatus } from "@/lib/fulfillment/fulfillment-client-domain";

/** Dee's credit-status list, read from the Status Guide's dispute category. */
export const CLIENT_STATUS_OPTIONS: readonly string[] =
  creditStatuses(Constants.public.Enums.fulfillment_client_status);

export function ClientStatusControl({
  client, canEdit = true,
}: { client: FulfillmentClient; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const [next, setNext] = useState<string>(client.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = next !== client.status;
  /* Dee's list, plus this record's own value if it predates the list. */
  const options = creditStatusOptionsFor(
    client.status, Constants.public.Enums.fulfillment_client_status);

  const apply = async () => {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      await updateClientStatus(client.id, next as FulfillmentClientStatus);
      /* The activity entry comes from the database trigger on
         `fulfillment_clients`, never from here — a screen that logs its own
         changes is a screen that can log a change it failed to make. */
      await queryClient.invalidateQueries({ queryKey: ["creditops", "clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    } catch (e) {
      setError(errorMessage(e, "Could not change the status."));
      setNext(client.status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground">
          <Tag className="h-3.5 w-3.5" /> Credit status
        </span>

        {canEdit ? (
          <>
            <OpsSelect
              size="sm"
              value={next}
              onValueChange={setNext}
              aria-label="Credit status"
              options={options.map((s) => ({ value: s, label: s }))}
              className="min-w-[16rem]"
            />
            <Button size="sm" variant={dirty ? "default" : "outline"}
              disabled={!dirty || busy} onClick={() => void apply()}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    : <Save className="mr-1 h-3.5 w-3.5" />}
              {busy ? "Saving…" : dirty ? "Change status" : "Saved"}
            </Button>
          </>
        ) : (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {client.status}
          </span>
        )}
      </div>

      {isStatusAutoSynced(client) && (
        /* An existing domain rule, surfaced rather than enforced: a SaaS-pulled
           client's status is derived from CRM actions, so a manual change here
           is an override and should be a deliberate accuracy correction. */
        <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
          This client's status syncs from their CRM. Changing it here is an override.
        </p>
      )}

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        The client's general <strong>dispute</strong> status, and only that. Separate from{" "}
        <strong>Lifecycle</strong> above, which is whether the client is active at all, and
        separate from <strong>Department Progress</strong> below — Support, Bureau Calling,
        Complaints and QA are departments with their own statuses, opened by handing off in
        Complete Work.
      </p>

      {error && <p role="alert" className="mt-1 text-[11px] text-status-danger">{error}</p>}
    </div>
  );
}
