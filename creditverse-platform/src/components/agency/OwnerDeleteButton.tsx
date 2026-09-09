/**
 * Delete a record permanently. Owner only, and it says so.
 *
 * Rendered for nobody but the agency owner — not disabled for an
 * administrator, absent. Two clicks, and the second one names what is about to
 * go and that it is not recoverable, because the whole point of this control
 * is that it does what archiving deliberately does not.
 */
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DELETABLE_LABEL, ownerDeleteRecord, type DeletableTable,
} from "@/lib/data/owner-delete";

export function OwnerDeleteButton({ table, id, name, onDeleted, className }: {
  table: DeletableTable;
  id: string;
  /** What to call it in the confirmation. */
  name: string;
  onDeleted?: () => void;
  className?: string;
}) {
  const { agencyMembership } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => ownerDeleteRecord(table, id, reason),
    onSuccess: () => {
      /* Everything, because a deleted row can appear in any list that cached
         it and there is no row left to invalidate precisely. */
      void qc.invalidateQueries();
      setConfirming(false);
      onDeleted?.();
    },
    onError: (e) => setError((e as Error).message),
  });

  /* Not disabled for an administrator — absent. */
  /* Ownership is the flag now (0234); the retired role value is tolerated so
     nothing regresses while an old session drains. */
  if (!(agencyMembership?.is_owner || agencyMembership?.role === "agency_owner")) return null;

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" className={className}
        aria-label={`Delete ${name} permanently`}
        onClick={() => { setError(null); setConfirming(true); }}>
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-900">
      <p>
        Delete the {DELETABLE_LABEL[table]} <strong>{name}</strong> permanently? This is not archiving —
        the record is destroyed and cannot be brought back. Anything filed against it goes with it.
      </p>
      <Input className="h-8 bg-background" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Why (recorded in the audit log)" aria-label="Reason for deleting" />
      {error && <p className="font-medium">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={remove.isPending}
          onClick={() => { setError(null); remove.mutate(); }}>
          {remove.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Delete permanently
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
      </div>
    </div>
  );
}
