/**
 * What a platform looks like, and how a person is abbreviated.
 *
 * Values rather than components, in their own file so the card stays a
 * component file — and so the calendar, the list view and the campaign page
 * colour a platform the same way without importing each other.
 */

/** One tone per platform, so the calendar's colour means something. */
export const CHANNEL_TONE: Record<string, string> = {
  Facebook: "bg-blue-500/15 text-blue-900 border-blue-500/40",
  Instagram: "bg-pink-500/15 text-pink-900 border-pink-500/40",
  TikTok: "bg-neutral-900/10 text-neutral-900 border-neutral-500/40",
  LinkedIn: "bg-sky-500/15 text-sky-900 border-sky-500/40",
  YouTube: "bg-red-500/15 text-red-900 border-red-500/40",
  Email: "bg-amber-500/15 text-amber-900 border-amber-500/40",
  SMS: "bg-teal-500/15 text-teal-900 border-teal-500/40",
  "Blog / Website": "bg-emerald-500/15 text-emerald-900 border-emerald-500/40",
};

export const DEFAULT_TONE = "bg-violet-500/15 text-violet-900 border-violet-500/40";

/** Two initials, so a card can name the assignee without an avatar request. */
export const initials = (name: string | null): string =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
