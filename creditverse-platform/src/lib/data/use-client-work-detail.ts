/**
 * The three things the client page used to keep in React state and lose on
 * reload: the checklist, the blocker, and the documents.
 *
 * All three are now canonical. The documents needed no new table at all —
 * `files` already held 56 real client documents from the ClickUp import,
 * filed under `entity_type = 'client'`, while the screen rendered an empty
 * array beside them.
 *
 * Everything here is keyed the way the WORK is keyed — client plus department
 * — because a checklist step belongs to the Complaints work, not to the
 * person; the same client in Dispute next month needs a different list.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type Department = Enums<"fulfillment_department">;

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  doneAt: string | null;
  sort: number;
}

/** Steps that came from the template sort below 1000; custom ones above. */
export const CUSTOM_STEP_SORT = 1000;

export interface ClientDocument {
  id: string;
  name: string;
  path: string;
  bucket: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  sharedWithPartner: boolean;
}

const live = (a: ReturnType<typeof useAuth>) => a.mode === "live" && a.status === "signed-in";

/**
 * The steps for this department's work, standard ones included.
 *
 * The template is applied first, every read: a file that predates the
 * templates — or one whose department just changed — gets its standard steps
 * the first time somebody opens the tab, rather than needing a migration or a
 * sweep. Idempotent on the database side, so a step already on the file,
 * checked or not, is left exactly as it is (Dee, 2026-09-12).
 */
export function useWorkChecklist(clientId: string | null, department: Department | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["creditops", "checklist", clientId, department],
    enabled: live(auth) && !!clientId && !!department,
    staleTime: 15_000,
    queryFn: async (): Promise<ChecklistItem[]> => {
      const sb = requireSupabase();
      await sb.rpc("creditops_apply_checklist_template", {
        p_client: clientId as string,
        p_department: department as Department,
      });
      const { data, error } = await sb
        .from("client_work_checklist")
        .select("id, label, done, done_at, sort")
        .eq("client_id", clientId as string)
        .eq("department", department as Department)
        .order("sort");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        label: r.label as string,
        done: r.done as boolean,
        doneAt: (r.done_at as string) ?? null,
        sort: r.sort as number,
      }));
    },
  });
}

export function useChecklistActions(clientId: string, department: Department) {
  const qc = useQueryClient();
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["creditops", "checklist", clientId, department] });

  return {
    add: useMutation({
      mutationFn: async ({ label, sort }: { label: string; sort: number }) => {
        const sb = requireSupabase();
        const { error } = await sb.from("client_work_checklist").insert({
          client_id: clientId, department, label: label.trim(), sort,
        } as never);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    /* `done_by` and `done_at` are set by the trigger, not sent from here: who
       ticked it is recorded at the moment it is ticked, rather than trusted
       from the screen. */
    toggle: useMutation({
      mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
        const sb = requireSupabase();
        const { error } = await sb.from("client_work_checklist").update({ done } as never).eq("id", id);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const sb = requireSupabase();
        const { error } = await sb.from("client_work_checklist").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
  };
}

/** Report a blocker, or clear one by passing null. */
export async function reportWorkBlocker(
  clientId: string, department: Department, reason: string | null,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("report_work_blocker", {
    p_client: clientId, p_department: department, p_reason: reason,
  });
  if (error) throw error;
}

/**
 * Every document filed against this client — uploads and the ClickUp import
 * alike, because both write the same canonical row.
 */
export function useClientDocuments(clientId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["creditops", "documents", clientId],
    enabled: live(auth) && !!clientId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientDocument[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("files")
        .select("id, name, path, bucket, mime_type, size_bytes, created_at, shared_with_partner")
        .eq("entity_type", "client")
        .eq("entity_id", clientId as string)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        path: r.path as string,
        bucket: r.bucket as string,
        mimeType: (r.mime_type as string) ?? null,
        sizeBytes: (r.size_bytes as number) ?? null,
        createdAt: r.created_at as string,
        sharedWithPartner: (r.shared_with_partner as boolean) ?? false,
      }));
    },
  });
}
