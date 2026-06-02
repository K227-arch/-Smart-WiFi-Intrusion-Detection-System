import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye, EyeOff, Loader2, AlertCircle, Mail, ShieldCheck,
  ArrowLeft, RefreshCw,
} from "lucide-react";
import { localAuth } from "../lib/insforge";
import { SalamandaLogo } from "../components/SalamandaLogo";
import { cn } from "../lib/utils";

interface LoginPageProps {
  onLogin: () => void;
}

// Three distinct screens in the auth flow
type Screen =
  | "credentials"   // email + password (sign-in or sign-up)
  | "otp"           // 2FA code sent to email
  | "set-password"; // only shown during sign-up to collect password before sending OTP

type Mode = "signin" | "signup";

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [screen, setScreen] = useState<Screen>("credentials");

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null); // shown in UI for dev convenience

  // ── Cooldown timer for resend button ──────────────────────────────────────
  function startResendCooldown() {
    setResendCooldown(60);
    const t = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) { clearInterval(t); return 0; }
        return v - 1;
      });
    }, 1000);
  }

  // ── Step 1: Submit credentials ────────────────────────────────────────────
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const result = await localAuth.signUp(email, password, name || undefined);
        setDevOtp(result.devOtp ?? null);
        startResendCooldown();
        setScreen("otp");
      } else {
        const result = await localAuth.signIn(email, password);
        setDevOtp(result.devOtp ?? null);
        startResendCooldown();
        setScreen("otp");
      }
    } catch (err: any) {
      setError(err.message ?? "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await localAuth.verifyOtp(email, otp);
      onLogin();
    } catch (err: any) {
      setError(err.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const result = await localAuth.resendOtp(email);
      setDevOtp(result.devOtp ?? null);
      startResendCooldown();
      setOtp("");
    } catch (err: any) {
      setError(err.message ?? "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  // ── Go back to credentials screen ────────────────────────────────────────
  const handleBack = () => {
    setScreen("credentials");
    setOtp("");
    setError(null);
    setDevOtp(null);
  };

  // ── Switch mode ───────────────────────────────────────────────────────────
  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setOtp("");
    setScreen("credentials");
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <AnimatePresence mode="wait">

            {/* ── Screen: Credentials ── */}
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
                        mode === m
                          ? "bg-amber-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
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
                      Email Address
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
                    {mode === "signin" ? "Continue" : "Create Account"}
                  </button>
                </form>

                {/* 2FA notice */}
                <p className="text-center text-slate-600 text-[10px] mt-5 font-mono leading-relaxed">
                  A one-time verification code will be sent to your email after credentials are confirmed.
                </p>
              </motion.div>
            )}

            {/* ── Screen: OTP ── */}
            {screen === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                {/* Back button */}
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs mb-6 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>

                {/* Icon + heading */}
                <div className="flex flex-col items-center mb-7">
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                    <Mail className="w-6 h-6 text-amber-400" />
                  </div>
                  <h2 className="text-white font-bold text-lg">Check your email</h2>
                  <p className="text-slate-400 text-sm mt-1.5 text-center leading-relaxed">
                    We sent a 6-digit verification code to
                  </p>
                  <p className="text-amber-400 text-sm font-mono font-bold mt-0.5">{email}</p>
                </div>

                <form onSubmit={handleOtp} className="space-y-5">
                  {/* OTP input */}
                  <div>
                    <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2 block text-center">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setOtp(v);
                        setError(null);
                      }}
                      maxLength={6}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-amber-500 transition-colors placeholder-slate-700"
                      required
                      autoFocus
                      autoComplete="one-time-code"
                    />
                  </div>

                  {error && <ErrorBanner message={error} />}

                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <ShieldCheck className="w-4 h-4" />}
                    Verify &amp; Sign In
                  </button>
                </form>

                {/* Resend */}
                <div className="mt-5 text-center">
                  <p className="text-slate-500 text-xs mb-2">Didn't receive the code?</p>
                  <button
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                    className={cn(
                      "flex items-center gap-1.5 mx-auto text-xs font-semibold transition-colors",
                      resendCooldown > 0 || loading
                        ? "text-slate-600 cursor-not-allowed"
                        : "text-amber-400 hover:text-amber-300"
                    )}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                    {resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : "Resend code"}
                  </button>
                </div>

                {/* Dev OTP banner — shown when no email service is configured */}
                {devOtp && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-2 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl"
                  >
                    <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Your verification code
                    </div>
                    <div className="text-4xl font-mono font-black tracking-[0.3em] text-amber-300 select-all">
                      {devOtp}
                    </div>
                    <p className="text-[9px] text-amber-600 text-center leading-relaxed">
                      No email service configured — code shown here for local dev.
                      Click the code to select it, then paste into the field above.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setOtp(devOtp); setError(null); }}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                    >
                      Auto-fill code
                    </button>
                  </motion.div>
                )}

                {/* Security note */}
                <div className="mt-6 flex items-start gap-2 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    This code expires in 10 minutes. Never share it with anyone. SALAMANDA will never ask for your code via phone or chat.
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6 font-mono">
          SALAMANDA NIDS v2.0 — Secured by InsForge · 2FA Enabled
        </p>
      </motion.div>
    </div>
  );
}

// ── Shared error banner ───────────────────────────────────────────────────────
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
