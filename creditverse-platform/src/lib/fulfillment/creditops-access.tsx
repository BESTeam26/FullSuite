/**
 * CreditOps Access Control — Role + Department + Permission scope.
 *
 * Governs who can EDIT Department Progress vs view-only, and which
 * departments/work items an agent is authorized to log through Complete Work.
 *
 * This is the frontend enforcement layer. The same rules must be enforced
 * server-side when the backend is connected.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import { resolveCreditOpsRole, resolveOpsAccess } from "@/lib/fulfillment/ops-role-resolver";
import { useOrganizationRoleAccess } from "@/lib/data/use-role-access";
import { roleAccessKey } from "@/lib/data/role-access";
import { ORG_ROLE_LABELS } from "@/lib/fulfillment/role-access-defaults";
import { useMyCreditOpsDepartments } from "@/lib/data/use-my-departments";

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

export type CreditOpsDepartment =
  "Onboarding" | "Dispute" | "Support" | "Complaints" | "Bureau Calling";

export const ALL_DEPARTMENTS: CreditOpsDepartment[] = [
  "Onboarding",
  "Dispute",
  "Support",
  "Complaints",
  "Bureau Calling",
];

/* ------------------------------------------------------------------ */
/* Work Completion action library                                      */
/*                                                                     */
/* One submitted Client Work session = ONE production unit (one file   */
/* worked). The checked completion items are the meaningful actions     */
/* completed inside that unit — they are NOT additional files.         */
/*                                                                     */
/* These are production OUTPUTS management cares about — not detailed   */
/* procedural SOP steps like "logged into SmartCredit".                */
/* ------------------------------------------------------------------ */

export interface WorkItemDef {
  id: string;
  label: string;
  department: CreditOpsDepartment;
}

