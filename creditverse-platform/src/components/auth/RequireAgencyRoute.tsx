/**
 * The door, using the same key as the menu.
 *
 * `Sidebar` decides what to show by calling `accessTo`; this decides what
 * opens by calling the same function with the same inputs. That is the whole
 * design: a hidden menu item is not security, so the two must never be able to
 * disagree about who may be where.
 *
 * This is the interface layer. The database still decides what rows anybody
 * receives — a refusal here is a courtesy, not the protection (rule 3).
 */
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Lock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";
import { accessTo, routeFor, type AccessContext, type AgencyRole } from "@/lib/agency/navigation";

function Refusal({ icon: Icon, title, body }: { icon: typeof Lock; title: string; body: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-bold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export const RequireAgencyRoute = ({ children }: { children: ReactNode }) => {
  const { agencyMembership, isAgencyStaff, status } = useAuth();
  const permissions = usePermissions();
  const { pathname } = useLocation();

  const spec = routeFor(pathname);
  /* Not an Agency HQ route: this guard has no opinion, and inventing one
     would refuse organization pages it knows nothing about. */
  if (!spec) return <>{children}</>;

  /* Still resolving. Render nothing rather than flashing a refusal at
     somebody who is in fact allowed. */
  if (status === "loading" || permissions.loading) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  const ctx: AccessContext = {
    role: (agencyMembership?.role as AgencyRole) ?? null,
    can: (key) => permissions.can(key as PermissionKeyName),
  };
  const access = accessTo(spec, ctx);
  if (access === "allow") return <>{children}</>;

  if (access === "locked") {
    return (
      <Refusal
        icon={Lock}
        title={`${spec.label} is not available yet`}
        body={spec.lockedReason ?? "This area is not finished and is not open for use."}
      />
    );
  }

  /* `hide` and `deny` get the same answer, and it says nothing about what
     exists. Telling somebody which page they were refused is a small leak of
     the thing they were refused. */
  return (
    <Refusal
      icon={ShieldAlert}
      title="Access denied"
      body={
        isAgencyStaff
          ? "Your role does not include this area. If you need it, ask an administrator."
          : "This is a BES internal area."
      }
    />
  );
};
