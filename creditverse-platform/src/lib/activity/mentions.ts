/**
 * Mentions inside a note body.
 *
 * A mention is a node — `{ type: "mention", attrs: { userId, label } }` — not
 * a string to be re-parsed later, so who was named is a fact in the document
 * rather than a guess from text. The plain-text `detail` keeps `@Label`, which
 * is why search, older rows and every existing reader keep working.
 *
 * Nothing here decides who may be mentioned or who gets notified: the picker
 * offers only people already in scope, and the database decides the
 * notification against the same visibility rule that governs reading. This
 * module is only the shape and the reading of it.
 */
import { isNoteDoc, type NoteDoc, type NoteNode } from "@/lib/activity/note-body";

export const MENTION_NODE = "mention";

export interface MentionAttrs {
  userId: string;
  label: string;
}

export function mentionNode(userId: string, label: string): NoteNode {
  return { type: MENTION_NODE, attrs: { userId, label } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A node is a usable mention only with a real id and a label to show. */
export function readMention(node: NoteNode): MentionAttrs | null {
  if (node.type !== MENTION_NODE) return null;
  const userId = String(node.attrs?.userId ?? "");
  const label = String(node.attrs?.label ?? "").trim();
  if (!UUID.test(userId) || !label) return null;
  return { userId, label };
}

function walk(nodes: NoteNode[] | undefined, visit: (node: NoteNode) => void): void {
  for (const node of nodes ?? []) {
    visit(node);
    walk(node.content, visit);
  }
}

/** Every distinct person named in a body, in the order they first appear. */
export function mentionedUserIds(body: unknown): string[] {
  if (!isNoteDoc(body)) return [];
  const out: string[] = [];
  walk((body as NoteDoc).content, (node) => {
    const mention = readMention(node);
    if (mention && !out.includes(mention.userId)) out.push(mention.userId);
  });
  return out;
}

/** The same people, with the labels the author saw when they wrote it. */
export function mentionsIn(body: unknown): MentionAttrs[] {
  if (!isNoteDoc(body)) return [];
  const seen = new Set<string>();
  const out: MentionAttrs[] = [];
  walk((body as NoteDoc).content, (node) => {
    const mention = readMention(node);
    if (mention && !seen.has(mention.userId)) {
      seen.add(mention.userId);
      out.push(mention);
    }
  });
  return out;
}

/**
 * How a mention reads in the plain-text copy. Kept in one place so the text
 * written to `detail` and the text a picker inserts never drift.
 */
export function mentionText(label: string): string {
  return `@${label}`;
}

/**
 * The word being typed after an "@", or null when the caret is not in one.
 * Pure so the trigger rule is testable without an editor: an "@" only starts
 * a mention at the start of the text or after whitespace, and the search ends
 * at whitespace, so an email address never opens the picker.
 */
export function mentionQueryAt(text: string, caret: number): { query: string; from: number } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const before = at === 0 ? "" : upto[at - 1];
  if (before && !/\s/.test(before)) return null;
  const query = upto.slice(at + 1);
  if (/\s/.test(query)) return null;
  if (query.length > 40) return null;
  return { query, from: at };
}

/** Ranks people for the picker: name start, then any part, then email. */
export function rankMentionCandidates<T extends { name: string; email?: string | null }>(
  people: T[],
  query: string,
  limit = 6,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  const score = (p: T): number => {
    const name = p.name.toLowerCase();
    const email = (p.email ?? "").toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    if (email.startsWith(q)) return 3;
    if (email.includes(q)) return 4;
    return 99;
  };
  return people
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 99)
    .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
