/**
 * What this partner can see of BES, and who at the partner can see it.
 *
 * Written plainly because the question "what do they actually see?" is asked
 * every time somebody is invited, and a vague answer is how internal material
 * ends up shared.
 */
import { ShieldCheck } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Pill } from "@/components/agency/partner/partner-ui";
import { usePartnerContacts } from "@/lib/data/use-agency-partners";
import { PORTAL_LABEL, portalState } from "@/lib/data/agency-partners";
import type { AgencyPartner } from "@/lib/data/agency-partners";

export function PartnerPortalTab({ partner }: { partner: AgencyPartner }) {
  const contacts = usePartnerContacts(partner.id);
  const rows = contacts.data ?? [];
  const activeCount = rows.filter((c) => portalState(c) === "active").length;
  const suspended = partner.lifecycle === "suspended" || partner.lifecycle === "archived";

  return (
    <div className="space-y-3">
      <ContentCard title="Portal access">
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
