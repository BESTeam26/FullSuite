/**
 * One BES task, in full.
 *
 * Everything a person needs to work it: what it is, who owns it, when it is
 * due, the checklist, what is blocking it, and the conversation. Every edit is
 * a `work_items` update and every comment an `activity_events` row — there is
 * no second store and no second activity log (rules 2, 10).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { ChecklistPanel } from "@/components/agency/ChecklistPanel";
import { BlockersPanel } from "@/components/agency/BlockersPanel";
import { ActivityComposer } from "@/components/composer/ActivityComposer";
import { OpsActivityTimeline } from "@/components/dashboard/fulfillment/OpsActivityTimeline";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkItemTimeline } from "@/lib/data/use-work-timeline";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useActivityAttachments } from "@/lib/data/use-activity-attachments";
import { useMentionable } from "@/lib/data/use-mentionable";
import { linkAttachments } from "@/lib/data/activity-attachments";
import { postNote, timelineKey } from "@/lib/data/activity";
import { useAgencyMembers, useAgencyTeams } from "@/lib/data/use-agency-work";
import { duplicateWorkItem } from "@/lib/data/agency-workspace";
import { requireSupabase } from "@/lib/supabase/client";
import { isOverdue } from "@/lib/agency/team-views";
import { formatDate } from "@/lib/format-date";
import type { WorkItem } from "@/lib/bes-domain";
import type { VisibilityAudience } from "@/lib/auth/use-visibility-audience";

const NONE = "__none__";
const STAGES = ["Queued", "Assigned", "In Processing", "Ready for QA", "QA Review", "Blocked", "Attention", "Completed"] as const;
const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

/** Patch the canonical row. Stage and assignee changes are logged by triggers. */
async function patchItem(id: string, patch: Record<string, unknown>) {
  const sb = requireSupabase();
  const { error } = await sb.from("work_items").update(patch as never).eq("id", id);
  if (error) throw error;
}

