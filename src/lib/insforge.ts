// ── LocalUser type ────────────────────────────────────────────────────────────
export interface LocalUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

// ── Auth state ───────────────────────────────────────────────────────────────
let authToken: string | null = null;

function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("wids_token", token);
  } else {
    localStorage.removeItem("wids_token");
  }
}

function getStoredToken(): string | null {
  if (authToken) return authToken;
  return localStorage.getItem("wids_token");
}

// ── localAuth — uses local server endpoints (JSON file storage) ───────────────
export const localAuth = {
  async signUp(email: string, password: string, name?: string) {
    const res = await fetch("/api/local-auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Sign up failed");
    return {
      requireEmailVerification: !!data.requireEmailVerification,
      devOtp: data.devOtp ?? "",
    };
  },

  async signIn(email: string, password: string) {
    const res = await fetch("/api/local-auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Invalid email or password");
    if (data.token) setAuthToken(data.token);
    return { requireOtp: !!data.requireOtp, devOtp: data.devOtp ?? "" };
  },

  async verifyOtp(email: string, otp: string) {
    const res = await fetch("/api/local-auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Verification failed");
    if (data.accessToken) setAuthToken(data.accessToken);
    return { user: { id: data.user?.id ?? "", email } };
  },

  async resendOtp(email: string) {
    const res = await fetch("/api/local-auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to resend code");
    return { sent: true, devOtp: data.devOtp ?? "" };
  },

  async getCurrentUser(): Promise<LocalUser | null> {
    const token = getStoredToken();
    if (!token) return null;

    const res = await fetch("/api/local-auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) setAuthToken(null);
      return null;
    }
    const data = await res.json();
    return { id: data.user?.id ?? "", email: data.user?.email ?? "", name: data.user?.name, avatar_url: data.user?.avatar_url };
  },

  async signOut() {
    const token = getStoredToken();
    if (token) {
      await fetch("/api/local-auth/signout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setAuthToken(null);
  },

  getToken(): string | null { return getStoredToken(); },
};

// Supabase client for database operations (exported for use in hooks)
export { supabaseClient } from "./supabase";