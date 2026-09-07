/**
 * A task's checklist.
 *
 * Who ticked a box and when are stamped by the database, never sent from
 * here — so a tick is attributable even if this component is wrong about who
 * is signed in.
 */
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useChecklist, useChecklistActions } from "@/lib/data/use-agency-work";
import { cn } from "@/lib/utils";

export function ChecklistPanel({ workItemId, readOnly }: { workItemId: string; readOnly?: boolean }) {
  const q = useChecklist(workItemId);
  const actions = useChecklistActions(workItemId);
  const [draft, setDraft] = useState("");
  const items = q.data ?? [];
  const done = items.filter((i) => i.done).length;

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    actions.add.mutate({ label, position: items.length });
    setDraft("");
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Checklist</h4>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">{done} of {items.length}</span>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-status-success transition-[width] duration-300"
            style={{ width: `${Math.round((done / items.length) * 100)}%` }}
          />
        </div>
      )}

      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/50">
            <Checkbox
              className="mt-0.5"
              checked={item.done}
              disabled={readOnly}
              aria-label={item.label}
              onCheckedChange={(c) => actions.toggle.mutate({ id: item.id, done: c === true })}
            />
            <span className={cn("flex-1 text-sm", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
              {item.label}
            </span>
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                onClick={() => actions.remove.mutate(item.id)}
                /* Visible on focus as well as hover: a keyboard user has no
                   hover, and an action that only appears under a pointer is
                   an action they cannot reach. */
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Add a step…"
            aria-label="Add a checklist step"
            className="h-8 text-sm"
          />
          <Button type="button" size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {items.length === 0 && readOnly && (
        <p className="mt-1 text-xs text-muted-foreground">No checklist on this task.</p>
      )}
    </section>
  );
}
