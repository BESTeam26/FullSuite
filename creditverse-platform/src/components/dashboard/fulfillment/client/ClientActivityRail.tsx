/**
 * The Activity rail — Dee's ClickUp column, beside the file rather than under it.
 *
 * Dee, 2026-09-24, with a screenshot of her own ClickUp: "This is the UI I
 * want exactly." What that screenshot has and this replaces: a column on the
 * right that is always open, each post showing who wrote it and when, images
 * shown as images, a reaction row, a Reply link, and a composer pinned at the
 * bottom.
 *
 * What it is NOT is History. History is every status change and handoff — the
 * audit trail, which Dee asked on 2026-09-23 to keep collapsed. This is the
 * part people talk in, and in ClickUp that is never folded away.
 *
 * Imported ClickUp comments and notes written here are the same kind of row,
 * so an eleven-month conversation carries on in the same column it arrived in.
 */
import { useState } from "react";
import { Loader2, SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format-date";
import { useToast } from "@/hooks/use-toast";
import {
  useClientPosts, useReactToPost, useReplyToPost, type ClientPost,
} from "@/lib/data/use-client-posts";

/* The six ClickUp offers on hover. A fixed set, because a picker is a
   dependency and a search box for something nobody searches. */
const QUICK = ["👍", "🎉", "👀", "✅", "❤️", "🙏"] as const;

/** Initials for the avatar disc, the way every one of these products does it. */
const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/* Stable per person, so the same colleague is the same colour on every file. */
const AVATAR_TONES = [
  "bg-emerald-600", "bg-sky-600", "bg-violet-600",
  "bg-amber-600", "bg-rose-600", "bg-teal-600",
];
const toneFor = (key: string) => {
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[n % AVATAR_TONES.length];
};

function Reactions({
  post, onReact, busy,
}: { post: ClientPost; onReact: (emoji: string) => void; busy: boolean }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {post.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={busy}
          onClick={() => onReact(r.emoji)}
          aria-pressed={r.mine}
          title={r.mine ? "Remove your reaction" : "React"}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            r.mine
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold">{r.count}</span>
        </button>
      ))}

      {picking ? (
        <span className="flex items-center gap-0.5 rounded-full border border-border bg-card px-1 py-0.5">
          {QUICK.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onReact(e); setPicking(false); }}
              className="rounded px-1 text-sm leading-none transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label="Add a reaction"
          className="rounded-full border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Post({
  post, clientId, organizationId, depth = 0,
}: { post: ClientPost; clientId: string; organizationId: string | null; depth?: number }) {
  const react = useReactToPost(clientId);
  const reply = useReplyToPost(clientId, organizationId);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const { toast } = useToast();

  const send = async () => {
    if (!draft.trim()) return;
    try {
      await reply.mutateAsync({ parentId: post.id, text: draft });
      setDraft(""); setReplying(false);
    } catch (e) {
      /* The draft stays: losing a typed reply to a network blip is the worst
         moment to clear a box. */
      toast({ title: "That did not send", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <article className={cn("py-3", depth > 0 && "ml-4 border-l border-border pl-3")}>
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
            toneFor(post.authorId ?? post.author),
          )}
        >
          {initialsOf(post.author)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-semibold text-foreground">{post.author}</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(post.at)}</span>
            {post.imported && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                from ClickUp
              </span>
            )}
          </p>
          {post.detail && (
            /* `whitespace-pre-wrap`: eleven months of ClickUp comments are
               plain text with line breaks that carry meaning. */
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
              {post.detail}
            </p>
          )}

          <Reactions
            post={post}
            busy={react.isPending}
            onReact={(emoji) => react.mutate({ postId: post.id, emoji })}
          />

          {!replying ? (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="mt-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reply
            </button>
          ) : (
            <div className="mt-2">
              <textarea
                autoFocus
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                  if (e.key === "Escape") { setReplying(false); setDraft(""); }
                }}
                placeholder="Reply…"
                className="w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!draft.trim() || reply.isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {reply.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => { setReplying(false); setDraft(""); }}
                  className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {post.replies.map((r) => (
            <Post key={r.id} post={r} clientId={clientId} organizationId={organizationId} depth={depth + 1} />
          ))}
        </div>
      </div>
    </article>
  );
}

export function ClientActivityRail({
  clientId, organizationId, composer,
}: {
  clientId: string;
  organizationId: string | null;
  /** The existing composer, pinned to the bottom as ClickUp pins its own. */
  composer: React.ReactNode;
}) {
  const posts = useClientPosts(clientId);
  const rows = posts.data ?? [];

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-bold text-foreground">Activity</h2>
        {rows.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "post" : "posts"}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
        {posts.isLoading ? (
          /* Skeletons, not "no posts yet": a false empty on a file with a
             year of history is the one thing worse than waiting. */
          <div className="space-y-3 py-3" aria-label="Loading the conversation">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.isError ? (
          <p className="py-4 text-xs text-status-danger">
            The conversation could not be loaded. {(posts.error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">
            Nothing posted yet. Anything written below stays on this client.
          </p>
        ) : (
          rows.map((p) => (
            <Post key={p.id} post={p} clientId={clientId} organizationId={organizationId} />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">{composer}</div>
    </aside>
  );
}
