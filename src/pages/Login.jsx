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

const LOGO = `${import.meta.env.BASE_URL}models/logo.jpeg`;

function Login() {
  const navigate = useNavigate();
  const emailRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => emailRef.current?.focus(), []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

      if (!navigator.onLine) {
        setError("There is no internet connection. Please check your connection and try again.");
      } else {
        setError("The email or password is incorrect. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-500/10 disabled:opacity-50";

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-white text-slate-950">
      <style>{`
        @keyframes rfmHorizonGlow {
          0%, 100% {
            opacity: .72;
            transform: translateX(-50%) scaleX(1);
          }

          50% {
            opacity: 1;
            transform: translateX(-50%) scaleX(1.03);
          }
        }

        .rfm-red-horizon {
          animation: rfmHorizonGlow 9s ease-in-out infinite;
          transform-origin: center bottom;
          will-change: transform, opacity;
        }

        @media (prefers-reduced-motion: reduce) {
          .rfm-red-horizon {
            animation: none !important;
          }
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-text-fill-color: #0f172a !important;
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        ::selection {
          background: rgba(220, 38, 38, .18);
          color: #0f172a;
        }
      `}</style>

      {/* No Internet Popup */}
      {isOffline && (
        <div className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-600 px-4 py-3 text-white shadow-[0_12px_35px_rgba(220,38,38,.28)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <span className="h-2.5 w-2.5 rounded-full bg-white" />
            </span>

            <div className="min-w-0">
              <p className="text-sm font-bold">
                No internet connection
              </p>
              <p className="mt-0.5 text-[11px] text-red-100">
                Please check your internet connection and try again.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-white">
        <div className="absolute inset-0 bg-white" />

        <div className="rfm-red-horizon absolute left-1/2 top-[74%] h-[42vh] w-[150vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center_top,rgba(255,55,70,.98)_0%,rgba(239,68,68,.78)_22%,rgba(248,113,113,.46)_48%,rgba(254,202,202,.22)_70%,transparent_78%)]" />

        <div className="absolute left-1/2 top-[74%] h-[2px] w-[118vw] -translate-x-1/2 rounded-full bg-red-300/70 shadow-[0_0_35px_rgba(239,68,68,.65)]" />

        <div className="absolute inset-x-0 bottom-0 h-[38vh] bg-gradient-to-t from-white/10 via-white/45 to-transparent" />
      </div>

      <header className="relative z-10 flex flex-col items-center px-5 pt-8 text-center sm:pt-10 lg:pt-12">
        <img
          src={LOGO}
          alt="Rare Fiction"
          className="h-16 w-16 rounded-xl bg-white object-cover shadow-sm ring-1 ring-slate-200 sm:h-20 sm:w-20"
        />

        <div className="mt-4 text-[20px] font-extrabold uppercase tracking-[.16em] text-slate-950 sm:text-[24px]">
          Rare Fiction
        </div>

        <div className="mt-1 text-[9px] font-bold uppercase tracking-[.5em] text-red-500 sm:text-[10px]">
          Internal OS
        </div>

        <div className="mt-5 text-[8px] font-semibold uppercase tracking-[.48em] text-slate-400 sm:text-[9px]">
          People · Ideas · Impact
        </div>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-7 sm:px-6 sm:py-9">
        <section className="w-full max-w-[600px]">
          <div className="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,.12)] backdrop-blur-xl sm:rounded-[28px] sm:p-9 lg:p-10">
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-[-.03em] text-slate-950 sm:text-4xl">
                Welcome back
              </h1>

              <p className="mt-2 text-sm text-slate-500 sm:text-base">
                Sign in to continue to Rare Fiction Internal OS
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-8 space-y-4"
            >
              <div>
                <label htmlFor="email" className="sr-only">
                  Work email
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
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
                    placeholder="Work email"
                    className={`${inputClass} h-14 rounded-2xl px-4 pl-12`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
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
                    placeholder="Password"
                    className={`${inputClass} h-14 rounded-2xl px-12`}
                  />

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-5 text-red-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex h-14 w-full items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-red-700 to-red-500 px-5 font-bold text-white shadow-[0_14px_35px_rgba(220,38,38,.22)] transition hover:from-red-600 hover:to-red-500 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base">
                  {loading ? "Signing in..." : "Sign in"}
                </span>

                <ArrowRight
                  size={20}
                  className="transition group-hover:translate-x-1"
                />
              </button>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2.5 border-t border-slate-200 pt-5">
              <ShieldCheck size={17} className="text-slate-500" />

              <span className="text-xs font-medium text-slate-500">
                Secure employee access
              </span>
            </div>
          </div>
        </section>
      </div>

      <footer className="relative z-10 flex flex-col items-center justify-center px-5 pb-7 pt-2 text-center sm:pb-9">
        <div className="text-[8px] font-bold uppercase tracking-[.42em] text-slate-500 sm:text-[9px]">
          Built for a bolder tomorrow
        </div>

        <span className="mt-3 h-[2px] w-16 rounded-full bg-red-500" />
      </footer>
    </main>
  );
}

export default Login;