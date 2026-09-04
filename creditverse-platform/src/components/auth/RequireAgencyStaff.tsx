/**
 * Route-level guard for BES-internal screens.
 *
 * The sidebar already shows a different navigation to customer organizations,
 * but a hidden link is presentation, not protection (rule 1). These routes had
 * no role gate at all: `RequireAuth` checks only that somebody is signed in
 * with *some* membership, so an organization user could reach Agency HQ screens
 * by typing the URL. Live surfaces still returned nothing, because RLS does the
 * real work — but the surfaces backed by placeholder arrays had nothing
 * protecting them, and those were the ones naming other customers.
 *
 * This is the same shape as `RequireEntitlement` and reads the same
 * authorization context; it is not a second permission system. `isAgencyStaff`
 * comes from the agency membership resolved once at sign-in, and the database
 * enforces the same boundary independently (rule 3: both layers, every time).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

const NotBesStaff = ({ label }: { label: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <ShieldOff className="h-5 w-5" />
    </div>
    <h1 className="text-lg font-bold text-foreground">
      {label} is a BES team screen
    </h1>
    <p className="max-w-md text-sm text-muted-foreground">
      This page shows BES internal operations across every customer, so it is
      not available from an organization account.
    </p>
    <Link
      to="/app"
      className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Back to Home
    </Link>
  </div>
);

export const RequireAgencyStaff = ({
  label,
  children,
}: {
  /** Human name for the refusal message. */
  label: string;
  children: ReactNode;
}) => {
  const { isAgencyStaff, mode } = useAuth();

  // Demo mode has no real memberships and exists to be explorable.
  if (mode === "demo") return <>{children}</>;

  return isAgencyStaff ? <>{children}</> : <NotBesStaff label={label} />;
};
