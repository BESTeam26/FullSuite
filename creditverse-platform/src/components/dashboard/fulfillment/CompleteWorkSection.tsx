/**
 * Complete Work section — logs ACTUAL work performed by the agent.
 *
 * Key rule:
 *   One submitted Client Work session = ONE production unit (one file worked).
 *   The checked completion items are the meaningful actions completed inside
 *   that unit — they are NOT additional files. Checking 4 boxes = 1 file, 4 actions.
 *
 * Department Progress = current state of the file (where is the client?).
 * Complete Work     = actual work performed by the agent (what did they do?).
 * Status change     = a separate downstream field, NOT a completion action.
 *
 * Flow:
 *   1. Agent selects "Log as department" — dropdown shows ONLY departments
 *      the current user is authorized to work under (CAN_WORK_AS).
 *   2. The section dynamically shows that department's production-action library.
 *   3. Multiple actions can be selected in one submission.
 *   4. Optional notes.
 *   5. Separate "After this work" status selector — only authorized next statuses.
 *   6. Submit creates ONE Work Completion event → Activity + Production (1 unit).
 */

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/data/error-message";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  useCreditOpsAccess,
  WORK_ITEMS,
  type CreditOpsDepartment,
} from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

interface Props {
  clientId: string;
  clientName?: string;
  partnerName?: string;
}

/** Authorized next statuses per role. A processor can advance the file but
 *  cannot graduate it; only an admin can. */
const ADMIN_STATUSES = [
  "Keep current status",
  "Move to Ready for Round 1",
  "Move to Ready for Processing",
  "Move to Round Sent - Awaiting Results",
  "Move to Ready for Reimport / Review",
  "Move to Waiting for Partner Approval",
  "Move to Completed",
  "Move to Graduated",
];
const PROCESSOR_STATUSES = [
  "Keep current status",
  "Move to Ready for Processing",
  "Move to Round Sent - Awaiting Results",
  "Move to Ready for Reimport / Review",
  "Move to Waiting for Partner Approval",
];

export function CompleteWorkSection({
  clientId,
  clientName = "this client",
  partnerName = "—",
}: Props) {
  const store = useCreditOpsStore();
  const access = useCreditOpsAccess();

  // Departments the current user is authorized to WORK AS.
  const workingDepts = access.allowedDepartments;

  const [activeDept, setActiveDept] = useState<CreditOpsDepartment | "">(
    workingDepts[0] ?? "",
  );
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [workNotes, setWorkNotes] = useState("");
  const [statusChange, setStatusChange] = useState("Keep current status");
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* Synchronous guard — see the note in OpsActivityTimeline. `isSubmitting`
     drives the label; this is what actually stops a second production row. */
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Production-action library for the selected department.
  const deptActions = useMemo(
    () => WORK_ITEMS.filter((w) => w.department === activeDept),
    [activeDept],
  );

  const isAdmin = access.role === "admin";
  const statusOptions = isAdmin ? ADMIN_STATUSES : PROCESSOR_STATUSES;

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleDeptChange = (dept: string) => {
    setActiveDept(dept as CreditOpsDepartment);
    setSelectedItems([]);
  };

  /**
   * Complete the work, then reset — in that order.
   *
   * `isSubmitting` is what makes a double-click produce one production row
   * rather than two. The form used to reset synchronously beside a
   * fire-and-forget write, so a second click landed on a still-populated
   * request and a failure cleared the agent's notes anyway.
   *
   * Note the honest limit: this guards the *interface*. There is no natural
   * idempotency key for production — the same agent may legitimately work the
   * same file twice in a day — so a genuinely idempotent write would need a
   * client-generated request id column. Recorded rather than pretended.
   */
  const handleCompleteWork = async () => {
    if (selectedItems.length === 0 || !activeDept || submittingRef.current)
      return;
    submittingRef.current = true;
    const actionLabels = selectedItems
      .map((id) => WORK_ITEMS.find((w) => w.id === id)?.label ?? id)
      .sort();

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // ONE Work Completion event → ONE production unit (1 file worked).
      // The selected items become the production actions under that unit.
      await store.logProduction({
        clientId,
        clientName,
        partnerName,
        department: activeDept,
        actions: actionLabels,
        workNotes: workNotes.trim() || undefined,
        actor: "Agent (BES HQ)",
      });

      // Status change stays SEPARATE from completion actions.
      if (statusChange !== "Keep current status") {
        const newStatus = statusChange.replace("Move to ", "");
        await store.addActivity({
          clientId,
          actor: "Agent (BES HQ)",
          action: "Status change",
          detail: `${newStatus}`,
          field: "status",
          previousValue: "—",
          newValue: newStatus,
        });
      }

      // Reset the form only once the work is recorded.
      setSelectedItems([]);
      setWorkNotes("");
      setStatusChange("Keep current status");
    } catch (err) {
      setSubmitError(errorMessage(err, "Could not record this work."));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <CheckCircle2 className="h-4 w-4 text-status-success" /> Complete Work
        </h3>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
          {access.roleDef.shortLabel}
        </span>
      </div>

      {/* One-unit explainer so agents understand the production model */}
      <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 px-3 py-2 text-[10px] text-emerald-800 dark:text-emerald-300">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          <span className="font-bold">1 file = 1 production unit.</span> Checked
          items are the actions completed inside that file — not additional
          files. Status change is separate.
        </p>
      </div>

      {workingDepts.length === 0 ? (
        <p className="rounded-lg bg-muted/30 p-3 text-xs italic text-muted-foreground">
          No departments authorized for your role. Contact a CreditOps Admin if
          you need access to log department work.
        </p>
      ) : (
        <>
          {/* Log as department — only authorized departments */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Log as department
            </label>
            <OpsSelect
              value={activeDept}
              onValueChange={handleDeptChange}
              options={workingDepts}
              size="sm"
              aria-label="Log as department"
              className="flex-1 font-semibold"
            />
          </div>

          {/* Dynamic production-action library for the selected department */}
          {activeDept && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Work completed — {activeDept}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {deptActions.map((item) => {
                  const isSel = selectedItems.includes(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors select-none",
                        isSel
                          ? "border-emerald-500/50 bg-emerald-500/10 font-bold text-emerald-800 dark:text-emerald-300"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded border-border text-status-success focus:ring-emerald-500 shrink-0 pointer-events-none"
                      />
                      <span className="leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            value={workNotes}
            onChange={(e) => setWorkNotes(e.target.value)}
            placeholder="Notes for this work (optional)"
            rows={2}
            className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Status change is SEPARATE from completion actions */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              After this work
            </label>
            <OpsSelect
              value={statusChange}
              onValueChange={setStatusChange}
              options={statusOptions}
              size="sm"
              aria-label="Status after this work"
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground">
              {selectedItems.length} action
              {selectedItems.length === 1 ? "" : "s"} · 1 file
            </span>
            {submitError && (
              <p
                role="alert"
                className="flex-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive"
              >
                {submitError} Your selection has been kept.
              </p>
            )}
            <button
              onClick={() => void handleCompleteWork()}
              disabled={selectedItems.length === 0 || isSubmitting}
              aria-busy={isSubmitting}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-bold shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                selectedItems.length === 0
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : isSubmitting
                    ? "cursor-not-allowed bg-emerald-700/60 text-white/90"
                    : "bg-emerald-700 text-white hover:bg-emerald-800",
              )}
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? "Recording…" : "Complete Work"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
