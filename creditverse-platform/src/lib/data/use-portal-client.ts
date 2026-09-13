/**
 * One client, as the partner may see them.
 *
 * Three reads, each gated on `partner_group_of_user()` inside the database and
 * each taking the PUBLIC id rather than the primary key — so a guessed id
 * reaches nothing and the portal never learns the internal identifier.
 *
 * What is absent is the point: no internal notes, no BES assignee, no SLA
 * figure, no audit trail, no credentials. Those are not filtered out here —
 * the functions never select them.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export interface PortalClientDetail {
  publicId: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  round: string;
  lifecycle: string;
  openItems: number;
  createdAt: string;
  lastActivityAt: string | null;
  processedOn: string | null;
  currentDepartment: string | null;
  currentWork: string | null;
  waiting: boolean;
  actionNeeded: boolean;
  actionId: string | null;
  actionTitle: string | null;
  actionDetail: string | null;
  actionKind: string | null;
}

export interface PortalClientEvent {
  id: number;
  happenedAt: string;
  action: string;
  detail: string | null;
  actorName: string | null;
}

export interface PortalClientFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number | null;
  mimeType: string | null;
  sharedAt: string | null;
}

const live = (auth: ReturnType<typeof useAuth>) =>
  auth.mode === "live" && auth.status === "signed-in";

export function usePortalClient(publicId: string | undefined) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "client", publicId],
    enabled: live(auth) && !!publicId,
    staleTime: 30_000,
    queryFn: async (): Promise<PortalClientDetail | null> => {
      const { data, error } = await requireSupabase()
        .rpc("my_partner_client" as never, { p_public_id: publicId } as never);
      if (error) throw error;
      const r = (data as Record<string, unknown>[] | null)?.[0];
      if (!r) return null;
      return {
        publicId: r.public_id as string,
        name: r.name as string,
        email: String(r.email ?? ""),
        phone: (r.phone as string) ?? null,
        status: r.status as string,
        round: r.round as string,
        lifecycle: r.lifecycle as string,
        openItems: Number(r.open_items ?? 0),
        createdAt: r.created_at as string,
        lastActivityAt: (r.last_activity_at as string) ?? null,
        processedOn: (r.processed_on as string) ?? null,
        currentDepartment: (r.current_department as string) ?? null,
        currentWork: (r.current_work as string) ?? null,
        waiting: r.waiting === true,
        actionNeeded: r.action_needed === true,
        actionId: (r.action_id as string) ?? null,
        actionTitle: (r.action_title as string) ?? null,
        actionDetail: (r.action_detail as string) ?? null,
        actionKind: (r.action_kind as string) ?? null,
      };
    },
  });
}

export function usePortalClientTimeline(publicId: string | undefined) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "client", publicId, "timeline"],
    enabled: live(auth) && !!publicId,
    staleTime: 30_000,
    queryFn: async (): Promise<PortalClientEvent[]> => {
      const { data, error } = await requireSupabase()
        .rpc("my_partner_client_timeline" as never, { p_public_id: publicId, p_limit: 50 } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id), happenedAt: r.happened_at as string,
        action: r.action as string, detail: (r.detail as string) ?? null,
        actorName: (r.actor_name as string) ?? null,
      }));
    },
  });
}

export function usePortalClientFiles(publicId: string | undefined) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "client", publicId, "files"],
    enabled: live(auth) && !!publicId,
    staleTime: 60_000,
    queryFn: async (): Promise<PortalClientFile[]> => {
      const { data, error } = await requireSupabase()
        .rpc("my_partner_client_files" as never, { p_public_id: publicId } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, name: r.name as string, path: r.path as string,
        sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
        mimeType: (r.mime_type as string) ?? null,
        sharedAt: (r.shared_at as string) ?? null,
      }));
    },
  });
}
