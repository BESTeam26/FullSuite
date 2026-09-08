/**
 * The composer.
 *
 * Enter sends, Shift+Enter is a new line, and the message is in the list
 * before the request comes back (§42, §46). Emoji from a local array rather
 * than a library (§19). An attachment is uploaded after the message exists,
 * because it hangs off the message's id.
 *
 * §38: when the Professional Messaging Guard refuses a message, THE DRAFT
 * STAYS. "Do not erase what they typed" — losing somebody's paragraph because
 * one word in it was blocked would teach them to write it somewhere else.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { CornerUpLeft, Loader2, Paperclip, Send, Smile, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMOJI_GROUPS } from "@/lib/communication/emoji";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  /** What the placeholder calls this conversation. */
  name: string;
  disabled?: boolean;
  sending?: boolean;
  /** Set while replying to a specific message. */
  replyingTo?: { id: number; author: string; text: string } | null;
  onCancelReply?: () => void;
  /**
   * Returns whether the message was accepted. FALSE puts the draft back —
   * §38: "Keep the user's draft in the composer so they can edit it. Do not
   * erase what they typed." Clearing optimistically and restoring on refusal
   * keeps the common case instant without costing anybody their paragraph.
   */
  onSend: (text: string, files: File[]) => Promise<boolean>;
  /** Shown when a meeting provider exists to talk to (§66). */
  onMeeting?: () => void;
  error?: string | null;
}

export function Composer({
  name, disabled, sending, replyingTo, onCancelReply, onSend, onMeeting, error,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const text = draft.trim();
    if (!text && files.length === 0) return;
    const keptDraft = draft;
    const keptFiles = files;
    /* Cleared now so sending feels instant (§42), and put back if the send is
       refused — by the guard, or by anything else. */
    setDraft("");
    setFiles([]);
    void onSend(text, keptFiles).then((accepted) => {
      if (!accepted) { setDraft(keptDraft); setFiles(keptFiles); }
    });
  };

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 5));
    e.target.value = "";
  };

  return (
    <div className="border-t border-border p-3">
      {replyingTo && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px]">
          <CornerUpLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Replying to <span className="font-semibold text-foreground">{replyingTo.author}</span>: {replyingTo.text}
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-muted-foreground hover:text-status-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" aria-label="Emoji" aria-expanded={emojiOpen} disabled={disabled}
            onClick={() => setEmojiOpen((v) => !v)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            <Smile className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Attach a file" disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            <Paperclip className="h-4 w-4" />
          </button>
          {onMeeting && (
            <button type="button" aria-label="Start or schedule a meeting" disabled={disabled}
              onClick={onMeeting}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
              <Video className="h-4 w-4" />
            </button>
          )}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={addFiles}
            aria-hidden tabIndex={-1} />
        </div>

        <textarea
          ref={boxRef}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder={`Message ${name}`}
          aria-label={`Message ${name}`}
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        <Button size="sm" onClick={send} disabled={disabled || sending || (!draft.trim() && files.length === 0)}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Send</span>
        </Button>
      </div>

      {emojiOpen && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-border bg-card p-2">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label} className="mb-1.5 last:mb-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-0.5">
                {g.emoji.map((e) => (
                  <button key={e} type="button" aria-label={`Insert ${e}`}
                    onClick={() => { setDraft((d) => d + e); boxRef.current?.focus(); }}
                    className="rounded px-1 py-0.5 text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        /* The guard's refusal lands here, with the draft still above it. */
        <p role="alert" className={cn("mt-1.5 rounded-lg px-2.5 py-1.5 text-xs",
                                       "border border-status-danger/30 bg-status-danger/10 text-status-danger")}>
          {error}
        </p>
      )}
    </div>
  );
}
