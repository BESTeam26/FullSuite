/**
 * Published activity on a BES CRM project, plus a comment box.
 *
 * BES chooses whether an update is internal or published; the customer can
 * only write at the shared level. Both are enforced by the database — the
 * choice here just avoids offering what would be refused. Nothing on this
 * surface lets the customer change status, assignment, dates or completion
 * (rule 17): there is no control for it, and no policy permits it.
 */
import { useState } from "react";
import { MessageSquare, Lock, Globe } from "lucide-react";
import type { WorkItem } from "@/lib/bes-domain";
import { VISIBILITY_LABEL, type ActivityVisibility } from "@/lib/data/activity";
import { usePostWorkComment, useWorkItemTimeline } from "@/lib/data/use-work-timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OpsSelect } from "@/components/ui/ops-select";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ProjectUpdates({ project, isBes }: { project: WorkItem; isBes: boolean }) {
  const { entries, isLoading, error } = useWorkItemTimeline(project.id);
  const post = usePostWorkComment();
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<ActivityVisibility>(isBes ? "bes_internal" : "shared_with_partner");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !project.agencyId) return;
    post.mutate(
      { itemId: project.id, agencyId: project.agencyId, organizationId: project.subjectOrganizationId, detail: text, visibility },
      { onSuccess: () => setText("") },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{project.title}</h3>
        {project.description && <p className="text-xs text-muted-foreground">{project.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Stage: <span className="font-medium text-foreground">{project.stage}</span>
          {project.dueAt ? ` · due ${new Date(project.dueAt).toLocaleDateString()}` : ""}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isBes ? "Post an update…" : "Ask a question or leave a comment for BES…"}
          aria-label="Comment"
          rows={2}
          className="text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          {isBes ? (
            <OpsSelect
              aria-label="Visibility"
              size="sm"
              value={visibility}
              onValueChange={(v) => setVisibility(v as ActivityVisibility)}
              options={[
                { value: "bes_internal", label: VISIBILITY_LABEL.bes_internal },
                { value: "shared_with_partner", label: VISIBILITY_LABEL.shared_with_partner },
              ]}
            />
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Visible to BES and your organization
            </span>
          )}
          <Button type="submit" size="sm" disabled={!text.trim() || post.isPending}>
            <MessageSquare className="mr-1 h-4 w-4" /> Post
          </Button>
          {post.error && <span className="text-xs text-red-700">{(post.error as Error).message}</span>}
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">Could not load updates: {error}</div>
      )}
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {isBes ? "No activity yet." : "BES has not published any updates on this project yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{e.actor}</span>
                <span>{e.action}</span>
                <span>· {when(e.timestamp)}</span>
                {isBes && (
                  <span className="inline-flex items-center gap-1">
                    {e.visibility === "bes_internal" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {VISIBILITY_LABEL[e.visibility]}
                  </span>
                )}
              </div>
              {e.detail && <p className="mt-1 text-sm text-foreground">{e.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
