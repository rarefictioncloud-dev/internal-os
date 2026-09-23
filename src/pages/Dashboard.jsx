import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, FolderKanban, MessageSquare, Send, UserRound } from "lucide-react";
import { collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useShift } from "../hooks/useShift";
import { useEndShiftLogout } from "../components/common/EndShiftLogout";

const HERO =
  "Glad you stopped in. Good taste tends to find us. Now, what are we building?";

const links = [
  ["Tasks", "/tasks"],
  ["Production", "/deliverables"],
  ["Messages", "/messages"],
  ["Profile", "/profile"],
];

const mobileActionIcons = {
  Tasks: CheckCircle2,
  Production: FolderKanban,
  Messages: MessageSquare,
  Profile: UserRound,
};

const formatTime = (value) => {
  const total = Math.max(0, Math.floor(value / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

// Visual reference only — used to draw the day-progress bar in the hero.
// Does not affect shift timing, attendance records, or the 5:30 PM close rule.
const STANDARD_DAY_MS = 8.5 * 60 * 60 * 1000;

function Typewriter({ text }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    let i = 0;
    let interval;

    const delay = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) clearInterval(interval);
      }, 38);
    }, 600);

    return () => {
      clearTimeout(delay);
      clearInterval(interval);
    };
  }, [text]);

  return (
    <>
      {shown}
      {shown.length < text.length && (
        <span className="ml-1 inline-block h-[1em] w-[2px] animate-[blink_1s_step-end_infinite] bg-slate-900 align-middle" />
      )}
    </>
  );
}

