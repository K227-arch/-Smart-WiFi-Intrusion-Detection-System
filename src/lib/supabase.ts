/**
 * SALAMANDA WIDS — Supabase Client (frontend only)
 *
 * Uses VITE_ prefixed env vars — safe to bundle in the browser.
 * Falls back to the hardcoded project URL so the client is never null,
 * but DB/auth calls will fail gracefully when the key is absent.
 *
 * Usage:
 *   import { supabaseClient } from "@/src/lib/supabase";
 *   const { data, error } = await supabaseClient.from("alerts").select();
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://kuntnvlvyuqetiorvlve.supabase.co";

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";

if (!supabaseAnonKey) {
  console.warn(
    "⚠ VITE_SUPABASE_PUBLISHABLE_KEY not set — Supabase browser client will not authenticate."
  );
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the Supabase session in localStorage so it survives page reloads.
    // The access token from supabaseClient.auth.getSession() can be passed as a
    // Bearer token to any WIDS API endpoint and will be verified via JWKS.
    persistSession: true,
    storageKey: "wids_supabase_session",
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Get the current Supabase access token (for use as a Bearer token in API calls).
 * Returns null when no Supabase session exists (fall back to local auth token).
 */
export async function getSupabaseToken(): Promise<string | null> {
  const { data } = await supabaseClient.auth.getSession();
  return data.session?.access_token ?? null;
}
