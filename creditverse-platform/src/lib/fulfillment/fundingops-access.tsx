/**
 * FundingOps Access Control — Role + Stage + Permission scope.
 *
 * Mirrors the CreditOps access model but with funding-domain stages instead of
 * credit-repair departments. Governs who can EDIT Stage Progress vs view-only,
 * and which stages an agent is authorized to log work through Complete Work.
 *
 * This is the frontend enforcement layer. The same rules must be enforced
 * server-side when the backend is connected.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import { resolveFundingOpsRole, resolveOpsAccess } from "@/lib/fulfillment/ops-role-resolver";
import { useOrganizationRoleAccess } from "@/lib/data/use-role-access";
import { roleAccessKey } from "@/lib/data/role-access";
import { ORG_ROLE_LABELS } from "@/lib/fulfillment/role-access-defaults";

/* ------------------------------------------------------------------ */
/* Funding stages (replace CreditOps departments)                      */
/* ------------------------------------------------------------------ */

export type FundingStage =
  | "Readiness Review"
  | "Document Review"
  | "Lender Matching"
  | "Submissions"
  | "Stipulations"
  | "Offers"
  | "Funded Deals";

export const ALL_STAGES: FundingStage[] = [
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submissions",
  "Stipulations",
  "Offers",
  "Funded Deals",
];

/* ------------------------------------------------------------------ */
/* Work Completion action library                                      */
/*                                                                     */
/* One submitted Funding Work session = ONE production unit (one file  */
/* worked). The checked completion items are the meaningful actions     */
/* completed inside that unit — they are NOT additional files.         */
/* ------------------------------------------------------------------ */

export interface WorkItemDef {
  id: string;
  label: string;
  stage: FundingStage;
}

export const WORK_ITEMS: WorkItemDef[] = [
  // ── Readiness Review ─────────────────────────────────────────────
  {
    id: "rr-profile",
    label: "Business Profile Reviewed",
    stage: "Readiness Review",
  },
  {
    id: "rr-credit",
    label: "Credit Readiness Assessed",
    stage: "Readiness Review",
  },
  {
    id: "rr-barrier",
    label: "Credit Barrier Identified",
    stage: "Readiness Review",
  },
  {
    id: "rr-bridge",
    label: "Referred to CreditOps/DIY",
    stage: "Readiness Review",
  },
  { id: "rr-other", label: "Other Readiness Work", stage: "Readiness Review" },

  // ── Document Review ──────────────────────────────────────────────
  { id: "dr-collect", label: "Documents Collected", stage: "Document Review" },
  {
    id: "dr-verify",
    label: "Document Verification Completed",
    stage: "Document Review",
  },
  {
    id: "dr-stips",
    label: "Stipulations Identified",
    stage: "Document Review",
  },
  {
    id: "dr-followup",
    label: "Missing Docs Followed Up",
    stage: "Document Review",
  },
  { id: "dr-other", label: "Other Document Work", stage: "Document Review" },

  // ── Lender Matching ───────────────────────────────────────────────
  {
    id: "lm-eligible",
    label: "Lender Eligibility Check",
    stage: "Lender Matching",
  },
  {
    id: "lm-match",
    label: "Program Match Completed",
    stage: "Lender Matching",
  },
  {
    id: "lm-shortlist",
    label: "Lender Shortlist Prepared",
    stage: "Lender Matching",
  },
  { id: "lm-other", label: "Other Matching Work", stage: "Lender Matching" },

  // ── Submissions ───────────────────────────────────────────────────
  { id: "sb-package", label: "Deal Packaged", stage: "Submissions" },
  {
    id: "sb-submit",
    label: "Lender Submission Completed",
    stage: "Submissions",
  },
  {
    id: "sb-confirm",
    label: "Submission Confirmation Logged",
    stage: "Submissions",
  },
  { id: "sb-other", label: "Other Submission Work", stage: "Submissions" },

  // ── Stipulations ──────────────────────────────────────────────────
  { id: "st-review", label: "Stipulations Reviewed", stage: "Stipulations" },
  {
    id: "st-request",
    label: "Stips Requested from Client",
    stage: "Stipulations",
  },
  { id: "st-satisfy", label: "Stipulation Satisfied", stage: "Stipulations" },
  { id: "st-other", label: "Other Stipulation Work", stage: "Stipulations" },

  // ── Offers ────────────────────────────────────────────────────────
  { id: "of-receive", label: "Offer Received & Logged", stage: "Offers" },
  { id: "of-negotiate", label: "Offer Negotiation Completed", stage: "Offers" },
  { id: "of-present", label: "Offer Presented to Client", stage: "Offers" },
  { id: "of-accept", label: "Offer Accepted", stage: "Offers" },
  { id: "of-other", label: "Other Offer Work", stage: "Offers" },

  // ── Funded Deals ──────────────────────────────────────────────────
  { id: "fd-fund", label: "Deal Funded", stage: "Funded Deals" },
  {
    id: "fd-verify",
    label: "Funding Verification Completed",
    stage: "Funded Deals",
  },
  { id: "fd-renew", label: "Renewal Initiated", stage: "Funded Deals" },
  {
    id: "fd-partner",
    label: "Partner Update Completed",
    stage: "Funded Deals",
  },
  { id: "fd-other", label: "Other Funded Work", stage: "Funded Deals" },
];

