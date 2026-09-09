import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  MessageCircle,
  Pause,
  Play,
  Sparkles,
  Target,
  TimerReset,
  Users,
  Video,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const SHIFT_START = 8 * 60 + 30;
const SHIFT_END = 22 * 60;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

const toMs = value => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return null;
};

const formatTime = ms => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const getDateLabel = () =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

function Stat({ icon: Icon, label, value, meta, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <div className="flex items-start justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
          <Icon size={18} />
        </span>
        <ArrowUpRight
          size={16}
          className="text-slate-300 transition group-hover:text-slate-600"
        />
      </div>

      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">{meta}</p>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const uid = user?.uid;
  const today = todayKey();

  const [attendance, setAttendance] = useState(null);
  const [localStart, setLocalStart] = useState(null);
  const [localPause, setLocalPause] = useState(null);
  const [now, setNow] = useState(Date.now());

  const [tasks, setTasks] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [teamCount, setTeamCount] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const attendanceRef = useMemo(
    () =>
      uid
        ? doc(db, "attendance", `${uid}_${today}`)
        : null,
    [uid, today]
  );

  const { start, end } = useMemo(() => {
    const s = new Date();
    s.setHours(8, 30, 0, 0);

    const e = new Date();
    e.setHours(22, 0, 0, 0);

    return {
      start: s.getTime(),
      end: e.getTime(),
    };
  }, [today]);

  const active = attendance?.active === true;
  const paused = attendance?.paused === true;
  const completed = attendance?.active === false;

  const canStart =
    now >= start && now < end;

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  /* ATTENDANCE */
  useEffect(() => {
    if (!attendanceRef) return;

    return onSnapshot(
      attendanceRef,
      snap => {
        if (!snap.exists()) {
          setAttendance(null);
          setLocalStart(null);
          setLocalPause(null);
          return;
        }

        const data = snap.data();
        setAttendance(data);

        const startAt = toMs(data.loginAt);
        const pauseAt = toMs(data.pausedAt);

        if (startAt) setLocalStart(startAt);
        if (data.paused && pauseAt) {
          setLocalPause(pauseAt);
        }

        if (!data.paused) {
          setLocalPause(null);
        }
      },
      e => console.error("Attendance listener:", e)
    );
  }, [attendanceRef]);

  /* TASKS */
  useEffect(() => {
    if (!uid) return;

    return onSnapshot(
      query(
        collection(db, "tasks"),
        where("assignedTo", "==", uid)
      ),
      snap =>
        setTasks(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => !d.archived)
        ),
      e => console.error("Tasks:", e)
    );
  }, [uid]);

  /* DELIVERABLES */
  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "deliverables"),
        limit(40)
      ),
      snap =>
        setDeliverables(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(d => !d.archived)
        ),
      e => console.error("Deliverables:", e)
    );
  }, []);

  /* TEAM COUNT */
  useEffect(() => {
    if (!uid) return;

    getDocs(collection(db, "users"))
      .then(snap =>
        setTeamCount(
          snap.docs.filter(
            d => d.data()?.isActive !== false
          ).length
        )
      )
      .catch(e => console.error("Team:", e));
  }, [uid]);

  /* AUTO CLOSE AT 10 PM */
  useEffect(() => {
    if (!attendanceRef || !active || now < end) return;

    updateDoc(attendanceRef, {
      active: false,
      paused: false,
      pausedAt: null,
      logoutAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(e => console.error("Auto logout:", e));
  }, [attendanceRef, active, now, end]);

  /*
    TIMER LOGIC

    Working:
      now - login - completed pauses

    Paused:
      pause moment - login - completed pauses

    Therefore the displayed timer NEVER increases while paused.
  */
  const elapsed = useMemo(() => {
    const loginAt =
      toMs(attendance?.loginAt) ||
      localStart;

    if (!loginAt) return 0;

    const completedPause =
      Number(attendance?.totalPausedMs || 0);

    if (paused) {
      const pauseAt =
        toMs(attendance?.pausedAt) ||
        localPause;

      if (!pauseAt) return 0;

      return Math.max(
        0,
        pauseAt - loginAt - completedPause
      );
    }

    const logoutAt = toMs(
      attendance?.logoutAt
    );

    const endAt = active
      ? Math.min(now, end)
      : logoutAt || now;

    return Math.max(
      0,
      endAt - loginAt - completedPause
    );
  }, [
    attendance,
    active,
    paused,
    localStart,
    localPause,
    now,
    end,
  ]);

  const pending = tasks.filter(
    t =>
      !["APPROVED", "DONE", "COMPLETED"].includes(
        String(t.status || "").toUpperCase()
      )
  );

  const awaiting = tasks.filter(
    t =>
      String(t.status || "").toUpperCase() ===
      "AWAITING_APPROVAL"
  );

  const finished = tasks.filter(t =>
    ["APPROVED", "DONE", "COMPLETED"].includes(
      String(t.status || "").toUpperCase()
    )
  );

  const production = deliverables.filter(
    d =>
      !["POSTED", "COMPLETED", "DONE"].includes(
        String(d.status || "").toUpperCase()
      )
  );

  /* START */
  async function startShift() {
    if (
      !uid ||
      !attendanceRef ||
      busy ||
      active ||
      completed ||
      !canStart
    )
      return;

    setBusy(true);
    setError("");

    const startedLocally = Date.now();
    setLocalStart(startedLocally);
    setLocalPause(null);

    try {
      await setDoc(
        attendanceRef,
        {
          userId: uid,
          name:
            profile?.name ||
            user?.displayName ||
            "Team member",
          date: today,
          loginAt: serverTimestamp(),
          logoutAt: null,
          pausedAt: null,
          totalPausedMs: 0,
          active: true,
          paused: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Start:", e);

      setLocalStart(null);

      setError(
        e?.code === "permission-denied"
          ? "You do not have permission to start this shift."
          : "Could not start the shift."
      );
    } finally {
      setBusy(false);
    }
  }

  /* PAUSE / RESUME */
  async function togglePause() {
    if (!attendanceRef || !active || busy) return;

    setBusy(true);
    setError("");

    try {
      /* PAUSE */
      if (!paused) {
        const pauseNow = Date.now();

        /*
          Set this immediately so the UI freezes
          at the exact moment the button is pressed.
        */
        setLocalPause(pauseNow);

        await updateDoc(attendanceRef, {
          paused: true,
          pausedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        return;
      }

      /* RESUME */
      const pauseStarted =
        toMs(attendance?.pausedAt) ||
        localPause;

      const pausedDuration = pauseStarted
        ? Math.max(0, Date.now() - pauseStarted)
        : 0;

      setLocalPause(null);

      await updateDoc(attendanceRef, {
        paused: false,
        pausedAt: null,
        totalPausedMs:
          Number(attendance?.totalPausedMs || 0) +
          pausedDuration,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Pause:", e);

      setError(
        e?.code === "permission-denied"
          ? "You do not have permission to update this shift."
          : "Could not update the shift."
      );
    } finally {
      setBusy(false);
    }
  }

  function requestEndShift() {
    if (!active || busy) return;
    setConfirmEnd(true);
  }

  /* END */
  async function endShift() {
    if (!attendanceRef || !active || busy) return;

    setBusy(true);
    setError("");

    try {
      const pauseStarted =
        toMs(attendance?.pausedAt) ||
        localPause;

      const extraPause =
        paused && pauseStarted
          ? Math.max(
              0,
              Date.now() - pauseStarted
            )
          : 0;

      await updateDoc(attendanceRef, {
        active: false,
        paused: false,
        pausedAt: null,
        logoutAt: serverTimestamp(),
        totalPausedMs:
          Number(attendance?.totalPausedMs || 0) +
          extraPause,
        updatedAt: serverTimestamp(),
      });

      setLocalPause(null);
      setConfirmEnd(false);
    } catch (e) {
      console.error("End:", e);

      setError(
        e?.code === "permission-denied"
          ? "You do not have permission to end this shift."
          : "Could not end the shift."
      );
    } finally {
      setBusy(false);
    }
  }

  const firstName =
    profile?.name?.split(" ")[0] || "there";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f8fa]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">

        {/* HEADER */}
        <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Workspace
            </div>

            <h1 className="text-[30px] font-semibold tracking-[-.035em] text-slate-950 sm:text-[36px]">
              Good to see you, {firstName}.
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {getDateLabel()}
            </p>
          </div>

          {/* SHIFT CONTROLS */}
          <div className="flex items-center gap-2 self-start xl:self-auto">

            {!paused && (
              <div
                className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 shadow-sm ${
                  active
                    ? "border-emerald-200"
                    : "border-slate-200"
                }`}
              >
                <Clock3
                  size={14}
                  className={
                    active
                      ? "text-emerald-600"
                      : "text-slate-400"
                  }
                />

                <span className="font-mono text-sm font-semibold text-slate-800">
                  {formatTime(elapsed)}
                </span>

                {active && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                    Working
                  </span>
                )}
              </div>
            )}

            {paused && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 shadow-sm">
                <Pause
                  size={14}
                  className="text-amber-600"
                />

                <span className="text-xs font-semibold text-amber-700">
                  Shift paused
                </span>
              </div>
            )}

            {!active ? (
              <button
                onClick={startShift}
                disabled={
                  busy ||
                  !canStart ||
                  completed
                }
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  completed
                    ? "bg-slate-100 text-slate-500"
                    : "bg-slate-950 text-white hover:bg-slate-800"
                }`}
              >
                {completed ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Play
                    size={14}
                    fill="currentColor"
                  />
                )}

                {completed
                  ? "Shift completed"
                  : "Start shift"}
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  disabled={busy}
                  className={`grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition ${
                    paused
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                  title={
                    paused
                      ? "Resume shift"
                      : "Pause shift"
                  }
                >
                  {paused ? (
                    <Play
                      size={15}
                      fill="currentColor"
                    />
                  ) : (
                    <Pause size={15} />
                  )}
                </button>

                <button
                  onClick={requestEndShift}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <TimerReset size={14} />
                  Shift logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>

            <button
              onClick={() => setError("")}
              className="font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* COMPLETED */}
        {completed && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={16} />
            </span>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                Today's shift is complete
              </p>

              <p className="text-xs text-slate-500">
                Your recorded working time has been saved.
                You cannot start another shift today.
              </p>
            </div>
          </div>
        )}

        {/* HERO */}
        <section className="relative mb-6 overflow-hidden rounded-[26px] bg-[#101318] px-6 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8 lg:px-10 lg:py-9">
          <div className="pointer-events-none absolute -right-28 -top-36 h-80 w-80 rounded-full bg-white/[.07] blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_.8fr] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[11px] font-medium text-slate-300">
                <Sparkles size={13} />
                Rare Fiction workspace
              </div>

              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-.04em] sm:text-4xl lg:text-[44px] lg:leading-[1.05]">
                Everything you need to move the work forward.
              </h2>

              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
                Stay close to your priorities, production
                pipeline and team activity without turning the
                home screen into an analytics wall.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate("/tasks")}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-slate-100"
                >
                  Open my tasks
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() =>
                    navigate("/deliverables")
                  }
                  className="rounded-xl border border-white/10 bg-white/[.05] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/[.09]"
                >
                  View production
                </button>
              </div>
            </div>

            <div className="lg:border-l lg:border-white/10 lg:pl-8">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
                    Focus
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {pending.length}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    tasks in motion
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
                    Production
                  </p>

                  <p className="mt-2 text-2xl font-semibold">
                    {production.length}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    active deliverables
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">
                    Your completed work
                  </span>

                  <span className="font-semibold">
                    {finished.length}
                  </span>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{
                      width: `${
                        tasks.length
                          ? Math.min(
                              100,
                              (finished.length /
                                tasks.length) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={Target}
            label="My priorities"
            value={pending.length}
            meta="Tasks needing attention"
            onClick={() => navigate("/tasks")}
          />

          <Stat
            icon={FileCheck2}
            label="Awaiting review"
            value={awaiting.length}
            meta="Submitted for approval"
            onClick={() => navigate("/tasks")}
          />

          <Stat
            icon={Video}
            label="Production"
            value={production.length}
            meta="Deliverables in motion"
            onClick={() =>
              navigate("/deliverables")
            }
          />

          <Stat
            icon={Users}
            label="Workspace"
            value={teamCount || "—"}
            meta="Active team members"
            onClick={() =>
              navigate("/messages")
            }
          />
        </div>

        {/* LOWER CARDS */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <CheckCircle2 size={18} />
              </span>

              <div>
                <p className="text-sm font-semibold">
                  Today at a glance
                </p>

                <p className="text-xs text-slate-500">
                  Keep the important things close
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => navigate("/tasks")}
                className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Target size={15} />
                  My tasks
                </span>

                <span className="text-xs font-semibold text-slate-400">
                  {tasks.length}
                </span>
              </button>

              <button
                onClick={() =>
                  navigate("/messages")
                }
                className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm">
                  <MessageCircle size={15} />
                  Messages
                </span>

                <ChevronRight
                  size={15}
                  className="text-slate-400"
                />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Clock3 size={18} />
              </span>

              <div>
                <p className="text-sm font-semibold">
                  Shift status
                </p>

                <p className="text-xs text-slate-500">
                  Your attendance for today
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {completed
                  ? "Shift completed"
                  : paused
                  ? "Shift paused"
                  : active
                  ? "Currently working"
                  : "Shift not started"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {completed
                  ? "Today's attendance has been closed."
                  : paused
                  ? "Working time is frozen. Resume when you're ready."
                  : active
                  ? "Working time is being recorded."
                  : "Start your shift when you're ready."}
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-between px-1 text-[11px] text-slate-400">
          <span>Rare Fiction workspace</span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
      </div>

      {/* END SHIFT CONFIRMATION */}
      {confirmEnd && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-base font-semibold text-slate-950">
                End today's shift?
              </p>

              <p className="mt-1 text-sm text-slate-500">
                This will permanently close your shift
                for today.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-900">
                  Important
                </p>

                <p className="mt-1 text-sm leading-6 text-red-800">
                  Once you end your shift, it will be
                  counted as completed and{" "}
                  <strong>
                    cannot be restarted or redone today
                  </strong>
                  .
                </p>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                If you're only taking a break, choose
                Cancel and use Pause instead.
              </p>
            </div>

            <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                onClick={() =>
                  setConfirmEnd(false)
                }
                disabled={busy}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={endShift}
                disabled={busy}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy
                  ? "Ending..."
                  : "Yes, end shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}