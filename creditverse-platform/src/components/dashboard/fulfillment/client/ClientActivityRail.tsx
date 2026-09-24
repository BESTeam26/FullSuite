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
import { useMemo, useState } from "react";
import { FileText, Loader2, Pencil, SmilePlus, ThumbsUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format-date";
import { useFilePreviews } from "@/lib/data/use-file-previews";
import { useToast } from "@/hooks/use-toast";
import {
  useClientPosts, useDeletePost, useEditPost, useReactToPost, useReplyToPost,
  type ClientPost, type FeedKind,
} from "@/lib/data/use-client-posts";

/* Dee's mockup, 2026-09-24. "All" is not a filter, it is the absence of one,
   so it carries no predicate and cannot fall out of step with the rest. */
const FILTERS: { id: string; label: string; kinds: FeedKind[] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "work", label: "Work", kinds: ["work"] },
  { id: "comments", label: "Comments", kinds: ["comment"] },
  { id: "files", label: "Files", kinds: ["file"] },
  { id: "system", label: "System", kinds: ["system"] },
];

/**
 * "Today", "Yesterday", then the plain date.
 *
 * Grouping by day is what makes a year of imported comments navigable: the
 * eye finds the day first and the entry second. Inside a group the stamp is
 * the TIME alone, because the date is already the heading above it.
 */
function dayLabel(at: string): string {
  const d = new Date(at);
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return formatDate(at);
}

const timeOfDay = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

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

/**
 * A file in the feed: the picture when it is one, a labelled row when it is not.
 *
 * The preview URL is signed and short-lived — `useFilePreviews` batches the
 * signing for everything on screen, so a column with twenty screenshots is
 * one request and not twenty.
 */