export const WORK_ITEMS: WorkItemDef[] = [
  // ── Dispute Processing ─────────────────────────────────────────────
  {
    id: "dp-cra-letters",
    label: "CRA Letters Prepared",
    department: "Dispute",
  },
  {
    id: "dp-furnisher-prep",
    label: "Direct Furnisher Prep",
    department: "Dispute",
  },
  {
    id: "dp-inquiry",
    label: "Inquiry Dispute Prepared",
    department: "Dispute",
  },
  { id: "dp-chexsystems", label: "ChexSystems", department: "Dispute" },
  {
    id: "dp-ews",
    label: "Early Warning Services (EWS)",
    department: "Dispute",
  },
  {
    id: "dp-secondary",
    label: "Secondary Bureau Dispute",
    department: "Dispute",
  },
  {
    id: "dp-manual-upload",
    label: "Manual Bureau Upload",
    department: "Dispute",
  },
  { id: "dp-freeze", label: "Security Freeze", department: "Dispute" },
  {
    id: "dp-reimport",
    label: "Reimport / Credit Report Reviewed",
    department: "Dispute",
  },
  {
    id: "dp-round-complete",
    label: "Round Processing Completed",
    department: "Dispute",
  },
  { id: "dp-other", label: "Other Processing Work", department: "Dispute" },

  // ── Complaints & Mailing ───────────────────────────────────────────
  { id: "cm-prepared", label: "Complaint Prepared", department: "Complaints" },
  { id: "cm-cfpb", label: "CFPB Complaint", department: "Complaints" },
  { id: "cm-ftc", label: "FTC Filing", department: "Complaints" },
  { id: "cm-bbb", label: "BBB Complaint", department: "Complaints" },
  {
    id: "cm-ag",
    label: "Attorney General Complaint",
    department: "Complaints",
  },
  {
    id: "cm-exec",
    label: "Compliance / Executive Escalation",
    department: "Complaints",
  },
  {
    id: "cm-letters-prep",
    label: "Letters Prepared for Mailing",
    department: "Complaints",
  },
  { id: "cm-mailed", label: "Mailing Completed", department: "Complaints" },
  {
    id: "cm-proof",
    label: "Tracking / Mailing Proof Updated",
    department: "Complaints",
  },
  {
    id: "cm-other",
    label: "Other Complaint / Mailing Work",
    department: "Complaints",
  },

  // ── Bureau Calling ─────────────────────────────────────────────────
  {
    id: "bc-ex",
    label: "Experian Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-eq",
    label: "Equifax Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-tu",
    label: "TransUnion Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-furnisher",
    label: "Creditor / Furnisher Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-secondary",
    label: "Secondary Bureau Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-verify",
    label: "Verification Call Completed",
    department: "Bureau Calling",
  },
  {
    id: "bc-followup",
    label: "Follow-Up Call Completed",
    department: "Bureau Calling",
  },
  { id: "bc-other", label: "Other Call Work", department: "Bureau Calling" },

  // ── Onboarding ─────────────────────────────────────────────────────
  {
    id: "ob-file-review",
    label: "Client File Reviewed",
    department: "Onboarding",
  },
  {
    id: "ob-review",
    label: "Onboarding Review Completed",
    department: "Onboarding",
  },
  { id: "ob-docs", label: "Documents Reviewed", department: "Onboarding" },
  {
    id: "ob-missing",
    label: "Missing Requirements Followed Up",
    department: "Onboarding",
  },
  {
    id: "ob-monitoring",
    label: "Credit Monitoring Access Verified",
    department: "Onboarding",
  },
  {
    id: "ob-import",
    label: "Credit Report Imported",
    department: "Onboarding",
  },
  {
    id: "ob-ready-r1",
    label: "Client Ready for Round 1",
    department: "Onboarding",
  },
  {
    id: "ob-endorse",
    label: "Partner Endorsement Completed",
    department: "Onboarding",
  },
  { id: "ob-other", label: "Other Onboarding Work", department: "Onboarding" },

  // ── Client Success / Support ───────────────────────────────────────
  { id: "cs-update", label: "Client Update Completed", department: "Support" },
  {
    id: "cs-progress",
    label: "Progress Update Completed",
    department: "Support",
  },
  {
    id: "cs-doc-followup",
    label: "Document Follow-Up Completed",
    department: "Support",
  },
  {
    id: "cs-monitoring",
    label: "Credit Monitoring Issue Handled",
    department: "Support",
  },
  { id: "cs-billing", label: "Billing Issue Handled", department: "Support" },
  {
    id: "cs-response",
    label: "Client Response Completed",
    department: "Support",
  },
  {
    id: "cs-reimport",
    label: "Reimport Follow-Up Completed",
    department: "Support",
  },
  {
    id: "cs-partner",
    label: "Partner Update Completed",
    department: "Support",
  },
  { id: "cs-resolved", label: "Support Issue Resolved", department: "Support" },
  {
    id: "cs-escalated",
    label: "Escalated to Management",
    department: "Support",
  },
  { id: "cs-other", label: "Other Support Work", department: "Support" },
];

/* ------------------------------------------------------------------ */
/* CreditOps roles                                                     */
/* ------------------------------------------------------------------ */

export type CreditOpsRoleKey =
  | "admin"
  | "full-agent"
  | "dispute"
  | "onboarding"
  | "support"
  | "complaints"
  | "bureau"
  /** No CreditOps membership: nothing to log, nothing to manage (deny). */
  | "none";

export interface CreditOpsRoleDef {
  key: CreditOpsRoleKey;
  label: string;
  shortLabel: string;
  description: string;
  /** Can edit Department Progress steps (view-only when false). */
  canEditDepartmentProgress: boolean;
  /** Departments this role is authorized to log work against. */
  allowedDepartments: CreditOpsDepartment[];
  /**
   * Can access the Management layer (cross-partner aggregate views:
   * Management Dashboard, Main Client List, all global queues, Webhooks).
   * Only management roles see this. Agents are scoped to their Partner
   * workspace only.
   */
  canAccessManagement: boolean;
}

