/**
 * Create a BES internal task.
 *
 * Title only. Everything else — list, assignee, team, priority, due date — is
 * optional here and editable the moment the task opens: a create form that
 * demands six fields is a form people work around by not using it.
 *
 * A task needs a list, and a list needs a workspace, so the first task also
 * creates "BES Team" if nothing exists yet. Nobody should have to understand
 * the hierarchy to write down a thing they have to do.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyMembers, useAgencyTeams, useCreateAgencyWorkspace } from "@/lib/data/use-agency-work";
import { createWorkspaceItem, createBoard, fetchWorkspaces } from "@/lib/data/workspaces";
import { fetchAgencyWorkspaces } from "@/lib/data/agency-workspace";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

const NONE = "__none__";

export function NewAgencyTaskDialog({
  open, onOpenChange, workspaces, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaces: Workspace[];
  onCreated: (id: string) => void;
}) {
  const auth = useAuth();
  const qc = useQueryClient();
  const members = useAgencyMembers();
  const teams = useAgencyTeams();
  const createWorkspace = useCreateAgencyWorkspace();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>(NONE);
  const [boardId, setBoardId] = useState<string>(NONE);
  const [assignee, setAssignee] = useState(NONE);
  const [teamId, setTeamId] = useState(NONE);
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === NONE && workspaces.length > 0) setWorkspaceId(workspaces[0].id);
  }, [workspaces, workspaceId]);

  const workspace = useMemo(() => workspaces.find((w) => w.id === workspaceId), [workspaces, workspaceId]);
  const boards = workspace?.boards ?? [];

  useEffect(() => {
    setBoardId(boards.length > 0 ? boards[0].id : NONE);
  }, [workspaceId, boards.length]);

  const submit = async () => {
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      let wsId = workspaceId === NONE ? null : workspaceId;
      let bId = boardId === NONE ? null : boardId;

      /* First task ever: make somewhere for it to live rather than refusing. */
      if (!wsId) {
        await createWorkspace.mutateAsync({ name: "BES Team", description: "Internal BES work" });
        const fresh = await fetchAgencyWorkspaces(auth.agencyId!);
        const created = fresh[0];
        if (!created) throw new Error("The workspace was created but could not be read back.");
        wsId = created.id;
        if (created.boards.length === 0) {
          await createBoard(wsId, "To do", 0);
        }
        const reread = await fetchAgencyWorkspaces(auth.agencyId!);
        bId = reread.find((w) => w.id === wsId)?.boards[0]?.id ?? null;
      }

      const item = await createWorkspaceItem({
        workspaceId: wsId!,
        /* Null: this is agency work, and the writer derives AGENCY scope from
           the absence of an organization. */
        organizationId: null,
        boardId: bId,
        title: name,
        itemTypeId: null,
        assignedTo: assignee === NONE ? null : assignee,
        teamId: teamId === NONE ? null : teamId,
        priority,
        dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
        description: description.trim() || null,
      });
      void qc.invalidateQueries({ queryKey: ["work"] });
      void qc.invalidateQueries({ queryKey: ["agency", "workspaces"] });
      setTitle(""); setDescription(""); setDue("");
      onCreated(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The task could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Internal BES work. It does not need a client, a case or an organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) { e.preventDefault(); void submit(); } }}
            placeholder="What needs doing?"
            aria-label="Task title"
          />
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Any detail (optional)" aria-label="Description" />

          <div className="grid gap-2 sm:grid-cols-2">
            {workspaces.length > 0 && (
              <>
                <OpsSelect aria-label="Workspace" size="sm" value={workspaceId} onValueChange={setWorkspaceId}
                  options={workspaces.map((w) => ({ value: w.id, label: w.name }))} />
                <OpsSelect aria-label="List" size="sm" value={boardId} onValueChange={setBoardId}
                  options={boards.length > 0
                    ? boards.map((b) => ({ value: b.id, label: b.name }))
                    : [{ value: NONE, label: "No list" }]} />
              </>
            )}
            <OpsSelect aria-label="Assignee" size="sm" value={assignee} onValueChange={setAssignee}
              options={[{ value: NONE, label: "Unassigned" },
                ...(members.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
            <OpsSelect aria-label="Team" size="sm" value={teamId} onValueChange={setTeamId}
              options={[{ value: NONE, label: "No team" },
                ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
            <OpsSelect aria-label="Priority" size="sm" value={priority}
              onValueChange={(v) => setPriority(v as typeof priority)}
              options={["Normal", "High", "Urgent"].map((p) => ({ value: p, label: p }))} />
            <Input type="date" className="h-8" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          </div>

          {error && <p className="text-sm text-status-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
