/**
 * Route-level permission guard for organization members.
 *
 * The sidebar hides links a member may not use; this closes the typed-URL
 * path with a plain message. BES staff and the agency view pass through (their
 * access is engagement and scope, enforced in the database), and so does demo
 * mode. Interface only: every writer re-checks the same key in the database
 * (0065), so this is presentation, never the protection.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";

const NotPermitted = ({ label }: { label: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Lock className="h-5 w-5" />
    </div>
    <h1 className="text-lg font-bold text-foreground">{label} is not part of your role</h1>
    <p className="max-w-md text-sm text-muted-foreground">
      Your organization administrator decides which areas each role can open. Ask them if you need this one.
    </p>
    <Link
      to="/app"
      className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
    >
      Back to Home
    </Link>
  </div>
);

export const RequirePermission = ({
  permission,
  label,
  children,
}: {
  /** One key, or several where any one of them opens the screen. */
  permission: PermissionKeyName | readonly PermissionKeyName[];
  label: string;
  children: ReactNode;
}) => {
  const { can, loading } = usePermissions();
  /* Layout stays put while the one cached permissions query resolves. */
  if (loading) return <div className="min-h-[60vh]" aria-busy="true" />;
  return can(permission) ? <>{children}</> : <NotPermitted label={label} />;
};
