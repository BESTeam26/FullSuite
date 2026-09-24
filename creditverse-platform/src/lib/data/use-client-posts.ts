/**
 * The conversation on a client file — ClickUp's Activity rail.
 *
 * Separate from `useClientHistory`, deliberately. History is the audit trail:
 * every status change, assignment and handoff, collapsed out of the way
 * because it is something you consult. This is the part people TALK in, and
 * in Dee's ClickUp it is a column of its own that is always open.
 *
 * Threading is assembled here rather than in SQL. `client_posts()` returns a
 * flat list with each row's parent, which is one bounded query; turning that
 * into parents-with-replies is arithmetic, and doing it in the database would
 * mean either a recursive query or one round trip per thread.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { postNote } from "@/lib/data/activity";

export interface PostReaction {
  emoji: string;
  count: number;
  /** Whether the person reading this is one of them. */
  mine: boolean;
}

export interface ClientPost {
  id: number;
  parentId: number | null;
  at: string;
  author: string;
  authorId: string | null;
  title: string;
  detail: string | null;
  /** Came from ClickUp rather than being written here. */
  imported: boolean;
  reactions: PostReaction[];
  replies: ClientPost[];
}

export const clientPostsKey = (clientId: string) => ["creditops", "posts", clientId];

interface Row {
  id: number;
  parent_id: number | null;
  happened_at: string;
  actor: string;
  actor_id: string | null;
  title: string;
  detail: string | null;
  imported: boolean;
  reactions: PostReaction[] | null;
}

/** Flat rows → top-level posts, each carrying its replies oldest-first. */
export function threadPosts(rows: readonly Row[]): ClientPost[] {
  const byId = new Map<number, ClientPost>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id, parentId: r.parent_id, at: r.happened_at, author: r.actor,
      authorId: r.actor_id, title: r.title, detail: r.detail,
      imported: r.imported, reactions: r.reactions ?? [], replies: [],
    });
  }
  const top: ClientPost[] = [];
  for (const post of byId.values()) {
    /* A reply whose parent is not in the list — deleted, or filtered out —
       is shown at the top level rather than dropped. Somebody wrote it. */
    const parent = post.parentId === null ? null : byId.get(post.parentId);
    if (parent) parent.replies.push(post);
    else top.push(post);
  }
  return top;
}

export function useClientPosts(clientId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: clientPostsKey(clientId ?? ""),
    enabled: auth.mode === "live" && auth.status === "signed-in" && !!clientId,
    staleTime: 15_000,
    queryFn: async (): Promise<ClientPost[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("client_posts" as never, {
        p_client: clientId as string,
      } as never);
      if (error) throw error;
      return threadPosts((data as unknown as Row[]) ?? []);
    },
  });
}

/** Add or remove my reaction. The database decides which — it is one call. */
export function useReactToPost(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, emoji }: { postId: number; emoji: string }) => {
      const sb = requireSupabase();
      const { error } = await sb.rpc("activity_react" as never, {
        p_activity: postId, p_emoji: emoji,
      } as never);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clientPostsKey(clientId) }),
  });
}

export function useReplyToPost(clientId: string, organizationId: string | null) {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ parentId, text }: { parentId: number; text: string }) => {
      const sb = requireSupabase();
      /* A reply is an ordinary note carrying a parent. `postNote` does not
         take one, and widening it would change every caller, so the parent is
         set in the same insert here. The trigger refuses a parent that is not
         itself a note. */
      const { error } = await sb.from("activity_events").insert({
        agency_id: auth.agencyId,
        organization_id: organizationId,
        entity_type: "fulfillment_client",
        entity_id: clientId,
        actor_id: auth.user?.id ?? null,
        actor_name: auth.displayName ?? null,
        action: "Internal note",
        detail: text.trim(),
        visibility: "bes_internal",
        parent_id: parentId,
      } as never);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clientPostsKey(clientId) }),
  });
}

export { postNote };
