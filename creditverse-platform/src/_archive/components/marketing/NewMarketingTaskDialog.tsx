/**
 * Creating a marketing task.
 *
 * It writes a canonical `work_items` row with the marketing workspace on it —
 * there is no marketing task table to write to, and that is the point (rule
 * 17). Everything else about the task is edited afterwards in the drawer, so
 * this form asks only what cannot be guessed: what it is, which workspace it
 * belongs to, and who is doing it.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OrgMember } from "@/lib/data/workspaces";
import type { NewMarketingWork } from "@/lib/data/marketing";
import type { Campaign } from "@/lib/marketing/marketing-domain";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

const NONE = "__none__";

export function NewMarketingTaskDialog({
  workspace,
  workspaces,
  campaigns,
  members,
  agencyId,
  onClose,
  onCreate,
}: {
  /** The workspace the person is already looking at — the sensible default. */
  workspace: Workspace;
  workspaces: Workspace[];
  campaigns: Campaign[];
  members: OrgMember[];
  agencyId: string;
  onClose: () => void;
  onCreate: (input: NewMarketingWork) => Promise<void>;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspace.id);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState(workspace.itemTypes[0]?.id ?? "");
  const [assignee, setAssignee] = useState(NONE);
  const [campaignId, setCampaignId] = useState(NONE);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = workspaces.find((w) => w.id === workspaceId) ?? workspace;
  /* The first status by position — "Backlog" in the seeded workflow. New work
     starts where the workspace says new work starts, never at a key typed in
     here, because Dee may rename or reorder these rows at any time. */
  const firstStatus = [...target.statuses].sort((a, b) => a.position - b.position)[0] ?? null;
  const types = target.itemTypes;
  const campaignsHere = campaigns.filter((c) => c.workspaceId === target.id);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        workspaceId: target.id,
        agencyId: target.agencyId ?? agencyId,
        title,
        statusId: firstStatus?.id ?? null,
        itemTypeId: types.find((t) => t.id === typeId)?.id ?? types[0]?.id ?? null,
        assignedTo: assignee === NONE ? null : assignee,
        campaignId: campaignId === NONE ? null : campaignId,
        dueAt: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New marketing task</SheetTitle>
          <SheetDescription>
            It starts in {firstStatus?.label ?? "the first status"}. Everything else — checklist,
            publish date, files, comments — is on the task itself.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What needs doing</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) { e.preventDefault(); void submit(); } }}
              placeholder="October launch carousel"
              className="mt-1 h-8 text-xs"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Workspace</span>
            <OpsSelect
              aria-label="Workspace"
              size="sm"
              value={workspaceId}
              onValueChange={(v) => { setWorkspaceId(v); setTypeId(""); setCampaignId(NONE); }}
              options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
              <OpsSelect
                aria-label="Type"
                size="sm"
                value={typeId || types[0]?.id || ""}
                onValueChange={setTypeId}
                options={types.map((t) => ({ value: t.id, label: t.label }))}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Due</span>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-8 text-xs" />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assignee</span>
            <OpsSelect
              aria-label="Assignee"
              size="sm"
              value={assignee}
              onValueChange={setAssignee}
              options={[{ value: NONE, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </label>

          {campaignsHere.length > 0 && (
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Campaign</span>
              <OpsSelect
                aria-label="Campaign"
                size="sm"
                value={campaignId}
                onValueChange={setCampaignId}
                options={[{ value: NONE, label: "No campaign" }, ...campaignsHere.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </label>
          )}

          {error && <p className="text-xs text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!title.trim() || saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create task"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
