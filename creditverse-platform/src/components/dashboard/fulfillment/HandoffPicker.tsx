/**
 * Hand this file to one or more departments at once.
 *
 * ── WHY THIS IS NOT A SINGLE "NEXT" BUTTON ─────────────────────────────────
 *
 * It used to be. The Hand off control walked one step along
 * Onboarding → Dispute → Support → Complaints → Bureau Calling, which made
 * Bureau Calling "the last department in the sequence" and meant a round
 * needing BOTH bureau calls AND a CFPB complaint could only be sent to one.
 *
 * Dee: "these parts can be done simultaneously and next steps on these can be
 * multiple handoffs." After a round goes out, bureau calling and complaints
 * run in parallel, and Support runs alongside both. So this picks several.
 *
 * ── IT SAYS WHAT IT WILL DO BEFORE IT DOES IT ──────────────────────────────
 *
 * `planHandoffs` is worked out as the boxes are ticked, so the summary reads
 * "opens Bureau Calling; Complaints is already working it" rather than
 * reporting it afterwards. A department already mid-way through is left
 * exactly where it is — re-sending a file to Bureau Calling must not knock it
 * back to BC NEEDED.
 */
import { useMemo } from "react";
import { ArrowRightLeft } from "lucide-react";
import {
  describeHandoff, handoffTargets, planHandoffs,
  type DepartmentStatusRow,
} from "@/lib/fulfillment/department-domain";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { cn } from "@/lib/utils";

const TITLE: Record<CreditOpsDepartment, string> = {
  Onboarding: "Onboarding",
  Dispute: "Dispute Processing",
  Support: "Client Success / Support",
  Complaints: "Complaints & Mailing",
  "Bureau Calling": "Bureau Calling",
};

export function HandoffPicker({ from, rows, selected, onChange, disabled }: {
  /** The department the work was done as. Null when it is not known. */
  from: CreditOpsDepartment | null;
  rows: readonly DepartmentStatusRow[];
  selected: CreditOpsDepartment[];
  onChange: (next: CreditOpsDepartment[]) => void;
  disabled?: boolean;
}) {
  const targets = useMemo(
    () => (from ? handoffTargets(from) : (["Onboarding", "Dispute", "Support", "Complaints", "Bureau Calling"] as CreditOpsDepartment[])),
    [from],
  );
  const plan = useMemo(() => planHandoffs(from, selected, rows), [from, selected, rows]);

  const toggle = (d: CreditOpsDepartment) =>
    onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d]);

  const openNow = (d: CreditOpsDepartment) =>
    rows.find((r) => r.department === d && r.status);

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <ArrowRightLeft className="h-3.5 w-3.5" /> Hand off to
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Pick as many as the file needs — they run at the same time. Handing off does not close
        your own department; finish that separately when you are done.
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {targets.map((d) => {
          const isSelected = selected.includes(d);
          const current = openNow(d);
          const busy = plan.alreadyOpen.some((o) => o.department === d);
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => toggle(d)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="block font-medium">{TITLE[d]}</span>
              <span className={cn("block text-[10px]",
                isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {busy ? `already ${current?.status}` : current ? current.status : "not open"}
              </span>
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {describeHandoff(from, plan)}.
          {plan.refused.length > 0 && ` ${plan.refused.map((r) => r.reason).join(". ")}.`}
        </p>
      )}
    </div>
  );
}