function FileCard({ file }: { file: NonNullable<ClientPost["file"]> }) {
  const isImage = (file.mime ?? "").startsWith("image/");
  const previews = useFilePreviews(isImage ? [{ bucket: file.bucket, path: file.path }] : []);
  const url = previews.data?.[`${file.bucket}/${file.path}`];
  const size = file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : null;

  if (isImage) {
    return (
      <figure className="mt-1.5">
        {url ? (
          <img
            src={url}
            alt={file.name}
            loading="lazy"
            className="max-h-56 w-full rounded-lg border border-border object-cover"
          />
        ) : (
          /* A grey box the size of the picture, not a spinner: the layout must
             not jump when twenty of these resolve at once. */
          <div className="h-32 w-full animate-pulse rounded-lg border border-border bg-muted" />
        )}
        <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">
          {file.name}{size ? ` · ${size}` : ""}
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
        {size && <p className="text-[10px] text-muted-foreground">{size}</p>}
      </div>
    </div>
  );
}

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
  const edit = useEditPost(clientId);
  const remove = useDeletePost(clientId);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const send = async () => {
    if (!draft.trim()) return;
    try {
      if (postId === null) return;
      await reply.mutateAsync({ parentId: postId, text: draft });
      setDraft(""); setReplying(false);
    } catch (e) {
      /* The draft stays: losing a typed reply to a network blip is the worst
         moment to clear a box. */
      toast({ title: "That did not send", description: (e as Error).message, variant: "destructive" });
    }
  };

  const thumbs = post.reactions.find((r) => r.emoji === "👍");
  const postId = post.id;

  const saveEdit = async () => {
    if (postId === null || !editDraft.trim()) return;
    try {
      await edit.mutateAsync({ postId, text: editDraft });
      setEditing(false);
    } catch (e) {
      /* The draft stays. Losing a correction to a refusal is the worst moment
         to clear a box. */
      toast({ title: "That did not save", description: (e as Error).message, variant: "destructive" });
    }
  };

  const doDelete = async () => {
    if (postId === null) return;
    try {
      await remove.mutateAsync(postId);
      setConfirming(false);
    } catch (e) {
      toast({ title: "That did not delete", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    /* A CARD, not a row in a divided list. Dee's ClickUp gives every comment
       its own bordered block with a hairline above its actions, and that is
       what makes a long conversation readable — a divider line between posts
       reads as one continuous wall of text. */
    <article className={cn(
      "overflow-hidden rounded-xl border border-border bg-card",
      depth > 0 && "ml-6",
    )}>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
              toneFor(post.authorId ?? post.author),
            )}
          >
            {initialsOf(post.author)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-bold text-foreground">{post.author}</span>
              {/* The time alone — the day is the heading above this group. */}
              <span className="text-[11px] text-muted-foreground">{timeOfDay(post.at)}</span>
              {post.imported && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  from ClickUp
                </span>
              )}
            </p>
            {post.file && <FileCard file={post.file} />}
            {editing ? (
              <div className="mt-1.5">
                <textarea
                  autoFocus
                  rows={3}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault(); void saveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={!editDraft.trim() || edit.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {edit.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : post.detail ? (
              /* `whitespace-pre-wrap`: a year of ClickUp comments is plain
                 text whose line breaks carry the meaning. */
              <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                {post.detail}
                {post.edited && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">(edited)</span>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* The action bar: reactions on the left, Reply on the right, above a
          hairline inside the card — ClickUp's arrangement exactly. A file or a
          completion has no activity id, so there is nothing to react to and
          nothing to reply to; the bar is simply absent rather than disabled. */}
      {post.id !== null && (
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {/* Thumbs-up is its own control, because it is the one people use. */}
          <button
            type="button"
            disabled={react.isPending}
            onClick={() => postId !== null && react.mutate({ postId, emoji: "👍" })}
            aria-pressed={!!thumbs?.mine}
            aria-label={thumbs?.mine ? "Remove your thumbs up" : "Thumbs up"}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              thumbs?.mine
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {thumbs && <span className="font-semibold">{thumbs.count}</span>}
          </button>

          <Reactions
            post={post}
            busy={react.isPending}
            onReact={(emoji) => postId !== null && react.mutate({ postId, emoji })}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Offered only where the database would allow it — `mine` is its
              answer, not a guess made here, so the control and the rule
              cannot disagree. */}
          {post.mine && !editing && (
            <>
              <button
                type="button"
                onClick={() => { setEditDraft(post.detail ?? ""); setEditing(true); }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              {confirming ? (
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">Delete?</span>
                  <button
                    type="button"
                    onClick={() => void doDelete()}
                    disabled={remove.isPending}
                    className="font-semibold text-status-danger transition-opacity hover:opacity-80 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {remove.isPending ? "Deleting…" : "Yes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reply
          </button>
        </div>
      </div>
      )}

      {replying && (
        <div className="border-t border-border p-3">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter breaks the line — ClickUp's rule. */
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault(); void send();
              }
              if (e.key === "Escape") { setReplying(false); setDraft(""); }
            }}
            placeholder="Reply…"
            className="w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-1.5 flex items-center gap-2">
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

      {post.replies.length > 0 && (
        <div className="space-y-2 border-t border-border bg-muted/30 p-2">
          {post.replies.map((r) => (
            <Post key={r.id} post={r} clientId={clientId} organizationId={organizationId} depth={depth + 1} />
          ))}
        </div>
      )}
    </article>
  );
}

export function ClientActivityRail({
  clientId, organizationId, composer,
}: {
  clientId: string;
  organizationId: string | null;
  /** The existing composer, pinned to the top as Dee asked. */
  composer: React.ReactNode;
}) {
  const posts = useClientPosts(clientId);
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => posts.data ?? [], [posts.data]);

  /* Filtered in the browser over one fetch. Four tabs that each hit the
     network is the waterfall rule 14 forbids, and the whole feed for one
     client is small. */
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || f.kinds.length === 0) return rows;
    return rows.filter((r) => f.kinds.includes(r.kind));
  }, [rows, filter]);

  /* Grouped by day, in the order the feed already came back — newest first,
     so the day headings run backwards from Today. */
  const days = useMemo(() => {
    const out: { label: string; items: ClientPost[] }[] = [];
    for (const item of shown) {
      const label = dayLabel(item.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [shown]);

  const countFor = (id: string) => {
    const f = FILTERS.find((x) => x.id === id);
    if (!f || f.kinds.length === 0) return rows.length;
    return rows.filter((r) => f.kinds.includes(r.kind)).length;
  };

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-bold text-foreground">Activity</h2>
        {rows.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </header>

      {/* The composer sits at the TOP. ClickUp puts it at the foot of the
          column; Dee asked for it up here, where it is reachable without
          scrolling a year of history first. */}
      <div className="border-b border-border p-3">{composer}</div>

      <div role="tablist" aria-label="Filter the activity"
        className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {FILTERS.map((f) => {
          const on = f.id === filter;
          const n = countFor(f.id);
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.id)}
              /* A filter that would empty the column is still offered, with a
                 zero on it: "no files on this client" is an answer, and a tab
                 that vanishes makes somebody wonder where it went. */
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
              {n > 0 && <span className={cn("ml-1", on ? "opacity-80" : "text-muted-foreground")}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {posts.isLoading ? (
          /* Skeletons, not "nothing here": a false empty on a file with a year
             of history is the one thing worse than waiting. */
          <div className="space-y-3" aria-label="Loading the activity">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.isError ? (
          <p className="text-xs text-status-danger">
            The activity could not be loaded. {(posts.error as Error).message}
          </p>
        ) : days.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {rows.length === 0
              ? "Nothing here yet. Anything written above stays on this client."
              : `Nothing under ${FILTERS.find((f) => f.id === filter)?.label}.`}
          </p>
        ) : (
          days.map((day) => (
            <section key={day.label} className="mb-3 last:mb-0">
              {/* Sticky, so the day you are reading stays named while you
                  scroll through it. */}
              <h3 className="sticky top-0 z-20 -mx-3 mb-2 border-b border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
                {day.label}
              </h3>
              <div className="space-y-2">
                {day.items.map((p) => (
                  <Post
                    key={p.id ?? `${p.kind}:${p.at}:${p.title}`}
                    post={p}
                    clientId={clientId}
                    organizationId={organizationId}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
