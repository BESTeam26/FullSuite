/**
 * What to tell the person when an invitation will not accept.
 *
 * The database raises two sorts of message: ones written for people ("This
 * invitation was sent to a different email address") and ones written for
 * Postgres ("invalid input syntax for type uuid"). Only the first sort is
 * worth showing; the second is noise that reveals internals and helps nobody,
 * so it becomes one plain sentence instead.
 */
const INTERNAL = /invalid input syntax|violates|does not exist|permission denied for|relation "|column "|JSON|syntax error/i;

/**
 * The message, wherever it is.
 *
 * supabase-js rejects with a PostgrestError — a plain object with `message`,
 * NOT an instance of Error. Reading it with `instanceof Error` therefore found
 * nothing and every database refusal collapsed into "this link is not valid",
 * including the one that actually helps: "This invitation was sent to a
 * different email address." On the onboarding path that turned a solvable
 * mistake into a dead end.
 */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "";
}

export function invitationProblem(error: unknown): string {
  const raw = messageOf(error);
  const text = raw.trim();
  if (!text || INTERNAL.test(text)) return "This invitation link is not valid, or it has already been used.";
  return text;
}
