/**
 * `/portal` resolves WHICH portal the signed-in person actually has.
 *
 * It used to ask one question — "are you a client?" — and tell everybody else
 * they had no client file. A partner contact who accepted a Partner Portal
 * invitation landed here and was told to check their email address, which was
 * both wrong and unfixable: they were never going to have a client file, and
 * they were not supposed to (Dee's live test, 2026-09-12).
 *
 * So the order of resolution is now explicit:
 *
 *   client file           → the client portal, here
 *   partner contact       → /partner, their partner's portal
 *   BES or org membership → /app, their workspace
 *   none of the above     → said plainly
 *
 * The client file is asked FIRST because this route IS the client portal;
 * somebody who is both a client and a partner contact arriving at /portal
 * meant the client portal. A partner arriving here meant /partner and simply
 * had nowhere else to be sent.
 *
 * Membership of the canonical client is the test — `clients.portal_user_id` —
 * not a role name and not an external membership, because C3 says one client
 * identity serves CreditOps, FundingOps and later DIY.
 *
 * This decides ROUTING. It is not the security layer: every row each portal
 * reads is filtered by row-level security as the signed-in person, and would
 * be filtered identically if this guard were deleted. A partner contact
 * cannot see another partner, and a client cannot see a partner, because of
 * the policies — not because of this file.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/auth-context";
import { FullScreenSpinner } from "@/components/auth/RequireAuth";
import { usePortalHome } from "@/lib/data/use-client-portal";

export function RequirePortalClient({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const home = usePortalHome();

  if (auth.status === "loading") return <FullScreenSpinner />;
  if (auth.mode === "live" && auth.status === "signed-out") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (home.isLoading) return <FullScreenSpinner />;

  /* Signed in, but not a client of anybody. Before concluding they have no
     portal, ask the other two questions. */
  if (!home.data) {
    if (auth.partnerContacts.length > 0) return <Navigate to="/partner" replace />;
    const isStaff = auth.isAgencyStaff || auth.orgMemberships.length > 0;
    if (isStaff) return <Navigate to="/app" replace />;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-foreground">No portal access yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This sign-in is not linked to a client file or a partner account. If somebody set one up for you, ask
            them to check the email address on it matches the one you signed in with.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
