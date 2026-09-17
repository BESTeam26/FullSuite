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
import { useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { AtSign, CornerUpLeft, Loader2, Paperclip, Send, Smile, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GifPicker } from "@/components/communication/GifPicker";
import { MentionPicker, type MentionCandidate } from "@/components/composer/MentionPicker";
import { mentionQueryAt, mentionText, type MentionAttrs } from "@/lib/activity/mentions";
import { effectiveMentions } from "@/lib/communication/message-body";
import {
  clearDraft, readDraft as readStoredDraft, saveDraft,
} from "@/lib/communication/drafts";

/** As many as one message carries. The file input enforced this; now everything does. */
const MAX_ATTACHMENTS = 5;

/** A drag carrying files, as opposed to one carrying selected text. */
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
import { EMOJI_GROUPS } from "@/lib/communication/emoji";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  /** What the placeholder calls this conversation. */
  name: string;
  /** Replaces the whole placeholder, for a thread where "Message this thread"
   *  reads like a instruction and "Reply in thread…" reads like the box it is. */
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  /**
   * Returns whether the message was accepted. FALSE puts the draft back —
   * §38: "Keep the user's draft in the composer so they can edit it. Do not
   * erase what they typed." Clearing optimistically and restoring on refusal
   * keeps the common case instant without costing anybody their paragraph.
   */
  onSend: (text: string, files: File[], mentions: MentionAttrs[]) => Promise<boolean>;
  /**
   * Where an unsent draft is kept, or null not to keep one. The conversation's
   * id for a channel; `thread:<rootId>` for a thread, so the two composers on
   * screen at once never overwrite each other.
   */
  draftKey?: string | null;
  /**
   * Who may be mentioned here. Comes from `channel_mentionable()`, which is
   * the set form of the predicate the notifier asks — so the picker cannot
   * offer somebody the notification will skip (§27).
   */
  mentionable?: readonly MentionCandidate[];
  /** Shown when a meeting provider exists to talk to (§66). */
  onMeeting?: () => void;
  error?: string | null;
  /**
   * Told on each keystroke, and told to stop when the message goes. The
   * composer does not know or care that this is Realtime presence — it only
   * reports that somebody is typing here (rule 5: UI does not own the
   * transport).
   */
  onTyping?: () => void;
  onStopTyping?: () => void;
}

