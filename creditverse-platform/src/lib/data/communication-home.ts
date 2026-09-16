/**
 * The HOME section of Communication — Inbox, Mentions & Reactions, Saved.
 *
 * Dee, 2026-09-16: *"This is a projection of existing conversations/messages.
 * Do not create a second inbox table unless the architecture genuinely needs
 * one."*
 *
 * It does not, and the split below is the reason:
 *
 *   INBOX is computed from the channel list the rail ALREADY has. No request
 *   of its own — a second query would be a second answer to "what am I in",
 *   and two answers is how they start to disagree.
 *
 *   MENTIONS & REACTIONS and SAVED are reads over canonical records, both
 *   SECURITY INVOKER so `messages`' own policy decides what comes back.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";

export interface ActivityItem {
  kind: "mention" | "reaction";
  messageId: number;
  channelId: string;
  channelName: string;
  bodyText: string | null;
  actorId: string | null;
  actorName: string;
  emoji: string | null;
  happenedAt: string;
}

export interface SavedItem {
  messageId: number;
  channelId: string;
  channelName: string;
  bodyText: string | null;
  authorName: string;
  createdAt: string;
  savedAt: string;
}

export const activityKey = ["communication", "activity"] as const;
export const savedKey = ["communication", "saved"] as const;

export function useCommunicationActivity() {
  return useQuery({
    queryKey: activityKey,
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await requireSupabase()
        .rpc("my_communication_activity" as never, { p_limit: 50 } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        kind: r.kind as ActivityItem["kind"],
        messageId: Number(r.message_id),
        channelId: r.channel_id as string,
        channelName: r.channel_name as string,
        bodyText: (r.body_text as string) ?? null,
        actorId: (r.actor_id as string) ?? null,
        actorName: r.actor_name as string,
        emoji: (r.emoji as string) ?? null,
        happenedAt: r.happened_at as string,
      }));
    },
  });
}

export function useSavedMessages() {
  return useQuery({
    queryKey: savedKey,
    staleTime: 30_000,
    queryFn: async (): Promise<SavedItem[]> => {
      const { data, error } = await requireSupabase()
        .rpc("my_saved_messages" as never, { p_limit: 50 } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        messageId: Number(r.message_id),
        channelId: r.channel_id as string,
        channelName: r.channel_name as string,
        bodyText: (r.body_text as string) ?? null,
        authorName: r.author_name as string,
        createdAt: r.created_at as string,
        savedAt: r.saved_at as string,
      }));
    },
  });
}

/**
 * Save or unsave. `user_id` is deliberately not sent — it defaults to
 * `auth.uid()`, the convention this schema keeps and the one
 * `message_reactions` was missing when reactions silently never worked.
 */
export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, saved }: { messageId: number; saved: boolean }) => {
      const sb = requireSupabase();
      if (saved) {
        const { error } = await sb.from("saved_messages").delete().eq("message_id", messageId);
        if (error) throw error;
        return;
      }
      const { error } = await sb.from("saved_messages").insert({ message_id: messageId } as never);
      /* Saved twice from two tabs is the state we wanted either way. */
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: savedKey }); },
  });
}

/* ── Search, across everything Communication touches ───────────────────────
 *
 * Dee: "Search should support messages, people, channels, Partners,
 * attachments." One RPC, SECURITY INVOKER, so each table decides for itself
 * what this searcher may find — a partner contact searching gets their own
 * conversations and none of the BES roster, because `profiles` refuses them,
 * not because this asks who they are.
 */
export type SearchKind = "message" | "channel" | "person" | "partner" | "file";

export interface SearchHit {
  kind: SearchKind;
  refId: string;
  /** Where the result opens. Null for a person or a partner, which are not conversations. */
  channelId: string | null;
  title: string;
  subtitle: string | null;
  happenedAt: string;
}

export function useCommunicationSearch(term: string) {
  const ready = term.trim().length >= 2;
  return useQuery({
    queryKey: ["communication", "search", term.trim()],
    enabled: ready,
    staleTime: 15_000,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await requireSupabase()
        .rpc("search_communication", { p_query: term.trim(), p_limit: 40 });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        kind: r.kind as SearchKind,
        refId: r.ref_id as string,
        channelId: (r.channel_id as string) ?? null,
        title: r.title as string,
        subtitle: (r.subtitle as string) ?? null,
        happenedAt: r.happened_at as string,
      }));
    },
  });
}
