/**
 * Work engine hooks — dual-mode.
 *
 * live → TanStack Query against Supabase (RLS-scoped).
 * demo → the seed work items already held by agency-context.
 *
 * Every hook reports its `source` so the UI can label demo data honestly
 * instead of pretending a number is real.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgency } from "@/lib/agency-context";
import type { WorkItem } from "@/lib/bes-domain";
import {
  fetchAgencyWork,
  fetchAttention,
  fetchMyWork,
  hoursUntil,
  mapWorkItem,
  type AttentionRow,
} from "@/lib/data/work-items";

export type DataSource = "live" | "demo";

export interface WorkQueryResult {
  items: WorkItem[];
  source: DataSource;
  isLoading: boolean;
  error: string | null;
}

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

/** Work assigned to the signed-in user. */
export function useMyWork(): WorkQueryResult {
  const auth = useAuth();
  const live = useLive();
  const { agencyWork } = useAgency();
  const userId = auth.user?.id ?? "";

  const q = useQuery({
    queryKey: ["work", "mine", userId],
    queryFn: () => fetchMyWork(userId),
    enabled: live,
    staleTime: 15_000,
  });

  if (!live) {
    return {
      items: agencyWork.filter((w) => w.stage !== "Completed"),
      source: "demo",
      isLoading: false,
      error: null,
    };
  }
  return {
    items: (q.data ?? []).map(mapWorkItem),
    source: "live",
    isLoading: q.isPending,
    error: q.error ? (q.error as Error).message : null,
  };
}

/** All AGENCY-scope work (the BES fulfillment desk). */
export function useAgencyWork(): WorkQueryResult {
  const live = useLive();
  const { agencyWork } = useAgency();

  const q = useQuery({
    queryKey: ["work", "agency"],
    queryFn: fetchAgencyWork,
    enabled: live,
    staleTime: 15_000,
  });

  if (!live) {
    return { items: agencyWork, source: "demo", isLoading: false, error: null };
  }
  return {
    items: (q.data ?? []).map(mapWorkItem),
    source: "live",
    isLoading: q.isPending,
    error: q.error ? (q.error as Error).message : null,
  };
}

export type AttentionReason = "blocked" | "overdue" | "sla_risk";

export interface AttentionItem {
  id: string;
  title: string;
  stage: string;
  reason: AttentionReason;
  hoursRemaining: number | null;
  organizationId: string | null;
}

export interface AttentionResult {
  items: AttentionItem[];
  counts: Record<AttentionReason, number>;
  source: DataSource;
  isLoading: boolean;
  error: string | null;
}

const reasonOf = (row: AttentionRow): AttentionReason =>
  (row.attention_reason as AttentionReason | null) ??
  (row.stage === "Blocked" || row.stage === "Attention" ? "blocked" : "sla_risk");

/** Derive the same attention buckets from domain items (demo mode). */
function attentionFromWork(items: WorkItem[]): AttentionItem[] {
  return items
    .filter(
      (w) =>
        w.stage === "Blocked" ||
        w.stage === "Attention" ||
        (w.slaHoursRemaining !== undefined && w.slaHoursRemaining <= 4),
    )
    .map((w) => ({
      id: w.id,
      title: w.title,
      stage: w.stage,
      reason:
        w.stage === "Blocked" || w.stage === "Attention"
          ? ("blocked" as const)
          : (w.slaHoursRemaining ?? 0) < 0
            ? ("overdue" as const)
            : ("sla_risk" as const),
      hoursRemaining: w.slaHoursRemaining ?? null,
      organizationId: w.organizationId ?? null,
    }));
}

const emptyCounts: Record<AttentionReason, number> = {
  blocked: 0,
  overdue: 0,
  sla_risk: 0,
};

const tally = (items: AttentionItem[]) =>
  items.reduce(
    (acc, i) => ({ ...acc, [i.reason]: acc[i.reason] + 1 }),
    { ...emptyCounts },
  );

export function useAttention(): AttentionResult {
  const live = useLive();
  const { workItems } = useAgency();

  const q = useQuery({
    queryKey: ["work", "attention"],
    queryFn: fetchAttention,
    enabled: live,
    staleTime: 15_000,
  });

  if (!live) {
    const items = attentionFromWork(workItems);
    return {
      items,
      counts: tally(items),
      source: "demo",
      isLoading: false,
      error: null,
    };
  }

  const items: AttentionItem[] = (q.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    stage: row.stage,
    reason: reasonOf(row),
    hoursRemaining: row.hours_remaining ?? hoursUntil(row.due_at) ?? null,
    organizationId: row.organization_id,
  }));

  return {
    items,
    counts: tally(items),
    source: "live",
    isLoading: q.isPending,
    error: q.error ? (q.error as Error).message : null,
  };
}
