/**
 * FundingOps hooks — dual-mode, matching `use-work.ts` and `use-time.ts`.
 *
 * live → TanStack Query against Supabase (RLS-scoped).
 * demo → the FundingOps seed data, so the workspace stays explorable.
 *
 * Each hook reports its `source` so the screen can label sample figures rather
 * than presenting them as real (rule 12). These exist so components stop
 * importing seed data directly: a component reaching past the data
 * layer is how a screen ends up showing seeds while the database is live
 * (rule 5).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAllFundingFiles,
  fetchFundingBusinesses,
  fetchFundingDeals,
  fetchFundingFiles,
  findClientAcrossDivisions,
  type CrossDivisionMatch,
} from "@/lib/data/funding-clients";
import type {
  FundingBusiness,
  FundingDeal,
  FundingFile,
} from "@/lib/fulfillment/fundingops-domain";
import type { DataSource } from "@/lib/data/use-work";

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

interface Result<T> {
  data: T;
  source: DataSource;
  isLoading: boolean;
  error: string | null;
}

/** Funding files for one client. Loaded when a client is opened, not with the list. */
export function useFundingFiles(
  clientId: string | undefined,
): Result<FundingFile[]> {
  const live = useLive();
  const q = useQuery({
    queryKey: ["funding", "files", clientId],
    queryFn: () => fetchFundingFiles(clientId!),
    enabled: live && Boolean(clientId),
    staleTime: 15_000,
  });
  if (!live) {
    return {
      data: [],
      source: "demo",
      isLoading: false,
      error: null,
    };
  }
  return {
    data: q.data ?? [],
    source: "live",
    isLoading: q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
  };
}

/** Every funding file in the division — the Deal List groups and labels by these. */
export function useAllFundingFiles(): Result<FundingFile[]> {
  const live = useLive();
  const q = useQuery({
    queryKey: ["funding", "files", "all"],
    queryFn: fetchAllFundingFiles,
    enabled: live,
    staleTime: 15_000,
  });
  if (!live) {
    return {
      data: [],
      source: "demo",
      isLoading: false,
      error: null,
    };
  }
  return {
    data: q.data ?? [],
    source: "live",
    isLoading: q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
  };
}

/** Lender deals inside one funding file. */
export function useFundingDeals(
  fileId: string | undefined,
): Result<FundingDeal[]> {
  const live = useLive();
  const q = useQuery({
    queryKey: ["funding", "deals", fileId],
    queryFn: () => fetchFundingDeals(fileId!),
    enabled: live && Boolean(fileId),
    staleTime: 15_000,
  });
  if (!live) {
    return {
      data: [],
      source: "demo",
      isLoading: false,
      error: null,
    };
  }
  return {
    data: q.data ?? [],
    source: "live",
    isLoading: q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
  };
}

/** Businesses owned by one funding client. */
export function useFundingBusinesses(
  clientId: string | undefined,
): Result<FundingBusiness[]> {
  const live = useLive();
  const q = useQuery({
    queryKey: ["funding", "businesses", clientId],
    queryFn: () => fetchFundingBusinesses(clientId!),
    enabled: live && Boolean(clientId),
    staleTime: 30_000,
  });
  if (!live) {
    return {
      data: [],
      source: "demo",
      isLoading: false,
      error: null,
    };
  }
  return {
    data: q.data ?? [],
    source: "live",
    isLoading: q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
  };
}

/**
 * Does this email already exist in the OTHER division?
 *
 * Rule 2: a person should not silently become two unrelated records because
 * two divisions intook them separately. Intake calls this so it can offer to
 * link instead of forking. Disabled until an email is actually entered, so
 * typing does not fire a query per keystroke (rule 14).
 */
export function useCrossDivisionMatches(
  email: string,
  scopeId?: string,
): Result<CrossDivisionMatch[]> {
  const live = useLive();
  const ready = live && email.includes("@");
  const q = useQuery({
    queryKey: [
      "funding",
      "cross-division",
      email.toLowerCase(),
      scopeId ?? "all",
    ],
    queryFn: () => findClientAcrossDivisions(email, scopeId),
    enabled: ready,
    staleTime: 30_000,
  });
  return {
    data: ready ? (q.data ?? []) : [],
    source: live ? "live" : "demo",
    isLoading: ready ? q.isLoading : false,
    error: (q.error as Error | null)?.message ?? null,
  };
}
