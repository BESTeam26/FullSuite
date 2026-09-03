/**
 * Department Progress section — a true multi-select CHECKLIST per department.
 *
 * Each department tracks a Set of checked steps (not a single selected step).
 * - View-only by default (lock badge) unless the user has CreditOps admin
 *   access (`canEditDepartmentProgress`).
 * - Agents can only check/uncheck steps for departments they are authorized
 *   to work under (`canLogDepartment`). Unauthorized departments render as
 *   view-only checklists.
 * - Every check/uncheck logs an immutable Activity event.
 */

import { useState } from "react";
import { ArrowRightLeft, Lock } from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  useCreditOpsAccess,
  type CreditOpsDepartment,
} from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
}

const ONBOARDING_STEPS = [
  "OB Not Started",
  "OB In Review",
  "Docs Pending",
  "Monitoring Pending",
  "Access Verified",
  "OB Ready for R1",
  "Partner Endorsed",
  "OB Incomplete",
];

const COMPLAINTS_STEPS = [
  "CM Not Needed",
  "Letters Pending",
  "Letters Mailed",
  "CFPB Filed",
  "FTC Filed",
  "BBB Filed",
  "AG Filed",
  "CM Awaiting Response",
  "CM Completed",
];

const BUREAU_STEPS = [
  "BC Not Needed",
  "BC Needed",
  "BC In Progress",
  "BC Completed",
];

const SUPPORT_STEPS = [
  "Support New",
  "Onboarding Followup",
  "Ready for Reimport",
  "Monitoring Issue",
  "Billing Issue",
  "Waiting Client Response",
  "Escalated to Management",
  "Support Resolved",
];

const DISPUTE_STEPS = [
  "New Onboarding",
  "Incomplete Onboarding",
  "Ready for Round 1",
  "Ready for Processing",
  "Round Sent - Awaiting Results",
  "Ready for Reimport / Review",
  "Waiting for Partner Approval",
  "Completed",
  "Archived / Inactive",
];

interface DeptGroup {
  title: string;
  department: CreditOpsDepartment;
  steps: string[];
}

const GROUPS: DeptGroup[] = [
  {
    title: "Onboarding Progress",
    department: "Onboarding",
    steps: ONBOARDING_STEPS,
  },
  {
    title: "Dispute Processing Progress",
    department: "Dispute",
    steps: DISPUTE_STEPS,
  },
  {
    title: "Complaints & Mailing Progress",
    department: "Complaints",
    steps: COMPLAINTS_STEPS,
  },
  {
    title: "Bureau Calling Progress",
    department: "Bureau Calling",
    steps: BUREAU_STEPS,
  },
  {
    title: "Client Success Progress",
    department: "Support",
    steps: SUPPORT_STEPS,
  },
];

/** Seed checklist state — a Set of checked steps per department. */
function seedProgress(): Record<string, Set<string>> {
  return {
    Onboarding: new Set(["OB In Review"]),
    Dispute: new Set(["Ready for Processing"]),
    Complaints: new Set(["CM Not Needed"]),
    "Bureau Calling": new Set(["BC Not Needed"]),
    Support: new Set(["Support New"]),
  };
}

export function DepartmentProgressSection({ clientId }: Props) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();
  const canEdit = access.canEditDepartmentProgress;

  // Track which departments are expanded/active for multi-select
  const [activeDepts, setActiveDepts] = useState<Set<CreditOpsDepartment>>(
    new Set(["Onboarding", "Dispute"]),
  );

  // Checklist state: Set<string> of checked steps per department
  const [progress, setProgress] = useState<Record<string, Set<string>>>(() =>
    seedProgress(),
  );

  const toggleDept = (dept: CreditOpsDepartment) => {
    if (!canEdit) return;
    setActiveDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const toggleStep = (dept: CreditOpsDepartment, step: string) => {
    if (!canEdit) return;
    setProgress((prev) => {
      const current = new Set(prev[dept] ?? []);
      const willCheck = !current.has(step);
      if (willCheck) current.add(step);
      else current.delete(step);
      return { ...prev, [dept]: current };
    });
    // Log the check/uncheck as an immutable Activity event
    const isChecked = progress[dept]?.has(step);
    store.addActivity({
      clientId,
      actor: "Agent (BES HQ)",
      action: `[DEPARTMENT_PROGRESS] ${dept}`,
      detail: `${isChecked ? "Unchecked" : "Checked"} ${step}`,
      field: "departmentProgress",
      previousValue: isChecked ? step : undefined,
      newValue: isChecked ? undefined : step,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Department Progress
        </h3>
        <div className="flex items-center gap-3">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              <Lock className="h-3 w-3" /> View Only
            </span>
          )}
          <button
            onClick={() =>
              store.addActivity({
                clientId,
                actor: "Agent (BES HQ)",
                action: "Handoff triggered",
                detail: "Initiated department handoff sequence",
              })
            }
            disabled={!canEdit}
            className={cn(
              "inline-flex items-center gap-1 text-xs font-bold",
              canEdit
                ? "text-primary hover:underline"
                : "cursor-not-allowed text-muted-foreground",
            )}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Handoff
          </button>
        </div>
      </div>

      {/* Department selector chips (multi-select) */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const isActive = activeDepts.has(g.department);
          const authorized = access.canLogDepartment(g.department);
          return (
            <button
              key={g.department}
              onClick={() => toggleDept(g.department)}
              disabled={!canEdit}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors",
                isActive
                  ? "border-emerald-500/50 bg-emerald-500/10 text-status-success"
                  : "border-border bg-muted/30 text-muted-foreground",
                !canEdit && "cursor-default opacity-70",
                !authorized && canEdit && "opacity-50",
              )}
              title={
                !authorized
                  ? "Not authorized for this department"
                  : canEdit
                    ? "Click to toggle"
                    : "View only — admin access required to edit"
              }
            >
              {g.department}
              {isActive && !authorized && " (read)"}
            </button>
          );
        })}
      </div>

      {/* Active department checklists (multi-select) */}
      <div className="space-y-3">
        {GROUPS.filter((g) => activeDepts.has(g.department)).map((group) => {
          const authorized = access.canLogDepartment(group.department);
          const checkedSet = progress[group.department] ?? new Set<string>();
          return (
            <div
              key={group.department}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold text-foreground">{group.title}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                    authorized
                      ? "bg-emerald-500/10 text-status-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {authorized ? "AUTHORIZED" : "VIEW ONLY"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.steps.map((step) => {
                  const isSel = checkedSet.has(step);
                  const editable = canEdit && authorized;
                  return (
                    <label
                      key={step}
                      onClick={(e) => {
                        e.preventDefault();
                        if (editable) toggleStep(group.department, step);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors",
                        editable ? "cursor-pointer" : "cursor-default",
                        isSel
                          ? "bg-emerald-500/10 font-bold text-emerald-800 dark:text-emerald-300"
                          : "text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => {}}
                        disabled={!editable}
                        className="h-3.5 w-3.5 rounded border-border text-status-success focus:ring-emerald-500"
                      />
                      <span>{step}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
