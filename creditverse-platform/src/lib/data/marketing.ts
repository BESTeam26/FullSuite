/**
 * Sales & Marketing — data access.
 *
 * Every read goes through a `security_invoker` view, so a row reaching this
 * file has already passed `work_items_select` as the signed-in person. Nothing
 * here filters for security; it filters for the screen.
 *
 * There is no marketing task table. Creating a marketing task is an insert
 * into `work_items` with a marketing workspace on it, which is why a marketing
 * task already has time, production, EOD, attention, files, comments and
 * history without any of that being written again (rule 17).
 */
import { supabase } from "@/lib/supabase/client";
import type {
  Campaign, MarketingApproval, MarketingCounters, MarketingPartner, MarketingWorkItem,
} from "@/lib/marketing/marketing-domain";
import { EMPTY_COUNTERS, compareByName } from "@/lib/marketing/marketing-domain";

const client = () => {
  if (!supabase) throw new Error("Not connected");
  return supabase;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- the module's views are
   newer than the generated database types; each mapper below names every
   column it reads, which is the check that matters. */
type Row = Record<string, any>;

const mapWork = (r: Row): MarketingWorkItem => ({
  id: r.id,
  workspaceId: r.workspace_id,
  workspaceName: r.workspace_name,
  partnerGroupId: r.partner_group_id ?? null,
  partnerName: r.partner_name ?? null,
  title: r.title,
  description: r.description ?? null,
  priority: r.priority,
  assignedTo: r.assigned_to ?? null,
  assigneeName: r.assignee_name ?? null,
  teamId: r.team_id ?? null,
  dueAt: r.due_at ?? null,
  completedAt: r.completed_at ?? null,
  createdAt: r.created_at,
  statusId: r.status_id ?? null,
  statusKey: r.status_key ?? null,
  statusLabel: r.status_label ?? null,
  statusColour: r.status_colour ?? null,
  statusPosition: r.status_position ?? null,
  isTerminal: r.is_terminal ?? false,
  itemTypeId: r.item_type_id ?? null,
  itemTypeKey: r.item_type_key ?? null,
  itemTypeLabel: r.item_type_label ?? null,
  campaignId: r.campaign_id ?? null,
  campaignName: r.campaign_name ?? null,
  publishOn: r.publish_on ?? null,
  channel: r.channel ?? null,
  contentType: r.content_type ?? null,
});

/** Bounded like every other list in the platform; the module filters, never scrolls forever. */
export const MARKETING_WORK_LIMIT = 500;

/**
 * Marketing work — everything the caller may see, or one workspace's worth.
 *
 * One request serves the task list, the calendar and the dashboard of whatever
 * scope is open, because they are three questions about the same rows. Asking
 * three times would be three round trips for one answer (rule 14).
 */
export async function fetchMarketingWork(workspaceId?: string | null): Promise<MarketingWorkItem[]> {
  let q = client().from("marketing_work").select("*").order("created_at", { ascending: false })
    .limit(MARKETING_WORK_LIMIT);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapWork);
}

/**
 * The module's partners, A→Z.
 *
 * Sorted here rather than in SQL so the ordering rule lives in one tested
 * place and matches every other partner list on the platform — Dee:
 * "Sort Partner/business names alphabetically A → Z regardless of which
 * operational folder they are in."
 */
export async function fetchMarketingPartners(): Promise<MarketingPartner[]> {
  const { data, error } = await client().from("marketing_partners").select("*");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: Row) => ({
      id: r.id, name: r.name, partnerName: r.partner_name ?? null,
      lifecycle: r.lifecycle ?? null, workspaceId: r.workspace_id ?? null,
    }))
    .sort(compareByName);
}

export async function fetchMarketingCounters(): Promise<MarketingCounters> {
  const { data, error } = await client().from("marketing_overview").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return EMPTY_COUNTERS;
  const r = data as Row;
  return {
    activePartners: Number(r.active_partners ?? 0),
    openTasks: Number(r.open_tasks ?? 0),
    dueToday: Number(r.due_today ?? 0),
    overdue: Number(r.overdue ?? 0),
    contentScheduled: Number(r.content_scheduled ?? 0),
    forInternalReview: Number(r.for_internal_review ?? 0),
    awaitingPartnerApproval: Number(r.awaiting_partner_approval ?? 0),
  };
}

