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

export const siteUrl =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin : "");

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
