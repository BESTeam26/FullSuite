/**
 * TalentOps bridge — data access for workspace shares.
 *
 * A share is the organization's authorization for BES to reach one workspace
 * (or one board) under a live TalentOps engagement. The organization creates
 * and revokes; BES can only read the shares it benefits from (RLS).
 */
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type ShareAccess = "view" | "work";

export interface WorkspaceShare {
  id: string;
  workspaceId: string;
  engagementId: string;
  boardId: string | null;
  access: ShareAccess;
  createdAt: string;
  revokedAt: string | null;
}

const mapShare = (r: Tables<"workspace_shares">): WorkspaceShare => ({
  id: r.id,
  workspaceId: r.workspace_id,
  engagementId: r.engagement_id,
  boardId: r.board_id,
  access: r.access as ShareAccess,
  createdAt: r.created_at,
  revokedAt: r.revoked_at,
});

/** Active shares the caller may see — for an org, its own; for BES, those it benefits from. */
export async function fetchActiveShares(workspaceId?: string): Promise<WorkspaceShare[]> {
  let q = supabase.from("workspace_shares").select("*").is("revoked_at", null).order("created_at");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapShare);
}

export interface CreateShareInput {
  workspaceId: string;
  engagementId: string;
  boardId: string | null;
  access: ShareAccess;
}

export async function createWorkspaceShare(input: CreateShareInput): Promise<WorkspaceShare> {
  const { data, error } = await supabase
    .from("workspace_shares")
    .insert({
      workspace_id: input.workspaceId,
      engagement_id: input.engagementId,
      board_id: input.boardId,
      access: input.access,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapShare(data);
}

/** Revoke = set revoked_at. Nothing is deleted (rule 11). */
export async function revokeWorkspaceShare(id: string): Promise<void> {
  const { error } = await supabase
    .from("workspace_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
