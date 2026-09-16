/**
 * Unsent messages, kept per conversation.
 *
 * Dee asked for a Drafts item in HOME. It was left out of the first pass
 * deliberately, because the composer held its draft in React state and lost it
 * the moment you clicked another conversation — a Drafts list over that would
 * have opened on nothing, every time. This is the missing half.
 *
 * ── WHY LOCALSTORAGE AND NOT A TABLE ───────────────────────────────────────
 *
 * A draft is a half-finished thought on one device. It is not a record of
 * anything that happened, nobody else may read it, and it must never be
 * something the database has to keep consistent — synchronising drafts across
 * tabs is a feature with no user asking for it and a surprising number of ways
 * to lose somebody's typing. The moment a draft becomes a message it becomes
 * canonical, and that path is unchanged.
 *
 * Every access is guarded: a private window, cleared site data or a preview
 * can make `localStorage` throw, and losing a draft is bad but throwing while
 * somebody types is worse.
 */
const KEY = "bes.communication.drafts";

export interface StoredDraft {
  channelId: string;
  text: string;
  savedAt: string;
}

type DraftMap = Record<string, StoredDraft>;

function readAll(): DraftMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as DraftMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: DraftMap): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* Storage full or blocked. The draft stays in the composer either way. */
  }
}

export function readDraft(channelId: string): string {
  return readAll()[channelId]?.text ?? "";
}

/**
 * Whitespace is not a draft. Saving "   " would put a conversation in the
 * Drafts list that looks unfinished and contains nothing, so an empty or
 * blank draft REMOVES the entry rather than storing it.
 */
export function saveDraft(channelId: string, text: string): void {
  const map = readAll();
  if (text.trim() === "") delete map[channelId];
  else map[channelId] = { channelId, text, savedAt: new Date().toISOString() };
  writeAll(map);
}

export function clearDraft(channelId: string): void {
  saveDraft(channelId, "");
}

/** Most recently touched first — the one you are most likely coming back to. */
export function listDrafts(): StoredDraft[] {
  return Object.values(readAll())
    .filter((d) => d && typeof d.text === "string" && d.text.trim() !== "")
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
