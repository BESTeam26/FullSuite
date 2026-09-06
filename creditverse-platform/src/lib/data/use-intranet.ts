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

/**
 * `organizationId` null means BES HQ's own board, which is a real query — so
 * a caller that is merely *not ready yet* (an organization still resolving, a
 * hub module still loading) must say so with `enabled: false`. Without that
 * distinction the screen fetches the BES board first and the organization's
 * second, which is the duplicate request rule 14 forbids.
 */
export function useAnnouncements(organizationId: string | null, options: { enabled?: boolean } = {}) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: announcementsKey(organizationId),
    queryFn: () => fetchAnnouncements(organizationId),
    enabled: live && (options.enabled ?? true),
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

export function useKnowledgeArticles(organizationId: string | null, options: { enabled?: boolean } = {}) {
  const live = useLive();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: knowledgeKey(organizationId),
    queryFn: () => fetchKnowledgeArticles(organizationId),
    enabled: live && (options.enabled ?? true),
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
