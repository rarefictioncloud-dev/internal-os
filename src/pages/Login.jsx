import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/config";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-[#f7f7f5] flex">

      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#111111] text-white p-12 flex-col justify-between">
        <div>
          <div className="text-sm font-semibold tracking-[0.25em]">
            RARE FICTION
          </div>

          <div className="mt-1 text-xs tracking-[0.25em] text-white/50">
            MEDIA
          </div>
        </div>

        <div>
          <p className="text-sm text-white/50 mb-5">
            Creative Operations Workspace
          </p>

          <h1 className="text-5xl xl:text-6xl font-semibold leading-tight tracking-tight">
            Create.
            <br />
            Collaborate.
            <br />
            Deliver.
          </h1>

          <p className="mt-8 max-w-md text-white/60 leading-relaxed">
            One workspace for tasks, clients, deliverables,
            production, communication and performance.
          </p>
        </div>

        <p className="text-xs text-white/30">
          Rare Fiction OS
        </p>
      </div>

      {/* Login panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          <div className="mb-8">
            <p className="text-sm font-medium text-slate-500">
              Welcome back
            </p>

            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Sign in to your workspace
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Use your company account to continue.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
          >

            <div>
              <label className="text-sm font-medium text-slate-700">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            <div className="mt-5">
              <label className="text-sm font-medium text-slate-700">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-[#111111] px-4 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Access is provided by your organization.
          </p>

        </div>
      </div>
    </div>
  );
}

export default Login;