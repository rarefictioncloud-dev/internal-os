import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebase/config";

/*
  ============================================================================
  RARE FICTION MEDIA — INTERNAL WORKSPACE LOGIN
  ============================================================================
*/

const BACKGROUND_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260820_010308_b1636845-4c15-4ab6-b0c9-9a29bfb0c6e3.mp4";

function RFMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M25.9 3.5H36L26.2 17.1H35L16.2 36.5H5.4L15.2 23H6.4L25.9 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Login() {
  const navigate = useNavigate();
  const emailInputRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError("Enter your work email and password to continue.");
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      navigate("/");
    } catch (authError) {
      console.error("Login error:", authError);
      setError("The email or password is incorrect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="rfm-login relative min-h-screen w-full overflow-x-hidden bg-[#151612] text-white flex flex-col justify-between">
      {/* Dynamic style rule to prevent browser autofill blue/white background */}
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
          -webkit-text-fill-color: #ffffff !important;
          -webkit-box-shadow: 0 0 0px 1000px #1a1c17 inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* =====================================================================
          CINEMATIC BACKGROUND & OVERLAYS
      ====================================================================== */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <video
          className="h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={BACKGROUND_VIDEO} type="video/mp4" />
        </video>

        {/* Gradient overlays to maintain dark readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#141511]/80 via-[#141511]/40 to-[#141511]/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0d0a]/60 via-transparent to-[#0b0d0a]/80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_30%,rgba(0,0,0,0.4)_100%)]" />
      </div>

      {/* =====================================================================
          TOP HEADER
      ====================================================================== */}
      <header className="relative z-20 flex items-center justify-between p-6 sm:px-10 sm:py-8 lg:px-16 lg:py-10">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-black/30 backdrop-blur-md shadow-lg">
            <RFMark className="h-6 w-6 text-white" />
          </div>

          <div>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.24em] text-white sm:text-[14px]">
              Rare Fiction Media
            </div>
            <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.38em] text-white/50 sm:text-[9px]">
              Creative Operations
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/20 px-3.5 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-[#ff873d] shadow-[0_0_12px_rgba(255,135,61,0.9)] animate-pulse" />
          <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/80 sm:text-[10px]">
            Private Workspace
          </span>
        </div>
      </header>

      {/* =====================================================================
          MAIN CONTENT GRID
      ====================================================================== */}
      <div className="relative z-20 flex-1 grid grid-cols-1 items-center gap-12 px-6 py-6 sm:px-10 lg:grid-cols-12 lg:gap-8 lg:px-16">
        
        {/* LEFT HERO SECTION */}
        <section className="flex flex-col justify-center lg:col-span-6 xl:col-span-7">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-[2px] w-8 bg-[#ff873d]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#ffb27f]">
              RFM OS
            </span>
          </div>

          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
            Create.
            <br />
            <span className="text-white/70">Collaborate.</span>
            <br />
            <span className="text-[#ff873d]">Deliver.</span>
          </h1>

          <p className="mt-6 max-w-lg text-sm font-medium leading-relaxed text-white/70 sm:text-base">
            One connected workspace for briefs, shoots, edits, approvals,
            people, and delivery.
          </p>

          <div className="mt-8 hidden items-center gap-4 sm:flex lg:mt-12">
            <span className="h-8 w-px bg-white/30" />
            <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-white/50">
              Stories move brands.
            </span>
          </div>
        </section>

        {/* RIGHT LOGIN FORM CONTAINER */}
        <section className="flex justify-center lg:col-span-6 lg:justify-end xl:col-span-5">
          <div className="w-full max-w-[460px] overflow-hidden rounded-3xl border border-white/20 bg-[#1c1e19]/70 p-7 sm:p-9 shadow-2xl backdrop-blur-2xl transition-all">
            
            {/* Header / Meta */}
            <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black shadow">
                  <RFMark className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                  RFM OS
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
                <LockKeyhole size={12} />
                Secure access
              </div>
            </div>

            {/* Title */}
            <div className="mb-6">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Welcome <span className="text-[#ff873d]">back.</span>
              </h2>
              <p className="mt-1.5 text-xs text-white/60">
                Sign in to your Rare Fiction Media workspace.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Email Input */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
                >
                  <span>Work email</span>
                  <span className="text-white/30">01</span>
                </label>

                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                  />
                  <input
                    ref={emailInputRef}
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError("");
                    }}
                    disabled={loading}
                    placeholder="you@rarefictionmedia.com"
                    className="h-13 w-full rounded-xl border border-white/15 bg-black/40 px-4 pl-11 text-sm font-medium text-white placeholder-white/30 outline-none transition-all focus:border-[#ff873d] focus:bg-black/60 focus:ring-2 focus:ring-[#ff873d]/20 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
                >
                  <span>Password</span>
                  <span className="text-white/30">02</span>
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError("");
                    }}
                    disabled={loading}
                    placeholder="Enter password"
                    className="h-13 w-full rounded-xl border border-white/15 bg-black/40 px-11 text-sm font-medium text-white placeholder-white/30 outline-none transition-all focus:border-[#ff873d] focus:bg-black/60 focus:ring-2 focus:ring-[#ff873d]/20 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-200"
                >
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group flex h-13 w-full items-center justify-between rounded-xl bg-[#ff873d] px-5 font-bold text-[#151612] shadow-lg shadow-[#ff873d]/20 transition-all hover:bg-[#ff9654] hover:shadow-xl active:scale-[0.99] disabled:opacity-50"
              >
                <span className="text-sm">
                  {loading ? "Signing in..." : "Enter Workspace"}
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10 transition-transform group-hover:translate-x-1">
                  <ArrowRight size={16} />
                </div>
              </button>
            </form>

            {/* Security Footer */}
            <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-white/60">
              <ShieldCheck size={18} className="shrink-0 text-[#ff873d]" />
              <div className="text-[11px] leading-tight">
                <p className="font-semibold text-white/80">Authorized team members only</p>
                <p className="text-white/40">Encrypted internal endpoint</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* =====================================================================
          BOTTOM FOOTER / STAGES
      ====================================================================== */}
      <footer className="relative z-20 flex items-center justify-between p-6 sm:px-10 lg:px-16">
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff873d]" />
          <span>RFM OS · Internal · 2026</span>
        </div>

        <div className="hidden gap-2 lg:flex">
          {["BRIEF", "SHOOT", "EDIT", "REVIEW", "PUBLISH"].map((stage, i) => (
            <span
              key={stage}
              className={`rounded-full border px-3 py-1 text-[8px] font-bold tracking-[0.18em] ${
                i === 0
                  ? "border-[#ff873d]/40 bg-[#ff873d]/10 text-[#ffb27f]"
                  : "border-white/10 bg-black/20 text-white/40"
              }`}
            >
              {stage}
            </span>
          ))}
        </div>
      </footer>
    </main>
  );
}

export default Login;