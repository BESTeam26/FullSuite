/**
 * Send one active document to one signer — a team member, a partner contact,
 * or an email address (a prospect, a client, anyone without a record).
 *
 * The same mutation as the member profile's inline sender
 * (`useDocumentActions().send`); this is the shared front door for the other
 * two signer kinds. The database still decides everything that matters: the
 * template must be active, every merge field must resolve for THIS signer,
 * and the request is frozen at send (0292).
 *
 * `signer` may arrive fixed (from a partner contact row) or be chosen here.
 */
import { useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpsSelect } from "@/components/ui/ops-select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAgencyMembers } from "@/lib/data/use-agency-teams";
import { useAgencyPartners, usePartnerContacts } from "@/lib/data/use-agency-partners";
import { useDocumentActions, useDocumentTemplates, type DocumentAudience } from "@/lib/data/documents";
import { useToast } from "@/hooks/use-toast";

const NONE = "__none";
type SignerKind = "member" | "partner_contact" | "external";

export type FixedSigner =
  | { kind: "partner_contact"; contactId: string; groupId: string; name: string }
  | { kind: "member"; userId: string; name: string };

const AUDIENCE_FOR: Record<SignerKind, DocumentAudience[]> = {
  member: ["member", "any"],
  partner_contact: ["partner", "any"],
  external: ["client", "partner", "any"],
};

export function SendForSignatureDialog({
  open, onClose, templateId, fixedSigner,
}: {
  open: boolean;
  onClose: () => void;
  /** Preselected document, when opened from a template row. */
  templateId?: string;
  /** Preselected signer, when opened from a person's row. */
  fixedSigner?: FixedSigner;
}) {
  const { toast } = useToast();
  const templates = useDocumentTemplates();
  const actions = useDocumentActions();
  const [kind, setKind] = useState<SignerKind>(fixedSigner?.kind ?? "member");
  const [pickedTemplate, setPickedTemplate] = useState(templateId ?? NONE);
  const [memberId, setMemberId] = useState(fixedSigner?.kind === "member" ? fixedSigner.userId : NONE);
  const [groupId, setGroupId] = useState(fixedSigner?.kind === "partner_contact" ? fixedSigner.groupId : NONE);
  const [contactId, setContactId] = useState(fixedSigner?.kind === "partner_contact" ? fixedSigner.contactId : NONE);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const members = useAgencyMembers();
  const partners = useAgencyPartners();
  const contacts = usePartnerContacts(kind === "partner_contact" && groupId !== NONE ? groupId : null);

  const sendable = useMemo(
    () => (templates.data ?? []).filter((t) => t.status === "active" && AUDIENCE_FOR[kind].includes(t.audience)),
    [templates.data, kind],
  );

  const signer = (() => {
    if (kind === "member") return memberId !== NONE ? { kind: "member" as const, userId: memberId } : null;
    if (kind === "partner_contact") return contactId !== NONE ? { kind: "partner_contact" as const, contactId } : null;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && name.trim().length >= 2;
    return ok ? { kind: "external" as const, email: email.trim(), name: name.trim() } : null;
  })();

  const submit = () => {
    if (!signer || pickedTemplate === NONE) return;
    actions.send.mutate(
      { templateId: pickedTemplate, signer },
      {
        onSuccess: (r) => {
          if (r.emailed) {
            toast({ title: "Sent for signature", description: "They have an email with the signing link." });
          } else {
            toast({
              title: "Created — but the email did not go",
              description: `${r.emailError ?? ""} Copy the link from Documents & Signatures → Signature requests.`,
              variant: "destructive",
            });
          }
          onClose();
        },
        onError: (e) => toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send for signature</DialogTitle>
          <DialogDescription>
            The document is filled in for this signer and frozen. They sign from a link in their email — no account needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!fixedSigner && (
            <div className="grid gap-1.5">
              <Label>Who signs</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Signer kind">
                {([["member", "Team member"], ["partner_contact", "Partner contact"], ["external", "Email address"]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={kind === k}
                    onClick={() => { setKind(k); setPickedTemplate(templateId ?? NONE); }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      kind === k ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fixedSigner ? (
            <p className="text-sm text-foreground">To <span className="font-medium">{fixedSigner.name}</span></p>
          ) : kind === "member" ? (
            <div className="grid gap-1.5">
              <Label>Team member</Label>
              <OpsSelect size="field" value={memberId} onValueChange={setMemberId}
                options={[{ value: NONE, label: members.isLoading ? "Loading…" : "Choose a person" },
                  ...(members.data ?? []).filter((m) => m.status === "active").map((m) => ({ value: m.userId, label: m.name }))]} />
            </div>
          ) : kind === "partner_contact" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Partner</Label>
                <OpsSelect size="field" value={groupId} onValueChange={(v) => { setGroupId(v); setContactId(NONE); }}
                  options={[{ value: NONE, label: partners.isLoading ? "Loading…" : "Choose a partner" },
                    ...(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
              </div>
              <div className="grid gap-1.5">
                <Label>Contact</Label>
                <OpsSelect size="field" value={contactId} onValueChange={setContactId}
                  options={[{ value: NONE, label: groupId === NONE ? "Pick a partner first" : contacts.isLoading ? "Loading…" : "Choose a contact" },
                    ...(contacts.data ?? []).filter((c) => c.status === "active").map((c) => ({ value: c.id, label: `${c.fullName} · ${c.email}` }))]} />
              </div>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sig-name">Their full name</Label>
                <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Reyes" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sig-email">Their email</Label>
                <Input id="sig-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Document</Label>
            <OpsSelect size="field" value={pickedTemplate} onValueChange={setPickedTemplate}
              options={[{ value: NONE, label: sendable.length === 0 ? "No active document for this kind of signer — build one in Settings → Documents" : "Choose a document" },
                ...sendable.map((t) => ({ value: t.id, label: `${t.name} (v${t.version})` }))]} />
            {kind === "external" && (
              <p className="text-[11px] text-muted-foreground">
                An email signer has no record to fill from, so the document may only use company values, the signer&apos;s name and email, dates, and the signature block.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!signer || pickedTemplate === NONE || actions.send.isPending} onClick={submit}>
            {actions.send.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

