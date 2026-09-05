/**
 * The TalentOps bridge, from the organization's side: share this workspace
 * (or one board) with BES under one of the organization's live TalentOps
 * engagements, and revoke it later. Only org admins may do this — the
 * database enforces it; the panel is simply not rendered for anyone else.
 */
import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { Share2, XCircle } from "lucide-react";
import { useFulfillment } from "@/lib/data/use-fulfillment";
import { isEngagementLive } from "@/lib/data/fulfillment-engagements";
import { useActiveShares, useCreateShare, useRevokeShare } from "@/lib/data/use-workspace-shares";
import type { Workspace } from "@/lib/workspaces/workspace-domain";
import type { ShareAccess } from "@/lib/data/workspace-shares";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";

const WHOLE = "__whole__";

export function SharePanel({ workspace }: { workspace: Workspace }) {
  const { engagements } = useFulfillment();
  const { shares, isLoading } = useActiveShares(workspace.id);
  const create = useCreateShare();
  const revoke = useRevokeShare();

  const talentOps = engagements.filter(
    (e) => e.service === "talentops" && e.organizationId === workspace.organizationId && isEngagementLive(e),
  );
  const [engagementId, setEngagementId] = useState(talentOps[0]?.id ?? "");
  const [boardId, setBoardId] = useState(WHOLE);
  const [access, setAccess] = useState<ShareAccess>("work");

  const boardLabel = (id: string | null) =>
    id ? (workspace.boards.find((b) => b.id === id)?.name ?? "Board") : "Whole workspace";

  return (
    <section aria-label="Share with BES" className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Share2 className="h-4 w-4 text-primary" /> Shared with BES (TalentOps)
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        BES sees this workspace only while a share exists under an active TalentOps engagement.
        Nothing is copied — BES works the same records you see here.
      </p>

      {isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : shares.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Not shared.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="text-foreground">
                {boardLabel(s.boardId)} · {s.access === "work" ? "can work items" : "view only"}
              </span>
              <button
                type="button"
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending}
                className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm disabled:opacity-60"
              >
                <XCircle className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {talentOps.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No active TalentOps engagement with BES exists for this organization, so nothing can be shared.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!engagementId) return;
            create.mutate({ workspaceId: workspace.id, engagementId, boardId: boardId === WHOLE ? null : boardId, access });
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          {talentOps.length > 1 && (
            <OpsSelect
              aria-label="Engagement"
              size="sm"
              value={engagementId}
              onValueChange={setEngagementId}
              options={talentOps.map((e) => ({ value: e.id, label: `TalentOps since ${formatDate(e.effectiveFrom)}` }))}
            />
          )}
          <OpsSelect
            aria-label="Scope"
            size="sm"
            value={boardId}
            onValueChange={setBoardId}
            options={[{ value: WHOLE, label: "Whole workspace" }, ...workspace.boards.map((b) => ({ value: b.id, label: `Board: ${b.name}` }))]}
          />
          <OpsSelect
            aria-label="Access"
            size="sm"
            value={access}
            onValueChange={(v) => setAccess(v as ShareAccess)}
            options={[{ value: "work", label: "BES can work items" }, { value: "view", label: "View only" }]}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!engagementId || create.isPending}>
            <Share2 className="mr-1 h-4 w-4" /> Share
          </Button>
          {create.error && <span className="text-xs text-red-700">{(create.error as Error).message}</span>}
        </form>
      )}
    </section>
  );
}
