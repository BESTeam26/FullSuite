/**
 * The portal's conversation queries.
 *
 * `["portal","services"]` is deliberately the same key the Services page uses:
 * Messages needs the live engagements only to decide which topics to offer, and
 * a partner who walks from one page to the other must not pay for that list
 * twice (rule 14).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { channelsKey } from "@/lib/data/use-channels";
import { portalSummaryKey } from "@/lib/data/use-portal-summary";
import {
  fetchMyPartnerServices, fetchMyPartnerTeam, openPartnerDirect, openPartnerTopic,
} from "@/lib/data/portal-conversations";
import type { PortalTopicKey } from "@/lib/portal/portal-conversations";

function useLive() {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in";
}

export function useMyPartnerServices() {
  const live = useLive();
  return useQuery({
    queryKey: ["portal", "services"],
    queryFn: fetchMyPartnerServices,
    enabled: live,
    staleTime: 60_000,
  });
}

export function useMyPartnerTeam() {
  const live = useLive();
  return useQuery({
    queryKey: ["portal", "team"],
    queryFn: fetchMyPartnerTeam,
    enabled: live,
    staleTime: 5 * 60_000,
  });
}

/**
 * Opening a conversation. Both of these are find-or-create, so pressing them
 * again is harmless — which is what lets the interface treat "open the
 * CreditOps channel" as a link rather than as a decision to create something.
 */
export function usePartnerConversationActions(groupId: string | null) {
  const qc = useQueryClient();
  /* A new channel changes the conversation list and the portal's unread badge,
     so both are refreshed — but only after one actually appears. */
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: channelsKey });
    void qc.invalidateQueries({ queryKey: portalSummaryKey });
  };
  return {
    openTopic: useMutation({
      mutationFn: (topic: PortalTopicKey) => openPartnerTopic(groupId as string, topic),
      onSuccess: refresh,
    }),
    openDirect: useMutation({
      mutationFn: (userId: string) => openPartnerDirect(groupId as string, userId),
      onSuccess: refresh,
    }),
  };
}
