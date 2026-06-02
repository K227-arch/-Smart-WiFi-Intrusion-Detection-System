import { createClient } from "@insforge/sdk";

// ── InsForge data client (database + realtime) ────────────────────────────────
// Used by useWidsData for alerts, devices, traffic buckets etc.
// These calls use the anon key and don't require auth cookies.
export const insforge = createClient({
  baseUrl: "https://bh9n4s8r.us-east.insforge.app",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo",
});

// Also export as insforgeData alias (used by useWidsData)
export const insforgeData = insforge;

// ── Local Auth API ────────────────────────────────────────────────────────────
// The InsForge backend is unreachable from this network (WAF/TLS block).
// Auth is handled entirely by the local Express server at /api/local-auth/*.
// Sessions are stored in data/wids-sessions.json.
// OTPs are printed to the server console (dev mode).

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

export interface LocalUser {
  id: string;
  email: string;
  name?: string;
}

export const localAuth = {
  /** Sign up with email + password. Returns { requireEmailVerification, devOtp } */
  async signUp(email: string, password: string, name?: string) {
    const res = await fetch("/api/local-auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Sign up failed");
    return data as { requireEmailVerification: boolean; email: string; devOtp: string };
  },

  /** Sign in with email + password. Returns { requireOtp, devOtp } */
  async signIn(email: string, password: string) {
    const res = await fetch("/api/local-auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Sign in failed");
    return data as { requireOtp: boolean; email: string; devOtp: string };
  },

  /** Verify OTP. On success, stores session token and returns user. */
  async verifyOtp(email: string, otp: string) {
    const res = await fetch("/api/local-auth/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Verification failed");
    setStoredToken(data.accessToken);
    return data as { accessToken: string; user: LocalUser };
  },

  /** Resend OTP to email. */
  async resendOtp(email: string) {
    const res = await fetch("/api/local-auth/resend-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to resend code");
    return data as { sent: boolean; devOtp: string };
  },

  /** Get current user from stored session token. Returns null if not authenticated. */
  async getCurrentUser(): Promise<LocalUser | null> {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/local-auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setStoredToken(null); return null; }
      const data = await res.json();
      return data.user as LocalUser;
    } catch {
      return null;
    }
  },

  /** Sign out — clears session token. */
  async signOut() {
    const token = getStoredToken();
    if (token) {
      fetch("/api/local-auth/signout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setStoredToken(null);
  },

  /** Returns the stored session token (for passing to API calls). */
  getToken(): string | null {
    return getStoredToken();
  },
};
