/**
 * The partner's agreements — one query, shared by the Agreements page and the
 * Files page (rule 14: one key, one request).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export interface PartnerAgreement {
  id: string; title: string; status: string; service: string | null;
  sentAt: string | null; signedAt: string | null; expiresAt: string | null;
  signerName: string | null; signatureName: string | null; token: string | null;
}

export function useMyPartnerAgreements() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "agreements"],
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
    queryFn: async (): Promise<PartnerAgreement[]> => {
      const { data, error } = await requireSupabase().rpc("my_partner_agreements" as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, title: r.title as string, status: r.status as string,
        service: (r.service as string) ?? null,
        sentAt: (r.sent_at as string) ?? null, signedAt: (r.signed_at as string) ?? null,
        expiresAt: (r.expires_at as string) ?? null,
        signerName: (r.signer_name as string) ?? null,
        signatureName: (r.signature_name as string) ?? null,
        token: (r.token as string) ?? null,
      }));
    },
  });
}
