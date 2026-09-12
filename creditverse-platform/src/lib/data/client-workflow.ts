/**
 * The business actions an agent takes on a client file.
 *
 * Each is one call. The database records the anchor, the SLA policy computes
 * the due date, the trigger clears the processing agent where the new state is
 * a waiting one, and the client's own due date is refreshed. The agent chooses
 * nothing about SLA type, timer kind or calculation source (Dee, 2026-09-11).
 */
import { requireSupabase } from "@/lib/supabase/client";

/** Letters are out: waiting, due in 30 days, processor released. */
export async function markMailed(clientId: string, mailedAt?: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("mark_client_mailed", {
    p_client: clientId,
    p_mailed_at: mailedAt ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** A support case: due in 24 hours. */
export async function openSupportCase(clientId: string, status = "Needs Response"): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("open_support_case", { p_client: clientId, p_status: status });
  if (error) throw error;
  return data as string;
}

/** Complaints work: due in 5 days. `Needed` means still to do, never filed. */
export async function openComplaint(
  clientId: string,
  status: "FTC Needed" | "CFPB Needed" | "For Complaints",
): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("open_complaint", { p_client: clientId, p_status: status });
  if (error) throw error;
  return data as string;
}

/**
 * A Team Lead's correction. The calculated date is preserved beside it and the
 * change is audited — an override must never destroy the logic it replaces.
 */
export async function setDueOverride(
  clientId: string,
  department: string,
  due: string,
  reason: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_department_due_override", {
    p_client: clientId,
    p_department: department as never,
    p_due: new Date(`${due}T12:00:00`).toISOString(),
    p_reason: reason,
  });
  if (error) throw error;
}

/** Back to what the policy says. */
export async function clearDueOverride(clientId: string, department: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("clear_department_due_override", {
    p_client: clientId,
    p_department: department as never,
  });
  if (error) throw error;
}