export async function fetchCampaigns(workspaceId?: string | null): Promise<Campaign[]> {
  let q = client().from("campaigns").select("*").is("archived_at", null).order("starts_on", { nullsFirst: false });
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Row) => ({
    id: r.id, workspaceId: r.workspace_id, partnerGroupId: r.partner_group_id ?? null,
    name: r.name, description: r.description ?? null, ownerId: r.owner_id ?? null,
    status: r.status, startsOn: r.starts_on ?? null, endsOn: r.ends_on ?? null,
  }));
}

export async function fetchMarketingApprovals(): Promise<MarketingApproval[]> {
  const { data, error } = await client().from("marketing_approvals").select("*")
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Row) => ({
    id: r.id, groupId: r.group_id, partnerName: r.partner_name, kind: r.kind, status: r.status,
    title: r.title, detail: r.detail ?? null, workItemId: r.work_item_id ?? null,
    workTitle: r.work_title ?? null, campaignId: r.campaign_id ?? null,
    campaignName: r.campaign_name ?? null, createdAt: r.created_at,
    respondedAt: r.responded_at ?? null, response: r.response ?? null,
    respondedByName: r.responded_by_name ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface NewMarketingWork {
  workspaceId: string;
  agencyId: string;
  title: string;
  statusId: string | null;
  itemTypeId: string | null;
  assignedTo?: string | null;
  teamId?: string | null;
  campaignId?: string | null;
  dueAt?: string | null;
  priority?: "Normal" | "High" | "Urgent";
}

/**
 * A marketing task is a canonical work item. `related_type: "project"` is the
 * value every workspace item carries — the column predates workspaces and
 * `project` is the row the engine already understands.
 */
export async function createMarketingWork(input: NewMarketingWork): Promise<string> {
  const { data, error } = await client()
    .from("work_items")
    .insert({
      agency_id: input.agencyId,
      scope: "AGENCY",
      related_type: "project",
      division: "sales_marketing",
      workspace_id: input.workspaceId,
      status_id: input.statusId,
      item_type_id: input.itemTypeId,
      assigned_to: input.assignedTo ?? null,
      team_id: input.teamId ?? null,
      campaign_id: input.campaignId ?? null,
      due_at: input.dueAt ?? null,
      priority: input.priority ?? "Normal",
      title: input.title.trim(),
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row).id;
}

export async function setWorkCampaign(itemId: string, campaignId: string | null): Promise<void> {
  const { error } = await client().from("work_items")
    .update({ campaign_id: campaignId } as never).eq("id", itemId);
  if (error) throw new Error(error.message);
}

export interface CampaignInput {
  workspaceId: string;
  agencyId: string;
  partnerGroupId: string | null;
  name: string;
  description?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  status?: Campaign["status"];
}

export async function createCampaign(input: CampaignInput): Promise<string> {
  const { data, error } = await client().from("campaigns").insert({
    agency_id: input.agencyId,
    workspace_id: input.workspaceId,
    partner_group_id: input.partnerGroupId,
    name: input.name.trim(),
    description: input.description ?? null,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    status: input.status ?? "planned",
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  return (data as Row).id;
}

export async function updateCampaign(
  id: string,
  patch: Partial<Pick<Campaign, "name" | "description" | "status" | "startsOn" | "endsOn">>,
): Promise<void> {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.startsOn !== undefined) row.starts_on = patch.startsOn;
  if (patch.endsOn !== undefined) row.ends_on = patch.endsOn;
  if (Object.keys(row).length === 0) return;
  const { error } = await client().from("campaigns").update(row as never).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Ask the partner to approve a piece of work, or a campaign.
 *
 * The database moves the work to `For Partner Approval` in the same call — a
 * request that leaves the task looking un-sent is how two people chase the
 * same partner about the same post.
 */
export async function requestPartnerApproval(
  workItemId: string,
  kind: "content_approval" | "campaign_approval" = "content_approval",
  title?: string | null,
  detail?: string | null,
): Promise<string> {
  const { data, error } = await client().rpc("request_partner_approval", {
    p_work_item: workItemId, p_kind: kind, p_title: title ?? null, p_detail: detail ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}
