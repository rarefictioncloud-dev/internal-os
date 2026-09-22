import { useEffect, useMemo, useState } from "react";
import {
  Lock,
  Trophy,
  Sparkles,
  ChevronLeft,
  RotateCcw,
  Star,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const ICONS = [
  "🚀","🎮","⚡","🎯","🧩","🔥","💎","👾","🌟","🛸",
  "🍕","🎧","🦊","🐼","🌈","🍔","🏆","🎲","🪐","🦄",
  "🎨","💡","🚗","🎵","🍩","🧠","🌙","☕","🎸","🦁",
  "🍿","🤖",
];

const TOTAL_LEVELS = 30;
const SESSION_TIME = 180000;
const RED = "#ef4444";

const levelPairs = (level) =>
  Math.min(ICONS.length, level + 2);

const columns = (cards) =>
  cards <= 6
    ? 3
    : cards <= 16
      ? 4
      : cards <= 30
        ? 5
        : cards <= 42
          ? 6
          : 8;

const difficulty = (level) =>
  level <= 5
    ? "Easy"
    : level <= 12
      ? "Normal"
      : level <= 20
        ? "Hard"
        : "Expert";

const makeDeck = (level) => {
  const selected = ICONS.slice(0, levelPairs(level));

  return [...selected, ...selected]
    .map((icon, i) => ({
      icon,
      id: `${level}-${i}-${Math.random()}`,
    }))
    .sort(() => Math.random() - 0.5);
};

const storageKey = (uid) =>
  `rfm-memory-progress-${uid}`;

export default function Memory() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);

  /* -------------------------------------------------------
     LEVEL STATE
  ------------------------------------------------------- */

  const [currentLevel, setCurrentLevel] =
    useState(1);

  const [unlockedLevel, setUnlockedLevel] =
    useState(1);

  const [completedLevel, setCompletedLevel] =
    useState(null);

  /* -------------------------------------------------------
     GAME STATE
  ------------------------------------------------------- */

  const [deck, setDeck] = useState(() =>
    makeDeck(1)
  );

  const [open, setOpen] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);

  const [locked, setLocked] = useState(false);
  const [now, setNow] = useState(Date.now());

  const level = currentLevel;
  const unlocked = unlockedLevel;

  const pairs = levelPairs(level);
  const cards = pairs * 2;

  const difficultyText = difficulty(level);

  const progressPercent = Math.round(
    (unlocked / TOTAL_LEVELS) * 100
  );

  /* =======================================================
     LOAD SAVED PROGRESS
  ======================================================= */

  useEffect(() => {
    if (!user?.uid) return;

    try {
      const saved = JSON.parse(
        localStorage.getItem(
          storageKey(user.uid)
        ) || "null"
      );

      const savedUnlocked = Math.min(
        TOTAL_LEVELS,
        Math.max(
          1,
          Number(saved?.unlocked) || 1
        )
      );

      const savedLevel = Math.min(
        savedUnlocked,
        Math.max(
          1,
          Number(saved?.level) || 1
        )
      );

      setUnlockedLevel(savedUnlocked);
      setCurrentLevel(savedLevel);

      setDeck(makeDeck(savedLevel));
      setOpen([]);
      setMatched([]);
      setMoves(0);
      setCompletedLevel(null);
      setLocked(false);
    } catch {
      setUnlockedLevel(1);
      setCurrentLevel(1);
      setDeck(makeDeck(1));
    }
  }, [user?.uid]);

  /* =======================================================
     SAVE PROGRESS
  ======================================================= */

  const saveProgress = (
    nextLevel,
    nextUnlocked
  ) => {
    const safeUnlocked = Math.min(
      TOTAL_LEVELS,
      Math.max(1, nextUnlocked)
    );

    const safeLevel = Math.min(
      safeUnlocked,
      Math.max(1, nextLevel)
    );

    setUnlockedLevel(safeUnlocked);
    setCurrentLevel(safeLevel);

    if (user?.uid) {
      try {
        localStorage.setItem(
          storageKey(user.uid),
          JSON.stringify({
            level: safeLevel,
            unlocked: safeUnlocked,
          })
        );
      } catch {}
    }
  };

  /* =======================================================
     FIREBASE SHARED GAMING SESSION
  ======================================================= */

  useEffect(() => {
    if (!user?.uid) return;

    return onSnapshot(
      doc(db, "gameSessions", user.uid),
      (snap) => {
        setSession(
          snap.exists()
            ? snap.data()
            : null
        );
      },
      (error) => {
        console.error(
          "Memory session listener error:",
          error
        );
      }
    );
  }, [user?.uid]);

  /* =======================================================
     SESSION TIMER
  ======================================================= */

  useEffect(() => {
    const started =
      session?.startedAt?.toMillis?.() || 0;

    if (!started) return;

    const tick = () => setNow(Date.now());

    tick();

    const timer = setInterval(
      tick,
      500
    );

    return () =>
      clearInterval(timer);
  }, [session]);

  const started =
    session?.startedAt?.toMillis?.() || 0;

  const timeLeft = started
    ? Math.max(
        0,
        started + SESSION_TIME - now
      )
    : SESSION_TIME;

  useEffect(() => {
    if (
      started &&
      now >= started + SESSION_TIME
    ) {
      setLocked(true);
    }
  }, [started, now]);

  /* =======================================================
     START / RESET LEVEL
  ======================================================= */

  const startLevel = (targetLevel) => {
    const safeLevel = Math.min(
      unlockedLevel,
      Math.max(1, targetLevel)
    );

    setCurrentLevel(safeLevel);

    setDeck(makeDeck(safeLevel));
    setOpen([]);
    setMatched([]);
    setMoves(0);
    setCompletedLevel(null);

    /* Save the level the user is currently playing */
    if (user?.uid) {
      try {
        localStorage.setItem(
          storageKey(user.uid),
          JSON.stringify({
            level: safeLevel,
            unlocked: unlockedLevel,
          })
        );
      } catch {}
    }
  };

  const restartLevel = () => {
    startLevel(currentLevel);
  };

  /* =======================================================
     CARD FLIP
  ======================================================= */

  const flip = (index) => {
    if (
      locked ||
      completedLevel !== null ||
      open.length >= 2 ||
      open.includes(index) ||
      matched.includes(index)
    ) {
      return;
    }

    setOpen((current) => [
      ...current,
      index,
    ]);
  };

  /* =======================================================
     MATCH LOGIC
  ======================================================= */

  useEffect(() => {
    if (open.length !== 2) return;

    setMoves((m) => m + 1);

    const [a, b] = open;

    if (
      deck[a]?.icon === deck[b]?.icon
    ) {
      const nextMatched = [
        ...matched,
        a,
        b,
      ];

      setMatched(nextMatched);
      setOpen([]);

      /* -----------------------------------------------
         LEVEL COMPLETED
      ----------------------------------------------- */

      if (
        nextMatched.length ===
        deck.length
      ) {
        const finishedLevel =
          currentLevel;

        setCompletedLevel(
          finishedLevel
        );

        /* ---------------------------------------------
           Unlock next level BUT DO NOT CHANGE
           CURRENT UI LEVEL YET.
        --------------------------------------------- */

        if (
          finishedLevel <
          TOTAL_LEVELS
        ) {
          const nextLevel =
            finishedLevel + 1;

          const nextUnlocked =
            Math.max(
              unlockedLevel,
              nextLevel
            );

          setUnlockedLevel(
            nextUnlocked
          );

          /*
           * Persist the NEXT level so if the
           * session expires or the user refreshes,
           * the game continues from there.
           *
           * UI remains on the completed level
           * until Continue is pressed.
           */
          if (user?.uid) {
            try {
              localStorage.setItem(
                storageKey(user.uid),
                JSON.stringify({
                  level: nextLevel,
                  unlocked:
                    nextUnlocked,
                }),
              );
            } catch {}
          }
        } else {
          if (user?.uid) {
            try {
              localStorage.setItem(
                storageKey(user.uid),
                JSON.stringify({
                  level:
                    TOTAL_LEVELS,
                  unlocked:
                    TOTAL_LEVELS,
                }),
              );
            } catch {}
          }
        }
      }

      return;
    }

    const timer = setTimeout(() => {
      setOpen([]);
    }, 650);

    return () =>
      clearTimeout(timer);
  }, [
    open,
    deck,
    matched,
    currentLevel,
    unlockedLevel,
    user?.uid,
  ]);

  /* =======================================================
     CONTINUE AFTER COMPLETION
  ======================================================= */

  const continueToNextLevel = () => {
    if (
      completedLevel === null
    ) {
      return;
    }

    if (
      completedLevel >=
      TOTAL_LEVELS
    ) {
      navigate("/games");
      return;
    }

    const nextLevel =
      completedLevel + 1;

    startLevel(nextLevel);
  };

  /* =======================================================
     TIMER DISPLAY
  ======================================================= */

  const minutes = String(
    Math.floor(
      timeLeft / 60000
    )
  ).padStart(2, "0");

  const seconds = String(
    Math.floor(
      (timeLeft % 60000) / 1000
    )
  ).padStart(2, "0");

  /* =======================================================
     LEVEL BUTTONS
  ======================================================= */

  const levelButtons = useMemo(
    () =>
      Array.from(
        {
          length: TOTAL_LEVELS,
        },
        (_, i) => i + 1
      ),
    []
  );

  return (
    <main
      className="
        min-h-screen
        bg-black
        px-3 py-4
        text-white
        sm:px-5 sm:py-6
      "
    >
      <div className="mx-auto max-w-4xl">

        {/* =================================================
            BACK
        ================================================= */}

        <button
          onClick={() =>
            navigate("/games")
          }
          className="
            mb-4 flex items-center gap-1
            text-[11px]
            text-white/30
            transition
            hover:text-red-400
          "
        >
          <ChevronLeft size={14} />
          Back to games
        </button>

        {/* =================================================
            HEADER
        ================================================= */}

        <header
          className="
            mb-5 flex flex-col gap-3
            sm:flex-row
            sm:items-end
            sm:justify-between
          "
        >
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p
                className="
                  text-[9px]
                  uppercase
                  tracking-[.28em]
                  text-red-500
                "
              >
                Game 02 · Memory Lab
              </p>

              <Sparkles
                size={11}
                className="text-red-500"
              />
            </div>

            <h1
              className="
                text-2xl
                font-semibold
                tracking-tight
                sm:text-3xl
              "
            >
              Memory
            </h1>

            <p
              className="
                mt-1 max-w-lg
                text-[11px]
                text-white/30
              "
            >
              Match every pair and progress
              through all 30 levels.
            </p>
          </div>

          {/* STATS */}

          <div
            className="
              flex flex-wrap
              gap-1.5
              text-[10px]
            "
          >
            <span
              className="
                rounded-lg
                border border-red-500/25
                bg-red-500/[.07]
                px-3 py-1.5
                text-red-400
              "
            >
              Level{" "}
              <b className="ml-1 text-white">
                {level}/30
              </b>
            </span>

            <span
              className="
                rounded-lg
                border border-white/10
                bg-white/[.035]
                px-3 py-1.5
              "
            >
              Moves{" "}
              <b className="ml-1">
                {moves}
              </b>
            </span>

            <span
              className="
                rounded-lg
                border border-white/10
                bg-white/[.035]
                px-3 py-1.5
                tabular-nums
              "
            >
              Time{" "}
              <b className="ml-1">
                {minutes}:{seconds}
              </b>
            </span>
          </div>
        </header>

        {/* =================================================
            JOURNEY
        ================================================= */}

        <section
          className="
            relative mb-4 overflow-hidden
            rounded-2xl
            border border-white/10
            bg-[#050505]
            p-4
          "
        >
          <div
            className="
              pointer-events-none
              absolute -right-10 -top-12
              h-28 w-28
              rounded-full
              bg-red-600/[.06]
              blur-3xl
            "
          />

          <div
            className="
              relative flex flex-col gap-3
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <div>
              <div className="flex items-center gap-1.5">
                <Star
                  size={12}
                  className="
                    fill-red-500
                    text-red-500
                  "
                />

                <span
                  className="
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[.22em]
                    text-red-500
                  "
                >
                  Your journey
                </span>
              </div>

              <h2
                className="
                  mt-1
                  text-sm
                  font-semibold
                "
              >
                {unlocked ===
                TOTAL_LEVELS
                  ? "All levels unlocked"
                  : `Level ${level} is your current checkpoint`}
              </h2>

              <p
                className="
                  mt-0.5
                  text-[10px]
                  text-white/30
                "
              >
                {unlocked ===
                TOTAL_LEVELS
                  ? "Complete Memory Lab unlocked."
                  : `${unlocked} of ${TOTAL_LEVELS} levels unlocked · ${difficultyText}`}
              </p>
            </div>

            <div
              className="
                w-full
                sm:max-w-[230px]
              "
            >
              <div
                className="
                  mb-1.5 flex
                  justify-between
                  text-[8px]
                  uppercase
                  tracking-[.18em]
                  text-white/20
                "
              >
                <span>
                  Progress
                </span>

                <span>
                  {progressPercent}%
                </span>
              </div>

              <div
                className="
                  h-1.5 overflow-hidden
                  rounded-full
                  bg-white/[.06]
                "
              >
                <div
                  className="
                    h-full rounded-full
                    bg-red-500
                    shadow-[0_0_10px_rgba(239,68,68,.35)]
                    transition-all
                    duration-500
                  "
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            LEVEL SELECT
        ================================================= */}

        <section
          className="
            mb-4 rounded-2xl
            border border-white/10
            bg-[#030303]
            p-3
          "
        >
          <div
            className="
              mb-3 flex
              items-center
              justify-between
              gap-2
            "
          >
            <div>
              <p
                className="
                  text-[9px]
                  uppercase
                  tracking-[.22em]
                  text-white/20
                "
              >
                Level select
              </p>

              <p
                className="
                  mt-0.5
                  text-[10px]
                  text-white/30
                "
              >
                Unlocked levels stay saved.
              </p>
            </div>

            <span
              className="
                rounded-full
                border border-red-500/15
                bg-red-500/[.04]
                px-2.5 py-1
                text-[9px]
                text-red-400/70
              "
            >
              {difficultyText}
            </span>
          </div>

          <div
            className="
              grid
              grid-cols-10
              gap-1.5
              sm:grid-cols-15
            "
          >
            {levelButtons.map(
              (n) => {
                const isUnlocked =
                  n <= unlocked;

                const active =
                  n === level;

                const complete =
                  n < unlocked;

                return (
                  <button
                    key={n}
                    disabled={!isUnlocked}
                    onClick={() =>
                      isUnlocked &&
                      startLevel(n)
                    }
                    className={`
                      group relative
                      aspect-square
                      rounded-lg
                      border
                      text-[9px]
                      font-semibold
                      transition-all
                      duration-200

                      ${
                        active
                          ? `
                            border-red-500
                            bg-red-500/[.13]
                            text-white
                            shadow-[0_0_18px_rgba(239,68,68,.14)]
                          `
                          : isUnlocked
                            ? `
                              border-white/10
                              bg-white/[.025]
                              text-white/50
                              hover:border-red-500/30
                              hover:bg-red-500/[.05]
                              hover:text-white
                            `
                            : `
                              cursor-not-allowed
                              border-white/[.05]
                              bg-white/[.01]
                              text-white/10
                            `
                      }
                    `}
                  >
                    {isUnlocked ? (
                      n
                    ) : (
                      <Lock
                        size={10}
                        className="
                          mx-auto
                          text-white/15
                        "
                      />
                    )}

                    {complete && (
                      <span
                        className="
                          absolute
                          right-0.5 top-0.5
                          h-1 w-1
                          rounded-full
                          bg-red-500
                        "
                      />
                    )}

                    {active && (
                      <span
                        className="
                          absolute
                          inset-x-1
                          -bottom-0.5
                          h-0.5
                          rounded-full
                          bg-red-500
                          shadow-[0_0_7px_rgba(239,68,68,.8)]
                        "
                      />
                    )}
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* =================================================
            GAME BOARD
        ================================================= */}

        <section
          className="
            rounded-2xl
            border border-white/10
            bg-[#030303]
            p-3
            shadow-2xl
            sm:p-4
          "
        >
          {/* GAME HEADER */}

          <div
            className="
              mx-auto mb-3
              flex max-w-2xl
              items-center
              justify-between
              px-0.5
            "
          >
            <div>
              <p
                className="
                  text-[9px]
                  uppercase
                  tracking-[.22em]
                  text-white/20
                "
              >
                Challenge{" "}
                {String(level).padStart(
                  2,
                  "0"
                )}
              </p>

              <p
                className="
                  mt-0.5
                  text-[10px]
                  text-white/30
                "
              >
                {cards} cards ·{" "}
                {pairs} pairs
              </p>
            </div>

            <button
              onClick={restartLevel}
              disabled={
                completedLevel !==
                null
              }
              className="
                flex items-center gap-1.5
                rounded-lg
                border border-white/10
                px-2.5 py-1.5
                text-[9px]
                text-white/35
                transition
                hover:border-red-500/20
                hover:bg-red-500/[.05]
                hover:text-red-400
                disabled:opacity-30
              "
            >
              <RotateCcw size={11} />
              Restart
            </button>
          </div>

          {/* BOARD */}

          <div
            className="
              mx-auto grid
              w-full max-w-2xl
              gap-1.5
              sm:gap-2
            "
            style={{
              gridTemplateColumns:
                `repeat(${columns(cards)}, minmax(0, 1fr))`,
            }}
          >
            {deck.map(
              (card, i) => {
                const visible =
                  open.includes(i) ||
                  matched.includes(i);

                return (
                  <button
                    key={card.id}
                    onClick={() =>
                      flip(i)
                    }
                    disabled={
                      locked ||
                      completedLevel !==
                        null
                    }
                    className={`
                      group
                      aspect-square
                      rounded-xl
                      border
                      text-xl
                      transition-all
                      duration-200
                      sm:text-2xl

                      ${
                        visible
                          ? `
                            scale-[.98]
                            border-red-500/35
                            bg-red-500/[.08]
                            shadow-[inset_0_0_18px_rgba(239,68,68,.07)]
                          `
                          : `
                            border-white/[.07]
                            bg-white/[.018]
                            hover:-translate-y-0.5
                            hover:border-red-500/20
                            hover:bg-red-500/[.035]
                          `
                      }
                    `}
                  >
                    <span
                      className={
                        visible
                          ? `
                            drop-shadow-[0_0_10px_rgba(255,255,255,.18)]
                          `
                          : `
                            text-white/15
                          `
                      }
                    >
                      {visible
                        ? card.icon
                        : "?"}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* =================================================
            FOOTER
        ================================================= */}

        <div
          className="
            mx-auto mt-3
            flex max-w-2xl
            flex-wrap
            justify-between
            gap-2
            text-[9px]
            text-white/20
          "
        >
          <span>
            {difficultyText} ·{" "}
            {pairs} pairs ·{" "}
            Progress saved
          </span>

          <span>
            3-minute shared gaming
            session
          </span>
        </div>

        {/* =================================================
            LEVEL COMPLETE
        ================================================= */}

        {completedLevel !==
          null &&
          completedLevel <
            TOTAL_LEVELS && (
            <div
              className="
                fixed inset-0 z-50
                grid place-items-center
                bg-black/90
                px-5
                backdrop-blur-xl
              "
            >
              <div
                className="
                  w-full max-w-sm
                  rounded-2xl
                  border border-red-500/15
                  bg-[#080808]
                  p-6
                  text-center
                  shadow-[0_30px_100px_rgba(0,0,0,.75)]
                "
              >
                <div
                  className="
                    mx-auto mb-3
                    grid h-12 w-12
                    place-items-center
                    rounded-xl
                    border border-red-500/15
                    bg-red-500/[.08]
                    text-red-500
                  "
                >
                  <Trophy size={22} />
                </div>

                <p
                  className="
                    text-[9px]
                    uppercase
                    tracking-[.28em]
                    text-red-500
                  "
                >
                  Level cleared
                </p>

                <h2
                  className="
                    mt-1.5
                    text-xl
                    font-semibold
                  "
                >
                  Level{" "}
                  {completedLevel}{" "}
                  complete
                </h2>

                <p
                  className="
                    mt-2
                    text-xs
                    leading-5
                    text-white/35
                  "
                >
                  Level{" "}
                  {completedLevel + 1}{" "}
                  is unlocked and saved.
                  Your next session will
                  continue there.
                </p>

                <button
                  onClick={
                    continueToNextLevel
                  }
                  className="
                    mt-5
                    inline-flex
                    items-center
                    gap-2
                    rounded-lg
                    bg-red-500
                    px-4 py-2.5
                    text-[10px]
                    font-semibold
                    text-white
                    shadow-[0_0_22px_rgba(239,68,68,.22)]
                    transition
                    hover:bg-red-400
                  "
                >
                  <Sparkles size={12} />
                  Continue to Level{" "}
                  {completedLevel + 1}
                </button>
              </div>
            </div>
          )}

        {/* =================================================
            ALL LEVELS COMPLETE
        ================================================= */}

        {completedLevel ===
          TOTAL_LEVELS && (
          <div
            className="
              fixed inset-0 z-50
              grid place-items-center
              bg-black/90
              px-5
              backdrop-blur-xl
            "
          >
            <div
              className="
                w-full max-w-sm
                rounded-2xl
                border border-red-500/15
                bg-[#080808]
                p-6
                text-center
                shadow-[0_30px_100px_rgba(0,0,0,.75)]
              "
            >
              <div
                className="
                  mx-auto mb-3
                  grid h-12 w-12
                  place-items-center
                  rounded-xl
                  border border-red-500/15
                  bg-red-500/[.08]
                  text-red-500
                "
              >
                <Trophy size={22} />
              </div>

              <p
                className="
                  text-[9px]
                  uppercase
                  tracking-[.28em]
                  text-red-500
                "
              >
                Memory master
              </p>

              <h2
                className="
                  mt-1.5
                  text-xl
                  font-semibold
                "
              >
                All 30 levels
                cleared
              </h2>

              <p
                className="
                  mt-2
                  text-xs
                  text-white/35
                "
              >
                Your complete Memory
                Lab progression is
                saved.
              </p>

              <button
                onClick={() =>
                  navigate("/games")
                }
                className="
                  mt-5
                  rounded-lg
                  bg-red-500
                  px-4 py-2.5
                  text-[10px]
                  font-semibold
                  text-white
                  shadow-[0_0_22px_rgba(239,68,68,.22)]
                  transition
                  hover:bg-red-400
                "
              >
                Return to games
              </button>
            </div>
          </div>
        )}

        {/* =================================================
            SESSION LOCK
        ================================================= */}

        {locked && (
          <div
            className="
              fixed inset-0 z-[60]
              grid place-items-center
              bg-black/90
              px-5
              backdrop-blur-xl
            "
          >
            <div
              className="
                w-full max-w-sm
                rounded-2xl
                border border-red-500/15
                bg-[#080808]
                p-6
                text-center
                shadow-[0_30px_100px_rgba(0,0,0,.75)]
              "
            >
              <div
                className="
                  mx-auto mb-3
                  grid h-12 w-12
                  place-items-center
                  rounded-xl
                  border border-red-500/10
                  bg-red-500/[.06]
                "
              >
                <Lock
                  className="text-red-500"
                  size={22}
                />
              </div>

              <h2
                className="
                  text-lg
                  font-semibold
                "
              >
                Games Locked
              </h2>

              <p
                className="
                  mt-2
                  text-xs
                  leading-5
                  text-white/30
                "
              >
                Your 3-minute gaming
                session has ended.
                Your Memory progress
                has been safely
                remembered.
              </p>

              <button
                onClick={() =>
                  navigate("/games")
                }
                className="
                  mt-5
                  rounded-lg
                  bg-red-500
                  px-4 py-2.5
                  text-[10px]
                  font-semibold
                  text-white
                  shadow-[0_0_22px_rgba(239,68,68,.22)]
                  transition
                  hover:bg-red-400
                "
              >
                Return
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}