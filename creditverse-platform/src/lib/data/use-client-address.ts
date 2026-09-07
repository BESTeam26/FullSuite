/**
 * The consumer's own postal address, for a letter that is FROM them.
 *
 * A dispute letter is written by the consumer, not by BES, so the return
 * address is theirs. It lives on the canonical client record — which is the
 * reason that record exists: one address, whichever service is using it.
 *
 * Keyed by the CreditOps case id because that is what the letters screen has,
 * and resolved through `fulfillment_clients.client_id` in one request.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import type { PostalAddress } from "@/lib/data/letter-mailing";
import type { VerifiedIdentity } from "@/lib/dispute/metro2/identity-input";

export async function fetchSenderAddress(caseId: string): Promise<PostalAddress | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select("clients(full_name, address_line1, address_line2, city, state, postal_code)")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  const c = (data as { clients: {
    full_name: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null } | null)?.clients;
  if (!c) return null;
  return {
    name: c.full_name ?? "",
    line1: c.address_line1 ?? "",
    line2: c.address_line2 ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    zip: c.postal_code ?? "",
  };
}

export function useSenderAddress(caseId: string | undefined) {
  return useQuery({
    queryKey: ["client", "sender-address", caseId],
    queryFn: () => fetchSenderAddress(caseId as string),
    enabled: !!caseId,
    staleTime: 60_000,
  });
}


/**
 * The identity fields Section A compares against, for one credit case.
 *
 * Same row as the sender address and the same cache key family — this asks for
 * the fields the rules need rather than the fields an envelope needs, and the
 * two are deliberately different shapes so neither drags the other's concerns
 * along.
 */
export async function fetchVerifiedIdentity(caseId: string): Promise<VerifiedIdentity> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("fulfillment_clients")
    .select("clients(full_name, date_of_birth, address_line1, city, state, postal_code)")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  const c = (data as { clients: {
    full_name: string | null;
    date_of_birth: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null } | null)?.clients;
  if (!c) return {};
  return {
    fullName: c.full_name,
    dateOfBirth: c.date_of_birth,
    addressLine1: c.address_line1,
    city: c.city,
    state: c.state,
    postalCode: c.postal_code,
  };
}

export function useClientProfileForCase(caseId: string | undefined) {
  return useQuery({
    queryKey: ["client", "verified-identity", caseId],
    queryFn: () => fetchVerifiedIdentity(caseId as string),
    enabled: !!caseId,
    staleTime: 60_000,
  });
}
