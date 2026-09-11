/**
 * Supabase browser client.
 *
 * - `isSupabaseConfigured` is true when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY exist.
 * - `authMode` is "live" when configured (or forced), otherwise "demo" so the app
 *   still boots over seed data without a backend.
 * - The anon key is public by design; Row Level Security governs access.
 *   The service_role key must NEVER be shipped to the browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forcedMode = import.meta.env.VITE_AUTH_MODE as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export type AuthMode = "live" | "demo";

export const authMode: AuthMode =
  forcedMode === "demo"
    ? "demo"
    : forcedMode === "live" || isSupabaseConfigured
      ? "live"
      : "demo";

/**
 * Where an emailed auth link should bring the person back to.
 *
 * The browser's own origin comes FIRST, deliberately. BES is served from more
 * than one hostname — `app.bescrm.net` is canonical, and the original
 * `bes-full-suite.vercel.app` is kept alive — and a build-time constant sends
 * whoever confirms an email out of the door they came in by and in through the
 * other one. It also silently rots the day a domain changes, which is exactly
 * how a confirmation link ends up pointing at a retired host.
 *
 * This is not the security boundary: Supabase refuses any `redirectTo` outside
 * the project's redirect allow-list and falls back to its Site URL, so an
 * origin nobody authorised cannot be smuggled in here. `VITE_SITE_URL` remains
 * for builds with no `window` at all.
 */
export const siteUrl =
  (typeof window !== "undefined" ? window.location.origin : "") ||
  ((import.meta.env.VITE_SITE_URL as string | undefined) ?? "");

export const supabase: SupabaseClient<Database> | null =
  isSupabaseConfigured && url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;

/** Throws a clear error instead of a null dereference when live mode is expected. */
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return supabase;
}
