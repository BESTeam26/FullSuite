/**
 * Organization-view settings — what an organization owner/admin configures
 * about their own organization. Nothing here is agency configuration.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Loader2 } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { updateOrganizationWorkspaceViews } from "@/lib/data/organizations";
import { errorMessage } from "@/lib/data/error-message";
import {
  hiddenViews,
  toggleHiddenView,
  workspaceViewOptions,
  type WorkspaceViewProduct,
} from "@/lib/fulfillment/workspace-views";
import { SectionCard, ToggleRow } from "@/components/settings/shared";

const PRODUCT_LABEL: Record<WorkspaceViewProduct, string> = {
  creditOps: "CreditOps workspace",
  fundingOps: "FundingOps workspace",
};

/**
 * Switch workspace views on or off for this organization. Each switch is a
 * real write: the database merge function authorizes it (organization
 * owner/admin, or a BES manager), refuses to hide the dashboard or the record
 * list, and audits the change. The agency's own division pages are unaffected.
 */
export function WorkspaceViewsSection() {
  const { activeOrganization, isProductOn } = useAgency();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const orgRole = useMemo(
    () =>
      auth.orgMemberships.find((m) => m.organization_id === activeOrganization?.id)
        ?.role ?? null,
    [auth.orgMemberships, activeOrganization?.id],
  );
  /* Mirrors the database rule (is_org_owner_admin OR agency manager). The
     database still decides; this only avoids offering a switch that would be
     refused (rule 3). */
  const canEdit =
    auth.mode === "live" &&
    (orgRole === "org_admin" || auth.agencyMembership !== null);

  const mutation = useMutation({
    mutationFn: (patch: ReturnType<typeof toggleHiddenView>) =>
      updateOrganizationWorkspaceViews(activeOrganization!.id, patch),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err) => setError(errorMessage(err, "Could not save this view setting.")),
  });

  if (!activeOrganization) {
    return (
      <SectionCard icon={LayoutGrid} title="Workspace views">
        <p className="text-sm text-muted-foreground">Open an organization to configure its workspace views.</p>
      </SectionCard>
    );
  }

  const products = (["creditOps", "fundingOps"] as WorkspaceViewProduct[]).filter((p) => isProductOn(p));

  return (
    <div className="space-y-6">
      {products.map((product) => {
        const hidden = new Set(hiddenViews(activeOrganization.workspaceViews, product));
        return (
          <SectionCard
            key={product}
            icon={LayoutGrid}
            title={`${PRODUCT_LABEL[product]} views`}
            description={
              canEdit
                ? "Switch off the views your team does not use. The dashboard and the record list always stay on. Changes apply to everyone in this organization."
                : "Only an organization owner/admin can change these. Shown as currently configured."
            }
            action={
              mutation.isPending ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </span>
              ) : undefined
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              {workspaceViewOptions(product).map((option) => (
                <ToggleRow
                  key={option.id}
                  label={option.label}
                  description={option.configurable ? undefined : "Always on"}
                  checked={!hidden.has(option.id)}
                  state={option.configurable && canEdit ? "live" : "enforced"}
                  onChange={() => {
                    if (!option.configurable || !canEdit || mutation.isPending) return;
                    mutation.mutate(
                      toggleHiddenView(
                        activeOrganization.workspaceViews,
                        product,
                        option.id,
                        !hidden.has(option.id),
                      ),
                    );
                  }}
                />
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-status-danger">
                {error}
              </p>
            )}
          </SectionCard>
        );
      })}
      {products.length === 0 && (
        <SectionCard icon={LayoutGrid} title="Workspace views">
          <p className="text-sm text-muted-foreground">
            No configurable workspace is enabled for this organization.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
