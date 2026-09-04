/**
 * A human-readable reason from whatever a failed call threw.
 *
 * Supabase rejects with a `PostgrestError` — a plain object with `message`,
 * `details` and `hint`, not an `Error`. Code that only handled `Error` fell
 * back to a generic string, so "column does not exist" and "permission denied"
 * both reached the user as "Could not post this note", which is the difference
 * between a fixable problem and a mysterious one.
 *
 * Deliberately returns the database's own wording. These surfaces are internal
 * BES tooling, and an operator who can see *why* a write failed can act on it;
 * nothing here is shown to an end client.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    for (const field of [e.message, e.details, e.hint]) {
      if (typeof field === "string" && field.trim()) return field;
    }
  }
  return fallback;
}
