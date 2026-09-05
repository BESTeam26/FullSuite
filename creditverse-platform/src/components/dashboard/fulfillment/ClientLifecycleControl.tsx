/**
 * Lifecycle badge + Archive / Reactivate / Complete / Graduate. A lifecycle
 * change is a transition with an activity event (set_client_lifecycle), never
 * a delete. Only "Active" counts as an active client.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { setClientLifecycle } from "@/lib/data/fulfillment-clients";
import { LIFECYCLE_LABELS, isActiveClient, type ClientLifecycle, type FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";

export function ClientLifecycleControl({ client, canEdit }: { client: FulfillmentClient; canEdit: boolean }) {
  const auth = useAuth();
  const live = auth.mode === "live";
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<ClientLifecycle | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycle: ClientLifecycle = client.lifecycle ?? (isActiveClient(client) ? "active" : "archived");

  const apply = async (next: ClientLifecycle) => {
    setBusy(true); setError(null);
    try {
      await setClientLifecycle({ clientId: client.id, lifecycle: next, reason: reason.trim() || null });
      await queryClient.invalidateQueries({ queryKey: ["creditops", "clients"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
      setConfirming(null); setReason("");
    } catch (e) { setError(errorMessage(e, "Could not change the client's lifecycle.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs shadow-sm">
      <span className="font-bold uppercase tracking-wider text-muted-foreground">Lifecycle</span>
      <span className={lifecycle === "active" ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-bold text-status-success" : "rounded-full bg-muted px-2.5 py-0.5 font-bold text-muted-foreground"}>
        {LIFECYCLE_LABELS[lifecycle]}
      </span>
      {lifecycle !== "active" && client.archivedAt && <span className="text-muted-foreground">since {new Date(client.archivedAt).toLocaleDateString()}</span>}
      <span className="text-muted-foreground">· only Active counts as an active client</span>
      {live && canEdit && (
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <OpsSelect
                value={confirming}
                onValueChange={(v) => setConfirming(v as ClientLifecycle)}
                options={(Object.keys(LIFECYCLE_LABELS) as ClientLifecycle[]).filter((k) => k !== lifecycle).map((k) => ({ value: k, label: LIFECYCLE_LABELS[k] }))}
                aria-label="New lifecycle"
              />
              {confirming === "archived" && (
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-44 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              )}
              <Button type="button" size="sm" onClick={() => void apply(confirming)} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
            </>
          ) : lifecycle === "active" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming("archived")}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Archive / change lifecycle
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming("active")}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reactivate
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="w-full text-status-danger">{error}</p>}
    </div>
  );
}
