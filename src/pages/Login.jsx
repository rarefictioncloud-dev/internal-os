import { useEffect, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { auth } from "../firebase/config";

const BG_IMAGE_1 =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260609_195923_b0ba8ace-1d1d-4f2c-9a28-1ab84b330680.png&w=1280&q=85";

const BG_IMAGE_2 =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260609_201152_bba90a12-bf12-459f-91f0-51f237dbaf3b.png&w=1280&q=85";

const SPOTLIGHT_R = 260;

function RevealLayer({ image, cursorX, cursorY }) {
  const canvasRef = useRef(null);
  const [maskUrl, setMaskUrl] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawMask = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      if (cursorX < -100 || cursorY < -100) {
        setMaskUrl("");
        return;
      }

      const gradient = ctx.createRadialGradient(
        cursorX,
        cursorY,
        0,
        cursorX,
        cursorY,
        SPOTLIGHT_R
      );

      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,1)");
      gradient.addColorStop(0.6, "rgba(255,255,255,0.75)");
      gradient.addColorStop(0.75, "rgba(255,255,255,0.4)");
      gradient.addColorStop(0.88, "rgba(255,255,255,0.12)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, SPOTLIGHT_R, 0, Math.PI * 2);
      ctx.fill();

      setMaskUrl(canvas.toDataURL("image/png"));
    };

    drawMask();
    window.addEventListener("resize", drawMask);

    return () => {
      window.removeEventListener("resize", drawMask);
    };
  }, [cursorX, cursorY]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "none" }}
      />

      <div
        className="absolute inset-0 z-20 pointer-events-none bg-center bg-cover bg-no-repeat"
        style={{
          backgroundImage: `url("${image}")`,
          maskImage: maskUrl ? `url("${maskUrl}")` : "none",
          WebkitMaskImage: maskUrl ? `url("${maskUrl}")` : "none",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
    </>
  );
}

function RareFictionMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10 backdrop-blur-md">
        <span className="absolute h-px w-5 bg-white/80" />
        <span className="absolute h-5 w-px bg-white/80" />
        <span className="absolute h-3 w-3 rotate-45 border border-white/90" />
      </div>

      <div>
        <p className="text-[15px] font-semibold leading-none tracking-[-0.03em] text-white">
          rare fiction media
        </p>
        <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-white/50">
          Creative Operations
        </p>
      </div>
    </div>
  );
}

