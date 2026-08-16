import { createClient } from "@insforge/sdk";

// ── InsForge backend credentials ──────────────────────────────────────────────
// Base URL: your InsForge project endpoint
// Anon key: public key for unauthenticated/client-side requests
const BASE_URL = import.meta.env.VITE_INSFORGE_BASE_URL ?? "https://bh9n4s8r.us-east.insforge.app";
const ANON_KEY = import.meta.env.VITE_INSFORGE_API_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo";

// ── SDK client ────────────────────────────────────────────────────────────────
// timeout: 35s handles InsForge cold starts (container may sleep after inactivity)
// retryCount: 2 retries on transient network errors
export const insforge = createClient({
  baseUrl: BASE_URL,
  anonKey: ANON_KEY,
  timeout: 35000,
  retryCount: 2,
});

export const insforgeData = insforge;

// ── LocalUser type ────────────────────────────────────────────────────────────
export interface LocalUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

// ── localAuth — wraps InsForge SDK auth for use across the app ────────────────
// All auth goes through InsForge. Both local dev and Vercel use the same
// InsForge backend at https://bh9n4s8r.us-east.insforge.app
export const localAuth = {
  async signUp(email: string, password: string, name?: string) {
    const { data, error } = await insforge.auth.signUp({ email, password, name });
    if (error) throw new Error(error.message ?? "Sign up failed");
    return {
      requireEmailVerification: !!data?.requireEmailVerification,
      devOtp: "",
    };
  },

  async signIn(email: string, password: string) {
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message ?? "Invalid email or password");
    if (!data?.accessToken) throw new Error("Sign in failed — no session returned");
    return { requireOtp: false, devOtp: "" };
  },

  async verifyOtp(email: string, otp: string) {
    const { data, error } = await insforge.auth.verifyEmail({ email, otp });
    if (error) throw new Error(error.message ?? "Verification failed");
    return { user: { id: data?.user?.id ?? "", email: data?.user?.email ?? email } };
  },

  async resendOtp(email: string) {
    const { error } = await insforge.auth.resendVerificationEmail({ email });
    if (error) throw new Error(error.message ?? "Failed to resend code");
    return { sent: true, devOtp: "" };
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

  getToken(): string | null { return null }, // SDK manages tokens via httpOnly cookie
};
