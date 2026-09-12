/**
 * A work item's checklist — the canonical `work_checklist_items`, wherever a
 * task is open.
 *
 * It lived only inside the CreditOps client file, so a workspace task had no
 * subtasks at all and a marketing writer had nowhere to break "October launch"
 * into the six things it actually is. One component over the accessors that
 * already existed, rather than a second checklist for the second surface
 * (rule 6).
 *
 * Who ticked a box and when are stamped by the database, never sent from here.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChecklist, useChecklistActions } from "@/lib/data/use-agency-work";
import { cn } from "@/lib/utils";

export function WorkChecklist({ workItemId, readOnly }: { workItemId: string; readOnly: boolean }) {
  const items = useChecklist(workItemId);
  const actions = useChecklistActions(workItemId);
  const [adding, setAdding] = useState("");
  const rows = items.data ?? [];
  const done = rows.filter((r) => r.done).length;

  /* Nothing to read and nothing to add: a permanently empty box on every task
     is furniture, and Dee has said so about this exact pattern before. */
  if (rows.length === 0 && readOnly) return null;

  const submit = () => {
    if (!adding.trim()) return;
    actions.add.mutate({ label: adding.trim(), position: rows.length * 10 });
    setAdding("");
  };

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Checklist {rows.length > 0 && <span className="tabular-nums">({done}/{rows.length})</span>}
      </p>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={r.done}
                disabled={readOnly}
                onChange={() => actions.toggle.mutate({ id: r.id, done: !r.done })}
                aria-label={r.label}
                className="h-3.5 w-3.5 shrink-0 rounded border-border text-primary focus:ring-primary"
              />
              <span className={cn("flex-1 text-xs", r.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {r.label}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${r.label}`}
                  onClick={() => actions.remove.mutate(r.id)}
                  className="shrink-0 rounded opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="mt-1.5 flex gap-2">
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Add a step"
            aria-label="Add a checklist step"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" disabled={!adding.trim()} onClick={submit} aria-label="Add step">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {actions.add.error && (
        <p className="mt-1 text-[11px] text-red-700">{(actions.add.error as Error).message}</p>
      )}
    </div>
  );
}
