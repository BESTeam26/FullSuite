/**
 * Roles & access — the organization owner/admin decides what each role may do
 * inside each entitled product: departments (work or read), workspace views,
 * progress editing, the management layer. Defaults come from the platform;
 * an edited role shows "Configured" and can be reset. Every Save is a real
 * write through the audited database function, which re-checks authorization,
 * entitlement and every department/view name.
 */
import { useMemo, useState } from "react";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { errorMessage } from "@/lib/data/error-message";
import { roleAccessKey } from "@/lib/data/role-access";
import { useOrganizationRoleAccess, useRoleAccessMutations } from "@/lib/data/use-role-access";
import {
  CONFIGURABLE_ROLES,
  ORG_ROLE_LABELS,
  defaultRoleAccess,
  departmentsFor,
  type OpsProduct,
  type OrgRoleKey,
  type RoleAccess,
} from "@/lib/fulfillment/role-access-defaults";
import { hiddenViews, workspaceViewOptions } from "@/lib/fulfillment/workspace-views";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/settings/shared";

const PRODUCT_LABEL: Record<OpsProduct, string> = { creditOps: "CreditOps", fundingOps: "FundingOps" };

export function RoleAccessSection() {
  const { activeOrganization, isProductOn } = useAgency();
  const auth = useAuth();
  const orgId = activeOrganization?.id ?? null;
  const configured = useOrganizationRoleAccess(orgId);

  const orgRole = useMemo(
    () => auth.orgMemberships.find((m) => m.organization_id === orgId)?.role ?? null,
    [auth.orgMemberships, orgId],
  );
  const canEdit = auth.mode === "live" && (orgRole === "org_admin" || auth.agencyMembership !== null);

  if (!activeOrganization || !orgId) {
    return (
      <SectionCard icon={ShieldCheck} title="Roles & access">
        <p className="text-sm text-muted-foreground">Open an organization to configure its roles.</p>
      </SectionCard>
    );
  }
  const products = (["creditOps", "fundingOps"] as OpsProduct[]).filter((p) => isProductOn(p));
  if (products.length === 0) {
    return (
      <SectionCard icon={ShieldCheck} title="Roles & access">
        <p className="text-sm text-muted-foreground">No configurable product is enabled for this organization.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Roles are what your people are assigned. Here you decide what each role may do inside each product —
        which departments it works or reads, which workspace views it sees, and whether it edits progress or
        opens the management layer. Organization admins and managers always have full access to your own
        products. {canEdit ? "" : "Only an organization owner/admin can change these."}
      </p>
      {configured.error && <p role="alert" className="text-sm text-status-danger">{configured.error}</p>}
      {products.map((product) => (
        <SectionCard key={product} icon={ShieldCheck} title={`${PRODUCT_LABEL[product]} roles`}>
          <div className="space-y-4">
            {CONFIGURABLE_ROLES[product].map((role) => (
              <RoleCard
                key={role}
                organizationId={orgId}
                product={product}
                role={role}
                configured={configured.rows[roleAccessKey(role, product)] ?? null}
                organizationHiddenViews={hiddenViews(activeOrganization.workspaceViews, product)}
                canEdit={canEdit}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

function RoleCard({
  organizationId,
  product,
  role,
  configured,
  organizationHiddenViews,
  canEdit,
}: {
  organizationId: string;
  product: OpsProduct;
  role: OrgRoleKey;
  configured: RoleAccess | null;
  organizationHiddenViews: string[];
  canEdit: boolean;
}) {
  const base = configured ?? defaultRoleAccess(role, product);
  const [draft, setDraft] = useState<RoleAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { save, reset } = useRoleAccessMutations(organizationId);
  const value = draft ?? base;
  const dirty = draft !== null;
  const busy = save.isPending || reset.isPending;

  const views = workspaceViewOptions(product).filter(
    (v) => v.configurable && !organizationHiddenViews.includes(v.id),
  );
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const edit = (patch: Partial<RoleAccess>) => setDraft({ ...value, ...patch });

  const commit = () =>
    save.mutate(
      { ...value, role, product },
      { onSuccess: () => { setDraft(null); setError(null); }, onError: (e) => setError(errorMessage(e, "Could not save this role.")) },
    );
  const restore = () =>
    reset.mutate(
      { role, product },
      { onSuccess: () => { setDraft(null); setError(null); }, onError: (e) => setError(errorMessage(e, "Could not reset this role.")) },
    );

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{ORG_ROLE_LABELS[role]}</h3>
          <span
            className={
              configured
                ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-status-success"
                : "rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"
            }
          >
            {configured ? "Configured" : "Default"}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {configured && (
              <Button type="button" variant="ghost" size="sm" onClick={restore} disabled={busy}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to default
              </Button>
            )}
            {dirty && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
            )}
            <Button type="button" size="sm" onClick={commit} disabled={!dirty || busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Departments</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {departmentsFor(product).map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={value.departments.includes(d)}
                  disabled={!canEdit || busy}
                  onCheckedChange={() => edit({ departments: toggleIn(value.departments, d) })}
                  aria-label={`${ORG_ROLE_LABELS[role]}: ${d}`}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Workspace views <span className="font-normal normal-case">(none checked = all the organization shows)</span>
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {views.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={value.views.includes(v.id)}
                  disabled={!canEdit || busy}
                  onCheckedChange={() => edit({ views: toggleIn(value.views, v.id) })}
                  aria-label={`${ORG_ROLE_LABELS[role]}: ${v.label}`}
                />
                {v.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { key: "canLogWork" as const, label: "Can log work", hint: "Off = read access to the departments above" },
          { key: "canEditProgress" as const, label: "Can edit progress", hint: "Department / stage progress steps" },
          { key: "canAccessManagement" as const, label: "Management layer", hint: "Cross-record management views" },
        ].map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{f.label}</p>
              <p className="text-[11px] text-muted-foreground">{f.hint}</p>
            </div>
            <Switch
              checked={value[f.key]}
              disabled={!canEdit || busy}
              onCheckedChange={(checked) => edit({ [f.key]: checked } as Partial<RoleAccess>)}
              aria-label={`${ORG_ROLE_LABELS[role]}: ${f.label}`}
            />
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-status-danger">{error}</p>}
    </div>
  );
}
