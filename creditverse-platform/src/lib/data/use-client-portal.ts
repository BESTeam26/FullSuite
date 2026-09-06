import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchDocumentRequests, fetchPortalHome, fetchPortalUpdates, fetchPresentedOffers,
} from "@/lib/data/client-portal";

/** Secondary sections load when opened, never before (rule 14). */
export function usePortalHome() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["portal", "home", auth.user?.id ?? null],
    queryFn: fetchPortalHome,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}

export function usePortalUpdates(enabled: boolean) {
  return useQuery({ queryKey: ["portal", "updates"], queryFn: () => fetchPortalUpdates(), enabled, staleTime: 60_000 });
}

export function usePortalDocumentRequests(enabled: boolean) {
  return useQuery({ queryKey: ["portal", "documents"], queryFn: fetchDocumentRequests, enabled, staleTime: 60_000 });
}

export function usePortalOffers(enabled: boolean) {
  return useQuery({ queryKey: ["portal", "offers"], queryFn: fetchPresentedOffers, enabled, staleTime: 60_000 });
}
