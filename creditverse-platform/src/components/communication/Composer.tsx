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
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AtSign, CornerUpLeft, Loader2, Paperclip, Send, Smile, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionPicker, type MentionCandidate } from "@/components/composer/MentionPicker";
import { mentionQueryAt, mentionText, type MentionAttrs } from "@/lib/activity/mentions";
import { effectiveMentions } from "@/lib/communication/message-body";
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
  onSend: (text: string, files: File[], mentions: MentionAttrs[]) => Promise<boolean>;
  /**
   * Who may be mentioned here. Comes from `channel_mentionable()`, which is
   * the set form of the predicate the notifier asks — so the picker cannot
   * offer somebody the notification will skip (§27).
   */
  mentionable?: readonly MentionCandidate[];
  /** Shown when a meeting provider exists to talk to (§66). */
  onMeeting?: () => void;
  error?: string | null;
}

export function Composer({
  name, disabled, sending, replyingTo, onCancelReply, onSend, onMeeting, error,
  mentionable = [],
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /* Everybody picked from the "@" list so far. Whether each is ACTUALLY
     mentioned is decided from the text at send time, so deleting the label
     un-mentions the person without any bookkeeping here. */
  const [picked, setPicked] = useState<MentionAttrs[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ query: string; from: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  /* Shown under the box, so the author can see who will be told before they
     press Enter rather than after. */
  const willNotify = useMemo(() => effectiveMentions(draft, picked), [draft, picked]);

  const readDraft = (value: string, caret: number) => {
    setDraft(value);
    setMentionQuery(mentionable.length > 0 ? mentionQueryAt(value, caret) : null);
  };

  /* Replaces the "@partial" the caret is in with "@Full Name ", which is the
     exact string `buildMessageBody` looks for on the way out. */
  const pick = (person: MentionCandidate) => {
    if (!mentionQuery) return;
    const label = person.name;
    const before = draft.slice(0, mentionQuery.from);
    const after = draft.slice(mentionQuery.from + 1 + mentionQuery.query.length);
    const inserted = `${mentionText(label)} `;
    const next = `${before}${inserted}${after}`;
    setDraft(next);
    setPicked((prev) =>
      prev.some((m) => m.userId === person.userId) ? prev : [...prev, { userId: person.userId, label }]);
    setMentionQuery(null);
    const caret = before.length + inserted.length;
    requestAnimationFrame(() => {
      boxRef.current?.focus();
      boxRef.current?.setSelectionRange?.(caret, caret);
    });
  };

  const send = () => {
    const text = draft.trim();
    if (!text && files.length === 0) return;
    const keptDraft = draft;
    const keptFiles = files;
    /* Cleared now so sending feels instant (§42), and put back if the send is
       refused — by the guard, or by anything else. */
    setDraft("");
    setFiles([]);
    const keptPicked = picked;
    const mentions = effectiveMentions(keptDraft, picked);
    setPicked([]);
    setMentionQuery(null);
    void onSend(text, keptFiles, mentions).then((accepted) => {
      if (!accepted) { setDraft(keptDraft); setFiles(keptFiles); setPicked(keptPicked); }
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

      <div className="relative flex items-end gap-1.5">
        {mentionQuery && (
          <MentionPicker
            query={mentionQuery.query}
            people={mentionable.map((p) => ({ ...p }))}
            onPick={pick}
            onDismiss={() => setMentionQuery(null)}
          />
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" aria-label="Emoji" aria-expanded={emojiOpen} disabled={disabled}
            onClick={() => setEmojiOpen((v) => !v)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            <Smile className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Mention someone" disabled={disabled || mentionable.length === 0}
            onClick={() => {
              /* The same thing typing "@" does, for anybody who would rather
                 press a button — and it has to insert the character so the
                 caret is inside a mention word. */
              const next = draft.length === 0 || /\s$/.test(draft) ? `${draft}@` : `${draft} @`;
              setDraft(next);
              setMentionQuery(mentionQueryAt(next, next.length));
              requestAnimationFrame(() => boxRef.current?.focus());
            }}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            <AtSign className="h-4 w-4" />
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
          onChange={(e) => readDraft(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onClick={(e) => readDraft(draft, (e.target as HTMLTextAreaElement).selectionStart ?? draft.length)}
          onKeyUp={(e) => {
            /* The caret moves without the value changing — arrow keys, Home.
               Re-reading it here is what closes the picker when somebody
               navigates out of the "@" word. */
            const el = e.target as HTMLTextAreaElement;
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              setMentionQuery(mentionable.length > 0
                ? mentionQueryAt(el.value, el.selectionStart ?? el.value.length) : null);
            }
          }}
          onKeyDown={(e) => {
            /* While the picker is open it owns Enter, Tab, the arrows and
               Escape — otherwise Enter would send "@Row" as a message
               instead of choosing Rowell. */
            if (mentionQuery && ["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"].includes(e.key)) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
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

      {willNotify.length > 0 && (
        /* Said before Enter, not after: who is about to be pinged. */
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">
          Will notify {willNotify.map((m) => m.label).join(", ")}
        </p>
      )}

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
