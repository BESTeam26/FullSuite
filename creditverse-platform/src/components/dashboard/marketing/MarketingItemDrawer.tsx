/**
 * One marketing task, in full.
 *
 * It is the canonical `WorkItemDrawer` — status, assignee, team, priority, due
 * date, description, the workspace's content fields, the checklist, comments,
 * @mentions and attachments — with two marketing-specific things slotted in
 * beside it: which campaign the work belongs to, and sending it to the partner
 * for approval.
 *
 * Writing a second drawer would have meant a second place a task is edited and
 * a second place to look when it is edited wrongly (rule 6). The slot exists
 * precisely so the generic drawer never has to learn what a campaign is.
 */
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpsSelect } from "@/components/ui/ops-select";
import { useToast } from "@/hooks/use-toast";
import { WorkItemDrawer } from "@/components/workspaces/WorkItemDrawer";
import { useRequestPartnerApproval } from "@/lib/data/use-marketing";
import type { OrgMember, OrgTeam } from "@/lib/data/workspaces";
import type { Campaign, MarketingWorkItem } from "@/lib/marketing/marketing-domain";
import type { Workspace } from "@/lib/workspaces/workspace-domain";

const NONE = "__none__";

export function MarketingItemDrawer({
  itemId,
  workspaces,
  rows,
  campaigns,
  members,
  teams,
  canWork,
  onSetCampaign,
  onClose,
}: {
  itemId: string;
  workspaces: Workspace[];
  rows: MarketingWorkItem[];
  campaigns: Campaign[];
  members: OrgMember[];
  teams: OrgTeam[];
  canWork: boolean;
  onSetCampaign: (itemId: string, campaignId: string | null) => void;
  onClose: () => void;
}) {
  const row = rows.find((r) => r.id === itemId) ?? null;
  const workspace = workspaces.find((w) => w.id === row?.workspaceId) ?? null;

  /* The row may be gone — filtered out by a refetch, or archived by somebody
     else while the drawer was open. Closing is better than rendering half a
     task against the wrong workspace's statuses. */
  if (!row || !workspace) return null;

  return (
    <WorkItemDrawer
      itemId={itemId}
      workspace={workspace}
      members={members}
      teams={teams}
      canAssign={canWork}
      readOnly={!canWork}
      visibilityModule="sales_marketing"
      /* Dee's own grouping, 2026-09-13. Production (status, assignee, due
         date, priority, checklist) and Collaboration (comments, mentions,
         attachments, activity) are the drawer's canonical halves already;
         this names the content half. */
      fieldGroups={[{
        title: "Content",
        keys: ["channel", "content_type", "publish_at", "caption", "cta", "asset_url", "published_url"],
      }]}
      extra={
        <MarketingExtras
          row={row}
          campaigns={campaigns.filter((c) => c.workspaceId === workspace.id)}
          canWork={canWork}
          isPartnerWorkspace={Boolean(workspace.partnerGroupId)}
          onSetCampaign={onSetCampaign}
        />
      }
      onClose={onClose}
    />
  );
}

function MarketingExtras({
  row, campaigns, canWork, isPartnerWorkspace, onSetCampaign,
}: {
  row: MarketingWorkItem;
  campaigns: Campaign[];
  canWork: boolean;
  isPartnerWorkspace: boolean;
  onSetCampaign: (itemId: string, campaignId: string | null) => void;
}) {
  const { toast } = useToast();
  const request = useRequestPartnerApproval();
  const [sending, setSending] = useState(false);
  const awaiting = row.statusKey === "partner_approval";

  const send = async () => {
    setSending(true);
    try {
      await request.mutateAsync({ workItemId: row.id, kind: "content_approval" });
      toast({
        title: "Sent to the partner",
        description: "It moved to For Partner Approval. They can approve it or ask for changes from their portal.",
      });
    } catch (e) {
      toast({ title: "Could not send that", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Campaign</p>
        {canWork ? (
          <OpsSelect
            aria-label="Campaign"
            size="sm"
            value={row.campaignId ?? NONE}
            onValueChange={(v) => onSetCampaign(row.id, v === NONE ? null : v)}
            options={[
              { value: NONE, label: "No campaign" },
              ...campaigns.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        ) : (
          <p className="text-sm text-foreground">{row.campaignName ?? "No campaign"}</p>
        )}
        {campaigns.length === 0 && canWork && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            This workspace has no campaigns yet. Create one on the Campaigns tab.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Partner approval</p>
        {!isPartnerWorkspace ? (
          <p className="text-[11px] text-muted-foreground">
            This is BES's own work, so there is no partner to ask.
          </p>
        ) : awaiting ? (
          <p className="text-[11px] text-muted-foreground">
            Already with the partner. Approving moves it to <strong>Approved / Scheduled</strong> —
            not Completed, because it still has to be published. Changes requested sends it back with
            their comment on this task.
          </p>
        ) : canWork ? (
          <>
            <Button size="sm" variant="outline" disabled={sending} onClick={() => void send()}>
              {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Send for partner approval
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Moves it to For Partner Approval so nobody chases them twice.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Sending for approval belongs to the marketing team.</p>
        )}
      </div>
    </div>
  );
}
