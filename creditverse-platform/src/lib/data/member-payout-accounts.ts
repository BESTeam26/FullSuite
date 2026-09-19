/**
 * Where payroll pays a person. Read by the person and by payroll capability;
 * written by the person (their own) or payroll.manage. The database enforces
 * both and audits the change with the last four digits only (migration
 * 20260919021000). Fetched only when the Compensation tab is open.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export const PAYOUT_METHODS = [
  { value: "gcash", label: "GCash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other e-wallet / bank" },
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]["value"];
export const payoutMethodLabel = (v: string | null | undefined) => PAYOUT_METHODS.find((m) => m.value === v)?.label ?? null;

export interface MemberPayoutAccount {
  userId: string;
  agencyId: string;
  method: PayoutMethod;
  provider: string | null;
  accountName: string | null;
  accountNumber: string | null;
  notificationEmail: string | null;
  notes: string | null;
  updatedAt: string;
}
export type MemberPayoutAccountEdits = Omit<MemberPayoutAccount, "userId" | "agencyId" | "updatedAt">;

const map = (r: Record<string, unknown>): MemberPayoutAccount => ({
  userId: r.user_id as string, agencyId: r.agency_id as string, method: r.method as PayoutMethod,
  provider: (r.provider as string) ?? null, accountName: (r.account_name as string) ?? null,
  accountNumber: (r.account_number as string) ?? null, notificationEmail: (r.notification_email as string) ?? null,
  notes: (r.notes as string) ?? null, updatedAt: r.updated_at as string,
});

export async function fetchMemberPayoutAccount(userId: string): Promise<MemberPayoutAccount | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("member_payout_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? map(data as unknown as Record<string, unknown>) : null;
}

const blank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);

export async function saveMemberPayoutAccount(userId: string, agencyId: string, e: MemberPayoutAccountEdits): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("member_payout_accounts").upsert({
    user_id: userId, agency_id: agencyId, method: e.method, provider: blank(e.provider), account_name: blank(e.accountName),
    account_number: blank(e.accountNumber), notification_email: blank(e.notificationEmail), notes: blank(e.notes),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export function useMemberPayoutAccount(userId: string | null, enabled = true) {
  const auth = useAuth();
  return useQuery({
    queryKey: ["people", "payout-account", userId],
    queryFn: () => fetchMemberPayoutAccount(userId!),
    enabled: enabled && !!userId && auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function useSaveMemberPayoutAccount(userId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: (e: MemberPayoutAccountEdits) => saveMemberPayoutAccount(userId, auth.agencyId ?? "", e),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["people", "payout-account", userId] }),
  });
}
