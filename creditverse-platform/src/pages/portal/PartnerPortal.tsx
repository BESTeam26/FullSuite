/**
 * The BES Partner Portal.
 *
 * ── A MULTI-PAGE PORTAL, NOT ONE LONG SCROLL ────────────────────────────────
 *
 * Dee, 2026-09-13: "I want a modern multi-page Partner Portal, not a long
 * single page… Do NOT create one giant scrolling page." It used to be exactly
 * that — nine sections stacked down one route, with billing near the top.
 *
 * The order is now hers, and the reason is hers too: "Clients comes before
 * Billing… the Partner relationship is operational first, financial second."
 * Invoices, Payments, Account Credit and Processing Credits all live INSIDE
 * Billing rather than competing for the main menu.
 *
 * ── WHAT DECIDES WHAT THEY SEE ──────────────────────────────────────────────
 *
 * `navFor` — pure, tested — decides which pages exist for this partner, and
 * `my_partner_portal_summary` answers it in one call rather than six. Hiding a
 * link is presentation: every page behind it reads through a definer function
 * gated on the signed-in contact, so a partner who types a URL is refused by
 * the data, not by the menu (rule 1).
 *
 * ── SUSPENSION ──────────────────────────────────────────────────────────────
 *
 * A suspended partner keeps Overview, Actions, Messages, Billing, Agreements,
 * Updates and Settings, and loses the service pages. Locking them out of the
 * one screen where they can pay is how a suspension becomes permanent.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { usePortalSummary } from "@/lib/data/use-portal-summary";
import { PortalShell, PortalShellLoading } from "@/components/portal/shell/PortalShell";
import { navFor, type PortalPageId } from "@/lib/portal/portal-nav";
import { PortalOverview } from "@/pages/portal/pages/PortalOverview";
import { PortalAgreements } from "@/pages/portal/pages/PortalAgreements";
import { PortalClientsPage } from "@/pages/portal/pages/PortalClientsPage";
import { PortalClientDetail } from "@/pages/portal/pages/PortalClientDetail";
import { PortalServices } from "@/pages/portal/pages/PortalServices";
import { PortalUpdates } from "@/pages/portal/pages/PortalUpdates";
import { PortalActionNeeded } from "@/components/portal/PortalActionNeeded";
import { PortalMessages } from "@/pages/portal/pages/PortalMessages";
import { PortalBilling } from "@/components/portal/PortalBilling";
import { PartnerInformation } from "@/components/portal/PartnerInformation";
import {
  PortalFiles,
} from "@/components/portal/PortalSections";
import { useMyPartner, usePartnerContacts } from "@/lib/data/use-agency-partners";

/** Copy for each page's heading, in one place so the shell stays generic. */
const HEADINGS: Record<PortalPageId, { title: string; description?: string }> = {
  overview:   { title: "Overview" },
  clients:    { title: "Clients", description: "Every client BES is working for you." },
  services:   { title: "Projects & Services", description: "What BES is delivering, and where each piece stands." },
  actions:    { title: "Actions Needed", description: "What BES is waiting on from you." },
  messages:   { title: "Messages", description: "Talk to your BES team. You can start a conversation any time." },
  billing:    { title: "Billing", description: "Invoices, payments and credits." },
  agreements: { title: "Agreements", description: "What you have signed, and anything waiting for signature." },
  files:      { title: "Files", description: "Documents BES has shared with you." },
  referrals:  { title: "Referrals" },
  updates:    { title: "Updates", description: "News from BES and what has moved on your account." },
  settings:   { title: "Account Settings", description: "Company information, contacts and connected systems." },
};

const NoAccess = ({ onSignOut }: { onSignOut: () => void }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
    <ShieldCheck className="h-10 w-10 text-muted-foreground" />
    <h1 className="text-lg font-bold text-foreground">No portal access</h1>
    <p className="max-w-md text-sm text-muted-foreground">
      This account does not have partner portal access. If you were expecting it,
      please contact your BES representative.
    </p>
    <button type="button" onClick={onSignOut}
      className="mt-2 text-sm font-medium text-primary hover:underline">
      Sign out
    </button>
  </div>
);

export const PartnerPortal = () => {
  const { signOut } = useAuth();
  const summary = usePortalSummary();

  if (summary.isLoading) return <PortalShellLoading />;
  if (!summary.data) return <NoAccess onSignOut={() => void signOut()} />;

  const s = summary.data;
  const allowed = new Set(navFor(s).map((i) => i.id));
  /* A page the menu does not offer is not rendered either. The database would
     refuse its reads anyway; this keeps the two saying the same thing. */
  const page = (id: PortalPageId, node: React.ReactNode) =>
    allowed.has(id)
      ? <PortalShell summary={s} {...HEADINGS[id]}>{node}</PortalShell>
      : <Navigate to="/partner" replace />;

  return (
    <Routes>
      <Route index element={
        <PortalShell
          summary={s}
          title={`Welcome back, ${s.partnerName}`}
          description="Here is where your account stands today."
        >
          <PortalOverview summary={s} />
        </PortalShell>
      } />
      <Route path="clients" element={page("clients", <PortalClientsPage />)} />
      <Route path="clients/:publicId" element={page("clients", <PortalClientDetail />)} />
      <Route path="services" element={page("services", <PortalServices />)} />
      <Route path="actions" element={page("actions", <PortalActionNeeded />)} />
      <Route path="messages" element={page("messages", <PortalMessagesPage />)} />
      <Route path="billing" element={page("billing", <PortalBilling />)} />
      <Route path="agreements" element={page("agreements", <PortalAgreements />)} />
      <Route path="files" element={page("files", <PortalFilesPage />)} />
      <Route path="updates" element={page("updates", <PortalUpdates />)} />
      <Route path="settings" element={page("settings", <PortalSettings />)} />
      {/* Referrals has no model yet, so the route redirects rather than
          rendering a page that would have nothing true to say. */}
      <Route path="referrals" element={<Navigate to="/partner" replace />} />
      <Route path="*" element={<Navigate to="/partner" replace />} />
    </Routes>
  );
};

/* The three pages that need the partner record itself rather than the summary.
   Each asks for it separately so a partner reading Billing never pays for the
   contacts query (rule 14). */

function PortalMessagesPage() {
  const partner = useMyPartner();
  if (!partner.data) return null;
  return <PortalMessages partnerGroupId={partner.data.id} />;
}

function PortalFilesPage() {
  const partner = useMyPartner();
  if (!partner.data) return null;
  return <PortalFiles partnerGroupId={partner.data.id} />;
}

function PortalSettings() {
  const { user } = useAuth();
  const partner = useMyPartner();
  const contacts = usePartnerContacts(partner.data?.id ?? null);
  const me = (contacts.data ?? []).find((c) => c.userId === user?.id);
  if (!partner.data) return null;
  return (
    <PartnerInformation
      partner={partner.data}
      contactName={me?.fullName ?? null}
      contactTitle={me?.title ?? null}
      contactPhone={me?.phone ?? null}
      contactEmail={me?.email ?? null}
    />
  );
}
