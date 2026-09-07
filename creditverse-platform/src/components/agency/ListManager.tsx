/**
 * Lists inside a BES workspace: rename, archive, and delete only when it is
 * safe to.
 *
 * ── THE DELETE RULE ────────────────────────────────────────────────────────
 *
 * Deleting a list that still holds work would take the work with it, and the
 * tasks — their comments, their history, who did what — are the part that
 * mattered. So a list holding anything cannot be deleted. It can be emptied
 * first, or archived, which keeps everything and takes it out of the way.
 *
 * Archive is the ordinary answer. Delete exists for the list somebody created
 * by mistake ten seconds ago, which is the only list it is ever safe on.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { countBoardItems, moveBoardItems } from "@/lib/data/agency-workspace";
import { createBoard, updateBoard } from "@/lib/data/workspaces";
import { requireSupabase } from "@/lib/supabase/client";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

export function ListManager({ workspace }: { workspace: Workspace }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; open: number; total: number } | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const boards = workspace.boards ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agency", "workspaces"] });
    void qc.invalidateQueries({ queryKey: ["work"] });
  };

  const askDelete = async (id: string) => {
    setError(null);
    setBusy(id);
    try {
      const counts = await countBoardItems(id);
      setConfirm({ id, ...counts });
      setMoveTo(boards.find((b) => b.id !== id)?.id ?? "");
    } finally { setBusy(null); }
  };

  const doDelete = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const sb = requireSupabase();
      const { error: e } = await sb.from("workspace_boards").delete().eq("id", id);
      if (e) throw e;
      setConfirm(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The list could not be deleted.");
    } finally { setBusy(null); }
  };

  return (
    <section>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lists</h4>
      </div>

      <ul className="mt-2 divide-y divide-border/50 rounded-lg border border-border">
        {boards.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">No lists yet.</li>
        )}
        {boards.map((b) => (
          <li key={b.id} className="flex items-center gap-2 px-3 py-2">
            {editing === b.id ? (
              <>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                  className="h-8 flex-1" aria-label="List name"
                  onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                <Button size="sm" variant="ghost" aria-label="Save"
                  onClick={async () => {
                    if (draft.trim()) { await updateBoard(b.id, { name: draft.trim() }); refresh(); }
                    setEditing(null);
                  }}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{b.name}</span>
                <Button size="sm" variant="ghost" aria-label={`Rename ${b.name}`}
                  onClick={() => { setEditing(b.id); setDraft(b.name); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Archive ${b.name}`}
                  onClick={async () => { await updateBoard(b.id, { archivedAt: new Date().toISOString() }); refresh(); }}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${b.name}`}
                  disabled={busy === b.id}
                  onClick={() => void askDelete(b.id)}>
                  {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <Input value={adding} onChange={(e) => setAdding(e.target.value)}
          placeholder="New list…" aria-label="New list name" className="h-8"
          onKeyDown={async (e) => {
            if (e.key === "Enter" && adding.trim()) {
              await createBoard(workspace.id, adding.trim(), boards.length);
              setAdding(""); refresh();
            }
          }} />
        <Button size="sm" variant="secondary" disabled={!adding.trim()}
          onClick={async () => { await createBoard(workspace.id, adding.trim(), boards.length); setAdding(""); refresh(); }}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {confirm && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          {confirm.total === 0 ? (
            <>
              <p className="text-sm text-foreground">This list is empty. Deleting it removes nothing else.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => void doDelete(confirm.id)}>Delete list</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                This list holds {confirm.total} {confirm.total === 1 ? "task" : "tasks"}
                {confirm.open > 0 && `, ${confirm.open} still open`}.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deleting it would take the tasks and their history with it. Move them
                somewhere first, or archive the list — archiving keeps everything.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {boards.length > 1 && (
                  <>
                    <OpsSelect aria-label="Move tasks to" size="sm" value={moveTo} onValueChange={setMoveTo}
                      options={boards.filter((b) => b.id !== confirm.id).map((b) => ({ value: b.id, label: b.name }))} />
                    <Button size="sm" variant="secondary" disabled={!moveTo}
                      onClick={async () => {
                        const n = await moveBoardItems(confirm.id, moveTo);
                        refresh();
                        setConfirm({ ...confirm, total: 0, open: 0 });
                        setError(n === 0 ? "Nothing moved — you may not be able to change those tasks." : null);
                      }}>
                      Move {confirm.total} here
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost"
                  onClick={async () => { await updateBoard(confirm.id, { archivedAt: new Date().toISOString() }); setConfirm(null); refresh(); }}>
                  <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive instead
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </>
          )}
          {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
