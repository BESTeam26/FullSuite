/**
 * Whether this partner may use the portal, who at the partner can, and what
 * they would see.
 *
 * Written plainly because the question "what do they actually see?" is asked
 * every time somebody is invited, and a vague answer is how internal material
 * ends up shared.
 *
 * ── THREE STATES, NOT ONE ──────────────────────────────────────────────────
 *
 *   ACCESS       the switch on the partner — ON, OFF, or cannot be enabled
 *   ELIGIBILITY  whether there IS a primary contact with a usable email
 *   INVITATION   whether anybody has been asked, and whether they accepted
 *
 * Dee, 2026-09-12, kept them apart deliberately: turning access on does not
 * invite anybody, and turning it off destroys nothing — the contact, their
 * identity, the engagements and every CreditOps record stay exactly as they
 * are, and switching back on restores them without a new invitation.
 */
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerContacts } from "@/lib/data/use-agency-partners";
import {
  PORTAL_LABEL, partnerPortalEligible, portalAccessLabel, portalState,
  setPartnerPortalAccess,
} from "@/lib/data/agency-partners";
import type { AgencyPartner } from "@/lib/data/agency-partners";

export function PartnerPortalTab({ partner }: { partner: AgencyPartner }) {
  const contacts = usePartnerContacts(partner.id);
  const perms = useAgencyPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const rows = contacts.data ?? [];
  const activeCount = rows.filter((c) => portalState(c) === "active").length;
  const suspended = partner.lifecycle === "suspended" || partner.lifecycle === "archived";
  const eligible = partnerPortalEligible(rows);
  const canEdit = perms.can("partners.edit");

  /* Invitation state is the CONTACTS' business and access is the PARTNER's.
     Dee, 2026-09-12: "Keep access state and invitation state separate." A
     partner can be ON with nobody invited, or OFF with somebody who accepted
     months ago — and switching back on restores them without a new
     invitation, because nothing about their identity was destroyed. */
  const invitationState =
    activeCount > 0 ? "Accepted" : rows.some((c) => portalState(c) === "invited") ? "Pending" : "Not sent";

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setPartnerPortalAccess(partner.id, next);
      await qc.invalidateQueries({ queryKey: ["agency", "partners"] });
      toast({
        title: next ? "Portal access enabled" : "Portal access disabled",
        description: next
          ? "Their contacts can sign in. Nobody is invited until you invite them."
          : "Nobody at this partner can sign in. Nothing was deleted.",
      });
    } catch (e) {
      toast({ title: "Could not change portal access", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ContentCard title="Portal access">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Portal access:{" "}
              <span className={partner.portalAccessEnabled ? "text-status-success" : "text-muted-foreground"}>
                {portalAccessLabel(partner, eligible)}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Invitation: {invitationState}
              {!eligible && " · add a primary contact with an email address on the Contacts tab"}
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant={partner.portalAccessEnabled ? "outline" : "default"}
              disabled={busy || (!partner.portalAccessEnabled && !eligible)}
              onClick={() => void toggle(!partner.portalAccessEnabled)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : partner.portalAccessEnabled ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>
        {suspended ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
            This partner is {partner.lifecycle === "archived" ? "archived" : "suspended"}, so nobody at
            it can sign in — whatever each contact's own status says. Access ends in one place rather
            than contact by contact.
          </p>
        ) : (
          <p className="text-sm text-foreground">
            {activeCount === 0
              ? "Nobody at this partner has activated the portal yet."
              : `${activeCount} ${activeCount === 1 ? "person" : "people"} can sign in.`}
          </p>
        )}
        <ul className="mt-2 divide-y divide-border/50">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate text-sm text-foreground">{c.fullName}</span>
              <Pill tone="border-border bg-muted text-muted-foreground">{PORTAL_LABEL[portalState(c)]}</Pill>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Invitations and suspensions are managed on the Contacts tab.
        </p>
      </ContentCard>

      <ContentCard title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> What they can see</span>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Yes</p>
            <ul className="mt-1 space-y-0.5 text-sm text-foreground">
              <li>Their own partner record and status</li>
              <li>The services they buy — names and status, no prices</li>
              <li>The people they have at BES's portal</li>
              <li>Files filed against them</li>
              <li>Updates BES deliberately shared with them</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Never</p>
            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              <li>Rates, invoices, payments or what BES earns</li>
              <li>BES internal tasks, EOD, production or workforce</li>
              <li>Internal notes and QA</li>
              <li>Any other partner, or any organization</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Every financial table refuses a partner outright — there is no partner branch in those
          policies at all, so this is enforced by the database rather than by what this screen renders.
        </p>
      </ContentCard>
    </div>
  );
}
