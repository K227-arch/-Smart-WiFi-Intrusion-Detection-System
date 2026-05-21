import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { insforge } from "../lib/insforge";
import { SalamandaLogo } from "../components/SalamandaLogo";

interface LoginPageProps {
  onLogin: () => void;
}

type Mode = "signin" | "signup";

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyPending, setVerifyPending] = useState(false);
  const [otp, setOtp] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: err } = await insforge.auth.signUp({
          email,
          password,
          name,
        });
        if (err) throw new Error(err.message);
        if (data?.requireEmailVerification) {
          setVerifyPending(true);
        } else if (data?.accessToken) {
          onLogin();
        } else {
          // Account created — try signing in directly
          const { data: signInData, error: signInErr } = await insforge.auth.signInWithPassword({ email, password });
          if (signInErr) throw new Error(signInErr.message);
          if (signInData?.accessToken) onLogin();
        }
      } else {
        const { data, error: err } = await insforge.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw new Error(err.message);
        if (data?.accessToken) onLogin();
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await insforge.auth.verifyEmail({ email, otp });
      if (err) throw new Error(err.message);
      if (data?.accessToken) onLogin();
    } catch (err: any) {
      setError(err.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    setError(null);
    setLoading(true);
    try {
      // redirectTo must be the exact URL InsForge will redirect back to after OAuth.
      // Using window.location.href captures the current page (including any path),
      // so the callback always lands back on the login page on Vercel.
      await insforge.auth.signInWithOAuth({
        provider,
        redirectTo: window.location.href.split("?")[0], // strip any stale query params
      });
      // SDK auto-redirects to provider — loading stays true during redirect
    } catch (err: any) {
      setError(err.message ?? "OAuth sign-in failed");
      setLoading(false);
    }
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
          <div className="flex items-center gap-3 mb-3">
            <SalamandaLogo className="h-20 w-20" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-white">
              SALA<span className="text-amber-500">MANDA</span>
            </h1>
            <p className="text-slate-500 text-[10px] mt-1 uppercase tracking-widest font-mono">
              Network Intrusion Detection System
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {verifyPending ? (
            /* Email verification */
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-white font-bold text-lg">Verify your email</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Enter the 6-digit code sent to <span className="text-amber-400">{email}</span>
                </p>
              </div>
              <input
                type="text"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-amber-500 transition-colors"
                required
              />
              {error && (
                <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify Email
              </button>
            </form>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
                {(["signin", "signup"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
                      mode === m
                        ? "bg-amber-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
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
                  <input
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                    required
                  />
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </button>
              </form>

              {/* OAuth */}
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-slate-600 text-xs">or continue with</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleOAuth("github")}
                    className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg py-2.5 text-sm text-slate-300 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    GitHub
                  </button>
                  <button
                    onClick={() => handleOAuth("google")}
                    className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg py-2.5 text-sm text-slate-300 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6 font-mono">
          SALAMANDA NIDS v2.0 — Secured by InsForge
        </p>
      </motion.div>
    </div>
  );
}
