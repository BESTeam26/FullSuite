/**
 * The private HR record — date of birth, address, WhatsApp, emergency contact.
 *
 * Read by the person and by management in scope; the date of birth is written
 * by management only (the database enforces both — see migration
 * 20260919020000). Nothing here is cached across people: one row per request,
 * fetched only when the Personal Records card is open.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface MemberPrivateRecord {
  userId: string;
  agencyId: string;
  dateOfBirth: string | null;
  homeAddress: string | null;
  workingLocation: string | null;
  whatsappPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  updatedAt: string;
}

export type MemberPrivateRecordEdits = Omit<MemberPrivateRecord, "userId" | "agencyId" | "updatedAt">;

const map = (r: Record<string, unknown>): MemberPrivateRecord => ({
  userId: r.user_id as string,
  agencyId: r.agency_id as string,
  dateOfBirth: (r.date_of_birth as string) ?? null,
  homeAddress: (r.home_address as string) ?? null,
  workingLocation: (r.working_location as string) ?? null,
  whatsappPhone: (r.whatsapp_phone as string) ?? null,
  emergencyContactName: (r.emergency_contact_name as string) ?? null,
  emergencyContactRelationship: (r.emergency_contact_relationship as string) ?? null,
  emergencyContactPhone: (r.emergency_contact_phone as string) ?? null,
  updatedAt: r.updated_at as string,
});

/** RLS returns nothing for a person the caller may not see — null, not an error. */
export async function fetchMemberPrivateRecord(userId: string): Promise<MemberPrivateRecord | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("member_private_records").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? map(data as unknown as Record<string, unknown>) : null;
}

const blank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);

export async function saveMemberPrivateRecord(userId: string, agencyId: string, edits: MemberPrivateRecordEdits): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("member_private_records").upsert({
    user_id: userId, agency_id: agencyId,
    date_of_birth: edits.dateOfBirth || null,
    home_address: blank(edits.homeAddress),
    working_location: blank(edits.workingLocation),
    whatsapp_phone: blank(edits.whatsappPhone),
    emergency_contact_name: blank(edits.emergencyContactName),
    emergency_contact_relationship: blank(edits.emergencyContactRelationship),
    emergency_contact_phone: blank(edits.emergencyContactPhone),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export function useMemberPrivateRecord(userId: string | null, enabled = true) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["people", "private-record", userId],
    queryFn: () => fetchMemberPrivateRecord(userId!),
    enabled: enabled && !!userId && auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function useSaveMemberPrivateRecord(userId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: (edits: MemberPrivateRecordEdits) => saveMemberPrivateRecord(userId, auth.agencyId ?? "", edits),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["people", "private-record", userId] });
      void qc.invalidateQueries({ queryKey: ["agency", "members"] });
    },
  });
}
