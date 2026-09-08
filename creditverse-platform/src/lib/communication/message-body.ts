/**
 * Turning what somebody typed into a document the database can read.
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 *
 * `mentioned_user_ids()` in SQL looks for nodes shaped
 * `{ type: "mention", attrs: { userId } }`. The composer is a plain textarea,
 * so the text has to be turned back into those nodes on the way out. Until it
 * was, the composer sent one flat text node and every @ in the product
 * notified nobody — the notifier was correct and had nothing to read.
 *
 * ── WHY IT IS A PURE FUNCTION AND NOT PART OF THE COMPOSER ─────────────────
 *
 * The interesting cases are all textual and none of them need a browser:
 *
 *   two people whose labels are prefixes of each other ("@Sam" inside
 *   "@Sam Okafor") — longest first, or the shorter one eats the longer one's
 *   text and names the wrong person;
 *
 *   a label the author typed and then deleted — no node, because they took
 *   the name out;
 *
 *   the same person mentioned twice — two nodes, one notification, which the
 *   database already handles by `distinct`;
 *
 *   an email address in the message — never a mention, which is
 *   `mentionQueryAt`'s rule and is why the picker did not open for it either.
 *
 * Every one of those is a test rather than something to notice in review.
 */
import { mentionNode, mentionText, type MentionAttrs } from "@/lib/activity/mentions";
import type { Json } from "@/lib/supabase/database.types";

export interface MessageBody {
  body: Json;
  bodyText: string;
}

interface Segment {
  from: number;
  to: number;
  mention: MentionAttrs;
}

/**
 * Where each picked person's `@Label` actually appears in the final text.
 *
 * Longest label first so a person called "Sam" cannot claim the "@Sam" that
 * begins "@Sam Okafor". Claimed ranges are recorded, so once "@Sam Okafor" is
 * taken, "Sam" looks elsewhere or is dropped.
 */
function locate(text: string, mentions: readonly MentionAttrs[]): Segment[] {
  const claimed: Segment[] = [];
  const byLength = [...mentions].sort((a, b) => b.label.length - a.label.length);

  for (const mention of byLength) {
    const needle = mentionText(mention.label);
    let searchFrom = 0;
    for (;;) {
      const at = text.indexOf(needle, searchFrom);
      if (at === -1) break;
      const to = at + needle.length;
      const overlaps = claimed.some((c) => at < c.to && to > c.from);
      /* A label may only end at a word boundary, so "@Sam" does not match
         inside "@Samantha" when only Sam was picked. */
      const next = text[to] ?? "";
      const boundary = next === "" || !/[\w'-]/.test(next);
      if (!overlaps && boundary) {
        claimed.push({ from: at, to, mention });
        break;
      }
      searchFrom = at + 1;
    }
  }
  return claimed.sort((a, b) => a.from - b.from);
}

/**
 * The document, and the plain text beside it.
 *
 * The text keeps `@Label` verbatim — that is what search reads, what a
 * notification's detail shows, and what every older reader of `body_text`
 * already understands. The nodes are what the trigger reads. Neither is
 * derived from the other at read time, so they cannot drift.
 */
export function buildMessageBody(
  text: string,
  mentions: readonly MentionAttrs[] = [],
): MessageBody {
  const segments = locate(text, mentions);
  const content: Json[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.from > cursor) {
      content.push({ type: "text", text: text.slice(cursor, segment.from) } as Json);
    }
    content.push(mentionNode(segment.mention.userId, segment.mention.label) as unknown as Json);
    cursor = segment.to;
  }
  if (cursor < text.length) {
    content.push({ type: "text", text: text.slice(cursor) } as Json);
  }
  /* A paragraph with no children is not a valid document, and an empty
     message is refused upstream anyway. */
  if (content.length === 0) {
    content.push({ type: "text", text } as Json);
  }

  return {
    body: { type: "doc", content: [{ type: "paragraph", content }] } as Json,
    bodyText: text,
  };
}

/** Whom this text will actually notify, for the composer to show before sending. */
export function effectiveMentions(
  text: string,
  mentions: readonly MentionAttrs[],
): MentionAttrs[] {
  const seen = new Set<string>();
  return locate(text, mentions)
    .map((s) => s.mention)
    .filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)));
}


export type BodyPart =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; userId: string; isMe: boolean };

/**
 * The message text, cut into the runs a reader should see differently.
 *
 * Reading it back out of the text rather than out of the document, because
 * the document is the authoring format and the read path deliberately does
 * not return it (0208). The named people DO come back, so the runs are found
 * the same way they were written: by the exact `@Label`, longest first, with
 * claimed ranges respected. That symmetry is the point — anything the builder
 * turned into a node, this turns back into a highlight, and nothing else gets
 * highlighted by accident.
 *
 * A colleague called Mark does not make the word "mark" in "mark it done"
 * light up, because "mark" is not "@Mark".
 */
export function splitBody(
  text: string,
  mentions: readonly MentionAttrs[],
  meUserId?: string | null,
): BodyPart[] {
  const segments = locate(text, mentions);
  if (segments.length === 0) return text ? [{ kind: "text", text }] : [];

  const parts: BodyPart[] = [];
  let cursor = 0;
  for (const segment of segments) {
    if (segment.from > cursor) {
      parts.push({ kind: "text", text: text.slice(cursor, segment.from) });
    }
    parts.push({
      kind: "mention",
      text: text.slice(segment.from, segment.to),
      userId: segment.mention.userId,
      isMe: !!meUserId && segment.mention.userId === meUserId,
    });
    cursor = segment.to;
  }
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}
