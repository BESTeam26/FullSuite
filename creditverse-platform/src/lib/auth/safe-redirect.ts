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
import { siteUrl } from "@/lib/supabase/client";

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

/**
 * The absolute URL an emailed auth link (confirm, magic link, recovery) must
 * come back to. One builder, because the two callers had drifted: password
 * reset from the sign-in page landed on `/auth/callback?type=recovery`, which
 * forwards to Settings so a new password can be set, while the same reset
 * requested from Settings landed on `/login` — where supabase-js consumed the
 * recovery token, signed the person straight in and never asked them for the
 * new password they had just asked for.
 *
 * `next` carries where they were going first, sanitised as a path.
 */
export function authCallbackUrl(options: { recovery?: boolean; next?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (options.recovery) params.set("type", "recovery");
  const next = safeRedirectPath(options.next, "");
  if (next) params.set("next", next);
  const query = params.toString();
  return `${siteUrl}/auth/callback${query ? `?${query}` : ""}`;
}
