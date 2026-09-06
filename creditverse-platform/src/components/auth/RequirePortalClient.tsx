/**
 * The portal is for a person who IS a client, and nobody else.
 *
 * Membership of the canonical client is the test — `clients.portal_user_id` —
 * not a role name and not an external membership, because C3 says one client
 * identity serves CreditOps, FundingOps and later DIY. A staff member who
 * happens to open /portal is sent to their own workspace rather than shown an
 * empty shell.
 *
 * This decides ROUTING. It is not the security layer: every row the portal
 * reads is filtered by row-level security as the signed-in client, and would
 * be filtered identically if this guard were deleted.
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

  /* Signed in, but not a client of anybody. Staff get their workspace; anyone
     else is told plainly rather than left on a blank page. */
  if (!home.data) {
    const isStaff = auth.isAgencyStaff || auth.orgMemberships.length > 0;
    if (isStaff) return <Navigate to="/app" replace />;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-foreground">No client account here yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This sign-in is not linked to a client file. If your company set one up for you, ask them to check the
            email address on it matches the one you signed in with.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
