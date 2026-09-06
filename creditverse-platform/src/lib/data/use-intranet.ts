/**
 * Announcements and knowledge articles for the screen in view. One query per
 * kind, keyed by the organization in view (null = BES HQ's own view), and one
 * refresh after any write.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  archiveAnnouncement,
  archiveKnowledgeArticle,
  fetchAnnouncements,
  fetchKnowledgeArticles,
  saveAnnouncement,
  saveKnowledgeArticle,
} from "@/lib/data/intranet";

export const announcementsKey = (orgId: string | null) => ["intranet", "announcements", orgId] as const;
export const knowledgeKey = (orgId: string | null) => ["intranet", "knowledge", orgId] as const;

function useLive() {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in";
}

export function useAnnouncements(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: announcementsKey(organizationId),
    queryFn: () => fetchAnnouncements(organizationId),
    enabled: live,
    staleTime: 30_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: announcementsKey(organizationId) });
  return {
    live,
    announcements: q.data ?? [],
    isLoading: live && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    save: useMutation({ mutationFn: saveAnnouncement, onSuccess: refresh }),
    archive: useMutation({ mutationFn: archiveAnnouncement, onSuccess: refresh }),
  };
}

export function useKnowledgeArticles(organizationId: string | null) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: knowledgeKey(organizationId),
    queryFn: () => fetchKnowledgeArticles(organizationId),
    enabled: live,
    staleTime: 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: knowledgeKey(organizationId) });
  return {
    live,
    articles: q.data ?? [],
    isLoading: live && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    save: useMutation({ mutationFn: saveKnowledgeArticle, onSuccess: refresh }),
    archive: useMutation({ mutationFn: archiveKnowledgeArticle, onSuccess: refresh }),
  };
}