/* ------------------------------------------------------------------ */
/* FundingOps roles                                                    */
/* ------------------------------------------------------------------ */

export type FundingOpsRoleKey =
  | "admin"
  | "full-agent"
  | "readiness"
  | "documents"
  | "matching"
  | "submissions"
  | "stipulations"
  | "offers"
  /** No FundingOps membership: nothing to log, nothing to manage (deny). */
  | "none";

export interface FundingOpsRoleDef {
  key: FundingOpsRoleKey;
  label: string;
  shortLabel: string;
  description: string;
  /** Can edit Stage Progress steps (view-only when false). */
  canEditStageProgress: boolean;
  /** Stages this role is authorized to log work against. */
  allowedStages: FundingStage[];
  /** Can access the Management layer (cross-partner aggregate views). */
  canAccessManagement: boolean;
}

export const FUNDINGOPS_ROLES: Record<FundingOpsRoleKey, FundingOpsRoleDef> = {
  admin: {
    key: "admin",
    label: "FundingOps Admin / Manager",
    shortLabel: "Admin",
    description:
      "Full FundingOps management access. Can edit Stage Progress, log work across all stages, and manage assignments.",
    canEditStageProgress: true,
    allowedStages: ALL_STAGES,
    canAccessManagement: true,
  },
  "full-agent": {
    key: "full-agent",
    label: "Full-Process Agent",
    shortLabel: "Full Agent",
    description:
      "Handles the complete funding lifecycle across all stages but cannot edit Stage Progress (view-only).",
    canEditStageProgress: false,
    allowedStages: ALL_STAGES,
    canAccessManagement: false,
  },
  readiness: {
    key: "readiness",
    label: "Readiness Specialist",
    shortLabel: "Readiness",
    description: "Readiness Review stage only.",
    canEditStageProgress: false,
    allowedStages: ["Readiness Review"],
    canAccessManagement: false,
  },
  documents: {
    key: "documents",
    label: "Document Specialist",
    shortLabel: "Documents",
    description: "Document Review stage only.",
    canEditStageProgress: false,
    allowedStages: ["Document Review"],
    canAccessManagement: false,
  },
  matching: {
    key: "matching",
    label: "Lender Matching Specialist",
    shortLabel: "Matching",
    description: "Lender Matching stage only.",
    canEditStageProgress: false,
    allowedStages: ["Lender Matching"],
    canAccessManagement: false,
  },
  submissions: {
    key: "submissions",
    label: "Submissions Specialist",
    shortLabel: "Submissions",
    description: "Submissions stage only.",
    canEditStageProgress: false,
    allowedStages: ["Submissions"],
    canAccessManagement: false,
  },
  stipulations: {
    key: "stipulations",
    label: "Stipulations Specialist",
    shortLabel: "Stipulations",
    description: "Stipulations stage only.",
    canEditStageProgress: false,
    allowedStages: ["Stipulations"],
    canAccessManagement: false,
  },
  offers: {
    key: "offers",
    label: "Offers / Closing Specialist",
    shortLabel: "Offers",
    description: "Offers & Funded Deals stages only.",
    canEditStageProgress: false,
    allowedStages: ["Offers", "Funded Deals"],
    canAccessManagement: false,
  },
  none: {
    key: "none",
    label: "No FundingOps role",
    shortLabel: "No role",
    description:
      "This account has no FundingOps membership for the active organization. Records may be viewed where the database allows; nothing can be logged.",
    canEditStageProgress: false,
    allowedStages: [],
    canAccessManagement: false,
  },
};

/** Roles a person can hold — "none" is a resolution result, not a choice. */
export const FUNDINGOPS_ROLE_LIST = (
  Object.keys(FUNDINGOPS_ROLES) as FundingOpsRoleKey[]
).filter((r) => r !== "none");

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

