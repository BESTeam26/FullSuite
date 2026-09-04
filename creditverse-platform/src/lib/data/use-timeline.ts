/**
 * The permitted timeline for one record.
 *
 * Loaded when a record is opened, not with the list — a client list of fifty
 * would otherwise fetch fifty timelines nobody has looked at (rule 14). One
 * query returns everything the caller may read; RLS has already removed the
 * rest, so there is no per-audience query and no client-side filtering.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchTimeline,
  timelineKey,
  type TimelineEntry,
} from "@/lib/data/activity";
import type { DataSource } from "@/lib/data/use-work";

export interface TimelineResult {
  entries: TimelineEntry[];
  source: DataSource;
  isLoading: boolean;
  error: string | null;
  /**
   * Re-read from the database.
   *
   * Not the way a newly posted note reaches the screen — the write returns the
   * persisted row and `appendToTimeline` places it directly. Calling this after
   * a fire-and-forget insert is what made a posted comment vanish: the refetch
   * raced the write and won, returning the timeline as it was a moment earlier.
   */
  refresh: () => void;
}

export function useTimeline(
  entityType: string,
  entityId: string | undefined,
): TimelineResult {
  const auth = useAuth();
  const qc = useQueryClient();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const key = timelineKey(entityType, entityId);

  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchTimeline(entityType, entityId!),
    enabled: live && Boolean(entityId),
    staleTime: 10_000,
  });

  return {
    entries: live ? (q.data ?? []) : [],
    source: live ? "live" : "demo",
    isLoading: live ? q.isLoading : false,
    error: live ? ((q.error as Error | null)?.message ?? null) : null,
    refresh: () => void qc.invalidateQueries({ queryKey: key }),
  };
}
