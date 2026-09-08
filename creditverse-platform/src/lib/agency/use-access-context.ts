/**
 * The one authorization context the interface runs on.
 *
 * ── WHY THIS IS A HOOK AND NOT AN EXPRESSION IN TWO FILES ──────────────────
 *
 * `Sidebar` and `RequireAgencyRoute` each built this object themselves, and
 * each carried a comment saying the menu and the door must never disagree.
 * They agreed only because somebody kept two copies in step. Extracted, so
 * they cannot drift — and so that View As has ONE place to substitute.
 *
 * ── HOW PREVIEW WORKS, EXACTLY ─────────────────────────────────────────────
 *
 * While a preview is active this returns the TARGET's role and capability
 * function. `accessTo()` — already the single authority both the menu and the
 * route guard call — then answers for the target without either of them
 * knowing a preview exists. That is Dee's §37 ("Do not only change the
 * sidebar... Preview must use the SAME canonical authorization logic for
 * navigation and routes") satisfied by construction rather than by two
 * parallel code paths.
 *
 * Nothing is impersonated: `auth.uid()` is still the previewer, so every
 * QUERY still returns the previewer's rows. That is why a data surface which
 * runs its own RLS-filtered query must say "preview unavailable" rather than
 * render — see `view-as.ts`.
 */
import { useMemo } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions, type PermissionKeyName } from "@/lib/auth/use-permission";
import { useAgencyPermissions, type AgencyPermission } from "@/lib/data/agency-permissions";
import { useViewAs } from "@/lib/agency/view-as-context";
import type { AccessContext, AgencyRole } from "@/lib/agency/navigation";

export interface AgencyAccessContext {
  ctx: AccessContext;
  /** Whether the ANSWERS below describe somebody other than the caller. */
  previewing: boolean;
  loading: boolean;
}

export function useAgencyAccessContext(): AgencyAccessContext {
  const { agencyMembership, status } = useAuth();
  const permissions = usePermissions();
  const agencyPermissions = useAgencyPermissions();
  const viewAs = useViewAs();

  /* Two engines answer the same question for different populations: the
     organization permission context, and `agency_can` for capabilities that
     exist only inside BES HQ. Either granting is a grant — a capability is
     not withheld because the other engine has never heard of it. Both are
     already resolved once per session, so this asks nothing of the network. */
  const own = useMemo<AccessContext>(
    () => ({
      role: (agencyMembership?.role as AgencyRole) ?? null,
      can: (key) =>
        agencyPermissions.can(key as AgencyPermission) ||
        permissions.can(key as PermissionKeyName),
    }),
    [agencyMembership?.role, agencyPermissions, permissions],
  );

  return {
    ctx: viewAs.previewing
      ? { role: viewAs.effectiveRole, can: viewAs.effectiveCan }
      : own,
    previewing: viewAs.previewing,
    loading: status === "loading" || permissions.loading || agencyPermissions.loading,
  };
}

/**
 * The caller's OWN context, never a preview's.
 *
 * `ViewAsProvider` needs this to know what to fall back to, and taking it
 * from `useAgencyAccessContext` would be circular.
 */
export function useOwnAccessContext(): AccessContext {
  const { agencyMembership } = useAuth();
  const permissions = usePermissions();
  const agencyPermissions = useAgencyPermissions();
  return useMemo<AccessContext>(
    () => ({
      role: (agencyMembership?.role as AgencyRole) ?? null,
      can: (key) =>
        agencyPermissions.can(key as AgencyPermission) ||
        permissions.can(key as PermissionKeyName),
    }),
    [agencyMembership?.role, agencyPermissions, permissions],
  );
}