export const CREDITOPS_ROLES: Record<CreditOpsRoleKey, CreditOpsRoleDef> = {
  admin: {
    key: "admin",
    label: "CreditOps Admin / Manager",
    shortLabel: "Admin",
    description:
      "Full CreditOps management access. Can edit Department Progress, log work across all departments, and manage assignments.",
    canEditDepartmentProgress: true,
    allowedDepartments: ALL_DEPARTMENTS,
    canAccessManagement: true,
  },
  "full-agent": {
    key: "full-agent",
    label: "Full-Process Agent",
    shortLabel: "Full Agent",
    description:
      "Handles the complete process across all departments but cannot edit Department Progress (view-only).",
    canEditDepartmentProgress: false,
    allowedDepartments: ALL_DEPARTMENTS,
    canAccessManagement: false,
  },
  dispute: {
    key: "dispute",
    label: "Dispute Processor",
    shortLabel: "Dispute",
    description:
      "Dispute Processing department only. Can log CRA/Creditor disputes, freezes, and bureau uploads.",
    canEditDepartmentProgress: false,
    allowedDepartments: ["Dispute"],
    canAccessManagement: false,
  },
  onboarding: {
    key: "onboarding",
    label: "Onboarding Specialist",
    shortLabel: "Onboarding",
    description: "Onboarding department only.",
    canEditDepartmentProgress: false,
    allowedDepartments: ["Onboarding"],
    canAccessManagement: false,
  },
  support: {
    key: "support",
    label: "Client Success / Support",
    shortLabel: "Support",
    description: "Client Success department only.",
    canEditDepartmentProgress: false,
    allowedDepartments: ["Support"],
    canAccessManagement: false,
  },
  complaints: {
    key: "complaints",
    label: "Complaints & Mailing",
    shortLabel: "Complaints",
    description: "Complaints & Mailing department only.",
    canEditDepartmentProgress: false,
    allowedDepartments: ["Complaints"],
    canAccessManagement: false,
  },
  bureau: {
    key: "bureau",
    label: "Bureau Calling",
    shortLabel: "Bureau",
    description: "Bureau Calling department only.",
    canEditDepartmentProgress: false,
    allowedDepartments: ["Bureau Calling"],
    canAccessManagement: false,
  },
  none: {
    key: "none",
    label: "No CreditOps role",
    shortLabel: "No role",
    description:
      "This account has no CreditOps membership for the active organization. Records may be viewed where the database allows; nothing can be logged.",
    canEditDepartmentProgress: false,
    allowedDepartments: [],
    canAccessManagement: false,
  },
};

/** Roles a person can hold — "none" is a resolution result, not a choice. */
export const CREDITOPS_ROLE_LIST = (
  Object.keys(CREDITOPS_ROLES) as CreditOpsRoleKey[]
).filter((r) => r !== "none");

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

interface CreditOpsAccessValue {
  role: CreditOpsRoleKey;
  /** Demo mode only: preview another role. A no-op against a live session. */
  setRole: (r: CreditOpsRoleKey) => void;
  /** True only in demo mode, where the role is not backed by a membership. */
  canSwitchRole: boolean;
  roleDef: CreditOpsRoleDef;
  /** False = read access to the allowed departments; Complete Work is not offered. */
  canLogWork: boolean;
  /** Workspace view ids this role may see; empty = every view the organization shows. */
  allowedViews: string[];
  canEditDepartmentProgress: boolean;
  canAccessManagement: boolean;
  /**
   * The departments this person WORKS — their queues, and the files they may
   * complete work on.
   *
   * Narrowed from `allowedDepartments` by the canonical team → department
   * assignment when there is one. Management keeps every department, because
   * running the operation is the job. Somebody in no department-bearing team
   * keeps the role's departments: see `useMyCreditOpsDepartments` for why
   * silence is treated as "no opinion" rather than "nothing".
   */
  myDepartments: CreditOpsDepartment[];
  allowedDepartments: CreditOpsDepartment[];
  /** Work items the current role is authorized to log. */
  allowedWorkItems: WorkItemDef[];
  canLogDepartment: (dept: CreditOpsDepartment) => boolean;
}

const CreditOpsAccessContext = createContext<CreditOpsAccessValue | null>(null);

