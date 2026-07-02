import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { insforge, localAuth } from "../lib/insforge";
import { SalamandaLogo } from "../components/SalamandaLogo";
import { cn } from "../lib/utils";

interface LoginPageProps {
  onLogin: () => void;
}

type Mode = "signin" | "signup";
// After signup with verification required, show OTP entry
type Screen = "credentials" | "verify";

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [screen, setScreen] = useState<Screen>("credentials");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await insforge.auth.signUp({ email, password, name: name || undefined });
        if (err) throw new Error(err.message ?? "Sign up failed");
        
        // If email verification is required, show OTP screen
        if (data?.requireEmailVerification) {
          setScreen("verify");
          setLoading(false);
          return;
        }
        
        // No verification required — sign in immediately with the credentials
        const { data: signInData, error: signInErr } = await insforge.auth.signInWithPassword({ email, password });
        if (signInErr) throw new Error(signInErr.message ?? "Account created but sign in failed. Please sign in manually.");
        if (signInData?.accessToken) {
          onLogin();
        } else {
          // Fallback: account created, ask user to sign in
          setMode("signin");
          setError(null);
          setScreen("credentials");
          // Show success message briefly
          setError("Account created successfully! Please sign in.");
        }
      } else {
        const { data, error: err } = await insforge.auth.signInWithPassword({ email, password });
        if (err) throw new Error(err.message ?? "Invalid email or password");
        if (data?.accessToken) {
          onLogin();
        } else if (data?.requireOtp) {
          // OTP required for sign-in (2FA)
          setScreen("verify");
        }
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed. Please try again.");
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
      if (err) throw new Error(err.message ?? "Verification failed");
      if (data?.accessToken) onLogin();
    } catch (err: any) {
      setError(err.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setScreen("credentials");
    setError(null);
    setOtp("");
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

            {/* ── Credentials screen ── */}
            {screen === "credentials" && (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
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

                <form onSubmit={handleCredentials} className="space-y-4">
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
                        placeholder="admin@example.com"
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
              </motion.div>
            )}

            {/* ── Email verification screen (only if SMTP is enabled in InsForge) ── */}
            {screen === "verify" && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <div className="flex flex-col items-center mb-7">
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                    <Mail className="w-6 h-6 text-amber-400" />
                  </div>
                  <h2 className="text-white font-bold text-lg">Check your email</h2>
                  <p className="text-slate-400 text-sm mt-1.5 text-center">
                    Enter the 6-digit code sent to
                  </p>
                  <p className="text-amber-400 text-sm font-mono font-bold mt-0.5">{email}</p>
                </div>

                <form onSubmit={handleVerify} className="space-y-5">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                    maxLength={6}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-amber-500 transition-colors placeholder-slate-700"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                  />

                  {error && <ErrorBanner message={error} />}

                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify &amp; Sign In
                  </button>

                  <button
                    type="button"
                    onClick={() => { setScreen("credentials"); setError(null); setOtp(""); }}
                    className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors"
                  >
                    ← Back
                  </button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6 font-mono">
          SALAMANDA NIDS v2.0 — Secured by InsForge
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
