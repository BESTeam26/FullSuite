/**
 * Route guard for the operations workspace.
 *
 * - loading      → spinner
 * - signed-out   → redirect to /login (remembering where the user was going)
 * - signed-in but zero memberships → "no workspace access" screen
 * - otherwise    → render children
 */
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

export const FullScreenSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const NoAccess = () => {
  const { displayName, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-foreground">No workspace access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as <span className="font-medium text-foreground">{displayName}</span>, but this
          account has not been added to an agency or organization yet. Ask your
          administrator to invite you.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
};

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { status, hasAnyAccess, mode } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenSpinner />;
  if (status === "signed-out") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (mode === "live" && !hasAnyAccess) return <NoAccess />;
  return <>{children}</>;
};
