import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase/config";


export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const shiftEndMs = (from = Date.now()) => {
  const d = new Date(from);
  d.setHours(17, 30, 0, 0);
  return d.getTime();
};

export const toMs = (v) => {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return typeof v.seconds === "number" ? v.seconds * 1000 : null;
};

/* Server clock. The timer compares server timestamps (loginAt) with "now", so a device
   clock that is off would freeze or inflate it. We learn the offset from our own writes:
   the server's updatedAt vs. the device time when the write was made. */
let serverOffsetMs = 0;
let writeStartedAt = 0;
export const serverNow = () => Date.now() + serverOffsetMs;

function learnOffset(snap) {
  if (!writeStartedAt || snap.metadata.hasPendingWrites || !snap.exists()) return;
  const confirmed = toMs(snap.get("updatedAt"));
  const latency = Date.now() - writeStartedAt;
  if (confirmed && latency < 30000) serverOffsetMs = confirmed - (writeStartedAt + latency / 2);
  writeStartedAt = 0;
}

const attendanceDoc = (uid, day = dayKey()) => doc(db, "attendance", `${uid}_${day}`);

// Worked time: stops at logout / shift end, and never counts after 5:30 PM.
export function workedMs(a, now = serverNow()) {
  const login = toMs(a?.loginAt);
  if (!login) return 0;

  const stop =
    a.active === false
      ? toMs(a.logoutAt) ?? now
      : Math.min(
          a.paused ? toMs(a.pausedAt) ?? now : now,
          shiftEndMs(login)
        );

  return Math.max(0, stop - login - Number(a.totalPausedMs || 0));
}

// Close the shift now. Anything after 5:30 PM (or after an old pause) is not counted.
function endPatch(a) {
  const now = serverNow();
  const end = shiftEndMs(toMs(a.loginAt) ?? now);
  const pausedAt = toMs(a.pausedAt);
  const stop = Math.min(a.paused ? pausedAt ?? now : now, end);

  return {
    active: false,
    paused: false,
    pausedAt: null,
    logoutAt: serverTimestamp(),
    totalPausedMs:
      Number(a.totalPausedMs || 0) + Math.max(0, now - stop),
    updatedAt: serverTimestamp(),
  };
}

// The one automatic write the controller should make for the current state, or null.
function nextStep(a, { uid, name, day }) {
  if (!a) {
    return serverNow() < shiftEndMs()
      ? [
          "start",
          {
            userId: uid,
            name: name || "Team member",
            date: day,
            loginAt: serverTimestamp(),
            logoutAt: null,
            pausedAt: null,
            totalPausedMs: 0,
            active: true,
            paused: false,
            updatedAt: serverTimestamp(),
          },
        ]
      : null;
  }

  if (a.active !== true) return null;

  if (serverNow() >= shiftEndMs()) {
    return ["end", endPatch(a)];
  }

  // Legacy: a shift paused by an earlier version resumes at sign-in (gap not counted).
  if (a.paused) {
    const pausedAt = toMs(a.pausedAt);

    return [
      "resume",
      {
        paused: false,
        pausedAt: null,
        updatedAt: serverTimestamp(),
        totalPausedMs:
          Number(a.totalPausedMs || 0) +
          (pausedAt ? Math.max(0, serverNow() - pausedAt) : 0),
      },
    ];
  }

  return null;
}

/* useShift(uid, name, { control, tick })
   control: true → this instance performs auto start / 5:30 end (mount it ONCE, in the layout).
   tick: true → re-render every second for a live timer. */
export function useShift(
  uid,
  name,
  { control = false, tick = true } = {}
) {
  /*
   * Keep the attendance day tied to the current calendar day.
   * This makes an already-open OS automatically move to a fresh
   * attendance document after midnight instead of remaining attached
   * to yesterday's document.
   */
  const [day, setDay] = useState(() => dayKey());

  const ref = useMemo(
    () => (uid ? attendanceDoc(uid, day) : null),
    [uid, day]
  );

  const [shift, setShift] = useState({
    loaded: false,
    data: null,
  });

  const [now, setNow] = useState(serverNow());
  const [error, setError] = useState("");
  const attempted = useRef(new Set());

  // Keep the current day fresh if the OS stays open across midnight.
  useEffect(() => {
    const refreshDay = () => {
      const currentDay = dayKey();
      setDay((previous) =>
        previous === currentDay ? previous : currentDay
      );
    };

    refreshDay();

    const timer = setInterval(refreshDay, 1000);
    return () => clearInterval(timer);
  }, []);

  // Reset one-time write attempts whenever the attendance day changes.
  useEffect(() => {
    attempted.current.clear();
    setShift({ loaded: false, data: null });
    setError("");
  }, [day, uid]);

  // Clock: every second for display, or one wake-up at 5:30 PM for the controller.
  useEffect(() => {
    if (tick) {
      const t = setInterval(() => setNow(serverNow()), 1000);
      return () => clearInterval(t);
    }

    const wait = Math.max(0, shiftEndMs(serverNow()) - serverNow());

    if (wait <= 0) {
      setNow(serverNow());
      return undefined;
    }

    const t = setTimeout(() => setNow(serverNow()), wait + 500);
    return () => clearTimeout(t);
  }, [tick, day]);

  // "estimate" gives a pending serverTimestamp a local value at once → the timer starts instantly.
  useEffect(() => {
    if (!ref) {
      setShift({ loaded: false, data: null });
      return undefined;
    }

    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        learnOffset(snap);

        setShift({
          loaded: true,
          data: snap.exists()
            ? snap.data({ serverTimestamps: "estimate" })
            : null,
        });

        setNow(serverNow());
      },
      (e) => {
        console.error("Attendance listener error:", e);
        setError("Could not load today's shift.");
      }
    );
  }, [ref]);

  const ended =
    serverNow() >= shiftEndMs() ||
    now >= shiftEndMs();

  useEffect(() => {
    if (!control || !ref || !shift.loaded) return;

    const step = nextStep(shift.data, {
      uid,
      name,
      day,
    });

    if (!step) return;

    const [action, data] = step;
    const key = `${uid}:${day}:${action}`;

    if (attempted.current.has(key)) return;

    attempted.current.add(key);
    writeStartedAt = Date.now();

    (action === "start"
      ? setDoc(ref, data)
      : updateDoc(ref, data)
    ).catch((e) => {
      console.error(`Shift ${action} failed:`, e);

      setError(
        e?.code === "permission-denied"
          ? `Your shift could not ${action} — permission denied.`
          : `Could not ${action} today's shift.`
      );
    });
  }, [
    control,
    ref,
    shift,
    ended,
    uid,
    name,
    day,
  ]);

  const a = shift.data;

  const status = !shift.loaded
    ? "loading"
    : !a
      ? ended
        ? "closed"
        : "starting"
      : a.active === false
        ? "completed"
        : a.paused
          ? "paused"
          : "working";

  return {
    ...shift,
    status,
    now,
    worked: workedMs(a, now),
    error,
    clearError: () => setError(""),
  };
}

/* Logging out ends today's shift, then signs out. Used by every logout button
   (via components/common/EndShiftLogout.jsx). Throws if the shift could not be ended,
   so the user is NOT signed out with the timer still running. */
export async function endShiftAndSignOut() {
  const uid = auth.currentUser?.uid;

  if (uid) {
    const ref = attendanceDoc(uid);
    const snap = await getDoc(ref);
    const a = snap.exists() ? snap.data() : null;

    if (a?.active === true) {
      writeStartedAt = Date.now();
      await updateDoc(ref, endPatch(a));
    }
  }

  await signOut(auth);
}

export default useShift;