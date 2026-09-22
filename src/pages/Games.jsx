import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Clock3,
  Gamepad2,
  Lock,
  Play,
  TimerReset,
} from "lucide-react";

import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const PLAY_TIME = 3 * 60 * 1000;
const COOLDOWN = 2 * 60 * 60 * 1000;

const games = [
  {
    id: "snake",
    title: "Snake",
    emoji: "🐍",
    description: "Classic snake with keyboard and mobile controls.",
    path: "/games/snake",
  },
  {
    id: "memory",
    title: "Memory",
    emoji: "🧠",
    description: "Match the cards and test your memory.",
    path: "/games/memory",
  },
  {
    id: "platform",
    title: "Platform Adventure",
    emoji: "🏃",
    description: "Run, jump and explore the platform world.",
    path: "/games/platform",
  },
];

const formatTime = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
};

function Games() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    return onSnapshot(
      doc(db, "gameSessions", user.uid),
      (snap) => setSession(snap.exists() ? snap.data() : null),
      (error) => console.error("Game session:", error)
    );
  }, [user?.uid]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAt = session?.startedAt?.toMillis?.() || 0;
  const unlockAt = session?.unlockAt?.toMillis?.() || 0;

  const playEnd = startedAt + PLAY_TIME;

  const isPlaying =
    startedAt > 0 &&
    now < playEnd;

  const isCooldown =
    !isPlaying &&
    unlockAt > now;

  const remaining =
    isPlaying ? playEnd - now : 0;

  const cooldownRemaining =
    isCooldown ? unlockAt - now : 0;

  const startGame = async (game) => {
    if (starting) return;

    if (isPlaying) {
      navigate(game.path);
      return;
    }

    if (isCooldown) return;

    if (!user?.uid) return;

    setStarting(true);

    /*
      Navigate immediately.
      The Snake page will receive the Firestore session
      once it is created.
    */
    navigate(game.path);

    try {
      await setDoc(doc(db, "gameSessions", user.uid), {
        uid: user.uid,
        game: game.id,
        startedAt: serverTimestamp(),
        unlockAt: new Date(
          Date.now() + PLAY_TIME + COOLDOWN
        ),
      });
    } catch (error) {
      console.error("Unable to create game session:", error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-full bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
              <Gamepad2 size={15} />
              RFM Games
            </div>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Take a quick break.
            </h1>

            <p className="mt-2 max-w-xl text-sm text-white/40">
              Choose any game. Your three-minute session is shared
              across all games.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            {isCooldown ? (
              <Lock size={17} className="text-red-400" />
            ) : (
              <Clock3 size={17} className="text-white/60" />
            )}

            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/30">
                Status
              </p>

              <p className="text-xs font-semibold">
                {isCooldown
                  ? "GAMES LOCKED"
                  : isPlaying
                    ? "SESSION ACTIVE"
                    : "READY TO PLAY"}
              </p>
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                {isCooldown ? (
                  <TimerReset size={22} />
                ) : (
                  <Clock3 size={22} />
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-white/30">
                  {isCooldown
                    ? "Next session available in"
                    : "Time remaining"}
                </p>

                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {isPlaying
                    ? formatTime(remaining)
                    : isCooldown
                      ? formatTime(cooldownRemaining)
                      : "03:00"}
                </p>
              </div>
            </div>

            <p className="max-w-md text-xs leading-5 text-white/35">
              {isCooldown
                ? "Your gaming session has ended. Games will unlock automatically after the cooldown."
                : isPlaying
                  ? "Switch between games without resetting your timer."
                  : "Starting any game begins your three-minute shared session."}
            </p>
          </div>
        </div>

        {/* Games */}
        <div className="grid gap-4 md:grid-cols-3">
          {games.map((game) => {
            const locked = isCooldown;

            return (
              <button
                key={game.id}
                type="button"
                disabled={locked || starting}
                onClick={() => startGame(game)}
                className={`group relative overflow-hidden rounded-3xl border p-6 text-left transition-all ${
                  locked
                    ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-40"
                    : "border-white/10 bg-white/[0.035] hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <div className="mb-7 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] text-4xl">
                    {game.emoji}
                  </div>

                  {locked ? (
                    <div className="rounded-full bg-white/5 p-2">
                      <Lock size={15} />
                    </div>
                  ) : (
                    <Play
                      size={17}
                      className="text-white/20 transition-all group-hover:translate-x-1 group-hover:text-white/70"
                    />
                  )}
                </div>

                <h2 className="text-lg font-semibold">
                  {game.title}
                </h2>

                <p className="mt-2 min-h-10 text-sm leading-5 text-white/40">
                  {game.description}
                </p>

                <div className="mt-6 border-t border-white/5 pt-4">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
                    {locked
                      ? "Locked"
                      : isPlaying
                        ? "Continue"
                        : "Play now"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Policy */}
        <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-start gap-3">
            <Clock3
              size={17}
              className="mt-0.5 shrink-0 text-white/30"
            />

            <p className="text-xs leading-5 text-white/35">
              <span className="font-semibold text-white/60">
                Gaming policy:
              </span>{" "}
              one shared three-minute session is available. After the
              session ends, gaming is locked for two hours.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Games;
