/**
 * Organization workspace views — which CreditOps / FundingOps views an
 * organization shows its own users.
 *
 * The setting is organization data (`organizations.workspace_views`, written
 * only through `merge_organization_workspace_views`). This module is the ONE
 * place that interprets it: what can be hidden, what never can, and the
 * resulting visible view list. The agency division pages never apply it —
 * BES sees every view of every Partner it may reach.
 *
 * Hiding a view is presentation, not authorization (rule 1): the rows behind a
 * hidden queue stay protected by their own policies.
 */
import { PARTNER_VIEWS, type PartnerViewId } from "@/lib/fulfillment/creditops-partners";
import {
  FUNDING_PARTNER_VIEWS,
  type FundingPartnerViewId,
} from "@/lib/fulfillment/fundingops-partners";

export type WorkspaceViewProduct = "creditOps" | "fundingOps";

export interface WorkspaceViewSettings {
  creditOps?: { hidden: string[] };
  fundingOps?: { hidden: string[] };
}

/** Views an organization must always keep: the overview and the record list. */
export const ALWAYS_VISIBLE_VIEWS: ReadonlySet<string> = new Set([
  "dashboard",
  "main-list",
  "deal-list",
]);

export interface WorkspaceViewOption {
  id: string;
  label: string;
  /** False for the views that can never be switched off. */
  configurable: boolean;
}

/** The catalogue for a product's settings screen, in workspace order. */
export function workspaceViewOptions(product: WorkspaceViewProduct): WorkspaceViewOption[] {
  const views: readonly { id: string; label: string }[] =
    product === "creditOps" ? PARTNER_VIEWS : FUNDING_PARTNER_VIEWS;
  return views.map((v) => ({
    id: v.id,
    label: v.label,
    configurable: !ALWAYS_VISIBLE_VIEWS.has(v.id),
  }));
}

/** Hidden ids for a product, ignoring anything that can never be hidden. */
export function hiddenViews(
  settings: WorkspaceViewSettings | null | undefined,
  product: WorkspaceViewProduct,
): string[] {
  const raw = settings?.[product]?.hidden;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id) => typeof id === "string" && !ALWAYS_VISIBLE_VIEWS.has(id));
}

export function visibleCreditOpsViews(
  settings: WorkspaceViewSettings | null | undefined,
): PartnerViewId[] {
  const hidden = new Set(hiddenViews(settings, "creditOps"));
  return PARTNER_VIEWS.map((v) => v.id).filter((id) => !hidden.has(id));
}

export function visibleFundingOpsViews(
  settings: WorkspaceViewSettings | null | undefined,
): FundingPartnerViewId[] {
  const hidden = new Set(hiddenViews(settings, "fundingOps"));
  return FUNDING_PARTNER_VIEWS.map((v) => v.id).filter((id) => !hidden.has(id));
}

/** The patch that hides or shows one view — what the settings switch sends. */
export function toggleHiddenView(
  settings: WorkspaceViewSettings | null | undefined,
  product: WorkspaceViewProduct,
  viewId: string,
  hidden: boolean,
): Pick<WorkspaceViewSettings, WorkspaceViewProduct> {
  if (ALWAYS_VISIBLE_VIEWS.has(viewId)) {
    throw new Error(`The "${viewId}" view cannot be hidden.`);
  }
  const current = new Set(hiddenViews(settings, product));
  if (hidden) current.add(viewId);
  else current.delete(viewId);
  return { [product]: { hidden: [...current] } } as Pick<WorkspaceViewSettings, WorkspaceViewProduct>;
}
