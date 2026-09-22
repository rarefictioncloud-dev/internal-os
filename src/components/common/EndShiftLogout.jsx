import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { endShiftAndSignOut } from "../../hooks/useShift";

/* useEndShiftLogout(shiftActive)
   Returns { ask, dialog }. Call ask() from any logout button and render {dialog}.
   - Shift running → warning: logging out ends today's shift.
   - No running shift → signs out directly. */
export function useEndShiftLogout(shiftActive) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setOpen(false);
      navigate("/login");
    } catch (e) {
      console.error("Logout failed:", e);
      setError(
        e?.code === "permission-denied"
          ? "Your shift could not be ended — permission denied. You are still signed in."
          : "Could not end your shift. Check your connection and try again. You are still signed in."
      );
    } finally {
      setBusy(false);
    }
  }

  const ask = () => (shiftActive ? (setError(""), setOpen(true)) : run(() => signOut(auth)));

  const dialog = open
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/75 p-5 backdrop-blur-md"
          onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-shift-title"
        >
          <div className="w-full max-w-sm rounded-[24px] border border-white/10 bg-[#111]/95 p-6 text-white shadow-2xl">
            <div className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-red-500 text-lg font-bold text-white">!</div>
            <h2 id="end-shift-title" className="text-xl font-medium">Log out and end today's shift?</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Logging out ends your shift for today. The timer stops now and cannot be restarted until tomorrow.
            </p>

            {error && (
              <p className="mt-4 rounded-xl border border-red-400/20 bg-red-950/60 px-3 py-2 text-xs text-red-200">{error}</p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-full border border-white/15 py-3 text-sm transition hover:bg-white/5 disabled:opacity-50"
              >
                Stay signed in
              </button>
              <button
                type="button"
                onClick={() => run(endShiftAndSignOut)}
                disabled={busy}
                className="flex-1 rounded-full bg-red-500 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "Ending shift…" : "End shift & log out"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return { ask, dialog, busy };
}