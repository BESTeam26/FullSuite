/**
 * One conversation, wherever it is being read from.
 *
 * Dee: "one record only per channel, even DM's. And portal message."
 *
 * That rule is kept in the database — a partner conversation is a single
 * `channels` row with two audiences. This component is the other half of it:
 * ONE piece of UI for reading and replying, used by the BES Communication
 * screen and by the partner portal. Two copies of a message list is how a
 * reply ends up formatted, ordered or attributed differently depending on who
 * is looking at the same exchange.
 *
 * It fetches only the open channel's messages and nothing else (rule 14).
 */
import { useState, type ReactNode } from "react";
import { Hash, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { useMessages, usePostMessage } from "@/lib/data/use-channels";

export interface ConversationPaneProps {
  channelId: string;
  name: string;
  purpose?: string | null;
  /** Said above the conversation: who else can read what you are about to type. */
  notice?: ReactNode;
  /** What an empty conversation says. */
  emptyLabel?: string;
}

export function ConversationPane({
  channelId, name, purpose, notice, emptyLabel = "Nothing here yet. Say something.",
}: ConversationPaneProps) {
  const auth = useAuth();
  const messages = useMessages(channelId);
  const post = usePostMessage(channelId, auth.user?.id ?? null);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    /* Same rich-text shape as an activity note, so mentions work unchanged. */
    post.mutate(
      { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, bodyText: text },
      { onSuccess: () => setDraft("") },
    );
  };

  return (
    <>
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Hash className="h-4 w-4 text-muted-foreground" /> {name}
        </h2>
        {purpose && <p className="text-xs text-muted-foreground">{purpose}</p>}
        {notice}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (messages.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          (messages.data ?? []).map((m) => (
            <article key={m.id} className="text-sm">
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold text-foreground">{m.authorName}</span>
                {m.fromBes && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    BES team
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{formatDate(m.createdAt)}</span>
              </p>
              <p className="whitespace-pre-wrap text-foreground">{m.bodyText}</p>
            </article>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder={`Message ${name}`}
            aria-label={`Message ${name}`}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button size="sm" onClick={send} disabled={post.isPending || !draft.trim()}>
            {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send</span>
          </Button>
        </div>
        {post.isError && (
          <p role="alert" className="mt-1.5 text-xs text-status-danger">
            {(post.error as Error).message}
          </p>
        )}
      </div>
    </>
  );
}
