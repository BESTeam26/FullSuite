/**
 * Company intranet records: announcements and knowledge articles (0072).
 * Reads go through row-level security; every write is a database function
 * that checks `intranet_may_write()` and records an audit row. Rows are
 * archived, never deleted.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type AnnouncementAudience = "organization" | "all_organizations" | "bes_internal";
export type KnowledgeAudience = "organization" | "consumer" | "both" | "bes_internal";

export interface Announcement {
  id: string;
  organizationId: string | null;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  tag: string | null;
  pinned: boolean;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: string;
  organizationId: string | null;
  audience: KnowledgeAudience;
  category: string | null;
  title: string;
  body: string;
  sort: number;
  publishedAt: string | null;
  createdBy: string | null;
  updatedAt: string;
}

/**
 * Announcements the caller may read, pinned first then newest. The policy
 * already limits rows to the caller's organization and BES-published rows;
 * `organizationId` narrows to one organization's view when several are
 * visible (BES staff working an organization), never widens.
 */
export async function fetchAnnouncements(organizationId: string | null): Promise<Announcement[]> {
  const sb = requireSupabase();
  let q = sb
    .from("announcements")
    .select("id, organization_id, audience, title, body, tag, pinned, published_at, created_by, created_at, updated_at")
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: true })
    .limit(100);
  if (organizationId) q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  else q = q.is("organization_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    audience: r.audience as AnnouncementAudience,
    title: r.title,
    body: r.body,
    tag: r.tag,
    pinned: r.pinned,
    publishedAt: r.published_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface SaveAnnouncementInput {
  id: string | null;
  organizationId: string | null;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  tag: string | null;
  pinned: boolean;
  publish: boolean;
}

export async function saveAnnouncement(input: SaveAnnouncementInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("save_announcement", {
    p_id: input.id ?? undefined,
    p_org: input.organizationId ?? undefined,
    p_audience: input.audience,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_tag: input.tag?.trim() ?? "",
    p_pinned: input.pinned,
    p_publish: input.publish,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveAnnouncement(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("archive_announcement", { p_id: id });
  if (error) throw error;
}

export async function fetchKnowledgeArticles(organizationId: string | null): Promise<KnowledgeArticle[]> {
  const sb = requireSupabase();
  let q = sb
    .from("knowledge_articles")
    .select("id, organization_id, audience, category, title, body, sort, published_at, created_by, updated_at")
    .is("archived_at", null)
    .order("category", { ascending: true, nullsFirst: false })
    .order("sort", { ascending: true })
    .order("title", { ascending: true })
    .limit(300);
  if (organizationId) q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  else q = q.is("organization_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    audience: r.audience as KnowledgeAudience,
    category: r.category,
    title: r.title,
    body: r.body,
    sort: r.sort,
    publishedAt: r.published_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
  }));
}

export interface SaveKnowledgeArticleInput {
  id: string | null;
  organizationId: string | null;
  audience: KnowledgeAudience;
  category: string | null;
  title: string;
  body: string;
  sort: number;
  publish: boolean;
}

export async function saveKnowledgeArticle(input: SaveKnowledgeArticleInput): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("save_knowledge_article", {
    p_id: input.id ?? undefined,
    p_org: input.organizationId ?? undefined,
    p_audience: input.audience,
    p_category: input.category?.trim() ?? "",
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_sort: input.sort,
    p_publish: input.publish,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveKnowledgeArticle(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("archive_knowledge_article", { p_id: id });
  if (error) throw error;
}
