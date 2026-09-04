/**
 * Activity on a work item — read under RLS (the customer sees only what BES
 * published), and comments posted through the canonical `postNote` path so
 * visibility, actor and audit are the same as everywhere else.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchTimeline,
  postNote,
  timelineKey,
  type ActivityVisibility,
  type TimelineEntry,
} from "@/lib/data/activity";

export function useWorkItemTimeline(itemId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!itemId;
  const q = useQuery({
    queryKey: timelineKey("work_item", itemId ?? undefined),
    queryFn: () => fetchTimeline("work_item", itemId as string, 100),
    enabled: live,
    staleTime: 15_000,
  });
  return {
    entries: (q.data ?? []) as TimelineEntry[],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
  };
}

export interface PostWorkCommentInput {
  itemId: string;
  agencyId: string;
  organizationId?: string;
  detail: string;
  visibility: ActivityVisibility;
}

export function usePostWorkComment() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostWorkCommentInput) => {
      if (!auth.user) throw new Error("Sign in to comment.");
      return postNote({
        agencyId: input.agencyId,
        organizationId: input.organizationId,
        entityType: "work_item",
        entityId: input.itemId,
        actorId: auth.user.id,
        actorName: auth.displayName,
        action: "Comment posted",
        detail: input.detail.trim(),
        visibility: input.visibility,
      });
    },
    onSuccess: (_, input) => {
      void qc.invalidateQueries({ queryKey: timelineKey("work_item", input.itemId) });
    },
  });
}
