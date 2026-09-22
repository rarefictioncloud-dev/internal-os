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

const LOGO = "/models/logo.jpeg";

function Login() {
  const navigate = useNavigate();
  const emailRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => emailRef.current?.focus(), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    } catch (err) {
      console.error("Login error:", err);
      setError("The email or password is incorrect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-white/10 bg-black/45 text-sm text-white outline-none transition placeholder:text-white/25 hover:border-white/20 focus:border-red-500 focus:bg-black/60 focus:ring-2 focus:ring-red-500/10 disabled:opacity-50";

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-black text-white">
      <style>{`
        @keyframes rfmDrift {
          0%   { transform: scale(1)     translate3d(0, 0, 0); }
          50%  { transform: scale(1.05)  translate3d(-0.6%, -0.4%, 0); }
          100% { transform: scale(1.09)  translate3d(0.8%, 0.5%, 0); }
        }

        @keyframes rfmTwinkle {
          0%, 100% { opacity: .35; }
          50%      { opacity: 1; }
        }

        .rfm-bg-scene {
          animation: rfmDrift 28s ease-in-out infinite alternate;
          transform-origin: center bottom;
          will-change: transform;
        }

        .rfm-stars {
          animation: rfmTwinkle 4.5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .rfm-bg-scene, .rfm-stars {
            animation: none !important;
            transform: scale(1);
            opacity: .7;
          }
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-text-fill-color: #fff !important;
          -webkit-box-shadow: 0 0 0 1000px #080808 inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        ::selection {
          background: rgba(220, 38, 38, .3);
          color: #fff;
        }
      `}</style>

      {/* Full-bleed animated space + Earth-orbit background,
          built entirely with Tailwind/CSS gradients — no image file,
          so it can never fail to load. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
        <div className="rfm-bg-scene absolute inset-[-6%] h-[112%] w-[112%]">
          {/* Deep space */}
          <div className="absolute inset-0 bg-gradient-to-b from-black via-[#0a0507] to-[#1c0509]" />

          {/* Starfield — layered dots, no image needed */}
          <div
            className="rfm-stars absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,255,255,.9), transparent 60%)," +
                "radial-gradient(1px 1px at 28% 9%, rgba(255,255,255,.7), transparent 60%)," +
                "radial-gradient(1.5px 1.5px at 45% 24%, rgba(255,255,255,.8), transparent 60%)," +
                "radial-gradient(1px 1px at 62% 6%, rgba(255,255,255,.6), transparent 60%)," +
                "radial-gradient(1.5px 1.5px at 78% 20%, rgba(255,255,255,.9), transparent 60%)," +
                "radial-gradient(1px 1px at 88% 12%, rgba(255,255,255,.6), transparent 60%)," +
                "radial-gradient(1.5px 1.5px at 20% 40%, rgba(255,255,255,.7), transparent 60%)," +
                "radial-gradient(1px 1px at 55% 45%, rgba(255,255,255,.6), transparent 60%)," +
                "radial-gradient(1.5px 1.5px at 92% 38%, rgba(255,255,255,.8), transparent 60%)",
            }}
          />

          {/* Atmosphere glow rising from the horizon */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_55%_at_50%_112%,rgba(220,38,38,.35),rgba(150,20,20,.14)_38%,transparent_65%)]" />

          {/* Earth limb — wide, flat ellipse for a gentle high-orbit curve */}
          <div className="absolute left-1/2 top-[87%] h-[42vh] w-[220vw] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-[#3a0a12] via-[#1a0509] to-black shadow-[0_-30px_90px_rgba(220,38,38,.3)]" />

          {/* City-light specks along the limb */}
          <div
            className="absolute left-1/2 top-[89%] h-[8vh] w-[180vw] -translate-x-1/2 rounded-[50%] opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(1px 1px at 30% 40%, rgba(255,200,120,.9), transparent 60%)," +
                "radial-gradient(1px 1px at 42% 55%, rgba(255,200,120,.7), transparent 60%)," +
                "radial-gradient(1.5px 1.5px at 58% 45%, rgba(255,200,120,.9), transparent 60%)," +
                "radial-gradient(1px 1px at 68% 60%, rgba(255,200,120,.6), transparent 60%)",
            }}
          />
        </div>

        {/* Left readability for the headline copy */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/[.7] via-black/[.25] to-black/[.35]" />

        {/* Soft red brand atmosphere */}
        <div className="absolute left-[8%] top-[35%] h-72 w-72 rounded-full bg-red-600/[.06] blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2.5">
          <img
            src={LOGO}
            alt="Rare Fiction"
            className="h-10 w-10 rounded-xl border border-white/15 bg-white object-cover shadow-lg"
          />

          <div className="leading-none">
            <div className="text-[12px] font-extrabold uppercase tracking-[.16em] sm:text-[13px]">
              RareFiction
            </div>
            <div className="mt-1 text-[7px] font-bold uppercase tracking-[.35em] text-white/40">
              OS
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-xl">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.9)]" />
          <span className="text-[7px] font-bold uppercase tracking-[.18em] text-white/65 sm:text-[8px]">
            Private Workspace
          </span>
        </div>
      </header>

      {/* Main */}
      <div className="relative z-10 flex flex-1 items-center px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_420px] lg:gap-16">
          {/* Left copy */}
          <section className="hidden lg:block">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-[2px] w-7 rounded-full bg-red-500" />
              <span className="text-[9px] font-bold uppercase tracking-[.35em] text-red-400">
                RFM OS
              </span>
            </div>

            <h1 className="text-7xl font-extrabold leading-[.9] tracking-[-.05em] xl:text-[6.3rem]">
              Create.
              <br />
              <span className="text-white/75">Collaborate.</span>
              <br />
              <span className="text-red-500">Deliver.</span>
            </h1>

            <p className="mt-6 max-w-md text-sm leading-6 text-white/55">
              One connected workspace for briefs, shoots, edits,
              approvals, people, and delivery.
            </p>

            <div className="mt-10 flex items-center gap-3">
              <span className="h-7 w-px bg-red-500" />
              <span className="text-[8px] font-bold uppercase tracking-[.3em] text-white/40">
                Stories move brands.
              </span>
            </div>
          </section>

          {/* Login card */}
          <section className="w-full">
            <div className="mx-auto w-full max-w-[420px] rounded-[24px] border border-white/15 bg-black/[.82] p-5 shadow-[0_30px_100px_rgba(0,0,0,.7)] backdrop-blur-2xl sm:p-7">
              {/* Card header */}
              <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <img
                    src={LOGO}
                    alt=""
                    className="h-7 w-7 rounded-lg bg-white object-cover"
                  />
                  <span className="text-[8px] font-bold uppercase tracking-[.2em] text-white/70">
                    RFM OS
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[7px] font-bold uppercase tracking-[.15em] text-white/35">
                  <LockKeyhole size={11} />
                  Secure access
                </div>
              </div>

              {/* Title */}
              <div className="mb-6">
                <p className="mb-2 text-[8px] font-bold uppercase tracking-[.3em] text-red-500">
                  Internal workspace
                </p>

                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Welcome <span className="text-red-500">back.</span>
                </h2>

                <p className="mt-2 text-xs leading-5 text-white/45">
                  Sign in to your Rare Fiction Media workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 flex justify-between text-[8px] font-bold uppercase tracking-[.2em] text-white/55"
                  >
                    <span>Work email</span>
                    <span className="text-white/20">01</span>
                  </label>

                  <div className="relative">
                    <Mail
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25"
                    />

                    <input
                      ref={emailRef}
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError("");
                      }}
                      disabled={loading}
                      placeholder="you@rarefictionmedia.com"
                      className={`${inputClass} px-4 pl-10`}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 flex justify-between text-[8px] font-bold uppercase tracking-[.2em] text-white/55"
                  >
                    <span>Password</span>
                    <span className="text-white/20">02</span>
                  </label>

                  <div className="relative">
                    <LockKeyhole
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25"
                    />

                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      disabled={loading}
                      placeholder="Enter password"
                      className={`${inputClass} px-10`}
                    />

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/10 hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.08] p-3 text-[11px] leading-5 text-red-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group flex h-12 w-full items-center justify-between rounded-xl bg-red-600 px-4 font-bold text-white shadow-[0_10px_30px_rgba(220,38,38,.2)] transition hover:bg-red-500 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm">
                    {loading ? "Signing in..." : "Enter Workspace"}
                  </span>

                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 transition group-hover:translate-x-1">
                    <ArrowRight size={15} />
                  </span>
                </button>
              </form>

              {/* Security */}
              <div className="mt-5 flex items-center gap-2.5 border-t border-white/10 pt-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[.04]">
                  <ShieldCheck size={14} className="text-red-500" />
                </div>

                <div className="text-[9px] leading-4">
                  <p className="font-semibold text-white/65">
                    Authorized team members only
                  </p>
                  <p className="text-white/25">
                    Encrypted internal endpoint
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2 text-[7px] font-bold uppercase tracking-[.2em] text-white/25">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          RFM OS · Internal · 2026
        </div>

        <div className="hidden gap-1.5 sm:flex">
          {["BRIEF", "SHOOT", "EDIT", "REVIEW", "PUBLISH"].map((stage, i) => (
            <span
              key={stage}
              className={`rounded-full border px-2.5 py-1 text-[6px] font-bold tracking-[.16em] ${
                i === 0
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-white/10 text-white/25"
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