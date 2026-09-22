import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Gamepad2,
  Lock,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const PLAY_TIME = 3 * 60 * 1000;

const GRID = 20;
const CELL = 20;
const BOARD = GRID * CELL;
const TICK_RATE = 115;

const formatTime = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remaining
  ).padStart(2, "0")}`;
};

function Snake() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const canvasRef = useRef(null);

  const snakeRef = useRef([]);
  const foodRef = useRef(null);

  const directionRef = useRef({ x: 1, y: 0 });
  const nextDirectionRef = useRef({ x: 1, y: 0 });

  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);

  const [session, setSession] = useState(undefined);
  const [now, setNow] = useState(Date.now());

  const [score, setScore] = useState(0);

  const [highScore, setHighScore] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem("snakeHighScore"));
      return Number.isFinite(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });

  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  /*
   * ============================================================
   * FIRESTORE SESSION
   * ============================================================
   *
   * session === undefined
   * -> Firestore is still loading
   *
   * session === null
   * -> No valid session exists
   *
   * session === object
   * -> Valid gaming session
   */

  useEffect(() => {
    if (!user?.uid) {
      setSession(null);
      return;
    }

    setSession(undefined);

    const sessionRef = doc(db, "gameSessions", user.uid);

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSession(null);
          return;
        }

        setSession(snapshot.data());
      },
      (error) => {
        console.error("Game session listener error:", error);
        setSession(null);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  /*
   * ============================================================
   * CLOCK
   * ============================================================
   */

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  /*
   * ============================================================
   * SESSION TIME
   * ============================================================
   */

  const startedAt = session?.startedAt?.toMillis?.() || 0;

  const playEnd = startedAt + PLAY_TIME;

  const active = startedAt > 0 && now < playEnd;

  const remaining = active ? playEnd - now : 0;

  /*
   * ============================================================
   * SESSION VALIDATION
   * ============================================================
   */

  useEffect(() => {
    if (session === undefined) return;

    if (!session) {
      navigate("/games", { replace: true });
      return;
    }

    if (!startedAt) {
      return;
    }

    if (now >= playEnd) {
      setPaused(true);
    }
  }, [
    session,
    startedAt,
    now,
    playEnd,
    navigate,
  ]);

  /*
   * ============================================================
   * FOOD
   * ============================================================
   */

  const createFood = useCallback((snake) => {
    const available = [];

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const occupied = snake.some(
          (part) => part.x === x && part.y === y
        );

        if (!occupied) {
          available.push({ x, y });
        }
      }
    }

    if (!available.length) {
      return null;
    }

    return available[
      Math.floor(Math.random() * available.length)
    ];
  }, []);

  /*
   * ============================================================
   * RESET GAME
   * ============================================================
   */

  const resetGame = useCallback(() => {
    const initialSnake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];

    snakeRef.current = initialSnake;

    foodRef.current = createFood(initialSnake);

    directionRef.current = {
      x: 1,
      y: 0,
    };

    nextDirectionRef.current = {
      x: 1,
      y: 0,
    };

    scoreRef.current = 0;

    setScore(0);
    setGameOver(false);
    setPaused(false);
  }, [createFood]);

  /*
   * ============================================================
   * START / RESET WHEN SESSION BECOMES ACTIVE
   * ============================================================
   */

  useEffect(() => {
    if (!active) return;

    if (!snakeRef.current.length) {
      resetGame();
    }
  }, [active, resetGame]);

  /*
   * ============================================================
   * CHANGE DIRECTION
   * ============================================================
   */

  const changeDirection = useCallback((x, y) => {
    const current = directionRef.current;

    // Prevent immediate 180-degree turns.
    if (
      current.x + x === 0 &&
      current.y + y === 0
    ) {
      return;
    }

    nextDirectionRef.current = { x, y };
  }, []);

  /*
   * ============================================================
   * KEYBOARD CONTROLS
   * ============================================================
   */

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const controlKeys = [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
        "w",
        "a",
        "s",
        "d",
        "r",
      ];

      if (controlKeys.includes(key)) {
        event.preventDefault();
      }

      if (key === "arrowup" || key === "w") {
        changeDirection(0, -1);
        return;
      }

      if (key === "arrowdown" || key === "s") {
        changeDirection(0, 1);
        return;
      }

      if (key === "arrowleft" || key === "a") {
        changeDirection(-1, 0);
        return;
      }

      if (key === "arrowright" || key === "d") {
        changeDirection(1, 0);
        return;
      }

      if (key === " " && active && !gameOver) {
        setPaused((value) => !value);
        return;
      }

      if (key === "r" && active) {
        resetGame();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    active,
    gameOver,
    changeDirection,
    resetGame,
  ]);

  /*
   * ============================================================
   * GAME LOOP
   * ============================================================
   *
   * Uses refs for score/high score so the interval does NOT
   * restart every time the player eats food.
   */

  useEffect(() => {
    if (!active || paused || gameOver) {
      return;
    }

    const interval = setInterval(() => {
      const snake = snakeRef.current;

      if (!snake.length) {
        return;
      }

      directionRef.current =
        nextDirectionRef.current;

      const head = snake[0];

      const nextHead = {
        x: head.x + directionRef.current.x,
        y: head.y + directionRef.current.y,
      };

      /*
       * Wall collision
       */

      const hitWall =
        nextHead.x < 0 ||
        nextHead.x >= GRID ||
        nextHead.y < 0 ||
        nextHead.y >= GRID;

      /*
       * Food collision
       */

      const food = foodRef.current;

      const eating =
        food &&
        nextHead.x === food.x &&
        nextHead.y === food.y;

      /*
       * When not eating, the tail moves away,
       * so don't count the last segment as a collision.
       */

      const bodyToCheck = eating
        ? snake
        : snake.slice(0, -1);

      const hitSelf = bodyToCheck.some(
        (part) =>
          part.x === nextHead.x &&
          part.y === nextHead.y
      );

      /*
       * Game over
       */

      if (hitWall || hitSelf) {
        setGameOver(true);
        return;
      }

      const nextSnake = [
        nextHead,
        ...snake,
      ];

      /*
       * Eat food
       */

      if (eating) {
        const newScore =
          scoreRef.current + 10;

        scoreRef.current = newScore;

        setScore(newScore);

        /*
         * High score
         */

        if (newScore > highScoreRef.current) {
          highScoreRef.current = newScore;

          setHighScore(newScore);

          try {
            sessionStorage.setItem(
              "snakeHighScore",
              String(newScore)
            );
          } catch {
            // Ignore storage errors.
          }
        }

        foodRef.current =
          createFood(nextSnake);
      } else {
        nextSnake.pop();
      }

      snakeRef.current = nextSnake;
    }, TICK_RATE);

    return () => clearInterval(interval);
  }, [
    active,
    paused,
    gameOver,
    createFood,
  ]);

  /*
   * ============================================================
   * DRAW CANVAS
   * ============================================================
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(
      0,
      0,
      BOARD,
      BOARD
    );

    /*
     * Background
     */

    ctx.fillStyle = "#070707";

    ctx.fillRect(
      0,
      0,
      BOARD,
      BOARD
    );

    /*
     * Grid
     */

    ctx.strokeStyle =
      "rgba(255,255,255,0.035)";

    ctx.lineWidth = 1;

    for (let i = 0; i <= GRID; i++) {
      const position = i * CELL;

      ctx.beginPath();
      ctx.moveTo(position, 0);
      ctx.lineTo(position, BOARD);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, position);
      ctx.lineTo(BOARD, position);
      ctx.stroke();
    }

    /*
     * Food
     */

    const food = foodRef.current;

    if (food) {
      const centerX =
        food.x * CELL + CELL / 2;

      const centerY =
        food.y * CELL + CELL / 2;

      ctx.fillStyle = "#ffffff";

      ctx.beginPath();

      ctx.arc(
        centerX,
        centerY,
        6,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    /*
     * Snake
     */

    snakeRef.current.forEach(
      (part, index) => {
        const padding =
          index === 0 ? 1 : 2;

        ctx.fillStyle =
          index === 0
            ? "#ffffff"
            : "rgba(255,255,255,0.58)";

        ctx.beginPath();

        ctx.roundRect(
          part.x * CELL + padding,
          part.y * CELL + padding,
          CELL - padding * 2,
          CELL - padding * 2,
          index === 0 ? 6 : 4
        );

        ctx.fill();
      }
    );
  }, [
    score,
    now,
    paused,
    gameOver,
  ]);

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (session === undefined) {
    return (
      <div className="flex min-h-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <Gamepad2
            size={30}
            className="mx-auto mb-4 text-white/30"
          />

          <p className="text-sm text-white/40">
            Loading game session...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * NO SESSION
   * ============================================================
   */

  if (!session || !startedAt) {
    return (
      <div className="flex min-h-full items-center justify-center bg-black px-6 text-white">
        <div className="text-center">
          <Lock
            size={30}
            className="mx-auto mb-4 text-white/30"
          />

          <h2 className="text-lg font-semibold">
            Game session unavailable
          </h2>

          <p className="mt-2 text-xs text-white/40">
            Start a gaming session from the Games page.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate("/games")
            }
            className="mt-5 rounded-xl bg-white px-5 py-3 text-xs font-semibold text-black transition hover:bg-white/90"
          >
            Back to Games
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="min-h-full bg-black px-3 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}

        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              navigate("/games")
            }
            className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs text-white/60 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft size={15} />
            Games
          </button>

          <div className="flex items-center gap-2 sm:gap-3">

            {/* Score */}

            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center sm:px-4">
              <p className="text-[9px] uppercase tracking-widest text-white/30">
                Score
              </p>

              <p className="text-sm font-semibold tabular-nums">
                {score}
              </p>
            </div>

            {/* High Score */}

            <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-center sm:block">
              <p className="text-[9px] uppercase tracking-widest text-white/30">
                Best
              </p>

              <p className="text-sm font-semibold tabular-nums">
                {highScore}
              </p>
            </div>

            {/* Timer */}

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:px-4">
              <Clock3
                size={14}
                className="text-white/40"
              />

              <span className="text-sm font-semibold tabular-nums">
                {formatTime(remaining)}
              </span>
            </div>
          </div>
        </div>

        {/* Title */}

        <div className="mb-5 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Gamepad2
              size={17}
              className="text-white/40"
            />

            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">
              RFM Arcade
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Snake
          </h1>

          <p className="mt-1 text-xs text-white/30">
            Arrow keys / WASD • Space to pause
          </p>
        </div>

        {/* Board */}

        <div className="relative mx-auto w-full max-w-[460px]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-2 shadow-2xl sm:p-4">
            <canvas
              ref={canvasRef}
              width={BOARD}
              height={BOARD}
              className="block h-auto w-full rounded-2xl"
            />
          </div>

          {/* Session Expired */}

          {!active && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-black/90 p-6 backdrop-blur-md">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <Lock size={24} />
                </div>

                <h2 className="text-xl font-semibold">
                  Session ended
                </h2>

                <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-white/40">
                  Your three-minute gaming session has ended.
                  Games are now locked until your cooldown expires.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    navigate("/games")
                  }
                  className="mt-5 rounded-xl bg-white px-5 py-3 text-xs font-semibold text-black transition hover:bg-white/90"
                >
                  Back to Games
                </button>
              </div>
            </div>
          )}

          {/* Game Over */}

          {gameOver && active && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-black/75 p-6 backdrop-blur-sm">
              <div className="text-center">
                <div className="mb-4 text-4xl">
                  🐍
                </div>

                <h2 className="text-2xl font-semibold">
                  Game Over
                </h2>

                <p className="mt-2 text-sm text-white/40">
                  Final score:{" "}
                  <span className="text-white">
                    {score}
                  </span>
                </p>

                <button
                  type="button"
                  onClick={resetGame}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-xs font-semibold text-black transition hover:bg-white/90"
                >
                  <RotateCcw size={14} />
                  Restart
                </button>
              </div>
            </div>
          )}

          {/* Pause */}

          {paused &&
            active &&
            !gameOver && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-black/65 backdrop-blur-sm">
                <div className="text-center">
                  <Pause
                    size={28}
                    className="mx-auto mb-3 text-white/70"
                  />

                  <h2 className="text-xl font-semibold">
                    Paused
                  </h2>

                  <p className="mt-1 text-xs text-white/35">
                    Your session timer continues while paused.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setPaused(false)
                    }
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-xs font-semibold text-black"
                  >
                    <Play size={14} />
                    Continue
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Mobile Controls */}

        <div className="mx-auto mt-5 grid w-[190px] grid-cols-3 gap-2 sm:hidden">
          <div />

          <ControlButton
            label={<ArrowUp size={20} />}
            onClick={() =>
              changeDirection(0, -1)
            }
          />

          <div />

          <ControlButton
            label={<ArrowLeft size={20} />}
            onClick={() =>
              changeDirection(-1, 0)
            }
          />

          <ControlButton
            label={<ArrowDown size={20} />}
            onClick={() =>
              changeDirection(0, 1)
            }
          />

          <ControlButton
            label={<ArrowRight size={20} />}
            onClick={() =>
              changeDirection(1, 0)
            }
          />
        </div>

        {/* Actions */}

        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPaused((value) => !value)
            }
            disabled={!active || gameOver}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs text-white/60 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-25"
          >
            {paused ? (
              <Play size={14} />
            ) : (
              <Pause size={14} />
            )}

            {paused ? "Resume" : "Pause"}
          </button>

          <button
            type="button"
            onClick={resetGame}
            disabled={!active}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs text-white/60 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-25"
          >
            <RotateCcw size={14} />
            Restart
          </button>
        </div>

        {/* Instructions */}

        <div className="mx-auto mt-5 max-w-md text-center">
          <p className="text-[10px] leading-5 text-white/20">
            Eat the white targets to grow your snake and increase
            your score. Don't hit the walls or yourself.
          </p>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full touch-manipulation items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 transition active:scale-95 active:bg-white/10"
    >
      {label}
    </button>
  );
}

export default Snake;