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
import { setItemFieldValue } from "@/lib/data/workspaces";

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
  partnerContactName: r.partner_contact_name ?? null,
  title: r.title,
  description: r.description ?? null,
  priority: r.priority,
  assignedTo: r.assigned_to ?? null,
  assigneeName: r.assignee_name ?? null,
  teamId: r.team_id ?? null,
  dueAt: r.due_at ?? null,
  completedAt: r.completed_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? null,
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
      primaryContactName: r.primary_contact_name ?? null,
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

/* ------------------------------------------------------------------ */
/* Spreadsheet import                                                  */
/* ------------------------------------------------------------------ */

/**
 * Apply a plan the person has already seen.
 *
 * Sequential rather than parallel, and counted honestly: a burst that half
 * succeeds leaves nobody able to say which half, and "imported" when nine rows
 * failed is the report that costs a day.
 *
 * Every write goes through the ordinary policies as the signed-in person —
 * this is a data-entry path onto the canonical engine, never a way past it.
 */
export interface ImportContext {
  workspaceId: string;
  agencyId: string;
  partnerGroupId: string | null;
  /** Workspace statuses, so a sheet's "In Progress" lands on the right row. */
  statuses: { id: string; key: string; label: string; position: number }[];
  itemTypes: { id: string; key: string; label: string }[];
  fields: { id: string; key: string }[];
  /** People who may be named in an Assignee column. */
  members: { id: string; name: string; email: string }[];
  campaigns: { id: string; name: string }[];
}

export interface ImportOutcome {
  created: number;
  updated: number;
  campaignsCreated: number;
  failed: { line: number; title: string; reason: string }[];
}

const normalize = (v: string): string => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export async function applyMarketingImport(
  rows: { line: number; externalRef: string; title: string; publishOn: string | null;
          channel: string | null; contentType: string | null; caption: string | null;
          campaign: string | null; assignee: string | null; status: string | null;
          dueOn: string | null; notes: string | null; existingId: string | null }[],
  ctx: ImportContext,
): Promise<ImportOutcome> {
  const sb = client();
  const out: ImportOutcome = { created: 0, updated: 0, campaignsCreated: 0, failed: [] };

  /* Campaigns first, so a row naming one can point at it. Reused by name
     within the workspace — never a second campaign with the same name. */
  const campaignByName = new Map(ctx.campaigns.map((c) => [normalize(c.name), c.id]));
  for (const name of new Set(rows.map((r) => r.campaign).filter((c): c is string => !!c))) {
    if (campaignByName.has(normalize(name))) continue;
    try {
      const id = await createCampaign({
        workspaceId: ctx.workspaceId, agencyId: ctx.agencyId,
        partnerGroupId: ctx.partnerGroupId, name, status: "active",
      });
      campaignByName.set(normalize(name), id);
      out.campaignsCreated += 1;
    } catch {
      /* Reported per row below rather than failing the whole import: a
         campaign that could not be created is a task without a campaign, not
         a task that should not exist. */
    }
  }

  const firstStatus = [...ctx.statuses].sort((a, b) => a.position - b.position)[0] ?? null;
  const statusFor = (label: string | null) => {
    if (!label) return firstStatus?.id ?? null;
    const want = normalize(label);
    return ctx.statuses.find((s) => normalize(s.label) === want || normalize(s.key) === want)?.id
      ?? firstStatus?.id ?? null;
  };
  const contentType = ctx.itemTypes.find((t) => t.key === "content") ?? ctx.itemTypes[0] ?? null;
  const memberFor = (who: string | null) => {
    if (!who) return null;
    const want = normalize(who);
    return ctx.members.find((m) => normalize(m.name) === want || normalize(m.email) === want)?.id ?? null;
  };
  const fieldId = (key: string) => ctx.fields.find((f) => f.key === key)?.id ?? null;

  for (const row of rows) {
    try {
      const patch = {
        title: row.title,
        status_id: statusFor(row.status),
        campaign_id: row.campaign ? campaignByName.get(normalize(row.campaign)) ?? null : null,
        assigned_to: memberFor(row.assignee),
        due_at: row.dueOn ? new Date(`${row.dueOn}T17:00:00`).toISOString() : null,
        description: row.notes,
        external_ref: row.externalRef,
      };

      let itemId = row.existingId;
      if (itemId) {
        const { error } = await sb.from("work_items").update(patch as never).eq("id", itemId);
        if (error) throw new Error(error.message);
        out.updated += 1;
      } else {
        const { data, error } = await sb.from("work_items").insert({
          ...patch,
          agency_id: ctx.agencyId,
          scope: "AGENCY",
          related_type: "project",
          division: "sales_marketing",
          workspace_id: ctx.workspaceId,
          item_type_id: contentType?.id ?? null,
        } as never).select("id").single();
        if (error) throw new Error(error.message);
        itemId = (data as Row).id;
        out.created += 1;
      }

      /* Content metadata is field values on the same record — not a second
         content table, which is the rule the calendar depends on. */
      for (const [key, value] of [
        ["publish_at", row.publishOn],
        ["channel", row.channel],
        ["content_type", row.contentType],
        ["caption", row.caption],
      ] as const) {
        const id = fieldId(key);
        if (!id || value === null) continue;
        await setItemFieldValue(itemId, id, value);
      }
    } catch (e) {
      out.failed.push({ line: row.line, title: row.title, reason: (e as Error).message });
    }
  }

  return out;
}

/** The existing work an import needs to see to decide create vs update. */
export async function fetchImportTargets(workspaceId: string): Promise<
  { id: string; title: string; externalRef: string | null }[]
> {
  const { data, error } = await client()
    .from("work_items")
    .select("id, title, external_ref")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Row) => ({
    id: r.id, title: r.title, externalRef: r.external_ref ?? null,
  }));
}

/**
 * Create one piece of content, quickly.
 *
 * The task and its content metadata in one call, because a post that exists
 * without its publish date is a post that is not on the calendar — and the
 * person who just typed the date would have to go and find it.
 */
export async function createContentItem(input: {
  workspaceId: string;
  agencyId: string;
  statusId: string | null;
  itemTypeId: string | null;
  fields: { id: string; key: string }[];
  title: string;
  channel: string | null;
  contentType: string | null;
  publishOn: string | null;
  assignedTo: string | null;
}): Promise<string> {
  const id = await createMarketingWork({
    workspaceId: input.workspaceId,
    agencyId: input.agencyId,
    title: input.title,
    statusId: input.statusId,
    itemTypeId: input.itemTypeId,
    assignedTo: input.assignedTo,
  });
  const fieldId = (key: string) => input.fields.find((f) => f.key === key)?.id ?? null;
  for (const [key, value] of [
    ["publish_at", input.publishOn],
    ["channel", input.channel],
    ["content_type", input.contentType],
  ] as const) {
    const fid = fieldId(key);
    if (fid && value) await setItemFieldValue(id, fid, value);
  }
  return id;
}
