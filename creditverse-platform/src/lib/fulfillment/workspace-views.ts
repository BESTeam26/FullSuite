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
import {
  PARTNER_VIEWS,
  type CreditOpsViewScope,
  type PartnerViewId,
} from "@/lib/fulfillment/creditops-partners";
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

/* ------------------------------------------------------------------ */
/* Person scope — which views this employee's job includes             */
/*                                                                     */
/* A second, independent axis from the organization's own setting      */
/* above. The organization decides which views EXIST for its people;   */
/* this decides which of them belong to THIS person's job. A view has  */
/* to survive both to render.                                          */
/* ------------------------------------------------------------------ */

export interface PersonViewScope {
  /** The CreditOps departments this person works. */
  departments: readonly string[] | undefined;
  /** Cross-department operations tooling — Escalations, CRM Signal Log. */
  canAccessManagement: boolean;
}

/**
 * A department queue this person may INSPECT but does not belong to.
 *
 * Dee, 2026-09-13: *"If a Team Lead / Operations Manager needs broader
 * visibility, do not fake it by putting every department under `My
 * Department`… `My Department` should still represent their actual
 * organizational assignment."*
 *
 * So management's extra reach is a separate band with its own honest label,
 * not a quietly widened one. A manager who is on the Dispute team sees Dispute
 * under MY DEPARTMENT and the other four under ALL QUEUES.
 */
export function creditOpsQueuesToInspect(scope: PersonViewScope): PartnerViewId[] {
  if (scope.canAccessManagement !== true) return [];
  const mine = new Set(scope.departments ?? []);
  return PARTNER_VIEWS
    .filter((v) => v.scope === "department" && !mine.has(v.department))
    .map((v) => v.id);
}

/**
 * The CreditOps views this person's job includes, in workspace order.
 *
 * Dee, 2026-09-11: *"Every authorized CreditOps team member should have:
 * Dashboard, Main Client List, Their Department Queue(s), SOPs & Logins."*
 *
 * Universal views are universal on purpose. Main Client List is the shared
 * CreditOps directory — a Complaints agent must be able to look up a client
 * that Dispute is working and report where it is, without being able to work
 * it. That is why this narrows QUEUES and never narrows the directory.
 */
export function creditOpsViewsForPerson(scope: PersonViewScope): PartnerViewId[] {
  /* An absent list means no department, not every department: a caller who
     has not resolved the assignment yet must not be handed the whole
     operation for a frame (rule 1, default deny). The universal views still
     render, so the workspace is never empty while it resolves. */
  const departments = scope.departments ?? [];
  return PARTNER_VIEWS.filter((v) => {
    if (v.scope === "universal") return true;
    if (v.scope === "management") return scope.canAccessManagement === true;
    /* A department queue belongs to the people IN that department. Management
       still reaches every queue — through `creditOpsQueuesToInspect`, under a
       band that says so — because "running the operation means seeing the work
       in it" was true, and "…so call it My Department" never was. */
    return departments.includes(v.department);
  }).map((v) => v.id);
}

export interface CreditOpsNavItem {
  id: PartnerViewId;
  label: string;
  scope: CreditOpsViewScope;
}

/**
 * The same decision as `creditOpsViewsForPerson`, grouped the way the second
 * navigation pane shows it.
 *
 * Dee, 2026-09-11: *"Do not solve complexity by removing navigation hierarchy.
 * The hierarchy is useful. The problem is too much operational detail on every
 * surface."* So the pane keeps its shape — CreditOps, then the partner folders
 * — and only the middle group changes per person:
 *
 *   universal    Dashboard · Main Client List        everyone
 *   department   MY DEPARTMENT · their queues        their assignment
 *   management   Escalation Queue · CRM Signal Log   management capability
 *
 * One function so the pane, the collapsed icon rail and the workspace tabs
 * cannot disagree about who may see what.
 */
export function creditOpsNavForPerson(scope: PersonViewScope): {
  universal: CreditOpsNavItem[];
  department: CreditOpsNavItem[];
  /** Queues a manager may inspect but is not a member of. Empty for everyone else. */
  allQueues: CreditOpsNavItem[];
  management: CreditOpsNavItem[];
} {
  const visible = new Set<string>(creditOpsViewsForPerson(scope));
  const asItem = (v: (typeof PARTNER_VIEWS)[number]) => ({
    id: v.id, label: v.label, scope: v.scope as CreditOpsViewScope,
  });
  const items = PARTNER_VIEWS.filter((v) => visible.has(v.id)).map(asItem);
  const inspect = new Set<string>(creditOpsQueuesToInspect(scope));
  /* The Dashboard is management-scoped (Dee, 2026-09-19) but, for those who
     have it, it sits with the universal pair at the top — it is where a
     manager starts, not a tool in the MANAGEMENT band. */
  return {
    universal: items.filter((v) => v.scope === "universal" || v.id === "dashboard"),
    department: items.filter((v) => v.scope === "department"),
    allQueues: PARTNER_VIEWS.filter((v) => inspect.has(v.id)).map(asItem),
    management: items.filter((v) => v.scope === "management" && v.id !== "dashboard"),
  };
}
