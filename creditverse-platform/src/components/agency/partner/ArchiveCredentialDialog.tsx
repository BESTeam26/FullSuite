import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PartnerCredential } from "@/lib/data/partner-credentials";
import { useArchiveCredential } from "@/lib/data/use-partner-credentials";

/**
 * Retire a login without losing the record of it.
 *
 * Archiving rather than deleting, because "who could sign in to this in
 * March" is asked after somebody leaves, and a deleted row cannot answer it
 * (rule 11). The reason is required: an entry that simply vanished tells the
 * next person nothing about whether the account was closed, the password was
 * changed, or the partner ended.
 */
export const ArchiveCredentialDialog = ({
  groupId,
  credential,
  onClose,
}: {
  groupId: string;
  credential: PartnerCredential;
  onClose: () => void;
}) => {
  const archive = useArchiveCredential(groupId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await archive.mutateAsync({ id: credential.id, reason: reason.trim() });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?:\s*/, "")
          : "The login could not be archived.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive “{credential.label}”</DialogTitle>
          <DialogDescription>
            It stops appearing in the list and its password can no longer be
            shown. The entry and its access record are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="archive-reason">Why is it being archived?</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Account closed when the partner moved off DisputeFox."
          />
        </div>

        {error && <p className="text-xs text-status-danger">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void submit()}
            disabled={reason.trim().length === 0 || archive.isPending}
          >
            {archive.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