export function Composer({
  name, placeholder, disabled, sending, onSend, onMeeting, error,
  mentionable = [], onTyping, onStopTyping, draftKey = null,
}: ComposerProps) {
  /* Seeded from storage so switching conversations and coming back does not
     lose what somebody had typed. */
  const [draft, setDraft] = useState(() => (draftKey ? readStoredDraft(draftKey) : ""));
  const [files, setFiles] = useState<File[]>([]);
  /* Counted, not toggled — see the handlers below. */
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;
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

  /* Every keystroke already passes through here, so this is the one place a
     draft can be persisted without a second listener that could disagree. */
  const rememberDraft = (value: string) => {
    if (draftKey) saveDraft(draftKey, value);
  };

  const readDraft = (value: string, caret: number) => {
    rememberDraft(value);
    setDraft(value);
    setMentionQuery(mentionable.length > 0 ? mentionQueryAt(value, caret) : null);
    /* Emptying the box is not typing — it is giving up on the sentence. */
    if (value.trim().length === 0) onStopTyping?.();
    else onTyping?.();
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
    onStopTyping?.();
    if (draftKey) clearDraft(draftKey);
    void onSend(text, keptFiles, mentions).then((accepted) => {
      /* Refused — put it back, in the box AND in storage, or a rejected send
         would quietly destroy what somebody wrote. */
      if (!accepted) {
        setDraft(keptDraft); setFiles(keptFiles); setPicked(keptPicked);
        if (draftKey) saveDraft(draftKey, keptDraft);
      }
    });
  };

  /** The one place files enter the composer, whoever chose them. */
  const takeFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((f) => [...f, ...incoming].slice(0, MAX_ATTACHMENTS));
  };

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    takeFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  /*
   * PASTE A SCREENSHOT.
   *
   * Dee, 2026-09-16: "screenshots / pasted images". Cmd-Shift-4 then Cmd-V is
   * how most of what BES files gets filed, and it did nothing here.
   *
   * A pasted image arrives as a clipboard item with no name — `image.png` for
   * every one of them, which is unreadable in a list. Naming it by the moment
   * it was pasted at least distinguishes two in the same conversation.
   *
   * Only images are intercepted. Pasting TEXT must keep working normally, so
   * anything that is not a file falls through untouched.
   */
  /** `image/gif` → `gif`. A pasted file kept the right MIME type and was then
   *  named `.png` regardless, so a GIF arrived looking like a screenshot. */
  const extensionFor = (mime: string): string => {
    const known: Record<string, string> = {
      "image/gif": "gif", "image/png": "png", "image/jpeg": "jpg",
      "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg",
    };
    return known[mime] ?? (mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png");
  };

  const named = (file: File): File => {
    if (file.name && !/^image\.(png|jpe?g)$/i.test(file.name)) return file;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new File([file], `Pasted ${stamp}.${extensionFor(file.type)}`, { type: file.type });
  };

  /**
   * A GIF copied from a web page.
   *
   * Dee, 2026-09-17: "I pasted a GIF in the chat but it did not move… It
   * should be GIF and moving or animated still when i paste it."
   *
   * Two things were wrong. The file was renamed `.png` whatever it was, which
   * is fixed above. And the deeper one: when you copy an image from a page,
   * the browser puts a FLATTENED SNAPSHOT on the clipboard as image/png — one
   * frame of the animation, because that is what a screenshot of it is.
   *
   * But it also puts the original markup on the clipboard as text/html. So
   * when that names a .gif, the original is fetched and used instead, and the
   * animation survives. If the fetch is refused — a site that blocks
   * cross-origin reads — the pasted frame is used, which is what happened
   * before and is better than nothing.
   */
  const gifFromClipboardHtml = async (html: string): Promise<File | null> => {
    const src = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
    if (!src) return null;
    let url: URL;
    try { url = new URL(src); } catch { return null; }
    /* https only, and only something that claims to be a GIF. A paste is not
       a reason to fetch an arbitrary address. */
    if (url.protocol !== "https:") return null;
    if (!/\.gif(\?|$)/i.test(url.pathname + url.search)) return null;
    try {
      const r = await fetch(url.toString());
      if (!r.ok) return null;
      const blob = await r.blob();
      /* Verified from the response, not from the URL — a path ending .gif
         proves nothing about what came back. Capped, because a paste should
         not pull down 50MB. */
      if (blob.type !== "image/gif" || blob.size > 20 * 1024 * 1024) return null;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return new File([blob], `Pasted ${stamp}.gif`, { type: "image/gif" });
    } catch {
      return null;
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null)
      .map(named);
    /* Guarded: a synthetic paste — and a jsdom one — may carry `items` and no
       `getData` at all, and a crash in a paste handler loses what was typed. */
    const html = typeof e.clipboardData?.getData === "function"
      ? e.clipboardData.getData("text/html") ?? ""
      : "";
    if (images.length === 0 && !/<img/i.test(html)) return;
    e.preventDefault();

    /* The snapshot goes in immediately so the paste feels instant, and is
       swapped for the real GIF if one can be fetched. */
    if (images.length > 0) takeFiles(images);
    if (/<img/i.test(html)) {
      void gifFromClipboardHtml(html).then((gif) => {
        if (!gif) return;
        setFiles((prev) => {
          const withoutSnapshot = images.length > 0
            ? prev.filter((f) => !images.includes(f))
            : prev;
          return [...withoutSnapshot, gif];
        });
      });
    }
  };

  return (
    <div
      className={cn("border-t border-border p-3 transition-colors",
        dragging && "bg-primary/5 ring-2 ring-inset ring-primary/40")}
      /* Drag-and-drop. `dragging` is counted rather than toggled: dragging
         over a child fires dragleave on the parent, so a boolean flickers the
         highlight off while the pointer is still inside. */
      onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setDragDepth((d) => d + 1); } }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={(e) => { if (hasFiles(e)) setDragDepth((d) => Math.max(0, d - 1)); }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth(0);
        if (!disabled) takeFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <p className="mb-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-2.5 py-1.5 text-center text-[11px] font-medium text-primary">
          Drop to attach
        </p>
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
          {/* A GIF becomes an ordinary attachment through the same path a
              dragged file takes — one attachment model, not two. */}
          <GifPicker disabled={disabled} onPick={(file) => takeFiles([file])} />
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
          onPaste={onPaste}
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
          placeholder={placeholder ?? `Message ${name}`}
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
