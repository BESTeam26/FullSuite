/**
 * The three portal previews that used to live at /portal, /affiliate and
 * /outsourcing.
 *
 * Each was a static mock-up: example balances, example commissions, example
 * partner work. They read as working portals and were not connected to
 * anything. The one portal that is real — a borrower opening their own
 * funding file — is at /portal/funding, behind that borrower's own sign-in.
 */
import { NotBuiltYet } from "@/pages/NotBuiltYet";

export function ClientPortalPreview() {
  return (
    <NotBuiltYet
      title="The client portal is not open yet"
      detail="A credit-repair client will sign in here to follow their own progress, letters and documents. It is designed and waiting on the client-record change; until then there is nothing real to show. Funding borrowers already have theirs at /portal/funding."
      backTo="/"
      backLabel="Back to the site"
    />
  );
}

export function AffiliatePortalPreview() {
  return (
    <NotBuiltYet
      title="The affiliate portal is not built yet"
      detail="Referral partners will sign in here to see the referrals they sent and what they earned. Partners are not yet people with logins in the platform, so any figures shown would be invented."
      backTo="/"
      backLabel="Back to the site"
    />
  );
}

export function OutsourcingPortalPreview() {
  return (
    <NotBuiltYet
      title="The outsourcing portal is not built yet"
      detail="An outsourcing partner will sign in here to see the work BES is doing for them. Their work already lives in the platform; the partner-facing view of it is still to be built."
      backTo="/"
      backLabel="Back to the site"
    />
  );
}
