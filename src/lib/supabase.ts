/**
 * SALAMANDA WIDS - Supabase Client (frontend only)
 * Uses VITE_ prefixed env vars — safe to bundle in browser
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? "https://kuntnvlvyuqetiorvlve.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string ?? "";

// Only used if Supabase is reachable — app works without it via local API
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
