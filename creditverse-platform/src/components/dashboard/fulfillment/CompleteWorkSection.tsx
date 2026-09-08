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
import { useAuth } from "@/lib/auth/auth-context";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  useCreditOpsAccess,
  WORK_ITEMS,
  type CreditOpsDepartment,
} from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";
import { HandoffPicker } from "@/components/dashboard/fulfillment/HandoffPicker";
import { handOffToDepartments } from "@/lib/data/fulfillment-clients";

interface Props {
  clientId: string;
  clientName?: string;
  partnerName?: string;
}

/**
 * ── DEE'S DISPUTE VOCABULARY, RESTORED AND WORKING ─────────────────────────
 *
 * This is the round workflow the team actually runs, and it is deliberately
 * NOT the generic client-status list used elsewhere. "In Dispute" and
 * "Awaiting Response" describe a file vaguely and overlap each other; "Round
 * Sent - Awaiting Results" and "Ready for Reimport / Review" describe exactly
 * where a round has got to.
 *
 * Two things were wrong here, and only one of them was the list:
 *
 *   the selector never wrote a status at all — it logged an activity entry
 *   SAYING the status changed while the record stayed put;
 *
 *   four of these values were missing from `fulfillment_client_status`, so
 *   they could not have been saved even if it had tried.
 *
 * I first "fixed" that by swapping in the generic list. Wrong repair: the
 * vocabulary was never the problem, the database not accepting it was. 0188
 * added the four values; this is the original list, and submitting now writes
 * it.
 *
 * A processor moves a round along. Only an admin finishes or graduates a file.
 */
const KEEP = "Keep current status";
const ADMIN_STATUS_OPTIONS = [
  KEEP,
  "Move to Ready for Round 1",
  "Move to Ready for Processing",
  "Move to Round Sent - Awaiting Results",
  "Move to Ready for Reimport / Review",
  "Move to Waiting for Partner Approval",
  "Move to Completed",
  "Move to Graduated",
];
const PROCESSOR_STATUS_OPTIONS = [
  KEEP,
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
  const { agencyMembership, displayName, mode } = useAuth();
  /* Production is BES's operational record (rule 16). An organization member
     finishing work on their own client records the completion as activity on
     the record — same action library, same status change — never as BES
     production. Demo sessions keep the production path so the sample EOD
     and production views have something to show. */
  const recordsProduction = agencyMembership !== null || mode === "demo";
  const actor = recordsProduction ? "Agent (BES HQ)" : displayName;

  // Departments the current user is authorized to WORK AS.
  const workingDepts = access.allowedDepartments;

  const [activeDept, setActiveDept] = useState<CreditOpsDepartment | "">(
    workingDepts[0] ?? "",
  );
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [workNotes, setWorkNotes] = useState("");
  const [statusChange, setStatusChange] = useState(KEEP);
  /* Several at once — bureau calling and complaints run in parallel. */
  const [handoffTo, setHandoffTo] = useState<CreditOpsDepartment[]>([]);
  const [handoffResult, setHandoffResult] = useState<
    { opened: string[]; alreadyOpen: string[] } | null
  >(null);
  const departmentRows = store.getDepartmentStatuses(clientId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* Synchronous guard — see the note in OpsActivityTimeline. `isSubmitting`
     drives the label; this is what actually stops a second production row. */
  const submittingRef = useRef(false);
  /**
   * The idempotency key for THIS submission. Minted when the form is first
   * filled, kept across retries, and re-minted only after a confirmed success
   * or a deliberate reset — so a double-click, a retry after a timeout, or a
   * replay all carry the same id and the database collapses them to one row.
   * A page refresh loses it on purpose: re-filling the form is a new intent.
   */
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Production-action library for the selected department.
  const deptActions = useMemo(
    () => WORK_ITEMS.filter((w) => w.department === activeDept),
    [activeDept],
  );

  const isAdmin = access.canEditDepartmentProgress && access.canAccessManagement;
  const statusOptions = isAdmin ? ADMIN_STATUS_OPTIONS : PROCESSOR_STATUS_OPTIONS;

  /* Read-only roles (for example QA by default) see the work, never a form
     that the database — and the organization's configuration — would refuse. */
  if (!access.canLogWork || workingDepts.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Complete Work
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Your role has read access here. Work on this client is recorded by the roles your organization has authorized to log it.
        </p>
      </section>
    );
  }

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
      if (recordsProduction) {
        // ONE Work Completion event → ONE production unit (1 file worked).
        // The selected items become the production actions under that unit.
        await store.logProduction({
          requestId: requestIdRef.current,
          clientId,
          clientName,
          partnerName,
          department: activeDept,
          actions: actionLabels,
          workNotes: workNotes.trim() || undefined,
          actor,
        });
      } else {
        // Organization author: the completion lives on the client's timeline.
        const notes = workNotes.trim();
        await store.addActivity({
          clientId,
          actor,
          action: "Work completed",
          detail: `${activeDept}: ${actionLabels.join(", ")}${notes ? ` — ${notes}` : ""}`,
          field: "work",
          newValue: activeDept,
        });
      }

      /* Status change stays SEPARATE from the completion actions — but it is
         a real change now. `updateStatus` writes the record; the activity
         entry comes from the database trigger, so the timeline says the status
         moved only when it actually did. */
      if (statusChange !== KEEP) {
        /* The label reads "Move to X"; the stored value is X. */
        await store.updateStatus(clientId, statusChange.replace("Move to ", ""), actor);
      }

      /* And the handoffs, which run in parallel with everything above. */
      if (handoffTo.length > 0) {
        const result = await handOffToDepartments({
          clientId,
          from: activeDept as never,
          targets: handoffTo as never,
          rows: departmentRows,
          note: workNotes.trim() || null,
        });
        setHandoffResult(result);
      }

      // Reset the form only once the work is recorded — and mint the next
      // intent's id only now, so a retry of THIS one could never be mistaken
      // for a new submission.
      requestIdRef.current = crypto.randomUUID();
      setSelectedItems([]);
      setWorkNotes("");
      setStatusChange(KEEP);
      setHandoffTo([]);
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
            <p className="text-[10px] text-muted-foreground">
              Moves the file. Separate from handing it to another department below — a round can
              advance and be handed off at the same time.
            </p>
          </div>

          {/* Handing off is not a status change and not one department. Bureau
              calling and complaints run at the same time; picking both opens
              both, and neither closes the department you worked as. */}
          <HandoffPicker
            from={(activeDept || null) as never}
            rows={departmentRows as never}
            selected={handoffTo}
            onChange={setHandoffTo}
            disabled={isSubmitting}
          />

          {handoffResult && (handoffResult.opened.length > 0 || handoffResult.alreadyOpen.length > 0) && (
            <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-900">
              {handoffResult.opened.length > 0 && `Opened ${handoffResult.opened.join(", ")}. `}
              {handoffResult.alreadyOpen.length > 0 &&
                `${handoffResult.alreadyOpen.join(", ")} was already working it and was left as it is.`}
            </p>
          )}

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
