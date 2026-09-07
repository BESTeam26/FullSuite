/**
 * Ending a service, with what will happen said before it happens.
 *
 * The cascade touches billing, work, assignments and workspaces in one call,
 * so the confirmation lists it plainly. Afterwards it reports what actually
 * moved — counts from the database, not a claim that it worked.
 *
 * The date matters and is not decorative. Cancelling forward stops future
 * billing; an invoice already earned before that date stands.
 */
import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePartnerServiceActions } from "@/lib/data/use-partner-services";
import type { CancellationOutcome } from "@/lib/data/partner-services";
import { formatDate } from "@/lib/format-date";

export function CancelServiceDialog({ groupId, serviceId, serviceName, onClose }: {
  groupId: string;
  serviceId: string;
  serviceName: string;
  onClose: () => void;
}) {
  const actions = usePartnerServiceActions(groupId);
  const [effectiveOn, setEffectiveOn] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<CancellationOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (outcome) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check className="h-4 w-4" /> {outcome.service} cancelled, effective {formatDate(outcome.effective)}
        </p>
        <ul className="space-y-0.5 text-xs text-emerald-900">
          <li>{outcome.scheduledCancelled} future charge{outcome.scheduledCancelled === 1 ? "" : "s"} stopped</li>
          <li>{outcome.workArchived} work item{outcome.workArchived === 1 ? "" : "s"} archived and unassigned</li>
          <li>{outcome.workspacesArchived} workspace{outcome.workspacesArchived === 1 ? "" : "s"} archived</li>
          <li>
            {outcome.clientsParked} client file{outcome.clientsParked === 1 ? "" : "s"} taken out of the active
            queues — every record kept
          </li>
          <li className="font-semibold">
            {outcome.partnerStillActive
              ? "The partner is still active — their other services are untouched."
              : "No service is running now. The partner can be archived when the relationship really is over."}
          </li>
        </ul>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" /> Cancel {serviceName}?
      </p>
      <ul className="space-y-0.5 text-xs text-amber-900">
        <li>Future billing for this service stops, and its recurring revenue leaves the run-rate.</li>
        <li>Its open work is archived and released from whoever is holding it.</li>
        <li>A workspace that exists only for this service is archived.</li>
        <li>Invoices, payments, production, EOD, files and history are all kept.</li>
        <li>Other services this partner buys are untouched.</li>
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-amber-900">
          Effective from
          <Input className="h-8" type="date" value={effectiveOn}
            onChange={(e) => setEffectiveOn(e.target.value)} aria-label="Cancellation effective date" />
        </label>
      </div>
      <p className="text-[11px] text-amber-900">
        Charges already due before this date stand. Cancelling forward is not erasing backwards.
      </p>
      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Why is it ending? (recorded on the partner's history)" aria-label="Cancellation reason" />
      {error && <p className="text-xs font-medium text-red-800">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={actions.cancelService.isPending}
          onClick={async () => {
            setError(null);
            try {
              setOutcome(await actions.cancelService.mutateAsync({ serviceId, effectiveOn, reason }));
            } catch (e) {
              setError((e as Error).message);
            }
          }}>
          {actions.cancelService.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Cancel this service
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Keep it running</Button>
      </div>
    </div>
  );
}