export function AgencyTaskDrawer({
  itemId, onClose, allItems,
}: {
  itemId: string;
  onClose: () => void;
  allItems: WorkItem[];
}) {
  const item = allItems.find((i) => i.id === itemId);
  const auth = useAuth();
  const qc = useQueryClient();
  const members = useAgencyMembers();
  const teams = useAgencyTeams();
  const timeline = useWorkItemTimeline(itemId);
  /* Scope is the AGENCY, not an organization — BES-internal work has no
     partner to widen visibility to. "talentops" is the service the shared
     visibility rules use for internal staffing work. */
  const { allowed, fallback } = useActivityVisibility(undefined, "talentops");
  const attachments = useActivityAttachments(timeline.entries.map((e) => e.id));
  const mention = useMentionable(undefined);
  const audience: VisibilityAudience = auth.isAgencyStaff ? "bes" : "organization";

  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
  }, [item?.id, item?.title, item?.description]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["work"] });
    void qc.invalidateQueries({ queryKey: timelineKey("work_item", itemId) });
  };

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try { await patchItem(itemId, patch); refresh(); } finally { setSaving(false); }
  };

  if (!item) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader><SheetTitle>Task not available</SheetTitle></SheetHeader>
          <p className="mt-3 text-sm text-muted-foreground">
            This task is not in your current list. It may have been reassigned or completed,
            or it may be outside what you are authorized to see.
          </p>
        </SheetContent>
      </Sheet>
    );
  }

  const overdue = isOverdue(item);
  const done = item.stage === "Completed";
  const agencyId = item.agencyId ?? auth.agencyId ?? "";
  const candidates = allItems
    .filter((i) => i.id !== itemId && i.stage !== "Completed")
    .map((i) => ({ id: i.id, title: i.title }));

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="space-y-1">
          <SheetTitle className="sr-only">{item.title}</SheetTitle>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== item.title) void save({ title: title.trim() }); }}
            aria-label="Task title"
            className="h-auto border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0"
          />
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            {overdue && !done && (
              <span className="inline-flex items-center gap-1 font-semibold text-status-danger">
                <AlertTriangle className="h-3.5 w-3.5" /> Overdue
              </span>
            )}
            {done && item.completedAt && (
              <span className="text-status-success">Completed {formatDate(item.completedAt)}</span>
            )}
            {saving && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <OpsSelect aria-label="Status" size="sm" value={item.stage}
              onValueChange={(v) => { void save({ stage: v }); }}
              options={STAGES.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="Assignee">
            <OpsSelect aria-label="Assignee" size="sm" value={item.assignedTo ?? NONE}
              onValueChange={(v) => { void save({ assigned_to: v === NONE ? null : v }); }}
              options={[{ value: NONE, label: "Unassigned" },
                ...(members.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
          </Field>
          <Field label="Team">
            <OpsSelect aria-label="Team" size="sm" value={item.teamId ?? NONE}
              onValueChange={(v) => { void save({ team_id: v === NONE ? null : v }); }}
              options={[{ value: NONE, label: "No team" },
                ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
          </Field>
          <Field label="Priority">
            <OpsSelect aria-label="Priority" size="sm" value={item.priority ?? "Normal"}
              onValueChange={(v) => { void save({ priority: v }); }}
              options={["Urgent", "High", "Normal"].map((p) => ({ value: p, label: p }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Due date">
              <Input type="date" className="h-8" aria-label="Due date"
                value={toDateInput(item.dueAt)}
                onChange={(e) => {
                  /* Stored at 5pm local, so "due today" means end of the
                     working day rather than midnight, which is already past
                     by the time anyone reads it. */
                  void save({ due_at: e.target.value ? new Date(`${e.target.value}T17:00:00`).toISOString() : null });
                }} />
            </Field>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (item.description ?? "")) void save({ description: description.trim() || null }); }}
              placeholder="What needs doing?" aria-label="Description" />
          </Field>
        </div>

        <div className="mt-5 space-y-5 border-t border-border/60 pt-4">
          <ChecklistPanel workItemId={itemId} />
          <BlockersPanel workItemId={itemId} candidates={candidates} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button size="sm" variant={done ? "secondary" : "default"}
            onClick={() => { void save({ stage: done ? "Assigned" : "Completed" }); }}>
            {done ? "Reopen task" : "Mark complete"}
          </Button>
          <Button size="sm" variant="ghost"
            onClick={async () => { await duplicateWorkItem(itemId); refresh(); }}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
          </Button>
        </div>

        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</p>
          {timeline.isLoading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : (
            <OpsActivityTimeline
              entries={timeline.entries}
              actor={auth.displayName}
              emptyMessage="No activity yet. Status changes, assignments, comments and files appear here."
              attachmentsByActivity={attachments.byActivity}
              canAnnotate={false}
              onTogglePin={() => {}}
              onSetMark={() => {}}
              composer={
                !auth.user ? undefined : (
                  <ActivityComposer
                    audience={audience}
                    entityType="work_item"
                    entityId={itemId}
                    /* No organizationId, deliberately: BES-internal work
                       belongs to no tenant, and naming one would file the
                       attachment under a customer with nothing to do with it. */
                    mentionable={mention.mentionable}
                    mentionAvatars={mention.mentionAvatars}
                    allowedVisibilities={allowed}
                    defaultVisibility={fallback}
                    onPost={async ({ body, plainText, visibility }) => {
                      const entry = await postNote({
                        agencyId, entityType: "work_item", entityId: itemId,
                        actorId: auth.user!.id, actorName: auth.displayName,
                        action: "Comment posted", detail: plainText, visibility, body,
                      });
                      void qc.invalidateQueries({ queryKey: timelineKey("work_item", itemId) });
                      return entry.id;
                    }}
                    onAttach={async (activityId, objects) => {
                      await linkAttachments({ activityId, agencyId, uploaderId: auth.user!.id, objects });
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
    <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    {children}
  </div>
);
