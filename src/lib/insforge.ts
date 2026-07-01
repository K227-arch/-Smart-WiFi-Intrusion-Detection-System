import { createClient } from "@insforge/sdk";

// ── InsForge credentials — read from env (injected by Vite at build time) ────
const BASE_URL = import.meta.env.VITE_INSFORGE_BASE_URL ?? "https://bh9n4s8r.us-east.insforge.app";
const ANON_KEY = import.meta.env.VITE_INSFORGE_API_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo";

// ── InsForge SDK client ───────────────────────────────────────────────────────
export const insforge = createClient({
  baseUrl: BASE_URL,
  anonKey: ANON_KEY,
  timeout: 8000,
  retryCount: 1,
});

export const insforgeData = insforge;

// ── localAuth — thin wrapper around InsForge auth SDK ─────────────────────────
// Using InsForge's own auth system so it works on Vercel, locally, and Electron.
// requireEmailVerification is disabled in the dashboard so signUp gives a token immediately.
export interface LocalUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export const localAuth = {
  async signUp(email: string, password: string, name?: string) {
    const { data, error } = await insforge.auth.signUp({ email, password, name });
    if (error) throw new Error(error.message ?? "Sign up failed");
    // If email verification is required (e.g. SMTP enabled), surface that
    if (data?.requireEmailVerification) {
      return { requireEmailVerification: true, email, devOtp: "" };
    }
    return { requireEmailVerification: false, email, devOtp: "" };
  },

  async signIn(email: string, password: string) {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message ?? "Sign in failed");
    if (!data?.accessToken) throw new Error("Sign in failed — no session returned");
    return { success: true, email };
  },

  async verifyEmail(email: string, otp: string) {
    const { data, error } = await insforge.auth.verifyEmail({ email, otp });
    if (error) throw new Error(error.message ?? "Verification failed");
    return { success: !!data?.accessToken };
  },

  async getCurrentUser(): Promise<LocalUser | null> {
    const { data } = await insforge.auth.getCurrentUser();
    if (!data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.profile?.name ?? undefined,
      avatar_url: data.user.profile?.avatar_url ?? undefined,
    };
  },

  async signOut() {
    await insforge.auth.signOut();
  },
};