function Stat({ label, value, note, onClick }) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex-1 px-4 py-3.5 text-left transition-all first:rounded-l-lg last:rounded-r-lg hover:bg-slate-50 sm:px-6 sm:py-4 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-3 max-md:py-2 max-md:shadow-none"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-950 sm:text-2xl max-md:text-[18px]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-slate-400 sm:text-[11px]">{note}</p>
    </Tag>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const uid = user?.uid;

  // Shift starts automatically as soon as the authenticated user reaches the dashboard.
  // The hook remains the single source of truth for today's attendance and timer.
  const shift = useShift(uid, profile?.name || user?.displayName, { control: true, tick: true });
  const { status, worked } = shift;
  const onShift = status === "working" || status === "paused";

  const [tasks, setTasks] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [teamCount, setTeamCount] = useState(0);
  const [activeToday, setActiveToday] = useState(0);
  const [error, setError] = useState("");
  // Logout = end today's shift, after a warning.
  const logoutFlow = useEndShiftLogout(onShift);

  /*
   * Shift rules:
   * - Logout ends the active shift through useEndShiftLogout before sign-out.
   * - Every day has its own attendance document.
   * - Any active/paused shift is hard-closed at 5:30 PM local time.
   * - The timer cannot continue beyond the stored logout time or 5:30 PM.
   */
  useEffect(() => {
    if (!uid || !onShift) return undefined;

    const now = new Date();
    const shiftEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      17,
      30,
      0,
      0
    );
    const today =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;
    const attendanceRef = doc(db, "attendance", `${uid}_${today}`);

    const closeShift = async () => {
      try {
        const data = shift.data || {};
        const pausedAt =
          typeof data.pausedAt?.toMillis === "function"
            ? data.pausedAt.toMillis()
            : data.pausedAt
              ? new Date(data.pausedAt).getTime()
              : 0;

        const extraPause =
          status === "paused" && pausedAt
            ? Math.max(0, Date.now() - pausedAt)
            : 0;

        await updateDoc(attendanceRef, {
          active: false,
          paused: false,
          pausedAt: null,
          logoutAt: serverTimestamp(),
          totalPausedMs: Number(data.totalPausedMs || 0) + extraPause,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        if (err?.code !== "not-found") {
          console.error("5:30 PM shift close:", err);
        }
      }
    };

    const delay = Math.max(0, shiftEnd.getTime() - Date.now());

    if (delay === 0) {
      closeShift();
      return undefined;
    }

    const timer = window.setTimeout(closeShift, delay + 250);
    return () => window.clearTimeout(timer);
  }, [uid, onShift, status, shift.data]);

  useEffect(() => {
    if (!uid) return;

    return onSnapshot(
      query(collection(db, "tasks"), where("assignedTo", "==", uid)),
      (snap) =>
        setTasks(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((d) => !d.archived)
        ),
      console.error
    );
  }, [uid]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "deliverables"), limit(40)),
      (snap) =>
        setDeliverables(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((d) => !d.archived)
        ),
      console.error
    );
  }, []);

  useEffect(() => {
    if (!uid) return;

    getDocs(collection(db, "users"))
      .then((snap) =>
        setTeamCount(
          snap.docs.filter((d) => d.data()?.isActive !== false).length
        )
      )
      .catch(console.error);
  }, [uid]);

  // CEO-only dashboard metric: members with an attendance record for today.
  // This is display data only and does not alter shift/attendance behavior.
  useEffect(() => {
    if (!uid || profile?.role !== "CEO") {
      setActiveToday(0);
      return undefined;
    }

    const now = new Date();
    const today =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;

    return onSnapshot(
      query(collection(db, "attendance"), where("date", "==", today)),
      (snap) => {
        setActiveToday(
          snap.docs.filter((d) => {
            const data = d.data() || {};
            return Boolean(data.loginAt && data.userId);
          }).length
        );
      },
      (error) => {
        console.error("Active today count:", error);
        setActiveToday(0);
      }
    );
  }, [uid, profile?.role]);

  const pendingTasks = tasks.filter(
    (t) =>
      !["APPROVED", "DONE", "COMPLETED"].includes(
        String(t.status).toUpperCase()
      )
  );

  const awaiting = tasks.filter(
    (t) => String(t.status).toUpperCase() === "AWAITING_APPROVAL"
  );

  const production = deliverables.filter(
    (d) =>
      !["POSTED", "DONE", "COMPLETED"].includes(
        String(d.status).toUpperCase()
      )
  );

  const focusNote = {
    working: "Working now · ends 5:30 PM",
    paused: "Resuming shift…",
    completed: "Shift completed",
    closed: "Shift hours end at 5:30 PM",
  }[status] || "Starting shift…";

  const shownError = error || shift.error;

  const displayName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "there";

  const firstName =
    String(displayName).trim().split(/\s+/)[0] || "there";

  const HERO = `Hello ${firstName}. What are we building today?`;

  // Presentational only — how far today's worked time fills the hero progress bar.
  const dayProgressPct = Math.min(100, (worked / STANDARD_DAY_MS) * 100);

  return (
    <main className="relative min-h-full overflow-hidden bg-[#f7f7f5] text-slate-900">
      {/* Desktop UI — unchanged functionality and existing desktop presentation. */}
      <div className="hidden md:block">
      {/* Atmosphere — a quiet drafting-grid, nothing louder */}
      <div className="pointer-events-none absolute inset-0 opacity-[.035] [background-image:linear-gradient(rgba(15,23,42,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.08)_1px,transparent_1px)] [background-size:56px_56px]" />

      {/* Shift status (fixed; same positions as before on mobile and desktop). */}
      <div className="fixed left-3 right-3 top-[78px] z-50 sm:left-8 sm:right-auto sm:top-24 md:left-[296px] md:right-auto md:top-28 lg:left-[312px] lg:top-28">
        {onShift ? (
          <div className="flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,.07)] sm:mx-0 sm:gap-3 sm:rounded-md sm:py-2.5 sm:pl-3 sm:pr-4">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "paused" ? "bg-amber-400" : "bg-emerald-500 motion-safe:animate-pulse"
              }`}
            />
            <span className="text-[11px] font-medium text-slate-800 sm:text-xs">
              {status === "paused" ? "Paused" : "Working"}
            </span>
            {status === "working" && (
              <span className="font-mono text-[11px] tabular-nums text-slate-400 sm:text-xs">
                {formatTime(worked)}
              </span>
            )}
            <button
              type="button"
              onClick={logoutFlow.ask}
              disabled={logoutFlow.busy}
              className="ml-1 border-l border-slate-200 pl-2.5 text-[11px] text-slate-400 transition hover:text-red-600 disabled:opacity-40 sm:pl-3 sm:text-xs"
            >
              Logout
            </button>
          </div>
        ) : status === "completed" ? (
          <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600 sm:text-xs">
            Shift completed · {formatTime(worked)}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-400 sm:text-xs">
            {status === "closed" ? "Shift hours end at 5:30 PM" : "Starting shift…"}
          </div>
        )}
      </div>

      {/* Fixed with the shift control; scrolling cannot move it. */}
      <div className="pointer-events-none fixed right-4 top-[78px] z-40 text-right sm:right-8 sm:top-24 md:right-8 md:top-28 lg:right-10 max-md:top-[78px]">
        <p className="text-[9px] font-semibold tracking-[.24em] text-slate-400">RFM / OS</p>
        <p className="mt-0.5 text-[9px] text-slate-400 sm:text-[11px]">Creative operations intelligence</p>
      </div>

      {/* Hero */}
      <section className="relative flex min-h-[calc(100vh-1px)] flex-col overflow-hidden px-4 pb-[220px] pt-28 sm:px-8 sm:pb-[220px] md:justify-center md:px-10 md:pb-24 md:pt-10 lg:pb-28 max-md:min-h-[calc(100svh-1px)] max-md:px-4 max-md:pb-[138px] max-md:pt-0">
        <div className="relative z-30 mx-auto mt-auto w-full max-w-[820px] md:-translate-y-[10vh] lg:-translate-y-[12vh] max-md:absolute max-md:left-4 max-md:right-4 max-md:top-[20%] max-md:mt-0 max-md:w-auto max-md:max-w-none max-[380px]:top-[18%]">
          <p className="mb-5 max-w-[720px] text-[clamp(28px,3.2vw,48px)] font-semibold leading-[1.1] tracking-[-.03em] text-slate-950 sm:mb-6 max-md:mb-6 max-md:max-w-[335px] max-md:text-[clamp(29px,8vw,36px)] max-md:leading-[1.02] max-md:tracking-[-.045em]">
            <Typewriter text={HERO} />
          </p>

          {/* Today's shift, drawn as a running progress bar rather than a stat tile */}
          <div className="mb-7 max-w-[640px] rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-[0_14px_40px_rgba(15,23,42,.07)] backdrop-blur md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none max-md:mb-7 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:backdrop-blur-none">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">Today's focus</span>
              <span className="font-mono text-[13px] font-semibold tabular-nums text-slate-900 sm:text-sm">
                {shift.data ? formatTime(worked) : "00:00:00"}
              </span>
            </div>
            <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 max-md:shadow-none">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-600 to-rose-500 transition-[width] duration-700 ease-out"
                style={{ width: `${dayProgressPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{focusNote}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-200 pt-4 max-md:grid max-md:grid-cols-3 max-md:gap-x-1 max-md:gap-y-5 max-md:border-none max-md:pt-0">
            {links.map(([label, path]) => {
              const Icon = mobileActionIcons[label];

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 shadow-[0_5px_16px_rgba(15,23,42,.04)] transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:text-sm max-md:flex max-md:flex-col max-md:items-center max-md:justify-center max-md:gap-2 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:py-0 max-md:shadow-none max-md:text-[10px]"
                >
                  <span className="hidden md:inline">{label}</span>

                  <span className="flex flex-col items-center gap-2 md:hidden">
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,.06)]">
                      {Icon ? <Icon size={18} strokeWidth={1.7} /> : null}
                    </span>
                    <span className="text-[10px] font-medium text-slate-700">
                      {label}
                    </span>
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="ml-auto inline-flex items-center justify-center whitespace-nowrap rounded-full bg-slate-950 px-4 py-2.5 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(15,23,42,.15)] transition-all hover:-translate-y-0.5 hover:bg-red-600 sm:rounded-md sm:px-5 sm:py-2 sm:text-[13px] max-md:col-span-2 max-md:ml-0 max-md:h-12 max-md:w-full max-md:gap-2 max-md:self-center max-md:px-5 max-md:py-0 max-md:text-[12px] max-md:shadow-[0_12px_28px_rgba(15,23,42,.14)]"
            >
              <Send size={15} strokeWidth={1.8} />
              Send a brief hello
            </button>
          </div>
        </div>
      </section>

      {/* Stats — a flat ticker instead of a card grid */}
      <section className="absolute bottom-9 left-0 right-0 z-40 px-4 sm:px-8 lg:px-10 max-md:bottom-4 max-md:px-4">
        <div className="mx-auto flex max-w-[1200px] divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white/90 shadow-[0_12px_36px_rgba(15,23,42,.06)] max-md:grid max-md:grid-cols-3 max-md:gap-0 max-md:divide-x max-md:divide-slate-200 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <Stat
            label="Tasks"
            value={pendingTasks.length}
            note={`${awaiting.length} awaiting approval`}
            onClick={() => navigate("/tasks")}
          />

          <Stat
            label="Deliverables"
            value={production.length}
            note="In production"
            onClick={() => navigate("/deliverables")}
          />

          {profile?.role === "CEO" ? (
            <Stat
              label="Active Today"
              value={activeToday}
              note="Members active today"
              onClick={() => navigate("/attendance")}
            />
          ) : (
            <Stat
              label="Calendar"
              value={new Date().getDate()}
              note={new Date().toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
              onClick={() => navigate("/calendar")}
            />
          )}
        </div>
      </section>

      {/* Mobile Editorial footer — presentational only */}
      <div className="pointer-events-none absolute bottom-[118px] left-5 right-5 z-30 hidden items-end justify-between max-md:flex">
        <p className="max-w-[190px] text-[10px] italic leading-4 text-slate-400">
          Ideas, people and execution
          <br />
          in one place.
        </p>

        <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          RFM OS
          <span className="h-px w-5 bg-red-500" />
        </div>
      </div>

      </div>


      {/* MOBILE — separate editorial layout. Presentational only. */}
      <div className="relative h-[100svh] w-full overflow-hidden md:hidden">
        {/* Soft editorial atmosphere */}
        <div className="pointer-events-none absolute inset-0 bg-[#f7f7f5]" />
        <div className="pointer-events-none absolute -right-20 top-[18%] h-64 w-64 rounded-full bg-rose-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-[8%] h-56 w-56 rounded-full bg-slate-100 blur-3xl" />

        {/* Shift status */}
        <div className="absolute left-4 top-4 z-20">
          {onShift ? (
            <div className="flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3.5 py-2 shadow-[0_8px_24px_rgba(15,23,42,.07)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === "paused"
                    ? "bg-amber-400"
                    : "bg-emerald-500 motion-safe:animate-pulse"
                }`}
              />
              <span className="text-[10px] font-medium text-slate-800">
                {status === "paused" ? "Paused" : "Working"}
              </span>

              {status === "working" && (
                <span className="font-mono text-[9px] tabular-nums text-slate-400">
                  {formatTime(worked)}
                </span>
              )}

              <button
                type="button"
                onClick={logoutFlow.ask}
                disabled={logoutFlow.busy}
                className="border-l border-slate-200 pl-2.5 text-[9px] text-slate-400 transition hover:text-red-600 disabled:opacity-40"
              >
                Logout
              </button>
            </div>
          ) : status === "completed" ? (
            <div className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,.07)]">
              Shift completed · {formatTime(worked)}
            </div>
          ) : (
            <div className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[10px] text-slate-400 shadow-[0_8px_24px_rgba(15,23,42,.07)]">
              {status === "closed"
                ? "Shift hours end at 5:30 PM"
                : "Starting shift…"}
            </div>
          )}
        </div>

        {/* RFM / OS */}
        <div className="absolute right-4 top-[58px] z-10 text-right">
          <p className="text-[8px] font-semibold tracking-[.25em] text-slate-400">
            RFM / OS
          </p>
          <p className="mt-0.5 text-[8px] text-slate-400">
            Creative operations intelligence
          </p>
        </div>

        {/* Editorial hero */}
        <div className="absolute left-5 right-5 top-[19%] z-10">
          <p className="max-w-[340px] text-[clamp(30px,8.2vw,38px)] font-semibold leading-[1.02] tracking-[-.045em] text-slate-950">
            <Typewriter text={HERO} />
          </p>

          {/* Today's focus */}
          <div className="mt-7">
            <div className="flex items-baseline justify-between">
              <span className="text-[8px] font-semibold uppercase tracking-[.2em] text-slate-400">
                Today's focus
              </span>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-900">
                {shift.data ? formatTime(worked) : "00:00:00"}
              </span>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-red-600 to-rose-500 transition-[width] duration-700 ease-out"
                style={{ width: `${dayProgressPct}%` }}
              />
            </div>

            <p className="mt-2 text-[9px] text-slate-400">
              {focusNote}
            </p>
          </div>
        </div>

        {/* Quick actions — editorial circles */}
        <div className="absolute left-5 right-5 top-[54%] z-10">
          <div className="grid grid-cols-3 gap-x-2">
            {links.slice(0, 3).map(([label, path]) => {
              const Icon = mobileActionIcons[label];

              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,.07)]">
                    {Icon ? <Icon size={17} strokeWidth={1.7} /> : null}
                  </span>
                  <span className="text-[9px] font-medium text-slate-700">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="flex flex-col items-center gap-2"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,.07)]">
                <UserRound size={17} strokeWidth={1.7} />
              </span>
              <span className="text-[9px] font-medium text-slate-700">
                Profile
              </span>
            </button>
          </div>

          {/* Main CTA */}
          <button
            type="button"
            onClick={() => navigate("/messages")}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-[11px] font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,.16)] transition-all active:scale-[.99]"
          >
            <Send size={14} strokeWidth={1.8} />
            Send a brief hello
          </button>
        </div>

        {/* Editorial footer */}
        <div className="absolute bottom-[86px] left-5 right-5 z-10 flex items-end justify-between">
          <p className="max-w-[175px] text-[9px] italic leading-3.5 text-slate-400">
            Ideas, people and execution
            <br />
            in one place.
          </p>

          <div className="flex items-center gap-2 text-[7px] font-semibold uppercase tracking-[.25em] text-slate-400">
            RFM OS
            <span className="h-px w-5 bg-red-500" />
          </div>
        </div>

        {/* Bottom metrics */}
        <div className="absolute bottom-3 left-5 right-5 z-10 border-t border-slate-200/80 pt-3">
          <div className="grid grid-cols-3 divide-x divide-slate-200">
            <div className="px-2 first:pl-0">
              <p className="text-[7px] font-semibold uppercase tracking-[.15em] text-slate-400">
                Tasks
              </p>
              <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-slate-950">
                {pendingTasks.length}
              </p>
              <p className="mt-0.5 truncate text-[7px] text-slate-400">
                {awaiting.length} awaiting approval
              </p>
            </div>

            <div className="px-3">
              <p className="text-[7px] font-semibold uppercase tracking-[.15em] text-slate-400">
                Deliverables
              </p>
              <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-slate-950">
                {production.length}
              </p>
              <p className="mt-0.5 truncate text-[7px] text-slate-400">
                In production
              </p>
            </div>

            <div className="px-2 last:pr-0">
              {profile?.role === "CEO" ? (
                <>
                  <p className="text-[7px] font-semibold uppercase tracking-[.15em] text-slate-400">
                    Active Today
                  </p>
                  <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-slate-950">
                    {activeToday}
                  </p>
                  <p className="mt-0.5 truncate text-[7px] text-slate-400">
                    Members active today
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[7px] font-semibold uppercase tracking-[.15em] text-slate-400">
                    Calendar
                  </p>
                  <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-slate-950">
                    {new Date().getDate()}
                  </p>
                  <p className="mt-0.5 truncate text-[7px] text-slate-400">
                    {new Date().toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {logoutFlow.dialog}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }


        @media (max-width: 767px) {
          main {
            min-height: 100svh;
          }

          section.relative {
            min-height: 100svh;
          }

          button {
            -webkit-tap-highlight-color: transparent;
          }
        }


        @media (max-width: 380px) {
          /* Slightly tighter composition for very small phones. */
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: .01ms !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
