/**
 * One work item, in full: the canonical columns (status, assignee, team,
 * priority, due date, description), the workspace's typed custom fields, and
 * the canonical activity stream with the shared composer and attachments.
 *
 * Nothing here is a second store: every edit is a work_items update, every
 * comment an activity_events row, every file a files row linked to a note.
 */
import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OpsSelect } from "@/components/ui/ops-select";
import { ActivityComposer } from "@/components/composer/ActivityComposer";
import { OpsActivityTimeline } from "@/components/dashboard/fulfillment/OpsActivityTimeline";
import { useAuth } from "@/lib/auth/auth-context";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useActivityAttachments } from "@/lib/data/use-activity-attachments";
import { linkAttachments } from "@/lib/data/activity-attachments";
import { postNote, timelineKey } from "@/lib/data/activity";
import { useWorkItemTimeline } from "@/lib/data/use-work-timeline";
import { useQueryClient } from "@tanstack/react-query";
import { useItemFieldValues, useSetItemFieldValue, useUpdateWorkspaceItem, useWorkspaceItems } from "@/lib/data/use-workspaces";
import type { OrgMember, OrgTeam } from "@/lib/data/workspaces";
import {
  isOverdue,
  sortedStatuses,
  validateFieldValue,
  type FieldValue,
  type Workspace,
  type WorkspaceField,
  type WorkspaceItem,
} from "@/lib/workspaces/workspace-domain";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisibilityAudience } from "@/lib/auth/use-visibility-audience";

const NONE = "__none__";
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function FieldInput({ field, value, onChange }: { field: WorkspaceField; value: FieldValue; onChange: (v: FieldValue) => void }) {
  const [draft, setDraft] = useState<string>(value === null || value === undefined ? "" : String(value));
  const [err, setErr] = useState<string | null>(null);
  const commit = (v: FieldValue) => {
    const e = validateFieldValue(field, v);
    setErr(e);
    if (!e) onChange(v);
  };
  switch (field.fieldType) {
    case "checkbox":
      return <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true)} aria-label={field.label} />;
    case "select":
      return (
        <OpsSelect aria-label={field.label} size="sm" value={typeof value === "string" ? value : NONE}
          onValueChange={(v) => onChange(v === NONE ? null : v)}
          options={[{ value: NONE, label: "—" }, ...field.choices.map((c) => ({ value: c, label: c }))]} />
      );
    case "date":
      return (
        <div>
          <Input type="date" aria-label={field.label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft || null)} className="h-8 w-44 text-xs" />
          {err && <p className="mt-0.5 text-[11px] text-red-700">{err}</p>}
        </div>
      );
    case "number":
      return (
        <div>
          <Input type="number" aria-label={field.label} value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft === "" ? null : Number(draft))} className="h-8 w-44 text-xs" />
          {err && <p className="mt-0.5 text-[11px] text-red-700">{err}</p>}
        </div>
      );
    default:
      return (
        <div>
          <Input aria-label={field.label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft || null)} className="h-8 text-xs" maxLength={2000} />
          {err && <p className="mt-0.5 text-[11px] text-red-700">{err}</p>}
        </div>
      );
  }
}

