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
  | "bureau";

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
};

export const CREDITOPS_ROLE_LIST = Object.keys(
  CREDITOPS_ROLES,
) as CreditOpsRoleKey[];

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

interface CreditOpsAccessValue {
  role: CreditOpsRoleKey;
  setRole: (r: CreditOpsRoleKey) => void;
  roleDef: CreditOpsRoleDef;
  canEditDepartmentProgress: boolean;
  canAccessManagement: boolean;
  allowedDepartments: CreditOpsDepartment[];
  /** Work items the current role is authorized to log. */
  allowedWorkItems: WorkItemDef[];
  canLogDepartment: (dept: CreditOpsDepartment) => boolean;
}

const CreditOpsAccessContext = createContext<CreditOpsAccessValue | null>(null);

export function CreditOpsAccessProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<CreditOpsRoleKey>("admin");
  const roleDef = CREDITOPS_ROLES[role];

  const allowedWorkItems = WORK_ITEMS.filter((w) =>
    roleDef.allowedDepartments.includes(w.department),
  );

  const canLogDepartment = (dept: CreditOpsDepartment) =>
    roleDef.allowedDepartments.includes(dept);

  return (
    <CreditOpsAccessContext.Provider
      value={{
        role,
        setRole,
        roleDef,
        canEditDepartmentProgress: roleDef.canEditDepartmentProgress,
        canAccessManagement: roleDef.canAccessManagement,
        allowedDepartments: roleDef.allowedDepartments,
        allowedWorkItems,
        canLogDepartment,
      }}
    >
      {children}
    </CreditOpsAccessContext.Provider>
  );
}

const FALLBACK_ROLE: CreditOpsRoleKey = "admin";

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
    roleDef,
    canEditDepartmentProgress: roleDef.canEditDepartmentProgress,
    canAccessManagement: roleDef.canAccessManagement,
    allowedDepartments: roleDef.allowedDepartments,
    allowedWorkItems,
    canLogDepartment,
  };
}
