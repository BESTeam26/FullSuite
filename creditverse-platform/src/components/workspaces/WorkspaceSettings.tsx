/**
 * Workspace configuration for organization admins. Every row here is data the
 * database validates and RLS guards (is_org_admin of the workspace's org).
 * Statuses map onto canonical work stages; labels are presentation, the stage
 * is the operational truth shared systems read.
 */
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OpsSelect } from "@/components/ui/ops-select";
import { SharePanel } from "./SharePanel";
import { STATUS_COLOURS, WORKSPACE_COLOURS, WORKSPACE_ICONS, WorkspaceIcon } from "./workspace-visuals";
import { useOrgMembers, useOrgTeams, useWorkspaceAdmin } from "@/lib/data/use-workspaces";
import {
  CANONICAL_STAGES, FIELD_TYPE_LABEL, slugKey, sortedStatuses,
  type CanonicalStage, type Workspace, type WorkspaceFieldType,
} from "@/lib/workspaces/workspace-domain";
import { ArrowDown, ArrowUp, Archive, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const Err = ({ e }: { e: unknown }) => (e ? <p className="text-xs text-red-700">{(e as Error).message}</p> : null);
const Row = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <li className={cn("flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm", className)}>{children}</li>
);

export function WorkspaceSettings({ workspace, open, onClose, onArchived }: { workspace: Workspace; open: boolean; onClose: () => void; onArchived: () => void }) {
  const admin = useWorkspaceAdmin(workspace.organizationId);
  const { members } = useOrgMembers(workspace.organizationId);
  const { teams, create: createTeam, setMember } = useOrgTeams(workspace.organizationId);

  // General
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  // Boards / statuses / types / fields drafts
  const [boardName, setBoardName] = useState("");
  const [statusLabel, setStatusLabel] = useState("");
  const [statusStage, setStatusStage] = useState<CanonicalStage>("Queued");
  const [statusColour, setStatusColour] = useState<string>(STATUS_COLOURS[0]);
  const [typeLabel, setTypeLabel] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<WorkspaceFieldType>("text");
  const [fieldChoices, setFieldChoices] = useState("");
  const [teamName, setTeamName] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

  const statuses = sortedStatuses(workspace.statuses);
  const boards = [...workspace.boards].sort((a, b) => a.position - b.position);
  const move = (list: { id: string; position: number }[], idx: number, dir: -1 | 1, fn: (id: string, position: number) => void) => {
    const other = list[idx + dir];
    if (!other) return;
    fn(list[idx].id, other.position);
    fn(other.id, list[idx].position);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ background: workspace.colour ?? "#475569" }}>
              <WorkspaceIcon name={workspace.icon} className="h-3.5 w-3.5" />
            </span>
            {workspace.name} · settings
          </SheetTitle>
          <SheetDescription className="text-xs">Statuses map onto the engine's stages; labels are yours, the stage is what My Work, Attention and EOD read.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="statuses" className="px-5 py-3">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {["general", "boards", "statuses", "types", "fields", "teams", "sharing"].map((t) => (
              <TabsTrigger key={t} value={t} className="rounded-lg border border-border px-3 py-1.5 text-xs capitalize data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-foreground">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">Name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1" /></label>
              <label className="text-xs text-muted-foreground sm:col-span-2">Description<Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 text-sm" /></label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Icon</p>
                <div className="flex gap-1">{WORKSPACE_ICONS.map((i) => (
                  <button key={i} type="button" aria-label={`Icon ${i}`} aria-pressed={workspace.icon === i} onClick={() => admin.updateWorkspace.mutate({ id: workspace.id, patch: { icon: i } })}
                    className={cn("rounded-md border p-1.5 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", workspace.icon === i ? "border-primary bg-primary/10" : "border-border")}><WorkspaceIcon name={i} className="h-4 w-4" /></button>
                ))}</div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Colour</p>
                <div className="flex gap-1">{WORKSPACE_COLOURS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={workspace.colour === c} onClick={() => admin.updateWorkspace.mutate({ id: workspace.id, patch: { colour: c } })}
                    className={cn("h-7 w-7 rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", workspace.colour === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
                ))}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!name.trim() || admin.updateWorkspace.isPending || (name === workspace.name && description === (workspace.description ?? ""))}
                onClick={() => admin.updateWorkspace.mutate({ id: workspace.id, patch: { name, description: description.trim() || null } })}>Save</Button>
              <Err e={admin.updateWorkspace.error} />
            </div>
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-sm font-semibold text-foreground">Archive workspace</p>
              <p className="text-xs text-muted-foreground">Hides the workspace and its items from boards. Nothing is deleted; history and production stay.</p>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-foreground"><Checkbox checked={confirmArchive} onCheckedChange={(c) => setConfirmArchive(c === true)} /> I understand</label>
                <Button size="sm" variant="outline" disabled={!confirmArchive || admin.updateWorkspace.isPending}
                  onClick={() => admin.updateWorkspace.mutate({ id: workspace.id, patch: { archivedAt: new Date().toISOString() } }, { onSuccess: onArchived })}>
                  <Archive className="mr-1 h-4 w-4" /> Archive
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="boards" className="mt-4 space-y-3">
            <ul className="space-y-1.5">
              {boards.map((b, i) => (
                <Row key={b.id}>
                  <span className="flex-1 text-foreground">{b.name}</span>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(boards, i, -1, (id, position) => admin.updateBoard.mutate({ id, patch: { position } }))} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Move down" disabled={i === boards.length - 1} onClick={() => move(boards, i, 1, (id, position) => admin.updateBoard.mutate({ id, patch: { position } }))} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Archive board ${b.name}`} disabled={boards.length <= 1} onClick={() => admin.updateBoard.mutate({ id: b.id, patch: { archivedAt: new Date().toISOString() } })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"><Archive className="h-3.5 w-3.5" /></button>
                </Row>
              ))}
            </ul>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!boardName.trim()) return; admin.createBoard.mutate({ workspaceId: workspace.id, name: boardName, position: boards.length }, { onSuccess: () => setBoardName("") }); }}>
              <Input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder="New board name" aria-label="New board name" className="h-8 max-w-xs text-sm" maxLength={80} />
              <Button type="submit" size="sm" variant="outline" disabled={!boardName.trim() || admin.createBoard.isPending}><Plus className="mr-1 h-4 w-4" /> Add board</Button>
            </form>
            <Err e={admin.createBoard.error ?? admin.updateBoard.error} />
            <p className="text-[11px] text-muted-foreground">Boards group items; items keep their status and stage when boards change. The last board cannot be archived.</p>
          </TabsContent>

          <TabsContent value="statuses" className="mt-4 space-y-3">
            <ul className="space-y-1.5">
              {statuses.map((s, i) => (
                <Row key={s.id}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.colour ?? "#64748b" }} />
                  <Input defaultValue={s.label} aria-label={`Label of ${s.label}`} maxLength={40} className="h-7 max-w-[10rem] text-sm"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== s.label && admin.updateStatus.mutate({ id: s.id, patch: { label: e.target.value } })} />
                  <span className="text-[11px] text-muted-foreground">→</span>
                  <OpsSelect aria-label={`Engine stage of ${s.label}`} size="inline" value={s.canonicalStage}
                    onValueChange={(v) => admin.updateStatus.mutate({ id: s.id, patch: { canonicalStage: v as CanonicalStage } })}
                    options={CANONICAL_STAGES.map((c) => ({ value: c, label: c }))} />
                  {s.isTerminal && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-success">terminal</span>}
                  <span className="flex-1" />
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(statuses, i, -1, (id, position) => admin.updateStatus.mutate({ id, patch: { position } }))} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Move down" disabled={i === statuses.length - 1} onClick={() => move(statuses, i, 1, (id, position) => admin.updateStatus.mutate({ id, patch: { position } }))} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Delete status ${s.label}`} onClick={() => admin.deleteStatus.mutate(s.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </Row>
              ))}
            </ul>
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const key = slugKey(statusLabel); if (!key) return; admin.createStatus.mutate({ workspaceId: workspace.id, status: { key, label: statusLabel, colour: statusColour, position: statuses.length, canonicalStage: statusStage } }, { onSuccess: () => setStatusLabel("") }); }}>
              <Input value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)} placeholder="New status label" aria-label="New status label" className="h-8 max-w-[11rem] text-sm" maxLength={40} />
              <OpsSelect aria-label="Engine stage" size="sm" value={statusStage} onValueChange={(v) => setStatusStage(v as CanonicalStage)} options={CANONICAL_STAGES.map((c) => ({ value: c, label: c }))} />
              <div className="flex gap-1">{STATUS_COLOURS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={statusColour === c} onClick={() => setStatusColour(c)} className={cn("h-6 w-6 rounded border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statusColour === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
              ))}</div>
              <Button type="submit" size="sm" variant="outline" disabled={!slugKey(statusLabel) || admin.createStatus.isPending}><Plus className="mr-1 h-4 w-4" /> Add status</Button>
            </form>
            <Err e={admin.createStatus.error ?? admin.updateStatus.error ?? admin.deleteStatus.error} />
            <p className="text-[11px] text-muted-foreground">A status mapped to <span className="font-medium text-foreground">Completed</span> completes the item in the engine. <span className="font-medium text-foreground">Blocked</span> and <span className="font-medium text-foreground">Attention</span> surface it in Attention. A status in use cannot be deleted.</p>
          </TabsContent>

          <TabsContent value="types" className="mt-4 space-y-3">
            <ul className="space-y-1.5">
              {workspace.itemTypes.map((t) => (
                <Row key={t.id}><span className="flex-1 text-foreground">{t.label}</span><span className="text-[11px] text-muted-foreground">{t.key}</span>
                  <button type="button" aria-label={`Delete type ${t.label}`} onClick={() => admin.deleteItemType.mutate(t.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></Row>
              ))}
            </ul>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const key = slugKey(typeLabel); if (!key) return; admin.createItemType.mutate({ workspaceId: workspace.id, key, label: typeLabel, position: workspace.itemTypes.length }, { onSuccess: () => setTypeLabel("") }); }}>
              <Input value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} placeholder="New work type" aria-label="New work type" className="h-8 max-w-xs text-sm" maxLength={40} />
              <Button type="submit" size="sm" variant="outline" disabled={!slugKey(typeLabel) || admin.createItemType.isPending}><Plus className="mr-1 h-4 w-4" /> Add type</Button>
            </form>
            <Err e={admin.createItemType.error ?? admin.deleteItemType.error} />
          </TabsContent>

          <TabsContent value="fields" className="mt-4 space-y-3">
            <ul className="space-y-1.5">
              {workspace.fields.map((f) => (
                <Row key={f.id} className={f.archivedAt ? "opacity-70" : ""}>
                  <span className="flex-1 text-foreground">{f.label}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{FIELD_TYPE_LABEL[f.fieldType]}</span>
                  {f.fieldType === "select" && <span className="truncate text-[11px] text-muted-foreground">{f.choices.join(" · ")}</span>}
                  {f.archivedAt && <span className="text-[11px] text-muted-foreground">archived</span>}
                  <button type="button" onClick={() => admin.archiveField.mutate({ id: f.id, archived: !f.archivedAt })} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">{f.archivedAt ? "Restore" : "Archive"}</button>
                </Row>
              ))}
            </ul>
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const key = slugKey(fieldLabel); if (!key) return; admin.createField.mutate({ workspaceId: workspace.id, field: { key, label: fieldLabel, fieldType, choices: fieldChoices.split(",").map((c) => c.trim()).filter(Boolean), position: workspace.fields.length } }, { onSuccess: () => { setFieldLabel(""); setFieldChoices(""); } }); }}>
              <Input value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} placeholder="New field label" aria-label="New field label" className="h-8 max-w-[11rem] text-sm" maxLength={40} />
              <OpsSelect aria-label="Field type" size="sm" value={fieldType} onValueChange={(v) => setFieldType(v as WorkspaceFieldType)} options={(Object.keys(FIELD_TYPE_LABEL) as WorkspaceFieldType[]).map((t) => ({ value: t, label: FIELD_TYPE_LABEL[t] }))} />
              {fieldType === "select" && <Input value={fieldChoices} onChange={(e) => setFieldChoices(e.target.value)} placeholder="Choices, comma-separated" aria-label="Choices" className="h-8 max-w-xs text-sm" />}
              <Button type="submit" size="sm" variant="outline" disabled={!slugKey(fieldLabel) || (fieldType === "select" && !fieldChoices.trim()) || admin.createField.isPending}><Plus className="mr-1 h-4 w-4" /> Add field</Button>
            </form>
            <Err e={admin.createField.error ?? admin.archiveField.error} />
            <p className="text-[11px] text-muted-foreground">Five types, validated by the database. Fields are archived, never deleted, so existing values stay readable. Fields carry no permissions and drive no workflow.</p>
          </TabsContent>

          <TabsContent value="teams" className="mt-4 space-y-3">
            {teams.length === 0 ? <p className="text-xs text-muted-foreground">No teams yet. A team groups members so items can be routed to it; team leads are notified of notes on team items.</p> : (
              <ul className="space-y-2">
                {teams.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-medium text-foreground">{t.name} <span className="text-[11px] font-normal text-muted-foreground">· {t.memberIds.length} member{t.memberIds.length === 1 ? "" : "s"}</span></p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {members.map((m) => {
                        const on = t.memberIds.includes(m.id);
                        return (
                          <label key={m.id} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground">
                            <Checkbox checked={on} onCheckedChange={(c) => setMember.mutate({ teamId: t.id, userId: m.id, member: c === true })} aria-label={`${m.name} in ${t.name}`} /> {m.name}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!teamName.trim()) return; createTeam.mutate(teamName, { onSuccess: () => setTeamName("") }); }}>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" aria-label="New team name" className="h-8 max-w-xs text-sm" maxLength={80} />
              <Button type="submit" size="sm" variant="outline" disabled={!teamName.trim() || createTeam.isPending}><Plus className="mr-1 h-4 w-4" /> Add team</Button>
            </form>
            <Err e={createTeam.error ?? setMember.error} />
            <p className="text-[11px] text-muted-foreground">Members come from your organization's memberships, resolved by the server. Nobody outside the organization can be added here.</p>
          </TabsContent>

          <TabsContent value="sharing" className="mt-4">
            <SharePanel workspace={workspace} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
