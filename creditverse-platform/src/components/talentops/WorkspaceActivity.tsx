/**
 * The Activity tab: one bounded read of the canonical activity stream across
 * the items on screen. Read-only here — comments are written from the item
 * itself, where the composer knows which record it is talking about.
 */
import { OpsActivityTimeline } from "@/components/dashboard/fulfillment/OpsActivityTimeline";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkspaceActivity } from "@/lib/data/use-workspaces";

export function WorkspaceActivity({ itemIds }: { itemIds: string[] }) {
  const auth = useAuth();
  const { entries, isLoading, error } = useWorkspaceActivity(itemIds);
  if (error) return <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">Could not load activity: {error}</p>;
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <OpsActivityTimeline entries={entries} actor={auth.displayName} emptyMessage="No activity yet on this work." canAnnotate={false} onTogglePin={() => {}} onSetMark={() => {}} />
    </div>
  );
}
