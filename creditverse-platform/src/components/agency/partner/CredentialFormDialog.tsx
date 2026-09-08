import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { looksLikeASecret } from "@/lib/partners/credential-domain";
import type {
  CredentialPlatform,
  PartnerCredential,
} from "@/lib/data/partner-credentials";
import { useSaveCredential } from "@/lib/data/use-partner-credentials";

/**
 * Add or edit one login.
 *
 * The password field carries the rule that is easiest to get wrong: leaving it
 * blank on an edit means "leave the stored password alone", NOT "there is no
 * password". Editing a label must never silently wipe a credential, so the
 * field says which it is doing, and clearing one is a separate, deliberate
 * checkbox.
 */
export const CredentialFormDialog = ({
  groupId,
  credential,
  platforms,
  onClose,
}: {
  groupId: string;
  credential: PartnerCredential | null;
  platforms: CredentialPlatform[];
  onClose: () => void;
}) => {
  const editing = credential !== null;
  const save = useSaveCredential(groupId);

  const [platformKey, setPlatformKey] = useState(credential?.platformKey ?? "disputefox");
  const [label, setLabel] = useState(credential?.label ?? "");
  const [username, setUsername] = useState(credential?.username ?? "");
  const [url, setUrl] = useState(credential?.url ?? "");
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [codeDestination, setCodeDestination] = useState(credential?.codeDestination ?? "");
  const [notes, setNotes] = useState(credential?.notes ?? "");
  const [rotationDue, setRotationDue] = useState(credential?.rotationDueOn ?? "");
  const [error, setError] = useState<string | null>(null);

  const platform = platforms.find((p) => p.key === platformKey);
  const noteWarning = looksLikeASecret(notes);
  const canSave = label.trim().length > 0 && !noteWarning && !save.isPending;

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({
        id: credential?.id,
        groupId,
        platformKey,
        label: label.trim(),
        username: username.trim() || null,
        url: url.trim() || null,
        /* The three meanings, decided here so the caller never has to guess:
           a typed password replaces, the clear checkbox empties, and neither
           leaves the stored one untouched. */
        secret: clearSecret ? "" : secret.length > 0 ? secret : undefined,
        codeDestination: codeDestination.trim() || null,
        notes: notes.trim() || null,
        rotationDue: rotationDue || null,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*?:\s*/, "")
          : "The login could not be saved.",
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit login" : "Add a login"}</DialogTitle>
          <DialogDescription>
            The password is encrypted and never stored in this record. Everything
            else here is stored in the clear so the team can copy it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cred-platform">Platform</Label>
              <Select value={platformKey} onValueChange={setPlatformKey}>
                <SelectTrigger id="cred-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-label">What the team calls it</Label>
              <Input
                id="cred-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Main DF login"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cred-username">Username or email</Label>
              <Input
                id="cred-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-url">Sign-in link</Label>
              <Input
                id="cred-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="app.disputefox.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cred-secret">Password</Label>
            <Input
              id="cred-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={clearSecret}
              autoComplete="new-password"
              placeholder={editing ? "Leave blank to keep the stored password" : ""}
            />
            {editing && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearSecret}
                  onChange={(e) => setClearSecret(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                There is no password for this login — remove the stored one
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cred-code">
                Where the security code goes
                {platform?.sendsCode && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({platform.label} sends one)
                  </span>
                )}
              </Label>
              <Input
                id="cred-code"
                value={codeDestination}
                onChange={(e) => setCodeDestination(e.target.value)}
                placeholder="ops@dispute-me.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cred-rotation">Change the password by</Label>
              <Input
                id="cred-rotation"
                type="date"
                value={rotationDue}
                onChange={(e) => setRotationDue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cred-notes">Notes</Label>
            <Textarea
              id="cred-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Which team uses it, what it is for, anything the next person needs."
            />
            {noteWarning && (
              <p className="flex items-start gap-1.5 text-xs text-status-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                That looks like a password. Notes are stored in the clear — put
                it in the password field above instead.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-status-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {editing ? "Save changes" : "Add login"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
