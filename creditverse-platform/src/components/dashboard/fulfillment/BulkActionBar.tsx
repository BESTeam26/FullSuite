import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { X } from "lucide-react";

/**
 * What you do to several clients at once.
 *
 * Dee's CreditOps design, 2026-09-23, and the row checkboxes in her own
 * ClickUp: a lead distributing Monday's work reassigns eleven files, and doing
 * that one row at a time is eleven round trips and eleven chances to miss one.
 *
 * ── WHY IT REPORTS INSTEAD OF ASSUMING ────────────────────────────────────
 *
 * Each client is written individually, because that is what the writers and
 * their authorization checks are built for — a bulk endpoint would be a second
 * path to the same change with its own rules to keep in step (rule 5). Some of
 * those writes can legitimately fail: an agent may hold eleven files and be
 * allowed to move nine. So the bar reports what happened per client rather
 * than claiming success for all of them, and leaves the ones that failed
 * SELECTED, so the next action is obvious and nothing is silently dropped.
 */
export function BulkActionBar({
  count,
  statusOptions,
  statusTone,
  assignees,
  onClear,
  onApplyStatus,
  onApplyAssignee,
}: {
  count: number;
  statusOptions: readonly string[];
  /** Colour for each status in the bulk menu; omitted leaves it plain. */
  statusTone?: (status: string) => string;
  assignees: { id: string | null; name: string }[];
  onClear: () => void;
  /** Resolves with the ids that FAILED, so the bar can keep them selected. */
  onApplyStatus: (status: string) => Promise<string[]>;
  onApplyAssignee: (agentId: string) => Promise<string[]>;
}) {
  const [busy, setBusy] = useState<null | "status" | "assignee">(null);
  const [result, setResult] = useState<string | null>(null);

  if (count === 0) return null;

  const run = async (kind: "status" | "assignee", apply: () => Promise<string[]>) => {
    setBusy(kind);
    setResult(null);
    try {
      const failed = await apply();
      /* Said plainly, both ways. "Updated 9 of 11" is a fact somebody can act
         on; a toast saying "Done" while two files did not move is not. */
      setResult(
        failed.length === 0
          ? `Updated ${count} client${count === 1 ? "" : "s"}.`
          : `Updated ${count - failed.length} of ${count}. ${failed.length} could not be changed and ${failed.length === 1 ? "is" : "are"} still selected.`,
      );
    } catch {
      setResult("Nothing was changed — the update failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
    >
      <span className="text-xs font-semibold text-foreground">
        {count} selected
      </span>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Status</span>
        <OpsSelect
          size="inline"
          aria-label="Set status for the selected clients"
          value=""
          placeholder="Change to…"
          disabled={busy !== null}
          options={statusOptions}
          tone={statusTone}
          onValueChange={(v) => void run("status", () => onApplyStatus(v))}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Assignee</span>
        <OpsSelect
          size="inline"
          aria-label="Assign the selected clients"
          value=""
          placeholder="Assign to…"
          disabled={busy !== null}
          options={assignees.map((a) => ({ value: a.id ?? "", label: a.name }))}
          onValueChange={(v) => void run("assignee", () => onApplyAssignee(v))}
        />
      </div>

      {busy && <span className="text-[11px] text-muted-foreground">Working…</span>}
      {result && (
        <span role="status" className="text-[11px] text-foreground">
          {result}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto h-7 text-xs"
      >
        <X className="mr-1 h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}
