/**
 * The partner's Account Settings (Dee, 2026-10-01, PARTNER_PORTAL_DOCTRINE.md:
 * "Business info · Contacts · Notification preferences · Password/security ·
 * Portal users · maybe brand/business details").
 *
 * In that order, then the system logins BES works from — the longest
 * section, so it goes last. Every section reads the partner's canonical
 * records through partner-scoped rules; nothing is stored for the portal.
 * "Brand/business details" is the DBA and website in Business information,
 * not a second branding record.
 */
import { useAuth } from "@/lib/auth/auth-context";
import { useMyPartner, usePartnerContacts } from "@/lib/data/use-agency-partners";
import { PartnerInformation } from "@/components/portal/PartnerInformation";
import { PartnerSystems } from "@/components/portal/PartnerSystems";
import { PartnerContactsCard } from "@/components/portal/settings/PartnerContactsCard";
import { PartnerNotificationsCard } from "@/components/portal/settings/PartnerNotificationsCard";
import { PartnerSecurityCard } from "@/components/portal/settings/PartnerSecurityCard";

export function PortalAccountSettings() {
  const { user } = useAuth();
  const partner = useMyPartner();
  /* One request serves both the "Your details" card and the contacts list —
     the same query key (rule 14). */
  const contacts = usePartnerContacts(partner.data?.id ?? null);
  const me = (contacts.data ?? []).find((c) => c.userId === user?.id);
  if (!partner.data) return null;
  return (
    <div className="space-y-4">
      <PartnerInformation
        partner={partner.data}
        contactName={me?.fullName ?? null}
        contactTitle={me?.title ?? null}
        contactPhone={me?.phone ?? null}
        contactEmail={me?.email ?? null}
      />
      <PartnerContactsCard partnerId={partner.data.id} myUserId={user?.id ?? null} />
      <PartnerNotificationsCard />
      <PartnerSecurityCard />
      <PartnerSystems partnerId={partner.data.id} />
    </div>
  );
}
