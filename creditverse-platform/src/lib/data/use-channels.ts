/**
 * The central Communication inbox, as hooks.
 *
 * ── ONE LIST, ONE KEY ──────────────────────────────────────────────────────
 *
 * Dee, §20: "Do not build five separate inboxes." So there is one query key —
 * `["channels"]` — shared by the page, the sidebar badge and the partner
 * portal. Three components asking the same question get one request (rule 14),
 * and they cannot disagree about the answer.
 *
 * There used to be a key per owner (`channels:agency:…`, `channels:org…`),
 * which was a way of asking the database a narrower question than it was
 * already answering. `visible_channels()` returns exactly what the caller may
 * see; asking for a subset of it is deciding visibility twice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addChannelMember, addChannelTeam, archiveChannel, createChannel,
  fetchChannelMembers, fetchChannelMentionable, fetchChannels, fetchChannelTeams,
  fetchMessages,
  markChannelRead, openDirectChannel, openPartnerConversation, postMessage,
  removeChannelMember, removeChannelTeam, restoreChannel, searchMessages,
} from "@/lib/data/channels";
import { useAuth } from "@/lib/auth/auth-context";
import type { Json } from "@/lib/supabase/database.types";

export const channelsKey = ["channels"] as const;
export const messagesKey = (channelId: string | null) => ["channels", "messages", channelId] as const;

/** Every conversation this person may reach, with unread counts, in one call. */
export function useChannels(enabled = true) {
  return useQuery({
    queryKey: channelsKey,
    queryFn: fetchChannels,
    enabled,
    staleTime: 30_000,
  });
}

/** Only the open conversation's messages are ever fetched. */
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messagesKey(channelId) });
      /* The list carries unread and last-message time, so it is stale the
         moment anybody says anything. */
      void qc.invalidateQueries({ queryKey: channelsKey });
    },
  });
}

/**
 * Marking a conversation read.
 *
 * Fire-and-forget on purpose: a failed read marker is not worth an error in
 * front of somebody who is reading. It corrects itself the next time they open
 * the conversation.
 */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => markChannelRead(channelId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: channelsKey }); },
  });
}

/**
 * Search. Two characters minimum, and debouncing is the caller's business —
 * this hook simply does not run on a query too short to mean anything.
 */
export function useMessageSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["channels", "search", trimmed],
    queryFn: () => searchMessages(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 15_000,
  });
}

/** Creating, archiving, and staffing a conversation with people AND teams. */
export function useChannelActions() {
  const qc = useQueryClient();
  const auth = useAuth();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: channelsKey });
    void qc.invalidateQueries({ queryKey: ["channel-members"] });
    void qc.invalidateQueries({ queryKey: ["channel-teams"] });
  };
  return {
    create: useMutation({
      mutationFn: (v: {
        name: string; kind: string; purpose?: string;
        organizationId?: string | null; agencyId?: string | null;
        partnerGroupId?: string | null; partnerServiceId?: string | null;
        openToScope?: boolean; teamIds?: string[];
      }) => createChannel({ ...v, createdBy: auth.user?.id ?? "" }),
      onSuccess: refresh,
    }),
    archive: useMutation({ mutationFn: (id: string) => archiveChannel(id), onSuccess: refresh }),
    restore: useMutation({ mutationFn: (id: string) => restoreChannel(id), onSuccess: refresh }),
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
    addTeam: useMutation({
      mutationFn: (v: { channelId: string; teamId: string }) =>
        addChannelTeam(v.channelId, v.teamId),
      onSuccess: refresh,
    }),
    removeTeam: useMutation({
      mutationFn: (v: { channelId: string; teamId: string }) =>
        removeChannelTeam(v.channelId, v.teamId),
      onSuccess: refresh,
    }),
    openDirect: useMutation({
      mutationFn: (otherUserId: string) => openDirectChannel(otherUserId),
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

export function useChannelTeams(channelId: string | null) {
  return useQuery({
    queryKey: ["channel-teams", channelId ?? ""],
    queryFn: () => fetchChannelTeams(channelId!),
    enabled: !!channelId,
    staleTime: 60_000,
  });
}

/**
 * The partner record's way into the conversation.
 *
 * Find-or-create on click. Nothing is fetched while the partner profile sits
 * there unopened — the button needs no data to render, so it asks for none
 * (rule 14).
 */
export function useOpenPartnerConversation() {
  const qc = useQueryClient();
  const auth = useAuth();
  return useMutation({
    mutationFn: (v: { partnerGroupId: string; partnerName: string }) =>
      openPartnerConversation({ ...v, createdBy: auth.user?.id ?? "" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: channelsKey }); },
  });
}

/**
 * The people this person may mention here.
 *
 * Cached per channel for a few minutes: a roster does not change while
 * somebody is typing, and the alternative is a request per keystroke.
 */
export function useChannelMentionable(channelId: string | null) {
  return useQuery({
    queryKey: ["channel-mentionable", channelId ?? ""],
    queryFn: () => fetchChannelMentionable(channelId!),
    enabled: !!channelId,
    staleTime: 300_000,
  });
}
