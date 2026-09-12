/**
 * Turning what somebody pastes from ClickUp into a reference we can import.
 *
 * Dee, 2026-09-12: "I need just to give it the link and not just number."
 * Nobody has the numeric list id to hand — what you have is the address bar,
 * and asking an operator to dig an id out of it is asking them to do the
 * computer's job.
 *
 * ── THE SHAPES CLICKUP PRODUCES ────────────────────────────────────────────
 *
 *   /25798251/v/li/901818050151     a LIST, id in the URL
 *   /25798251/v/l/rk9kb-14078       a VIEW of a list, hashed id
 *   /25798251/v/lb/901818050151     a board view of a list
 *   /25798251/v/b/901818050151      an older board form
 *
 * Only the first three matter in practice, and the difference between them is
 * the point: a `/v/li/` URL carries the list id itself, while `/v/l/` carries
 * a VIEW id that only ClickUp can turn into a list. So the parse says which
 * kind it found and the import resolves a view when it has to, rather than
 * this file guessing and being confidently wrong.
 *
 * A bare number still works — it is a list id, which is what the field held
 * before — so nothing that was already linked has to be re-entered.
 *
 * ── WHY THIS IS NOT A REGEX AT THE CALL SITE ───────────────────────────────
 *
 * A wrong id here does not fail loudly. It silently imports somebody else's
 * clients into this partner. That is worth a tested function: "Approve with
 * Tiff" had the CreditOps SPACE id stored as its list, and the only way to
 * notice was to look the list up by hand.
 */

export interface ClickUpListRef {
  kind: "list" | "view";
  id: string;
  /** How it is stored on the partner: `clickup:list:…` / `clickup:view:…`. */
  ref: string;
}

const LIST_IN_URL = /\/v\/(?:li|lb|b)\/([0-9]+)/i;
const VIEW_IN_URL = /\/v\/l\/([A-Za-z0-9_-]+)/i;
/* A list id pasted on its own. ClickUp ids are long; a short number is far
   more likely to be a typo than an id, and importing from a typo is worse
   than refusing it. */
const BARE_LIST_ID = /^[0-9]{6,}$/;

export function parseClickUpListRef(input: string): ClickUpListRef | null {
  const text = (input ?? "").trim();
  if (!text) return null;

  const bare = text.replace(/\s/g, "");
  if (BARE_LIST_ID.test(bare)) return { kind: "list", id: bare, ref: `clickup:list:${bare}` };

  /* Already stored in our own form — accepted so re-pasting what the screen
     shows does not fail. */
  const stored = /^clickup:(list|view):([A-Za-z0-9_-]+)$/i.exec(bare);
  if (stored) {
    const kind = stored[1].toLowerCase() as "list" | "view";
    return { kind, id: stored[2], ref: `clickup:${kind}:${stored[2]}` };
  }

  if (!/clickup\.com/i.test(text)) return null;

  const list = LIST_IN_URL.exec(text);
  if (list) return { kind: "list", id: list[1], ref: `clickup:list:${list[1]}` };

  const view = VIEW_IN_URL.exec(text);
  if (view) return { kind: "view", id: view[1], ref: `clickup:view:${view[1]}` };

  return null;
}

/** What the operator should see once a link is understood. */
export function describeClickUpRef(ref: ClickUpListRef): string {
  return ref.kind === "list"
    ? `ClickUp list ${ref.id}`
    : `ClickUp view ${ref.id} — the list behind it is resolved when the import runs`;
}

/** Read a stored reference back. Returns null for anything unrecognised. */
export function readStoredRef(stored: string | null | undefined): ClickUpListRef | null {
  return stored ? parseClickUpListRef(stored) : null;
}
