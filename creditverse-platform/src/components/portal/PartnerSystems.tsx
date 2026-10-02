/**
 * The partner's own system logins on Account Settings — the same records
 * onboarding filled and BES works from:
 *
 *   Credit Repair CRM | GoHighLevel | Email/ESP | Credit Monitoring |
 *   Affiliate Accounts | Domain | Additional Systems
 *
 * Credentials: add, edit, replace, remove. The password shows masked with
 * View and Copy (each recorded), and every card says when it was last changed
 * and by whom — the answer to "why can BES suddenly not log in to DisputeFox".
 * Removal archives; it never deletes (rule 11).
 */
import { useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/agency/partner/CopyField";
import { CredentialPasswordField } from "@/components/agency/partner/CredentialPasswordField";
import { CredentialFormDialog } from "@/components/agency/partner/CredentialFormDialog";
import type { PartnerCredential } from "@/lib/data/partner-credentials";
import { useArchiveCredential, useCredentialPlatforms, useMyPartnerCredentials } from "@/lib/data/use-partner-credentials";
import { byCategory, CREDENTIAL_CATEGORIES } from "@/lib/partners/credential-domain";
import { formatDate } from "@/lib/format-date";
import { useToast } from "@/hooks/use-toast";
import { PanelState } from "@/components/common/QueryState";

export function PartnerSystems({ partnerId }: { partnerId: string }) {
  const { toast } = useToast();
  const platforms = useCredentialPlatforms();
  const credentials = useMyPartnerCredentials();
  const archive = useArchiveCredential(null, "portal");
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [editing, setEditing] = useState<PartnerCredential | null>(null);
  const [removing, setRemoving] = useState<PartnerCredential | null>(null);
  const grouped = byCategory(credentials.data ?? [], (platforms.data ?? []).map((p) => p.key));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" /> Connected systems
      </h2>
      <p className="text-[11px] text-muted-foreground">The logins BES uses to work in your systems. Keep them current so work is never held up.</p>
      {/* Systems by category */}
      {CREDENTIAL_CATEGORIES.map((cat) => {
        const items = grouped.find((g) => g.category === cat.key)?.items ?? [];
        return (
          <div key={cat.key} className="mt-3 rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-foreground">{cat.label}</h3>
                <p className="text-[11px] text-muted-foreground">{cat.hint}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreatingIn(cat.key)}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {credentials.isPending || credentials.isError ? (
              <PanelState query={credentials}
                empty={<p className="text-xs text-muted-foreground">Nothing recorded.</p>} />
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing recorded.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border/60 bg-card p-3">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> {c.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.providerName ?? c.platformLabel}
                          {c.accountName ? <> · {c.accountName}</> : null}
                          {c.updatedAt ? <> · Updated {formatDate(c.updatedAt)}{c.updatedByName ? ` by ${c.updatedByName}` : ""}</> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setEditing(c)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-destructive" onClick={() => setRemoving(c)}><Trash2 className="mr-1 h-3 w-3" /> Remove</Button>
                      </div>
                    </div>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      {c.username && <CopyField label="Login email / username" value={c.username} />}
                      <CredentialPasswordField credentialId={c.id} hasSecret={c.hasSecret} mayReveal scope="portal" />
                      {c.url && <CopyField label="Login URL" value={c.url} mono={false} />}
                      {c.affiliateLink && <CopyField label="Affiliate link" value={c.affiliateLink} mono={false} />}
                      {c.dashboardUrl && <CopyField label="Dashboard URL" value={c.dashboardUrl} mono={false} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {(creatingIn || editing) && (
        <CredentialFormDialog
          groupId={partnerId}
          credential={editing}
          platforms={platforms.data ?? []}
          scope="portal"
          defaultCategory={creatingIn ?? editing?.category}
          onClose={() => { setCreatingIn(null); setEditing(null); }}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Remove system">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg">
            <p className="text-sm font-semibold text-foreground">Remove {removing.label}?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              BES will no longer see this login. It is kept in your history, not deleted, so a question about who could sign in last month can still be answered.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
              <Button size="sm" variant="destructive" disabled={archive.isPending}
                onClick={() => archive.mutate({ id: removing.id, reason: "Removed by the partner" }, {
                  onSuccess: () => { setRemoving(null); toast({ title: "Removed" }); },
                  onError: (e) => toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" }),
                })}>
                {archive.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
