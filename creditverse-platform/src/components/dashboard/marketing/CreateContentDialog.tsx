/**
 * `+ Create Content` — one post, quickly.
 *
 * Dee: "This should be faster than opening a generic task form. Minimum:
 * Partner, Title, Platform, Content Type, Publish Date, Assignee. Everything
 * else can be completed afterward."
 *
 * So six controls and nothing else. Caption, CTA, asset, campaign and the
 * checklist all live in the drawer, where somebody sits down to write rather
 * than standing at a calendar thinking "Tuesday, a reel, Roniel".
 *
 * It writes a canonical `work_items` row plus its field values — the same
 * record the calendar, the task list and the campaign all read.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isoDay } from "@/lib/marketing/marketing-domain";
import type { OrgMember } from "@/lib/data/workspaces";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

const NONE = "__none__";

export interface NewContent {
  workspaceId: string;
  title: string;
  channel: string | null;
  contentType: string | null;
  publishOn: string | null;
  assignedTo: string | null;
}

/** A field's configured choices, or nothing — never a hard-coded list here. */
const choicesOf = (workspace: Workspace, key: string): string[] =>
  workspace.fields.find((f) => f.key === key)?.choices ?? [];

export function CreateContentDialog({
  workspace,
  workspaces,
  members,
  onClose,
  onCreate,
}: {
  /** Where the person already is — the sensible default. */
  workspace: Workspace;
  workspaces: Workspace[];
  members: OrgMember[];
  onClose: () => void;
  onCreate: (input: NewContent) => Promise<void>;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspace.id);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState(NONE);
  const [contentType, setContentType] = useState(NONE);
  const [publishOn, setPublishOn] = useState(isoDay(new Date()));
  const [assignee, setAssignee] = useState(NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = workspaces.find((w) => w.id === workspaceId) ?? workspace;
  const channels = choicesOf(target, "channel");
  const types = choicesOf(target, "content_type");

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        workspaceId: target.id,
        title,
        channel: channel === NONE ? null : channel,
        contentType: contentType === NONE ? null : contentType,
        publishOn: publishOn || null,
        assignedTo: assignee === NONE ? null : assignee,
      });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create content</SheetTitle>
          <SheetDescription>
            Just enough to put it on the calendar. The caption, the creative and the checklist are on
            the item itself.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Title / hook</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) { e.preventDefault(); void submit(); } }}
              placeholder="3 credit myths that cost you a mortgage"
              className="mt-1 h-8 text-xs"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Partner</span>
            <OpsSelect
              aria-label="Partner"
              size="sm"
              value={workspaceId}
              onValueChange={(v) => { setWorkspaceId(v); setChannel(NONE); setContentType(NONE); }}
              options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Platform</span>
              <OpsSelect
                aria-label="Platform"
                size="sm"
                value={channel}
                onValueChange={setChannel}
                options={[{ value: NONE, label: "Not set" }, ...channels.map((c) => ({ value: c, label: c }))]}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Content type</span>
              <OpsSelect
                aria-label="Content type"
                size="sm"
                value={contentType}
                onValueChange={setContentType}
                options={[{ value: NONE, label: "Not set" }, ...types.map((t) => ({ value: t, label: t }))]}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Publish date</span>
              <Input type="date" value={publishOn} onChange={(e) => setPublishOn(e.target.value)} className="mt-1 h-8 text-xs" />
            </label>
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
          </div>

          {error && <p className="text-xs text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!title.trim() || saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create content"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
