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

export function invitationProblem(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = raw.trim();
  if (!text || INTERNAL.test(text)) return "This invitation link is not valid, or it has already been used.";
  return text;
}