export function WorkItemDrawer({
  itemId,
  workspace,
  members,
  teams,
  canAssign,
  readOnly,
  onClose,
}: {
  /** The drawer resolves the LIVE item from the shared items query, so its own edits refresh it. */
  itemId: string | null;
  workspace: Workspace;
  members: OrgMember[];
  teams: OrgTeam[];
  /** Assignment is a supervisor act (org admin, BES manager/lead); others see the assignee read-only. */
  canAssign: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const auth = useAuth();
  const audience: VisibilityAudience = auth.isAgencyStaff ? "bes" : "organization";
  const qc = useQueryClient();
  const { items } = useWorkspaceItems(workspace.id);
  const item = items.find((i) => i.id === itemId) ?? null;
  const update = useUpdateWorkspaceItem(workspace.id);
  const { values } = useItemFieldValues(item?.id ?? null);
  const setValue = useSetItemFieldValue(item?.id ?? "");
  const { entries, isLoading: tlLoading } = useWorkItemTimeline(item?.id ?? null);
  const attachments = useActivityAttachments(entries.map((e) => e.id));
  const { allowed, fallback } = useActivityVisibility(workspace.organizationId, "talentops");
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");

  if (!item) return null;
  // `key` on the caller side resets these drafts per item; live edits below read `item` directly.
  const statuses = sortedStatuses(workspace.statuses);
  const status = statuses.find((s) => s.id === item.statusId);
  const terminal = statuses.find((s) => s.isTerminal);
  const assignee = members.find((m) => m.id === item.assignedTo);
  const patch = (p: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ itemId: item.id, patch: p });
  const activeFields = workspace.fields.filter((f) => !f.archivedAt);
  const agencyId = workspace.agencyId ?? auth.agencyId ?? "";

  return (
    <Sheet open={!!itemId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="sr-only">{item.title}</SheetTitle>
          <SheetDescription className="sr-only">Work item details</SheetDescription>
          {readOnly ? (
            <h2 className="text-base font-bold text-foreground">{item.title}</h2>
          ) : (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== item.title && patch({ title })}
              aria-label="Title" className="h-9 border-transparent px-1 text-base font-bold shadow-none hover:border-border focus:border-border" />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{workspace.name}</span>
            {item.completedAt ? (
              <span className="inline-flex items-center gap-1 text-status-success"><CheckCircle2 className="h-3.5 w-3.5" /> Completed {formatDate(item.completedAt)}</span>
            ) : isOverdue(item) ? (
              <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Overdue</span>
            ) : null}
            {update.error && <span className="text-red-700">{(update.error as Error).message}</span>}
          </div>
        </SheetHeader>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Status">
            <OpsSelect aria-label="Status" size="sm" value={item.statusId ?? ""} disabled={readOnly}
              onValueChange={(v) => patch({ statusId: v })} options={statuses.map((s) => ({ value: s.id, label: s.label }))} />
            {status && <p className="mt-1 text-[11px] text-muted-foreground">Engine stage: {status.canonicalStage}</p>}
          </Field>
          <Field label="Assignee">
            {canAssign && !readOnly ? (
              <OpsSelect aria-label="Assignee" size="sm" value={item.assignedTo ?? NONE}
                onValueChange={(v) => patch({ assignedTo: v === NONE ? null : v })}
                options={[{ value: NONE, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
            ) : (
              <p className="text-sm text-foreground">{assignee?.name ?? (item.assignedTo ? "Assigned" : "Unassigned")}</p>
            )}
          </Field>
          <Field label="Team">
            {canAssign && !readOnly ? (
              <OpsSelect aria-label="Team" size="sm" value={item.teamId ?? NONE}
                onValueChange={(v) => patch({ teamId: v === NONE ? null : v })}
                options={[{ value: NONE, label: "No team" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
            ) : (
              <p className="text-sm text-foreground">{teams.find((t) => t.id === item.teamId)?.name ?? "No team"}</p>
            )}
          </Field>
          <Field label="Priority">
            <OpsSelect aria-label="Priority" size="sm" value={item.priority} disabled={readOnly}
              onValueChange={(v) => patch({ priority: v as "Normal" | "High" | "Urgent" })} options={["Normal", "High", "Urgent"]} />
          </Field>
          <Field label="Due date">
            <Input type="date" aria-label="Due date" defaultValue={toDateInput(item.dueAt)} disabled={readOnly}
              onChange={(e) => patch({ dueAt: e.target.value ? new Date(`${e.target.value}T17:00:00`).toISOString() : null })} className="h-8 w-44 text-xs" />
          </Field>
          <Field label="Type">
            <p className="text-sm text-foreground">{workspace.itemTypes.find((t) => t.id === item.itemTypeId)?.label ?? "—"}</p>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly}
                onBlur={() => description !== (item.description ?? "") && patch({ description: description || null })} rows={3} className="text-sm" />
            </Field>
          </div>
          {activeFields.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fields</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeFields.map((f) => (
                  <Field key={f.id} label={f.label}>
                    {readOnly ? (
                      <p className="text-sm text-foreground">{values[f.id] === null || values[f.id] === undefined ? "—" : String(values[f.id])}</p>
                    ) : (
                      <FieldInput key={`${f.id}:${String(values[f.id])}`} field={f} value={values[f.id] ?? null} onChange={(v) => setValue.mutate({ fieldId: f.id, value: v })} />
                    )}
                  </Field>
                ))}
              </div>
              {setValue.error && <p className="mt-1 text-xs text-red-700">{(setValue.error as Error).message}</p>}
            </div>
          )}
          {!readOnly && !item.completedAt && terminal && (
            <div className="sm:col-span-2">
              <Button size="sm" onClick={() => patch({ statusId: terminal.id })} disabled={update.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Mark complete ({terminal.label})
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground">Sets the engine stage to Completed; My Work, Attention and EOD follow.</p>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</p>
          {tlLoading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : (
            <OpsActivityTimeline
              entries={entries}
              actor={auth.displayName}
              emptyMessage="No activity yet. Status changes, assignments, comments and files will appear here."
              attachmentsByActivity={attachments.byActivity}
              canAnnotate={false}
              onTogglePin={() => {}}
              onSetMark={() => {}}
              composer={
                readOnly || !auth.user ? undefined : (
                  <ActivityComposer
                    audience={audience}
                    entityType="work_item"
                    entityId={item.id}
                    organizationId={workspace.organizationId}
                    allowedVisibilities={allowed}
          defaultVisibility={fallback}
                    onPost={async ({ body, plainText, visibility }) => {
                      const entry = await postNote({
                        agencyId, organizationId: workspace.organizationId, entityType: "work_item", entityId: item.id,
                        actorId: auth.user!.id, actorName: auth.displayName, action: "Comment posted", detail: plainText, visibility, body,
                      });
                      void qc.invalidateQueries({ queryKey: timelineKey("work_item", item.id) });
                      return entry.id;
                    }}
                    onAttach={async (activityId, objects) => {
                      await linkAttachments({ activityId, agencyId, organizationId: workspace.organizationId, uploaderId: auth.user!.id, objects });
                      attachments.refresh();
                    }}
                  />
                )
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className={cn("mb-1 text-[11px] font-medium text-muted-foreground")}>{label}</p>
    {children}
  </div>
);
