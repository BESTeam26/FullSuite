/**
 * The people at a partner, and their portal access.
 *
 * A `partner_contacts` row IS the portal boundary — no organization, no
 * tenant, no entitlement surface. Suspending one contact ends their access
 * everywhere at once, because `partner_group_of_user()` resolves to nothing
 * for them rather than each screen checking separately.
 *
 * No delete. A contact who has ever signed in is history (rule 11).
 */
import { useState } from "react";
import { Loader2, Star, UserPlus } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerActions, usePartnerContacts } from "@/lib/data/use-agency-partners";
import { PORTAL_LABEL, portalState } from "@/lib/data/agency-partners";
import { invitationLink } from "@/lib/data/agency-invitations";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format-date";

const PORTAL_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  invited: "border-blue-500/30 bg-blue-500/10 text-blue-700",
  no_access: "border-border bg-muted text-muted-foreground",
  suspended: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  archived: "border-border bg-muted text-muted-foreground",
};

export function PartnerContactsTab({ groupId }: { groupId: string }) {
  const contacts = usePartnerContacts(groupId);
  const actions = usePartnerActions();
  const perms = useAgencyPermissions();
  const canManage = perms.can("partners.contacts");
  const canPortal = perms.can("partners.portal");
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const rows = contacts.data ?? [];

  /* Email when connected; the link either way, so the invite is never stuck
     behind a mail outage — the same honesty rule as agency invitations. */
  const invite = async (id: string) => {
    setInvitingId(id);
    try {
      const result = await actions.inviteContact.mutateAsync({ id, groupId });
      const link = invitationLink(result.token);
      if (result.emailOutcome.status === "sent") {
        toast({ title: "Invitation sent", description: "They activate from the email, and the link lasts seven days." });
      } else {
        await navigator.clipboard.writeText(link).catch(() => undefined);
        toast({
          title: "Invitation created — email not sent",
          description: `${result.emailOutcome.status === "not_connected"
            ? "Email is not connected yet."
            : result.emailOutcome.message ?? "The email could not be sent."} The activation link is on your clipboard.`,
        });
      }
    } catch (e) {
      toast({ title: "Could not invite", description: (e as Error).message, variant: "destructive" });
    } finally {
      setInvitingId(null);
    }
  };

  return (
    <ContentCard
      title={`Contacts${rows.length > 0 ? ` (${rows.length})` : ""}`}
      action={canManage && (
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add contact
        </Button>
      )}
    >
      {adding && canManage && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Input className="h-8 w-44" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name" aria-label="Contact name" />
          <Input className="h-8 w-56" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com" aria-label="Contact email" />
          <Input className="h-8 w-40" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)" aria-label="Contact phone" />
          <Button size="sm" disabled={!name.trim() || !email.trim() || actions.addContact.isPending}
            onClick={async () => {
              await actions.addContact.mutateAsync({
                groupId, fullName: name, email, phone, isPrimary: rows.length === 0,
              });
              setName(""); setEmail(""); setPhone(""); setAdding(false);
            }}>
            {actions.addContact.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}

      {contacts.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <Empty title="Nobody recorded yet"
          hint="Add a contact to invite them to the partner portal. A contact exists before they activate, and cannot sign in until they do." />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((c) => {
            const state = portalState(c);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {c.fullName}
                    {c.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label="Primary contact" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email}{c.phone && ` · ${c.phone}`}
                    {c.activatedAt && ` · activated ${formatDate(c.activatedAt)}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Pill tone={PORTAL_TONE[state]}>{PORTAL_LABEL[state]}</Pill>
                  {canPortal && c.status === "active" && !c.userId && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                      disabled={actions.inviteContact.isPending}
                      onClick={() => void invite(c.id)}>
                      {actions.inviteContact.isPending && invitingId === c.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : state === "invited" ? "Re-send invite" : "Invite to portal"}
                    </Button>
                  )}
                  {canPortal && c.status === "active" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => actions.setContactStatus.mutate({ id: c.id, groupId, status: "suspended" })}>
                      Suspend
                    </Button>
                  )}
                  {canPortal && c.status === "suspended" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => actions.setContactStatus.mutate({ id: c.id, groupId, status: "active" })}>
                      Restore
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ContentCard>
  );
}
