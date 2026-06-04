import { createClient } from "@insforge/sdk";

// ── InsForge credentials — read from env (injected by Vite at build time) ────
const BASE_URL = import.meta.env.VITE_INSFORGE_BASE_URL ?? "https://bh9n4s8r.us-east.insforge.app";
const API_KEY  = import.meta.env.VITE_INSFORGE_API_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo";

// ── InsForge data client (database + realtime) ────────────────────────────────
// Short timeout so the app falls back to local /api/* endpoints quickly
// instead of waiting the full 30s SDK default when InsForge is unreachable.
export const insforge = createClient({ baseUrl: BASE_URL, anonKey: API_KEY, timeout: 5000, retryCount: 0 });
export const insforgeData = insforge;

// ── Local Auth API ────────────────────────────────────────────────────────────
const SESSION_KEY = "wids_session_token";

function getStoredToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export interface LocalUser { id: string; email: string; name?: string; }

export const localAuth = {
  async signUp(email: string, password: string, name?: string) {
    const res = await fetch("/api/local-auth/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Sign up failed");
    return data as { requireEmailVerification: boolean; email: string; devOtp: string };
  },
  async signIn(email: string, password: string) {
    const res = await fetch("/api/local-auth/signin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Sign in failed");
    return data as { requireOtp: boolean; email: string; devOtp: string };
  },
  async verifyOtp(email: string, otp: string) {
    const res = await fetch("/api/local-auth/verify-otp", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Verification failed");
    setStoredToken(data.accessToken);
    return data as { accessToken: string; user: LocalUser };
  },
  async resendOtp(email: string) {
    const res = await fetch("/api/local-auth/resend-otp", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to resend code");
    return data as { sent: boolean; devOtp: string };
  },
  async getCurrentUser(): Promise<LocalUser | null> {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/local-auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setStoredToken(null); return null; }
      return (await res.json()).user as LocalUser;
    } catch { return null; }
  },
  async signOut() {
    const token = getStoredToken();
    if (token) fetch("/api/local-auth/signout", {
      method: "POST", headers: { authorization: `Bearer ${token}` },
    }).catch(() => {});
    setStoredToken(null);
  },
  getToken(): string | null { return getStoredToken(); },
};
