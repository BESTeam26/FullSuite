/**
 * Emoji for the composer and for reactions.
 *
 * Dee, §19: "Do not load an enormous blocking library into the initial page if
 * avoidable. Support standard Unicode emojis."
 *
 * So this is an array, not a dependency. A full picker is a megabyte of
 * metadata and a network request to render a control most people use six
 * emoji from; these are the six, plus a modest palette behind the button.
 * Nothing here is loaded from anywhere.
 */

/** What the hover bar offers — the ones a team actually uses at work (§20). */
export const QUICK_REACTIONS = ["👍", "✅", "👀", "🎉", "❤️", "😂"] as const;

export interface EmojiGroup {
  label: string;
  emoji: readonly string[];
}

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  { label: "Reactions", emoji: ["👍", "👎", "✅", "❌", "👀", "🙏", "🙌", "👏", "💯", "🔥", "🎉", "⭐"] },
  { label: "Faces", emoji: ["🙂", "😀", "😅", "😂", "🥲", "😉", "😊", "😍", "🤔", "😐", "😴", "😬", "😕", "😢", "😡", "🤯"] },
  { label: "Work", emoji: ["📌", "📎", "📄", "📊", "📈", "📉", "🗓️", "⏰", "⌛", "✉️", "📞", "💬", "🔗", "🔍", "⚠️", "🚀"] },
  { label: "Status", emoji: ["🟢", "🟡", "🔴", "⚪", "✔️", "➕", "➖", "❓", "❗", "💡", "🔒", "🔓"] },
];
