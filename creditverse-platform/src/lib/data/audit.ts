/**
 * The audit log as the database wrote it — actor, context, record, previous
 * and new value, when. Read-only; `audit_log` is append-only and policy-gated
 * (BES staff of the agency, or an organization's members for their own rows).
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

export interface AuditRow { id: number; actor: string; action: string; entityType: string; entityId: string | null; organizationId: string | null; before: Json | null; after: Json | null; createdAt: string }

export async function fetchAuditLog(limit = 200, organizationId?: string | null): Promise<AuditRow[]> {
  const sb = requireSupabase();
  let q = sb.from("audit_log").select("id, action, entity_type, entity_id, organization_id, before, after, created_at, profiles!actor_id(full_name, email)").order("created_at", { ascending: false }).limit(limit);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => { const p = r.profiles as { full_name: string | null; email: string } | null; return { id: Number(r.id), actor: p?.full_name?.trim() || p?.email || "System", action: r.action, entityType: r.entity_type, entityId: r.entity_id, organizationId: r.organization_id, before: r.before, after: r.after, createdAt: r.created_at }; });
}
