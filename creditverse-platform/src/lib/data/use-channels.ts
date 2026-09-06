import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchChannels, fetchMessages, postMessage } from "@/lib/data/channels";
import type { Json } from "@/lib/supabase/database.types";

/**
 * The channel list is shared by the sidebar and the page, under one key, so
 * both render from a single request (rule 14).
 */
export const channelsKey = (orgId: string | null) => ["channels", orgId] as const;
export const messagesKey = (channelId: string | null) => ["channels", "messages", channelId] as const;

export function useChannels(organizationId: string | null) {
  return useQuery({
    queryKey: channelsKey(organizationId),
    queryFn: () => fetchChannels(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}

/** Only the open channel's messages are ever fetched. */
export function useMessages(channelId: string | null) {
  return useQuery({
    queryKey: messagesKey(channelId),
    queryFn: () => fetchMessages(channelId!),
    enabled: !!channelId,
    staleTime: 10_000,
  });
}

export function usePostMessage(channelId: string | null, authorId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: Json; bodyText: string }) =>
      postMessage({ channelId: channelId!, authorId: authorId!, ...input }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: messagesKey(channelId) }); },
  });
}
