/**
 * What has been done for a client, read rather than maintained.
 *
 * Derived in the database from the records completing work already writes —
 * `production_logs` and the handful of lifecycle events worth seeing at a
 * glance. Nobody keeps it up to date, nobody can forget to, and it cannot
 * claim work that produced no record.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type ProgressKind = "work" | "milestone" | "migrated";

export interface ProgressEntry {
  at: string;
  department: string;
  headline: string;
  detail: string | null;
  actor: string;
  kind: ProgressKind;
}

export async function fetchClientProgress(clientId: string): Promise<ProgressEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("client_progress_report", { p_client: clientId });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      at: rec.at as string,
      department: (rec.department as string) ?? "—",
      headline: (rec.headline as string) ?? "",
      detail: (rec.detail as string) ?? null,
      actor: (rec.actor as string) ?? "BES",
      kind: (rec.kind as ProgressKind) ?? "work",
    };
  });
}
