import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addChannelMember, archiveChannel, createChannel, fetchChannelMembers,
  fetchChannels, fetchMessages, openPartnerConversation, postMessage,
  removeChannelMember,
} from "@/lib/data/channels";
import { useAuth } from "@/lib/auth/auth-context";
import type { Json } from "@/lib/supabase/database.types";

/**
 * The channel list is shared by the sidebar and the page, under one key, so
 * both render from a single request (rule 14).
 */
export const channelsKey = (orgId: string | null) => ["channels", orgId] as const;
export const messagesKey = (channelId: string | null) => ["channels", "messages", channelId] as const;

/**
 * Channels for one owner — an organization, or BES itself.
 *
 * `agencyId` is used when the person is in Agency HQ view: BES's own team
 * channels, which no organization member reaches (0190). Exactly one owner,
 * so the key carries whichever it is and the two never share a cache entry.
 */
export function useChannels(organizationId: string | null, agencyId?: string | null) {
  const owner = agencyId
    ? ({ agencyId } as const)
    : organizationId
      ? ({ organizationId } as const)
      : null;
  return useQuery({
    queryKey: channelsKey(agencyId ? `agency:${agencyId}` : organizationId),
    queryFn: () => fetchChannels(owner!),
    enabled: !!owner,
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

/**
 * Creating, archiving and staffing a channel.
 *
 * Invalidates by owner rather than everything: the agency's channel list and
 * an organization's are separate caches and a change to one is not news to
 * the other.
 */
export function useChannelActions(owner: { organizationId: string | null; agencyId: string | null }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const key = channelsKey(owner.agencyId ? `agency:${owner.agencyId}` : owner.organizationId);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["channel-members"] });
  };
  return {
    create: useMutation({
      mutationFn: (v: { name: string; kind: string; purpose?: string; partnerGroupId?: string | null }) =>
        createChannel({
          ...v,
          createdBy: auth.user?.id ?? "",
          /* A conversation WITH a partner is owned by the partner, not by BES
             — that is what puts the same row in their portal. */
          organizationId: v.partnerGroupId || owner.agencyId ? null : owner.organizationId,
          agencyId: v.partnerGroupId ? null : owner.agencyId,
          partnerGroupId: v.partnerGroupId ?? null,
        }),
      onSuccess: refresh,
    }),
    archive: useMutation({ mutationFn: (id: string) => archiveChannel(id), onSuccess: refresh }),
    addMember: useMutation({
      mutationFn: (v: { channelId: string; userId: string; isManager?: boolean }) =>
        addChannelMember(v.channelId, v.userId, v.isManager),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (v: { channelId: string; userId: string }) =>
        removeChannelMember(v.channelId, v.userId),
      onSuccess: refresh,
    }),
  };
}

export function useChannelMembers(channelId: string | null) {
  return useQuery({
    queryKey: ["channel-members", channelId ?? ""],
    queryFn: () => fetchChannelMembers(channelId!),
    enabled: !!channelId,
    staleTime: 60_000,
  });
}

/**
 * The partner record's way into the conversation.
 *
 * Find-or-create on click. Nothing is fetched while the partner profile sits
 * there unopened — the button needs no data to render, so it asks for none
 * (rule 14). The agency channel list is invalidated afterwards because a
 * brand-new conversation belongs in it.
 */
export function useOpenPartnerConversation(agencyId: string | null) {
  const qc = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: (v: { partnerGroupId: string; partnerName: string }) =>
      openPartnerConversation({ ...v, createdBy: auth.user?.id ?? "" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: channelsKey(agencyId ? `agency:${agencyId}` : null) });
    },
  });
}

/**
 * The partner portal's side of the conversation.
 *
 * Its own cache key — a partner contact and a BES agent are looking at the
 * same channel row, but they are different sessions asking different
 * questions, and sharing a key between them would mean one person's list
 * answering the other's.
 */
export function usePartnerChannels(partnerGroupId: string | null) {
  return useQuery({
    queryKey: ["channels", partnerGroupId ? `partner:${partnerGroupId}` : null],
    queryFn: () => fetchChannels({ partnerGroupId: partnerGroupId! }),
    enabled: !!partnerGroupId,
    staleTime: 60_000,
  });
}
