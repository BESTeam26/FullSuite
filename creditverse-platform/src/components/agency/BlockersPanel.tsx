/**
 * What is holding a task up.
 *
 * A blocker names another task or says why in words — the database requires
 * one of the two, because "blocked" with no reason is a status nobody can act
 * on. Resolving keeps the row: what blocked what, and for how long, is the
 * part worth having later.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { CircleSlash, Plus, Check } from "lucide-react";
import { useBlockers, useBlockerActions } from "@/lib/data/use-agency-work";
import { formatDate } from "@/lib/format-date";

const NONE = "__none__";

export function BlockersPanel({
  workItemId,
  candidates,
  readOnly,
}: {
  workItemId: string;
  /** Other open tasks that could be the blocker. */
  candidates: { id: string; title: string }[];
  readOnly?: boolean;
}) {
  const q = useBlockers(workItemId);
  const actions = useBlockerActions(workItemId);
  const [note, setNote] = useState("");
  const [blockedBy, setBlockedBy] = useState(NONE);

  const all = q.data ?? [];
  const open = all.filter((b) => !b.resolvedAt);
  const resolved = all.filter((b) => b.resolvedAt);

  const add = () => {
    const hasItem = blockedBy !== NONE;
    if (!hasItem && note.trim().length < 3) return;
    actions.add.mutate({
      blockedById: hasItem ? blockedBy : null,
      note: note.trim() ? note.trim() : null,
    });
    setNote("");
    setBlockedBy(NONE);
  };

  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <CircleSlash className="h-3.5 w-3.5" /> Blocked by
      </h4>

      {open.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Nothing is blocking this task.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {open.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
              <span className="text-sm text-foreground">
                {b.blockedByTitle ? (
                  <>Waiting on <span className="font-medium">{b.blockedByTitle}</span></>
                ) : (
                  b.note
                )}
                {b.blockedByTitle && b.note && <span className="block text-xs text-muted-foreground">{b.note}</span>}
              </span>
              {!readOnly && (
                <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => actions.resolve.mutate(b.id)}>
                  <Check className="mr-1 h-3 w-3" /> Cleared
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-2 space-y-1.5">
          <OpsSelect
            aria-label="Blocked by task"
            size="sm"
            value={blockedBy}
            onValueChange={setBlockedBy}
            options={[{ value: NONE, label: "Not waiting on another task" },
              ...candidates.map((c) => ({ value: c.id, label: c.title }))]}
          />
          <div className="flex items-center gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder={blockedBy === NONE ? "Why is it blocked?" : "Add a note (optional)"}
              aria-label="Blocker reason"
              className="h-8 text-sm"
            />
            <Button type="button" size="sm" variant="secondary" onClick={add}
              disabled={blockedBy === NONE && note.trim().length < 3}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {blockedBy === NONE && note.trim().length > 0 && note.trim().length < 3 && (
            <p className="text-xs text-muted-foreground">Say a little more about what is blocking it.</p>
          )}
        </div>
      )}

      {resolved.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {resolved.length} cleared
          </summary>
          <ul className="mt-1 space-y-1">
            {resolved.map((b) => (
              <li key={b.id} className="text-xs text-muted-foreground line-through">
                {b.blockedByTitle ?? b.note} · cleared {formatDate(b.resolvedAt!)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
