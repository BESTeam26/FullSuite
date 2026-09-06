/**
 * One answer for "may this person do X here?", read from the permissions the
 * database computed for them (my_permissions(), cached once per organization).
 * BES staff are not gated by an organization's keys (their access is
 * engagement and scope); demo mode answers yes so the sample walkthrough works.
 * Interface only: the same key is enforced inside the database function
 * (0065), so hiding a control is presentation, never the protection.
 */
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useMyPermissions } from "@/lib/data/use-team-permissions";

export type PermissionKeyName =
  | "creditops.clients.view" | "creditops.clients.edit" | "creditops.reports.import" | "creditops.letters.build" | "creditops.letters.approve" | "creditops.letters.templates"
  | "fundingops.files.view" | "fundingops.files.edit" | "fundingops.documents.review" | "fundingops.submissions.create" | "fundingops.offers.manage" | "fundingops.funding.confirm" | "fundingops.lenders.manage" | "fundingops.commissions.view"
  | "workspaces.manage" | "reports.view" | "reports.export" | "team.manage" | "team.permissions" | "settings.manage" | "billing.view" | "billing.manage";

export function usePermission(key: PermissionKeyName): { allowed: boolean; loading: boolean } {
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const mine = useMyPermissions(live && !auth.isAgencyStaff ? activeOrganization?.id ?? null : null);
  if (!live || auth.isAgencyStaff || !activeOrganization) return { allowed: true, loading: false };
  if (mine.isLoading || !mine.data) return { allowed: false, loading: mine.isLoading };
  return { allowed: mine.data[key] === true, loading: false };
}

/**
 * The whole permission set at once, for surfaces that gate many controls
 * (navigation, settings menus). One cached query, no per-item hooks.
 * `gated` is false for BES staff and demo mode: nothing is hidden for them.
 */
export function usePermissions(): {
  can: (key: PermissionKeyName | readonly PermissionKeyName[]) => boolean;
  loading: boolean;
  gated: boolean;
} {
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const gated = live && !auth.isAgencyStaff && !!activeOrganization;
  const mine = useMyPermissions(gated ? activeOrganization?.id ?? null : null);
  const can = (key: PermissionKeyName | readonly PermissionKeyName[]) => {
    if (!gated) return true;
    if (!mine.data) return false;
    const keys = Array.isArray(key) ? key : [key as PermissionKeyName];
    return keys.some((k) => mine.data?.[k] === true);
  };
  return { can, loading: gated && mine.isLoading, gated };
}
