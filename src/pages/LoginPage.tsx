import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { SalamandaLogo } from "../components/SalamandaLogo";
import { cn } from "../lib/utils";

interface LoginPageProps {
  onLogin: () => void;
}

type Mode = "signin" | "signup";

// ── Local auth helpers — talk directly to Express, no cloud dependency ────────
const LOCAL_TOKEN_KEY = "wids_local_token";

export function getLocalToken(): string | null {
  return localStorage.getItem(LOCAL_TOKEN_KEY);
}

async function localSignIn(email: string, password: string): Promise<void> {
  const res = await fetch("/api/local-auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Sign in failed");
  if (!data.accessToken) throw new Error("No session returned — try again");
  localStorage.setItem(LOCAL_TOKEN_KEY, data.accessToken);
}

async function localSignUp(email: string, password: string, name?: string): Promise<void> {
  const res = await fetch("/api/local-auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Sign up failed");
  if (data.accessToken) {
    localStorage.setItem(LOCAL_TOKEN_KEY, data.accessToken);
  } else {
    // Auto sign-in after signup
    await localSignIn(email, password);
  }
}

export async function checkLocalAuth(): Promise<boolean> {
  const token = getLocalToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/local-auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function localSignOut(): Promise<void> {
  const token = getLocalToken();
  if (token) {
    await fetch("/api/local-auth/signout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    localStorage.removeItem(LOCAL_TOKEN_KEY);
  }
}

// ── Login Page ────────────────────────────────────────────────────────────────
export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await localSignUp(email, password, name || undefined);
      } else {
        await localSignIn(email, password);
      }
      onLogin();
    } catch (err: any) {
      setError(err.message ?? "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.04)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <SalamandaLogo className="h-20 w-20 mb-3" />
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-white">
              SALA<span className="text-amber-500">MANDA</span>
            </h1>
            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-widest font-mono">
              Network Intrusion Detection System
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === "signin" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="p-8"
            >
              {/* Tab switcher */}
              <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
                {(["signin", "signup"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      "flex-1 py-2 text-sm font-semibold rounded-md transition-all",
                      mode === m ? "bg-amber-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {m === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div>
                    <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5 block">
                      Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5 block">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      placeholder="admin@wids.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5 block">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                      required
                      minLength={6}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ShieldCheck className="w-4 h-4" />}
                  {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
                </button>
              </form>

              {mode === "signin" && (
                <p className="text-center text-slate-600 text-xs mt-5 font-mono">
                  Default: admin@wids.local
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6 font-mono">
          SALAMANDA NIDS v2.0 — Local Auth
        </p>
      </motion.div>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {message}
    </motion.div>
  );
}
