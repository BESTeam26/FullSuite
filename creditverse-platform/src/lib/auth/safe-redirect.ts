/**
 * Where to send someone after they sign in.
 *
 * The destination travels in a URL (`?next=…`) or in router state, so it is
 * attacker-controllable: a link like `?next=https://evil.example` would turn
 * our own login page into a redirector that carries our brand. Only a path
 * inside this application is ever honoured.
 *
 * Rejected on purpose:
 *   • anything that is not path-rooted        — `https://…`, `evil.example`
 *   • `//host`                                — protocol-relative, another origin
 *   • `/\host` and `/%2f…`                    — the same trick, browser- or
 *                                               server-decoded later
 */
const FALLBACK = "/app";

export function safeRedirectPath(value: string | null | undefined, fallback = FALLBACK): string {
  if (!value) return fallback;
  const path = value.trim();
  if (!path.startsWith("/")) return fallback;
  /* Second character decides whether this is still our origin. */
  const second = path.slice(1, 2);
  if (second === "/" || second === "\\") return fallback;
  if (/^\/%2f/i.test(path) || /^\/%5c/i.test(path)) return fallback;
  return path;
}