function Login() {
  const navigate = useNavigate();

  const mouse = useRef({ x: -999, y: -999 });
  const smooth = useRef({ x: -999, y: -999 });
  const rafRef = useRef(null);

  const [cursorPos, setCursorPos] = useState({
    x: -999,
    y: -999,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleMouseMove = (event) => {
      mouse.current.x = event.clientX;
      mouse.current.y = event.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1;
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1;

      setCursorPos({
        x: smooth.current.x,
        y: smooth.current.y,
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      navigate("/");
    } catch (error) {
      console.error("Login error:", error);
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen overflow-hidden bg-black tracking-[-0.02em]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <section
        className="relative h-screen w-full overflow-hidden bg-black"
        style={{ height: "100dvh" }}
      >
        {/* Base visual */}
        <div
          className="absolute inset-0 z-10 bg-center bg-cover bg-no-repeat hero-zoom"
          style={{
            backgroundImage: `url("${BG_IMAGE_1}")`,
          }}
        />

        {/* Cursor spotlight / second visual */}
        <RevealLayer
          image={BG_IMAGE_2}
          cursorX={cursorPos.x}
          cursorY={cursorPos.y}
        />

        {/* Cinematic readability layer */}
        <div className="absolute inset-0 z-30 bg-black/[0.16]" />
        <div className="absolute inset-0 z-30 bg-gradient-to-r from-black/50 via-black/10 to-black/45" />
        <div className="absolute inset-0 z-30 bg-gradient-to-t from-black/65 via-transparent to-black/20" />

        {/* Brand — no navigation */}
        <div
          className="absolute left-5 top-5 z-50 sm:left-8 sm:top-7 lg:left-10 lg:top-8 hero-anim hero-fade"
          style={{ animationDelay: "0.15s" }}
        >
          <RareFictionMark />
        </div>

        {/* Main brand statement */}
        <div className="absolute left-5 right-5 top-[16%] z-50 sm:left-10 sm:right-auto sm:top-[18%] lg:left-14 lg:top-[17%]">
          <p
            className="hero-anim hero-fade text-[10px] font-semibold uppercase tracking-[0.3em] text-white/65 sm:text-[11px]"
            style={{ animationDelay: "0.28s" }}
          >
            Rare Fiction Media
          </p>

          <h1 className="mt-4 max-w-[680px] text-white">
            <span
              className="hero-anim hero-reveal block font-playfair text-5xl font-normal italic leading-[0.88] sm:text-7xl md:text-8xl lg:text-[7.2rem]"
              style={{
                letterSpacing: "-0.065em",
                animationDelay: "0.35s",
              }}
            >
              Create.
            </span>

            <span
              className="hero-anim hero-reveal -mt-1 block text-5xl font-normal leading-[0.88] sm:text-7xl md:text-8xl lg:text-[7.2rem]"
              style={{
                letterSpacing: "-0.085em",
                animationDelay: "0.48s",
              }}
            >
              Collaborate.
            </span>

            <span
              className="hero-anim hero-reveal -mt-1 block text-5xl font-normal leading-[0.88] sm:text-7xl md:text-8xl lg:text-[7.2rem]"
              style={{
                letterSpacing: "-0.085em",
                animationDelay: "0.61s",
              }}
            >
              Deliver.
            </span>
          </h1>
        </div>

        {/* Workspace context */}
        <div
          className="absolute bottom-7 left-5 z-50 hidden max-w-[290px] sm:bottom-10 sm:left-8 sm:block lg:bottom-12 lg:left-14 hero-anim hero-fade"
          style={{ animationDelay: "0.82s" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e8702a] shadow-[0_0_12px_rgba(232,112,42,0.8)]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/55">
              Internal workspace
            </span>
          </div>

          <p className="text-sm leading-relaxed text-white/75">
            One workspace for briefs, shoots, edits, reviews, approvals and
            everything that turns an idea into something worth delivering.
          </p>
        </div>

        {/* Login card */}
        <div
          id="workspace-login"
          className="absolute bottom-5 left-5 right-5 z-[80] sm:bottom-8 sm:left-auto sm:right-8 sm:w-[390px] lg:right-12 lg:w-[410px] xl:right-16"
        >
          <div
            className="hero-anim hero-fade rounded-[28px] border border-white/55 bg-[#f7f4ed]/[0.96] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-8"
            style={{ animationDelay: "0.9s" }}
          >
            <div className="mb-7">
              <div className="mb-5 flex items-center justify-between">
                <span className="rounded-full border border-black/10 bg-black/[0.04] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-black/55">
                  Private access
                </span>

                <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-black/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e8702a]" />
                  RFM OS
                </span>
              </div>

              <h2 className="text-[2.2rem] font-medium leading-none tracking-[-0.065em] text-[#151515] sm:text-[2.55rem]">
                Welcome back.
              </h2>

              <p className="mt-3 max-w-[290px] text-sm leading-relaxed text-black/50">
                Sign in to your Rare Fiction Media workspace.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55"
                >
                  Work email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  placeholder="you@rarefictionmedia.com"
                  className="w-full rounded-2xl border border-black/[0.10] bg-white/75 px-4 py-3.5 text-sm text-[#151515] outline-none transition-all placeholder:text-black/25 focus:border-black/25 focus:bg-white focus:ring-4 focus:ring-black/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55"
                >
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-black/[0.10] bg-white/75 px-4 py-3.5 text-sm text-[#151515] outline-none transition-all placeholder:text-black/25 focus:border-black/25 focus:bg-white focus:ring-4 focus:ring-black/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group mt-1 flex w-full items-center justify-between rounded-full bg-[#171717] px-5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-black hover:shadow-xl hover:shadow-black/15 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{loading ? "Signing in..." : "Enter workspace"}</span>

                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-base transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </button>
            </form>

            <div className="mt-5 border-t border-black/[0.08] pt-4">
              <p className="text-center text-[10px] leading-relaxed text-black/35">
                This is a private company workspace. Access is limited to
                authorized Rare Fiction Media team members.
              </p>
            </div>
          </div>
        </div>

        {/* Small screen footer */}
        <div className="absolute bottom-5 left-5 z-50 sm:hidden">
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/45">
            Rare Fiction Media · Internal
          </p>
        </div>

        {/* Cursor hint */}
        <div className="pointer-events-none absolute bottom-6 right-6 z-50 hidden items-center gap-2 md:flex">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/35">
            Move cursor
          </span>
          <span className="h-px w-8 bg-white/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
        </div>
      </section>
    </main>
  );
}

export default Login;
