/**
 * Ending the whole relationship, or bringing it back.
 *
 * Archiving is not a lifecycle dropdown. It runs a cascade — work archived and
 * released, workspaces closed, client files taken out of the queues, portal
 * access suspended — so it is its own deliberate action with its own
 * confirmation, and the database refuses it outright while any service is
 * still running.
 *
 * Nothing is deleted. Clients, invoices, payments, production, EOD, files and
 * activity are all kept; only the active views change.
 */
import { useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePartnerServiceActions } from "@/lib/data/use-partner-services";
import type { ArchiveOutcome } from "@/lib/data/partner-services";

export function ArchivePartnerDialog({ groupId, partnerName, archived, onClose }: {
  groupId: string;
  partnerName: string;
  archived: boolean;
  onClose: () => void;
}) {
  const actions = usePartnerServiceActions(groupId);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<ArchiveOutcome | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (restored !== null) {
    return (
      <Panel tone="emerald">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check className="h-4 w-4" /> {partnerName} is active again
        </p>
        <p className="text-xs text-emerald-900">
          {restored} client file{restored === 1 ? "" : "s"} back in the active queues. Portal contacts
          and work assignments are restored one at a time — some were suspended or released on
          purpose, and an undo cannot tell which.
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </Panel>
    );
  }

  if (outcome) {
    return (
      <Panel tone="emerald">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Check className="h-4 w-4" /> {outcome.partner} archived
        </p>
        <ul className="space-y-0.5 text-xs text-emerald-900">
          <li>{outcome.workArchived} work item{outcome.workArchived === 1 ? "" : "s"} archived and unassigned</li>
          <li>{outcome.workspacesArchived} workspace{outcome.workspacesArchived === 1 ? "" : "s"} archived</li>
          <li>{outcome.clientsParked} client file{outcome.clientsParked === 1 ? "" : "s"} out of the active queues, all records kept</li>
          <li>{outcome.portalSuspended} portal contact{outcome.portalSuspended === 1 ? "" : "s"} suspended</li>
        </ul>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </Panel>
    );
  }

  if (archived) {
    return (
      <Panel tone="blue">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
          <RotateCcw className="h-4 w-4" /> Bring {partnerName} back?
        </p>
        <p className="text-xs text-blue-900">
          Their client files return to the active queues and the partner becomes active again.
          Portal access and work assignments stay off until somebody restores them deliberately.
        </p>
        {error && <p className="text-xs font-medium text-red-800">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={actions.restorePartner.isPending}
            onClick={async () => {
              setError(null);
              try {
                setRestored((await actions.restorePartner.mutateAsync()).clientsRestored);
              } catch (e) { setError((e as Error).message); }
            }}>
            {actions.restorePartner.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Restore partner
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel tone="amber">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" /> Archive {partnerName}?
      </p>
      <ul className="space-y-0.5 text-xs text-amber-900">
        <li>Their remaining open work is archived and released from whoever holds it.</li>
        <li>Their workspaces are archived and their client files leave the active queues.</li>
        <li>Portal access is suspended for everyone at the partner.</li>
        <li>Clients, invoices, payments, production, EOD, files and history are all kept.</li>
        <li>It refuses while any service is still running, and names the ones that are.</li>
      </ul>
      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Why is the relationship ending? (recorded on their history)" aria-label="Archive reason" />
      {error && <p className="text-xs font-medium text-red-800">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={actions.archivePartner.isPending}
          onClick={async () => {
            setError(null);
            try {
              setOutcome(await actions.archivePartner.mutateAsync({ reason }));
            } catch (e) { setError((e as Error).message); }
          }}>
          {actions.archivePartner.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Archive partner
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Panel>
  );
}

function Panel({ tone, children }: { tone: "amber" | "emerald" | "blue"; children: React.ReactNode }) {
  const styles = {
    amber: "border-amber-500/40 bg-amber-500/10",
    emerald: "border-emerald-500/40 bg-emerald-500/10",
    blue: "border-blue-500/30 bg-blue-500/10",
  }[tone];
  return <div className={`mb-3 space-y-2 rounded-xl border p-3 ${styles}`}>{children}</div>;
}
