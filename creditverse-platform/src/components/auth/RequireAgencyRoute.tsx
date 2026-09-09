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
import { useAgencyPermissions, type AgencyPermission } from "@/lib/data/agency-permissions";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";
import { accessTo, routeFor } from "@/lib/agency/navigation";
import { useAgencyAccessContext } from "@/lib/agency/use-access-context";

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
  const agencyPermissions = useAgencyPermissions();
  const { pathname } = useLocation();
  /* The SAME context the Sidebar renders from, so a visible link cannot lead
     to a refusal. It also carries the previewed person during a View As, which
     is what makes a preview's route guard as exact as its menu (§37).

     Read BEFORE the early returns below: a hook that runs only on some renders
     changes hook order between them, which React forbids. */
  const { ctx } = useAgencyAccessContext();

  const spec = routeFor(pathname);
  /* Not an Agency HQ route: this guard has no opinion, and inventing one
     would refuse organization pages it knows nothing about. */
  if (!spec) return <>{children}</>;

  /* Still resolving. Render nothing rather than flashing a refusal at
     somebody who is in fact allowed — and only ever the content area, because
     this guard now sits inside the shell. It used to wrap the whole layout,
     so this branch removed the navigation as well, which read as the app
     breaking on every tab change. */
  if (status === "loading" || permissions.loading || agencyPermissions.loading) {
    /* A page-shaped skeleton, not an empty box: the old blank div made every
       first paint look like the app had failed and then flashed the real page
       in (rule 15 — loading preserves layout). */
    return (
      <div className="animate-pulse p-6 md:p-8" aria-busy="true" aria-label="Checking access">
        <div className="mb-6 h-7 w-56 rounded-lg bg-muted" />
        <div className="mb-3 h-4 w-80 max-w-full rounded bg-muted/70" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-24 rounded-xl bg-muted/60" />
          <div className="h-24 rounded-xl bg-muted/60" />
          <div className="h-24 rounded-xl bg-muted/60" />
        </div>
        <div className="mt-4 h-64 rounded-xl bg-muted/40" />
      </div>
    );
  }

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
