/**
 * GHL-style permission tree for one member: every permission key grouped by
 * module, the member's effective answer with where it comes from (admin role ·
 * override · organization default · platform default), a toggle that writes a
 * per-member override through set_member_permission(), "reset to role
 * default", and Copy Permission from another member. The database decides
 * and audits; this component only shows and asks.
 */
import { useMemo, useState } from "react";
import { Copy, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/data/error-message";
import { copyMemberPermissions, effectivePermission, setMemberPermission, type OrgRole } from "@/lib/data/team-permissions";
import type { TeamMember } from "@/lib/data/team-members";
import { useInvalidatePermissions, useMemberPermissions, usePermissionKeys, useRolePermissions } from "@/lib/data/use-team-permissions";
import { ORG_ROLE_LABELS } from "@/lib/fulfillment/role-access-defaults";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { admin: "by role (admin)", override: "set for this member", organization: "your organization's default for this role", default: "platform default for this role", deny: "not granted" } as const;

export function MemberPermissionTree({ member, organizationId, role, members, canEdit }: { member: TeamMember; organizationId: string; role: OrgRole; members: TeamMember[]; canEdit: boolean }) {
  const keys = usePermissionKeys();
  const rolePerms = useRolePermissions(organizationId);
  const overrides = useMemberPermissions(member.membershipId);
  const invalidate = useInvalidatePermissions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string>("");
  const isAdmin = role === "org_admin" || role === "org_manager";

  const modules = useMemo(() => {
    const by = new Map<string, typeof keys.data>();
    for (const k of keys.data ?? []) by.set(k.module, [...(by.get(k.module) ?? []), k]);
    return [...by.entries()];
  }, [keys.data]);

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(member.membershipId, organizationId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };
  const others = members.filter((m) => m.membershipId !== member.membershipId);
  const loading = keys.isLoading || rolePerms.isLoading || overrides.isLoading;

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground">Permissions</p>
          <p className="text-[11px] text-muted-foreground">{isAdmin ? "Admins and managers hold every permission by role; nothing to toggle." : "Each switch is this member's answer. Toggling records an override for them alone; reset returns to the role's default."}</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {canEdit && !isAdmin && others.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background p-3">
          <label className="block min-w-56 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Copy permission from</span>
            <OpsSelect value={copyFrom} onValueChange={setCopyFrom} options={others.map((m) => ({ value: m.membershipId, label: `${m.name} · ${ORG_ROLE_LABELS[m.role]}` }))} placeholder="Choose a team member…" aria-label="Copy permissions from" />
          </label>
          <Button size="sm" variant="outline" disabled={!copyFrom || busy !== null} onClick={() => void run("copy", () => copyMemberPermissions(copyFrom, member.membershipId), "Could not copy permissions.").then(() => setCopyFrom(""))}>
            {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="mr-1 h-4 w-4" />} Copy Permission
          </Button>
          <p className="w-full text-[10px] text-muted-foreground">Copies that member's role and per-member overrides onto {member.name}. Their data-visibility scope is not copied.</p>
        </div>
      )}

      {!isAdmin && modules.map(([module, list]) => (
        <div key={module} className="rounded-xl border border-border bg-background">
          <p className="border-b border-border/60 px-3 py-2 text-xs font-bold text-foreground">{module}</p>
          <ul className="divide-y divide-border/60">
            {(list ?? []).map((k) => {
              const eff = effectivePermission(k.key, role, organizationId, rolePerms.data ?? [], overrides.data ?? []);
              return (
                <li key={k.key} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                  <Switch checked={eff.allowed} disabled={!canEdit || busy !== null} aria-label={k.label}
                    onCheckedChange={(v) => void run(k.key, () => setMemberPermission(member.membershipId, k.key, v), "Could not change the permission.")} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground">{k.label}{k.securityRelevant && <ShieldAlert className="h-3.5 w-3.5 text-status-warning" aria-label="Security-relevant" />}</p>
                    <p className="text-[10px] text-muted-foreground">{k.description ? `${k.description} · ` : ""}{SOURCE_LABEL[eff.source]}</p>
                  </div>
                  {busy === k.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {eff.source === "override" && canEdit && (
                    <button type="button" disabled={busy !== null} onClick={() => void run(`reset:${k.key}`, () => setMemberPermission(member.membershipId, k.key, null), "Could not reset the permission.")} className={cn("inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:opacity-60")}>
                      <RotateCcw className="h-3 w-3" /> Reset to role default
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}