export function CreditOpsAccessProvider({ children }: { children: ReactNode }) {
  /* Live sessions resolve access from the real membership rows — agency
     first, then the active organization — and, for organization members, the
     organization's own configured role access (Settings → Roles & access),
     falling back to the platform defaults. The browser never chooses. Demo
     mode keeps the switcher so the access model can be shown without a
     database. */
  const auth = useAuth();
  const { activeOrganization } = useAgency();
  const live = auth.mode === "live";
  /* Canonical team → department assignment. Reused, not re-invented. */
  const { departments: teamDepartments } = useMyCreditOpsDepartments();
  const [previewRole, setPreviewRole] = useState<CreditOpsRoleKey>("admin");
  const agencyRole = auth.agencyMembership?.role ?? null;
  const orgRole =
    auth.orgMemberships.find(
      (m) => m.organization_id === activeOrganization?.id,
    )?.role ?? null;
  const configuredRows = useOrganizationRoleAccess(
    live && !agencyRole && orgRole ? (activeOrganization?.id ?? null) : null,
  );
  const configured = orgRole
    ? (configuredRows.rows[roleAccessKey(orgRole, "creditOps")] ?? null)
    : null;

  const role: CreditOpsRoleKey = live
    ? resolveCreditOpsRole({ agencyRole, orgRole })
    : previewRole;
  const preview = CREDITOPS_ROLES[previewRole];
  const access = live
    ? resolveOpsAccess({ agencyRole, orgRole, product: "creditOps", configured })
    : {
        departments: preview.allowedDepartments,
        views: [],
        canLogWork: preview.allowedDepartments.length > 0,
        canEditProgress: preview.canEditDepartmentProgress,
        canAccessManagement: preview.canAccessManagement,
      };
  const allowedDepartments = access.departments.filter((d): d is CreditOpsDepartment =>
    (ALL_DEPARTMENTS as string[]).includes(d),
  );
  const roleDef: CreditOpsRoleDef = live
    ? {
        key: role,
        label: orgRole && !agencyRole ? ORG_ROLE_LABELS[orgRole] : CREDITOPS_ROLES[role].label,
        shortLabel: orgRole && !agencyRole ? ORG_ROLE_LABELS[orgRole] : CREDITOPS_ROLES[role].shortLabel,
        description: configured
          ? "Access configured by your organization (Settings → Roles & access)."
          : CREDITOPS_ROLES[role].description,
        canEditDepartmentProgress: access.canEditProgress,
        allowedDepartments,
        canAccessManagement: access.canAccessManagement,
      }
    : preview;

  /* Team membership narrows the role, it never widens it: the intersection,
     and only when membership actually says something. */
  const myDepartments =
    roleDef.canAccessManagement || teamDepartments.length === 0
      ? allowedDepartments
      : allowedDepartments.filter((d) => teamDepartments.includes(d));

  const allowedWorkItems = WORK_ITEMS.filter((w) =>
    myDepartments.includes(w.department),
  );

  const canLogDepartment = (dept: CreditOpsDepartment) =>
    access.canLogWork && myDepartments.includes(dept);

  return (
    <CreditOpsAccessContext.Provider
      value={{
        role,
        setRole: live ? () => {} : setPreviewRole,
        canSwitchRole: !live,
        roleDef,
        canLogWork: access.canLogWork,
        allowedViews: access.views,
        canEditDepartmentProgress: roleDef.canEditDepartmentProgress,
        canAccessManagement: roleDef.canAccessManagement,
        myDepartments,
        allowedDepartments,
        allowedWorkItems,
        canLogDepartment,
      }}
    >
      {children}
    </CreditOpsAccessContext.Provider>
  );
}

/* Outside the provider nothing is known about the person: deny (rule 1). */
const FALLBACK_ROLE: CreditOpsRoleKey = "none";

export function useCreditOpsAccess(): CreditOpsAccessValue {
  const ctx = useContext(CreditOpsAccessContext);
  if (ctx) return ctx;
  // Safe fallback so components never crash if rendered outside the provider.
  const roleDef = CREDITOPS_ROLES[FALLBACK_ROLE];
  const allowedWorkItems = WORK_ITEMS.filter((w) =>
    roleDef.allowedDepartments.includes(w.department),
  );
  const canLogDepartment = (dept: CreditOpsDepartment) =>
    roleDef.allowedDepartments.includes(dept);
  return {
    role: FALLBACK_ROLE,
    setRole: () => {},
    canSwitchRole: false,
    roleDef,
    canLogWork: false,
    allowedViews: [],
    canEditDepartmentProgress: roleDef.canEditDepartmentProgress,
    canAccessManagement: roleDef.canAccessManagement,
    myDepartments: roleDef.allowedDepartments,
    allowedDepartments: roleDef.allowedDepartments,
    allowedWorkItems,
    canLogDepartment,
  };
}
