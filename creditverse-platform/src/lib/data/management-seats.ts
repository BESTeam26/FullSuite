/**
 * Management seats — where a person sits in management (D-021, AD-008).
 *
 * chief_operations / division_manager / department_manager grant operational
 * SCOPE through the placement helpers in the database; managing_partner and
 * executive_assistant place a person on the org chart and grant nothing.
 * Team Lead is not a seat here: it stays the team relationship.
 * Seats are effective-dated; ending one sets effective_to, never deletes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export const SEAT_KINDS = [
  { value: "chief_operations",   label: "Chief Operations",   scope: "Every operating division", corporate: false },
  { value: "division_manager",   label: "Division Manager",   scope: "One division",              corporate: false },
  { value: "department_manager", label: "Department Manager", scope: "One department",            corporate: false },
  { value: "managing_partner",   label: "Managing Partner",   scope: "Placement only — access comes from capabilities", corporate: true },
  { value: "executive_assistant", label: "Executive Assistant", scope: "Placement only — access comes from capabilities", corporate: true },
] as const;
export type SeatKind = (typeof SEAT_KINDS)[number]["value"];
export const seatLabel = (v: string) => SEAT_KINDS.find((k) => k.value === v)?.label ?? v;

export interface ManagementSeat {
  id: string;
  agencyId: string;
  userId: string;
  seat: SeatKind;
  divisionId: string | null;
  departmentId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  createdAt: string;
}

const map = (r: Record<string, unknown>): ManagementSeat => ({
  id: r.id as string, agencyId: r.agency_id as string, userId: r.user_id as string, seat: r.seat as SeatKind,
  divisionId: (r.division_id as string) ?? null, departmentId: (r.department_id as string) ?? null,
  effectiveFrom: r.effective_from as string, effectiveTo: (r.effective_to as string) ?? null,
  reason: (r.reason as string) ?? null, createdAt: r.created_at as string,
});

/** Live seats only; history stays in the table and in the activity trail. */
export async function fetchManagementSeats(): Promise<ManagementSeat[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("management_seats").select("*").is("effective_to", null).order("seat").order("effective_from");
  if (error) throw error;
  return (data ?? []).map((r) => map(r as unknown as Record<string, unknown>));
}

export interface GrantSeatInput { userId: string; seat: SeatKind; divisionId?: string | null; departmentId?: string | null; reason: string; effectiveFrom?: string }

export async function grantManagementSeat(agencyId: string, input: GrantSeatInput): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("management_seats").insert({
    agency_id: agencyId, user_id: input.userId, seat: input.seat,
    division_id: input.seat === "division_manager" ? input.divisionId ?? null : null,
    department_id: input.seat === "department_manager" ? input.departmentId ?? null : null,
    effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    reason: input.reason.trim() || null,
  });
  if (error) throw error;
}

export async function endManagementSeat(id: string, reason: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("management_seats")
    .update({ effective_to: new Date().toISOString().slice(0, 10), reason: reason.trim() || null })
    .eq("id", id).is("effective_to", null);
  if (error) throw error;
}

export function useManagementSeats() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["people", "management-seats"],
    queryFn: fetchManagementSeats,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function useSeatActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["people", "management-seats"] });
    void qc.invalidateQueries({ queryKey: ["people", "org"] });
  };
  return {
    grant: useMutation({ mutationFn: (input: GrantSeatInput) => grantManagementSeat(auth.agencyId ?? "", input), onSuccess: refresh }),
    end: useMutation({ mutationFn: (v: { id: string; reason: string }) => endManagementSeat(v.id, v.reason), onSuccess: refresh }),
  };
}
