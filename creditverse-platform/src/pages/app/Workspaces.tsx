/**
 * Custom Workspaces — the organization's flexible operations layer over the
 * canonical work engine (CLAUDE.md rule 17).
 *
 * Organization view: its own workspaces; org admins can share one with BES
 * under a TalentOps engagement. Agency view: exactly the workspaces shared
 * with BES — the same records, never a copy — read-only when the share says so.
 * Authorization is the database's; this page renders what RLS returns.
 */
import { useState } from "react";
import { LayoutGrid, Plus, Settings2 } from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useOrgMembers, useOrgTeams, useSharedWorkspaces, useWorkspaceAdmin, useWorkspaces } from "@/lib/data/use-workspaces";
import { useActiveShares } from "@/lib/data/use-workspace-shares";
import type { Workspace, WorkspaceItem } from "@/lib/workspaces/workspace-domain";
import { WorkspaceBoard } from "@/components/workspaces/WorkspaceBoard";
import { WorkItemDrawer } from "@/components/workspaces/WorkItemDrawer";
import { WorkspaceSettings } from "@/components/workspaces/WorkspaceSettings";
import { NewWorkspaceDialog } from "@/components/workspaces/NewWorkspaceDialog";
import { WorkspaceIcon } from "@/components/workspaces/workspace-visuals";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Notice = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
    <LayoutGrid className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>
  </div>
);

const WorkspaceNav = ({
  workspaces,
  selectedId,
  onSelect,
}: {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => (
  <nav aria-label="Workspaces" className="w-full shrink-0 lg:w-56">
    <ul className="space-y-1">
      {workspaces.map((w) => {
        const active = selectedId === w.id;
        return (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => onSelect(w.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active ? "bg-primary/10 font-semibold text-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white" style={{ background: w.colour ?? "hsl(var(--primary))" }}>
                <WorkspaceIcon name={w.icon} className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
            </button>
            {w.organizationName && (
              <p className="px-3 pb-1 text-[11px] text-muted-foreground">{w.organizationName}</p>
            )}
          </li>
        );
      })}
    </ul>
  </nav>
);

/** BES side of the bridge: shared workspaces only. */
const SharedView = ({ meId }: { meId: string | null }) => {
  const { workspaces, isLoading, error } = useSharedWorkspaces();
  const { shares } = useActiveShares();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<WorkspaceItem | null>(null);
  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;
  const canWork = (w: Workspace) => shares.some((s) => s.workspaceId === w.id && s.access === "work");

  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">Could not load shared workspaces: {error}</div>;
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (workspaces.length === 0)
    return (
      <Notice
        title="No workspaces are shared with BES"
        body="Custom Workspaces belong to each organization. BES sees a workspace only while the organization shares it under an active TalentOps engagement."
      />
    );
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <WorkspaceNav workspaces={workspaces} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      {selected && (
        <WorkspaceBoard
          key={selected.id}
          workspace={selected}
          meId={meId}
          readOnly={!canWork(selected)}
          subtitle={`Shared by ${selected.organizationName ?? "the organization"} under TalentOps`}
          onOpenItem={setOpenItem}
        />
      )}
      {selected && (
        <WorkItemDrawer key={openItem?.id ?? "none"} itemId={openItem?.id ?? null} workspace={selected} members={[]} teams={[]} canAssign={false} readOnly={!canWork(selected)} onClose={() => setOpenItem(null)} />
      )}
    </div>
  );
};

/** Organization side: own workspaces; admins configure, share and assign. */
const OrganizationView = ({ organizationId, meId, isOrgAdmin }: { organizationId: string; meId: string | null; isOrgAdmin: boolean }) => {
  const { workspaces, isLoading, error } = useWorkspaces(organizationId);
  const { members } = useOrgMembers(organizationId);
  const { teams } = useOrgTeams(organizationId);
  const admin = useWorkspaceAdmin(organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<WorkspaceItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const selected = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;

  const newWorkspace = isOrgAdmin && (
    <NewWorkspaceDialog
      open={creating}
      onOpenChange={setCreating}
      pending={admin.createWorkspace.isPending}
      error={admin.createWorkspace.error ? (admin.createWorkspace.error as Error).message : null}
      onCreate={(input) => admin.createWorkspace.mutate(input, { onSuccess: (id) => { setCreating(false); setSelectedId(id as string); } })}
    />
  );

  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">Could not load workspaces: {error}</div>;
  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (workspaces.length === 0)
    return (
      <>
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <LayoutGrid className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No workspaces yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {isOrgAdmin
              ? "Create the first workspace, then define its statuses, work types and fields. Every item lives on the same work engine as the rest of the platform."
              : "Nothing is visible to you in this organization. An organization admin creates and configures workspaces."}
          </p>
          {isOrgAdmin && <Button size="sm" className="mt-4" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New workspace</Button>}
        </div>
        {newWorkspace}
      </>
    );
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-60">
        <WorkspaceNav workspaces={workspaces} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        {isOrgAdmin && (
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New workspace</Button>
            {selected && <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1 h-4 w-4" /> Configure {selected.name}</Button>}
          </div>
        )}
      </div>
      {selected && (
        <WorkspaceBoard key={selected.id} workspace={selected} meId={meId} members={members} teams={teams} canAssign={isOrgAdmin} onOpenItem={setOpenItem} />
      )}
      {selected && (
        <WorkItemDrawer key={openItem?.id ?? "none"} itemId={openItem?.id ?? null} workspace={selected} members={members} teams={teams} canAssign={isOrgAdmin} readOnly={false} onClose={() => setOpenItem(null)} />
      )}
      {selected && isOrgAdmin && (
        <WorkspaceSettings key={`${selected.id}:${selected.name}`} workspace={selected} open={settingsOpen} onClose={() => setSettingsOpen(false)} onArchived={() => { setSettingsOpen(false); setSelectedId(null); }} />
      )}
      {newWorkspace}
    </div>
  );
};

export default function Workspaces() {
  const { viewMode, activeOrganization } = useAgency();
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const meId = auth.user?.id ?? null;
  const organizationId = viewMode === "agency" ? null : (activeOrganization?.id ?? null);
  // Mirrors the database's is_org_admin(): owner/admin and manager roles configure and assign.
  const isOrgAdmin = !!organizationId && auth.orgMemberships.some((m) => m.organization_id === organizationId && (m.role === "org_admin" || m.role === "org_manager"));

  return (
    <HqPageShell
      title="Workspaces"
      description={
        viewMode === "agency"
          ? "Organization workspaces shared with BES under TalentOps — the same records, never a copy"
          : "Your organization's own operations — boards, statuses and work items you define"
      }
      icon={LayoutGrid}
    >
      {!live ? (
        <Notice title="Available when signed in" body="Workspaces read live organization data and are not part of the demo." />
      ) : viewMode === "agency" ? (
        <SharedView meId={meId} />
      ) : organizationId ? (
        <OrganizationView organizationId={organizationId} meId={meId} isOrgAdmin={isOrgAdmin} />
      ) : (
        <Notice title="No organization selected" body="Pick a organization to see its workspaces." />
      )}
    </HqPageShell>
  );
}
