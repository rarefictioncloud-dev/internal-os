import { useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { useShift } from "../hooks/useShift";
import { useEndShiftLogout } from "../components/common/EndShiftLogout";

const DOG = `${import.meta.env.BASE_URL}models/chow-chow-hero.png`;
const HERO =
  "Glad you stopped in. Good taste tends to find us. Now, what are we building?";

const links = [
  ["Tasks", "/tasks"],
  ["Production", "/deliverables"],
  ["Messages", "/messages"],
  ["Profile", "/profile"],
];

const formatTime = (value) => {
  const total = Math.max(0, Math.floor(value / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};

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
        <span className="ml-1 inline-block h-[1em] w-[2px] animate-[blink_1s_step-end_infinite] bg-white align-middle" />
      )}
    </>
  );
}

function StatCard({ icon, label, value, note, onClick, wide = false }) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[20px] border border-white/[.10] bg-white/[.055] p-3.5 text-left shadow-[0_18px_50px_rgba(0,0,0,.18)] backdrop-blur-2xl transition duration-300 sm:rounded-[22px] sm:p-4 ${
        wide ? "md:col-span-2" : ""
      } ${onClick ? "hover:-translate-y-1 hover:bg-white/[.09]" : ""}`}
    >
      <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/[.04] blur-2xl transition group-hover:bg-orange-300/[.08]" />

      <div className="relative flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-sm text-black sm:h-10 sm:w-10">
          {icon}
        </span>

        <div className="min-w-0">
          <p className="text-[8px] tracking-[.22em] text-white/40 sm:text-[9px]">
            {label}
          </p>
          <p className="mt-1 text-[21px] font-medium leading-none tracking-tight sm:text-2xl">
            {value}
          </p>
        </div>

        {onClick && (
          <span className="ml-auto text-sm text-white/25 transition group-hover:translate-x-1 group-hover:text-white/70">
            ↗
          </span>
        )}
      </div>

      <p className="relative mt-2.5 truncate pl-[48px] text-[10px] text-white/45 sm:mt-3 sm:pl-[52px] sm:text-xs">
        {note}
      </p>
    </Tag>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const uid = user?.uid;

  const dogRef = useRef(null);
  const motion = useRef({ x: 0, y: 0, rx: 0, ry: 0, scale: 1 });
  const target = useRef({ x: 0, y: 0, rx: 0, ry: 0, scale: 1 });

  // Shift starts automatically as soon as the authenticated user reaches the dashboard.
  // The hook remains the single source of truth for today's attendance and timer.
  const shift = useShift(uid, profile?.name || user?.displayName, { control: true, tick: true });
  const { status, worked } = shift;
  const onShift = status === "working" || status === "paused";

  const [tasks, setTasks] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [teamCount, setTeamCount] = useState(0);
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

  /* Smooth mouse response for the dog. */
  useEffect(() => {
    let frame;

    const onMove = (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;

      target.current = {
        x: x * 38,
        y: y * 23,
        rx: -y * 3,
        ry: x * 6,
        scale: 1 + Math.max(0, 0.5 - Math.abs(y)) * 0.018,
      };
    };

    const onLeave = () => {
      target.current = { x: 0, y: 0, rx: 0, ry: 0, scale: 1 };
    };

    const animate = () => {
      const a = motion.current;
      const b = target.current;
      const ease = 0.08;

      a.x += (b.x - a.x) * ease;
      a.y += (b.y - a.y) * ease;
      a.rx += (b.rx - a.rx) * ease;
      a.ry += (b.ry - a.ry) * ease;
      a.scale += (b.scale - a.scale) * ease;

      if (dogRef.current) {
        dogRef.current.style.transform =
          `translate3d(${a.x}px,${a.y}px,0) perspective(1100px) ` +
          `rotateX(${a.rx}deg) rotateY(${a.ry}deg) scale(${a.scale})`;
      }

      frame = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    frame = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

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

  return (
    <main className="relative min-h-full overflow-hidden bg-[#070707] text-white">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(255,139,56,.13),transparent_25%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_80%,rgba(255,255,255,.045),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />

      {/* Shift status (fixed; same positions as before on mobile and desktop). */}
      <div className="fixed left-4 top-24 z-50 sm:left-8 sm:top-24 md:left-[296px] md:top-28 lg:left-[312px] lg:top-28">
        {onShift ? (
          <div className="flex items-center gap-2 rounded-full border border-white/[.13] bg-black/70 px-3.5 py-2.5 shadow-2xl backdrop-blur-2xl sm:gap-3 sm:px-4">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "paused" ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            <strong className="text-[10px] tracking-wide sm:text-[11px]">
              {status === "paused" ? "PAUSED" : "WORKING"}
            </strong>
            {status === "working" && (
              <span className="font-mono text-[10px] text-white/50 sm:text-[11px]">
                {formatTime(worked)}
              </span>
            )}
            <button
              type="button"
              onClick={logoutFlow.ask}
              disabled={logoutFlow.busy}
              className="text-[10px] underline underline-offset-2 hover:text-white/65 disabled:opacity-40 sm:text-[11px]"
            >
              Logout
            </button>
          </div>
        ) : status === "completed" ? (
          <div className="rounded-full border border-white/[.13] bg-black/70 px-4 py-2.5 text-[10px] backdrop-blur-2xl sm:text-[11px]">
            ✓ Shift completed · {formatTime(worked)}
          </div>
        ) : (
          <div className="rounded-full border border-white/[.13] bg-black/70 px-4 py-2.5 text-[10px] text-white/60 backdrop-blur-2xl sm:text-[11px]">
            {status === "closed" ? "Shift hours end at 5:30 PM" : "Starting shift…"}
          </div>
        )}
      </div>

      {/* Fixed with the shift control; scrolling cannot move it. */}
      <div className="pointer-events-none fixed left-2 top-[9rem] z-40 sm:left-6 md:left-[296px] md:top-[12rem] lg:left-[312px]">
        <div className="rounded-xl border border-white/[.07] bg-black/30 px-3 py-2 shadow-lg backdrop-blur-md">
          <p className="text-[9px] tracking-[.3em] text-white/35">RFM / OS</p>
          <p className="mt-1 text-[10px] text-white/40 sm:text-xs">Creative operations intelligence</p>
        </div>
      </div>

      {/* Hero */}
      <section className="relative flex min-h-[calc(100vh-1px)] flex-col overflow-hidden px-4 pb-[300px] pt-28 sm:px-8 sm:pb-[290px] md:justify-center md:px-10 md:pb-24 md:pt-10 lg:pb-28 max-md:min-h-[calc(100svh-1px)] max-md:px-4 max-md:pb-0 max-md:pt-0">
        <div className="pointer-events-none absolute bottom-[25%] right-[3%] h-52 w-52 rounded-full bg-orange-400/[.10] blur-[75px] sm:h-64 sm:w-64 md:hidden" />

        <div className="relative z-30 mt-auto w-full max-w-[610px] md:-translate-y-[7vh] lg:-translate-y-[9vh] max-md:absolute max-md:left-4 max-md:right-4 max-md:top-[22%] max-md:mt-0 max-md:w-auto max-md:max-w-none max-[380px]:top-[19%]">
          <p className="mb-5 max-w-[620px] text-[clamp(21px,2.6vw,30px)] leading-[1.28] tracking-[-.025em] text-white sm:mb-6 md:text-[clamp(23px,2.4vw,30px)] max-md:mb-4 max-md:max-w-[350px] max-md:text-[19px] max-md:leading-[1.25] max-md:tracking-[-.02em]">
            <Typewriter text={HERO} />
          </p>

          <div className="flex max-w-[620px] flex-wrap gap-y-1 max-md:max-w-[350px] max-md:gap-y-1.5">
            {links.map(([label, path]) => (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                className="mx-[.18em] mb-[.35em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-3.5 py-[.38em] text-[12px] text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:text-white sm:px-5 sm:text-[14px] max-md:px-3 max-md:py-[.32em] max-md:text-[10px]"
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="mx-[.18em] mb-[.35em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/70 bg-transparent px-3.5 py-[.38em] text-[12px] text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-black sm:px-5 sm:text-[14px] max-md:px-3 max-md:py-[.32em] max-md:text-[10px]"
            >
              Send a brief hello
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute z-30 bottom-[86%] right-[9%] max-md:bottom-[53%] max-md:right-[8%]">
          <div className="relative rounded-full border border-white/[.10] bg-black/55 px-4 py-2.5 text-center text-[10px] font-medium text-white/80 shadow-[0_12px_35px_rgba(0,0,0,.3)] backdrop-blur-xl sm:px-5 sm:text-[11px] md:text-xs">
            i know i am cute but mind your work
            <span className="absolute -bottom-1.5 right-[22%] h-3 w-3 rotate-45 border-b border-r border-white/[.10] bg-black/55" />
          </div>
        </div>
        <div
          ref={dogRef}
          className="pointer-events-none absolute z-20
            bottom-[15%] right-[-12%] w-[78%] max-w-[820px]
            sm:bottom-[13%] sm:right-[-8%] sm:w-[72%]
            md:bottom-[0%] md:right-[-7%] md:w-[59%]
            lg:right-[-3%] lg:w-[55%]
            xl:w-[51%]
            max-md:bottom-[20%] max-md:right-[-17%] max-md:w-[92%] max-md:max-w-none
            max-[380px]:bottom-[17%] max-[380px]:w-[96%]"
          style={{ transformOrigin: "68% 72%" }}
        >
          <img
            src={DOG}
            alt="Chow Chow"
            draggable="false"
            className="relative block h-auto w-full select-none object-contain drop-shadow-[0_45px_65px_rgba(0,0,0,.75)]"
          />
        </div>
      </section>

      {/* Stats — desktop bottom bar, mobile compact floating grid */}
      <section className="absolute bottom-4 left-0 right-0 z-40 px-4 sm:px-8 lg:px-10 max-md:bottom-3 max-md:px-3">
        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-2 md:grid-cols-4 max-md:gap-2">
          <StatCard
            icon="▶"
            label="FOCUS"
            value={shift.data ? formatTime(worked) : "00:00:00"}
            note={focusNote}
          />

          <StatCard
            icon="✓"
            label="MY TASKS"
            value={pendingTasks.length}
            note={`${awaiting.length} awaiting approval`}
            onClick={() => navigate("/tasks")}
          />

          <StatCard
            icon="□"
            label="DELIVERABLES"
            value={production.length}
            note="In production"
            onClick={() => navigate("/deliverables")}
          />

          <StatCard
            icon="♧"
            label="TEAM"
            value={teamCount || "—"}
            note="Active team members"
            onClick={() => navigate("/messages")}
          />
        </div>
      </section>

      {logoutFlow.dialog}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @media (max-width: 767px) {
          main {
            min-height: 100%;
          }

          img[alt="Chow Chow"] {
            max-height: 390px;
            object-fit: contain;
            object-position: center bottom;
          }

          section.absolute.bottom-4 > div > * {
            min-height: 0;
          }
        }

        @media (max-width: 380px) {
          img[alt="Chow Chow"] {
            max-height: 340px;
          }
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