interface FundingOpsAccessValue {
  role: FundingOpsRoleKey;
  /** Demo mode only: preview another role. A no-op against a live session. */
  setRole: (r: FundingOpsRoleKey) => void;
  /** True only in demo mode, where the role is not backed by a membership. */
  canSwitchRole: boolean;
  roleDef: FundingOpsRoleDef;
  /** False = read access to the allowed stages; work logging is not offered. */
  canLogWork: boolean;
  /** Workspace view ids this role may see; empty = every view the organization shows. */
  allowedViews: string[];
  canEditStageProgress: boolean;
  canAccessManagement: boolean;
  allowedStages: FundingStage[];
  /** Work items the current role is authorized to log. */
  allowedWorkItems: WorkItemDef[];
  canLogStage: (stage: FundingStage) => boolean;
}

const FundingOpsAccessContext = createContext<FundingOpsAccessValue | null>(
  null,
);

export function FundingOpsAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  /* Same rule as CreditOps: live sessions resolve access from membership rows
     plus the organization's configured role access; only demo mode may
     preview a role. */
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const live = auth.mode === "live";
  const [previewRole, setPreviewRole] = useState<FundingOpsRoleKey>("admin");
  const agencyRole = auth.agencyMembership?.role ?? null;
  const orgRole =
    auth.orgMemberships.find(
      (m) => m.organization_id === activeOrganization?.id,
    )?.role ?? null;
  const configuredRows = useOrganizationRoleAccess(
    live && !agencyRole && orgRole ? (activeOrganization?.id ?? null) : null,
  );
  const configured = orgRole
    ? (configuredRows.rows[roleAccessKey(orgRole, "fundingOps")] ?? null)
    : null;

  const role: FundingOpsRoleKey = live
    ? resolveFundingOpsRole({ agencyRole, orgRole })
    : previewRole;
  const preview = FUNDINGOPS_ROLES[previewRole];
  const access = live
    ? resolveOpsAccess({ agencyRole, orgRole, product: "fundingOps", configured })
    : {
        departments: preview.allowedStages,
        views: [],
        canLogWork: preview.allowedStages.length > 0,
        canEditProgress: preview.canEditStageProgress,
        canAccessManagement: preview.canAccessManagement,
      };
  const allowedStages = access.departments.filter((d): d is FundingStage =>
    (ALL_STAGES as string[]).includes(d),
  );
  const roleDef: FundingOpsRoleDef = live
    ? {
        key: role,
        label: orgRole && !agencyRole ? ORG_ROLE_LABELS[orgRole] : FUNDINGOPS_ROLES[role].label,
        shortLabel: orgRole && !agencyRole ? ORG_ROLE_LABELS[orgRole] : FUNDINGOPS_ROLES[role].shortLabel,
        description: configured
          ? "Access configured by your organization (Settings → Roles & access)."
          : FUNDINGOPS_ROLES[role].description,
        canEditStageProgress: access.canEditProgress,
        allowedStages,
        canAccessManagement: access.canAccessManagement,
      }
    : preview;

  const allowedWorkItems = WORK_ITEMS.filter((w) =>
    allowedStages.includes(w.stage),
  );

  const canLogStage = (stage: FundingStage) =>
    access.canLogWork && allowedStages.includes(stage);

  return (
    <FundingOpsAccessContext.Provider
      value={{
        role,
        setRole: live ? () => {} : setPreviewRole,
        canSwitchRole: !live,
        roleDef,
        canLogWork: access.canLogWork,
        allowedViews: access.views,
        canEditStageProgress: roleDef.canEditStageProgress,
        canAccessManagement: roleDef.canAccessManagement,
        allowedStages,
        allowedWorkItems,
        canLogStage,
      }}
    >
      {children}
    </FundingOpsAccessContext.Provider>
  );
}

/* Outside the provider nothing is known about the person: deny (rule 1). */
const FALLBACK_ROLE: FundingOpsRoleKey = "none";

export function useFundingOpsAccess(): FundingOpsAccessValue {
  const ctx = useContext(FundingOpsAccessContext);
  if (ctx) return ctx;
  const roleDef = FUNDINGOPS_ROLES[FALLBACK_ROLE];
  const allowedWorkItems = WORK_ITEMS.filter((w) =>
    roleDef.allowedStages.includes(w.stage),
  );
  const canLogStage = (stage: FundingStage) =>
    roleDef.allowedStages.includes(stage);
  return {
    role: FALLBACK_ROLE,
    setRole: () => {},
    canSwitchRole: false,
    roleDef,
    canLogWork: false,
    allowedViews: [],
    canEditStageProgress: roleDef.canEditStageProgress,
    canAccessManagement: roleDef.canAccessManagement,
    allowedStages: roleDef.allowedStages,
    allowedWorkItems,
    canLogStage,
  };
}
