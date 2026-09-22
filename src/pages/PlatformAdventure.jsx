import { useEffect, useRef, useState } from "react";
import { Lock, Heart, Coins as CoinsIcon, Maximize2, Minimize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

/* ------------------------------------------------------------------ */
/*  Endless runner: the world is generated in fixed-width segments as */
/*  the player advances. The camera locks onto the player once they   */
/*  pass a fixed screen position, so the viewport itself never moves  */
/*  — only the world scrolls underneath the character.                */
/* ------------------------------------------------------------------ */

const CANVAS_W = 800;
const CANVAS_H = 420;
const GROUND_Y = 360;
const PLAYER_W = 26;
const PLAYER_H = 34;
const GRAVITY = 0.62;
const JUMP_V = -12.2;
const MOVE_V = 3.6;
const SEGMENT_W = 380;
const LOOKAHEAD = 900;
const PRUNE_BEHIND = 500;
const LOCK_X = 300; // player's fixed screen position once the camera engages
const INVULN_FRAMES = 80;
const LIVES_START = 3;

const THEME_STEPS = [
  { sky: ["#8fd3ff", "#c9f0ff"], hill: "#3fae5c", hillShadow: "#2f8a47", ground: "#5b3a24", groundTop: "#6fbf4a" },
  { sky: ["#ffb572", "#ffe2b0"], hill: "#c98b45", hillShadow: "#a56a2c", ground: "#4a3220", groundTop: "#caa05c" },
  { sky: ["#1b1f3a", "#3a2f5c"], hill: "#2a2550", hillShadow: "#1c1938", ground: "#241a33", groundTop: "#6b4fa0" },
];

function themeFor(distance) {
  const idx = Math.floor(distance / 1600) % THEME_STEPS.length;
  return THEME_STEPS[idx];
}

/* seeded RNG so a given segment always generates the same layout */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSegment(index) {
  const startX = index * SEGMENT_W;
  const rng = mulberry32(index * 7919 + 13);
  const safeZone = index < 2;
  const platforms = [];
  const coins = [];
  const enemies = [];

  const wantsPit = !safeZone && index > 3 && rng() < 0.26;
  if (wantsPit) {
    const gapW = 70 + rng() * 45;
    const gapStart = startX + 70 + rng() * (SEGMENT_W - gapW - 140);
    platforms.push([startX, GROUND_Y, gapStart - startX, 60]);
    platforms.push([gapStart + gapW, GROUND_Y, startX + SEGMENT_W - (gapStart + gapW), 60]);
  } else {
    platforms.push([startX, GROUND_Y, SEGMENT_W, 60]);
  }

  if (!safeZone && rng() < 0.72) {
    const pw = 90 + rng() * 60;
    const px = startX + 40 + rng() * Math.max(20, SEGMENT_W - pw - 60);
    const py = 175 + rng() * 105;
    platforms.push([px, py, pw, 18]);
    const coinCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < coinCount; i++) {
      coins.push([px + 18 + i * 24, py - 26]);
    }
  }

  if (rng() < 0.45) {
    coins.push([startX + SEGMENT_W * 0.5 + rng() * 60, GROUND_Y - 45]);
  }

  if (!safeZone && rng() < 0.55) {
    const ex = startX + 70 + rng() * (SEGMENT_W - 140);
    enemies.push({
      x: ex,
      range: [startX + 15, startX + SEGMENT_W - 15],
      y: GROUND_Y,
    });
  }

  return { platforms, coins, enemies };
}

export default function PlatformAdventure() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvas = useRef(null);
  const wrapperRef = useRef(null);
  const [session, setSession] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [status, setStatus] = useState("playing"); // playing | gameOver
  const [score, setScore] = useState(0);
  const [coinsCollected, setCoinsCollected] = useState(0);
  const [lives, setLives] = useState(LIVES_START);
  const [distance, setDistance] = useState(0);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);

  const keys = useRef({});
  const player = useRef({ x: 80, y: 280, vx: 0, vy: 0, onGround: false, facing: 1, inv: 0 });
  const walkCycle = useRef(0);
  const squash = useRef(1);
  const camX = useRef(0);

  const nextSegment = useRef(0);
  const platforms = useRef([]);
  const runtimeCoins = useRef([]);
  const runtimeEnemies = useRef([]);
  const particles = useRef([]);
  const coinId = useRef(0);
  const enemyId = useRef(0);
  const frameCount = useRef(0);
  const bestDistance = useRef(0);
  const enemyKills = useRef(0);
  const distanceRef = useRef(0);

  /* ---------------- firebase session gate ---------------- */
  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(doc(db, "gameSessions", user.uid), snap =>
      setSession(snap.exists() ? snap.data() : null)
    );
  }, [user?.uid]);

  /* ---------------- keyboard input ---------------- */
  useEffect(() => {
    const down = e => {
      keys.current[e.key] = true;
      if (e.key === " ") e.preventDefault();
    };
    const up = e => (keys.current[e.key] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ---------------- fullscreen mode ---------------- */
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  async function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }

  /* ---------------- (re)start a run ---------------- */
  function resetRun() {
    player.current = { x: 80, y: 280, vx: 0, vy: 0, onGround: false, facing: 1, inv: 0 };
    walkCycle.current = 0;
    squash.current = 1;
    camX.current = 0;
    nextSegment.current = 0;
    platforms.current = [];
    runtimeCoins.current = [];
    runtimeEnemies.current = [];
    particles.current = [];
    coinId.current = 0;
    enemyId.current = 0;
    frameCount.current = 0;
    enemyKills.current = 0;
    bestDistance.current = 0;
    distanceRef.current = 0;
    ensureWorld(0);
    setScore(0);
    setCoinsCollected(0);
    setLives(LIVES_START);
    setDistance(0);
    setStatus("playing");
  }

  useEffect(() => { resetRun(); }, []);

  function ensureWorld(uptoX) {
    while (nextSegment.current * SEGMENT_W < uptoX + LOOKAHEAD) {
      const seg = buildSegment(nextSegment.current);
      platforms.current.push(...seg.platforms);
      seg.coins.forEach(([x, y]) => {
        runtimeCoins.current.push({ id: coinId.current++, x, y, taken: false });
      });
      seg.enemies.forEach(e => {
        runtimeEnemies.current.push({
          id: enemyId.current++,
          x: e.x,
          y: e.y,
          range: e.range,
          dir: 1,
          alive: true,
          wobble: Math.random() * 10,
        });
      });
      nextSegment.current += 1;
    }

    const cutoff = camX.current - PRUNE_BEHIND;
    platforms.current = platforms.current.filter(([x, , w]) => x + w > cutoff);
    runtimeCoins.current = runtimeCoins.current.filter(c => (c.taken ? false : c.x > cutoff));
    runtimeEnemies.current = runtimeEnemies.current.filter(e => (e.alive ? e.x > cutoff : false));
  }

  /* ---------------- main loop ---------------- */
  useEffect(() => {
    const started = session?.startedAt?.toMillis?.() || 0;
    if (!started) return;

    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;

    let frame;

    const loop = () => {
      const remainMs = started + 180000 - Date.now();
      setTimeLeft(Math.max(0, Math.ceil(remainMs / 1000)));
      if (remainMs <= 0) {
        setLocked(true);
        return;
      }

      if (status === "playing") {
        updatePhysics();
      }

      draw(ctx);
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status]);

  /* ---------------- physics + game logic ---------------- */
  function updatePhysics() {
    const p = player.current;
    frameCount.current += 1;

    const left = keys.current.ArrowLeft || keys.current.a;
    const right = keys.current.ArrowRight || keys.current.d;
    const jump = keys.current.ArrowUp || keys.current.w || keys.current[" "];

    p.vx = right ? MOVE_V : left ? -MOVE_V : 0;
    if (p.vx > 0) p.facing = 1;
    if (p.vx < 0) p.facing = -1;

    if (jump && p.onGround) {
      p.vy = JUMP_V;
      p.onGround = false;
      squash.current = 0.72;
    }

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;
    p.onGround = false;
    if (p.inv > 0) p.inv -= 1;

    if (p.vx !== 0) walkCycle.current += 0.18;

    ensureWorld(p.x);

    for (const [x, y, w] of platforms.current) {
      const withinX = p.x + PLAYER_W > x && p.x < x + w;
      const wasAbove = p.y + PLAYER_H - p.vy <= y + 1;
      const nowBelowTop = p.y + PLAYER_H >= y;
      if (withinX && wasAbove && nowBelowTop && p.vy >= 0) {
        p.y = y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
    }

    squash.current += (1 - squash.current) * 0.2;

    if (p.x < camX.current) p.x = camX.current; // can't run backward off-screen

    if (p.y > 460) {
      loseLife();
      return;
    }

    for (const coin of runtimeCoins.current) {
      if (coin.taken) continue;
      const dx = p.x + PLAYER_W / 2 - coin.x;
      const dy = p.y + PLAYER_H / 2 - coin.y;
      if (Math.hypot(dx, dy) < 24) {
        coin.taken = true;
        setScore(s => s + 10);
        setCoinsCollected(c => c + 1);
        spawnSparkle(coin.x, coin.y, 48);
      }
    }

    for (const en of runtimeEnemies.current) {
      if (!en.alive) continue;
      en.x += en.dir * (1.3 + Math.min(1.4, distanceRef.current / 4000));
      en.wobble += 0.15;
      if (en.x < en.range[0] || en.x > en.range[1]) en.dir *= -1;

      const overlapX = p.x + PLAYER_W > en.x - 14 && p.x < en.x + 14;
      const overlapY = p.y + PLAYER_H > en.y - 26 && p.y + PLAYER_H < en.y - 4;
      const sideOverlapY = p.y + PLAYER_H > en.y - 30 && p.y < en.y;

      if (overlapX && overlapY && p.vy > 0) {
        en.alive = false;
        p.vy = JUMP_V * 0.6;
        enemyKills.current += 1;
        setScore(s => s + 25);
        spawnSparkle(en.x, en.y - 20, 45);
      } else if (overlapX && sideOverlapY && p.inv <= 0) {
        loseLife();
        return;
      }
    }

    // camera locks to the character once they cross the fixed screen point
    camX.current = Math.max(0, p.x - LOCK_X);

    if (frameCount.current % 6 === 0) {
      const d = Math.floor(p.x / 8);
      if (d > bestDistance.current) bestDistance.current = d;
      distanceRef.current = bestDistance.current;
      setDistance(bestDistance.current);
    }

    particles.current = particles.current
      .map(pt => ({ ...pt, y: pt.y - 0.6, life: pt.life - 1 }))
      .filter(pt => pt.life > 0);
  }

  function spawnSparkle(x, y, hue) {
    for (let i = 0; i < 6; i++) {
      particles.current.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        life: 24 + Math.random() * 10,
        hue: hue + Math.random() * 20,
      });
    }
  }

  function loseLife() {
    setLives(l => {
      const next = l - 1;
      if (next <= 0) {
        setStatus("gameOver");
        setBest(b => Math.max(b, bestDistance.current));
      } else {
        const p = player.current;
        p.x = Math.max(camX.current + 40, p.x - 90);
        p.y = 150;
        p.vy = 0;
        p.vx = 0;
        p.inv = INVULN_FRAMES;
      }
      return Math.max(0, next);
    });
  }

  /* ---------------- drawing ---------------- */
  function draw(ctx) {
    const cx = camX.current;
    const theme = themeFor(distanceRef.current);

    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = theme.hillShadow;
    for (let i = -1; i < 6; i++) {
      const hx = i * 260 - (cx * 0.25) % 260;
      ctx.beginPath();
      ctx.ellipse(hx + 130, 380, 160, 90, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = theme.hill;
    for (let i = -1; i < 6; i++) {
      const hx = i * 320 - (cx * 0.4) % 320;
      ctx.beginPath();
      ctx.ellipse(hx + 160, 400, 190, 110, 0, Math.PI, 0);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 6; i++) {
      const clx = ((i * 420 - cx * 0.15) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      const cly = 50 + (i % 3) * 30;
      ctx.beginPath();
      ctx.ellipse(clx, cly, 26, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(clx + 22, cly + 4, 18, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(clx - 20, cly + 6, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(-cx, 0);

    for (const [x, y, w, h] of platforms.current) {
      ctx.fillStyle = theme.ground;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = theme.groundTop;
      ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let bx = x; bx < x + w; bx += 34) ctx.fillRect(bx, y + 10, 2, h - 10);
    }

    for (const coin of runtimeCoins.current) {
      if (coin.taken) continue;
      const spin = Math.abs(Math.sin(Date.now() / 220 + coin.id));
      ctx.fillStyle = "#ffd54f";
      ctx.save();
      ctx.translate(coin.x, coin.y);
      ctx.scale(0.4 + spin * 0.6, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const en of runtimeEnemies.current) {
      if (!en.alive) continue;
      drawEnemy(ctx, en);
    }

    for (const pt of particles.current) {
      ctx.fillStyle = `hsla(${pt.hue}, 90%, 60%, ${Math.max(0, pt.life / 30)})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    drawPlayer(ctx, player.current);

    ctx.restore();
  }

  function drawPlayer(ctx, p) {
    const cx = p.x + PLAYER_W / 2;
    const cy = p.y + PLAYER_H;
    const stretch = squash.current;
    const walking = Math.abs(p.vx) > 0 && p.onGround;
    const legSwing = walking ? Math.sin(walkCycle.current) * 16 : 0;
    const armSwing = walking ? Math.sin(walkCycle.current + Math.PI) * 14 : 0;
    const flicker = p.inv > 0 && Math.floor(p.inv / 5) % 2 === 0;

    ctx.save();
    ctx.globalAlpha = flicker ? 0.35 : 1;
    ctx.translate(cx, cy);
    ctx.scale(p.facing, 1);
    ctx.scale(1 / stretch, stretch);

    ctx.strokeStyle = "#2b2f3a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-5, -14);
    ctx.lineTo(-5 + legSwing * 0.3, -1);
    ctx.moveTo(5, -14);
    ctx.lineTo(5 - legSwing * 0.3, -1);
    ctx.stroke();

    ctx.fillStyle = "#3060d6";
    ctx.beginPath();
    ctx.roundRect(-11, -30, 22, 20, 6);
    ctx.fill();

    ctx.fillStyle = "#e8452c";
    ctx.beginPath();
    ctx.roundRect(-11, -34, 22, 10, [6, 6, 0, 0]);
    ctx.fill();

    ctx.strokeStyle = "#e8452c";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, -28);
    ctx.lineTo(-10 + armSwing * 0.4, -16);
    ctx.moveTo(10, -28);
    ctx.lineTo(10 - armSwing * 0.4, -16);
    ctx.stroke();

    ctx.fillStyle = "#ffcfa0";
    ctx.beginPath();
    ctx.arc(0, -38, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e8452c";
    ctx.beginPath();
    ctx.arc(0, -40, 9.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-2, -49, 12, 4);

    ctx.fillStyle = "#22252c";
    ctx.beginPath();
    ctx.arc(4, -38, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4a3222";
    ctx.fillRect(0, -35, 7, 3);

    ctx.restore();
  }

  function drawEnemy(ctx, en) {
    const bob = Math.sin(en.wobble) * 2;
    ctx.save();
    ctx.translate(en.x, en.y + bob);

    ctx.fillStyle = "#7a4a2b";
    ctx.beginPath();
    ctx.ellipse(0, -14, 14, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3d2a1a";
    const step = Math.sin(en.wobble * 2) * 3;
    ctx.beginPath();
    ctx.ellipse(-7 + step, -2, 5, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(7 - step, -2, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(-5, -16, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -16, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(-5 + en.dir, -15, 2, 0, Math.PI * 2);
    ctx.arc(5 + en.dir, -15, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#3d2a1a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -22);
    ctx.lineTo(-2, -20);
    ctx.moveTo(9, -22);
    ctx.lineTo(2, -20);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------- mobile controls ---------------- */
  const mobile = key => {
    keys.current[key] = true;
    setTimeout(() => (keys.current[key] = false), 160);
  };
  const mobileHold = (key, held) => {
    keys.current[key] = held;
  };

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => navigate("/games")} className="mb-5 text-xs text-white/40">
          ← Back to games
        </button>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[.3em] text-[#f47732]">
              Game 03 · Endless
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Platform Adventure</h1>
          </div>

          <div className="flex items-center gap-4 text-xs text-white/70">
            <span className="flex items-center gap-1">
              <CoinsIcon size={14} className="text-[#ffd54f]" /> {coinsCollected}
            </span>
            <span className="flex items-center gap-1">
              {Array.from({ length: LIVES_START }).map((_, i) => (
                <Heart
                  key={i}
                  size={14}
                  className={i < lives ? "fill-[#f47732] text-[#f47732]" : "text-white/20"}
                />
              ))}
            </span>
            <span>Score {score}</span>
            <span className="text-white/40">{distance}m</span>
            {timeLeft != null && <span className="text-white/40">{timeLeft}s</span>}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-white/70 hover:text-white"
              title={isFullscreen ? "Exit full screen" : "Full screen"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        <div
          ref={wrapperRef}
          className={
            isFullscreen
              ? "relative flex h-screen w-screen items-center justify-center bg-black"
              : "relative overflow-hidden rounded-3xl border border-white/[0.08]"
          }
        >
          <canvas
            ref={canvas}
            width={CANVAS_W}
            height={CANVAS_H}
            className={isFullscreen ? "h-full max-h-screen w-auto" : "w-full"}
          />

          {status === "gameOver" && (
            <div className="absolute inset-0 grid place-items-center bg-black/85 backdrop-blur-md">
              <div className="text-center">
                <h2 className="font-semibold text-[#f47732]">Run over</h2>
                <p className="mt-2 text-xs text-white/40">
                  Score {score} · Distance {distance}m
                  {best > distance ? ` · Best ${best}m` : ""}
                </p>
                <button
                  onClick={resetRun}
                  className="mt-5 rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black"
                >
                  Run again
                </button>
              </div>
            </div>
          )}

          {locked && (
            <div className="absolute inset-0 grid place-items-center bg-black/90 backdrop-blur-md">
              <div className="text-center">
                <Lock className="mx-auto mb-3 text-white/50" />
                <h2 className="font-semibold">Gaming session ended</h2>
                <p className="mt-2 text-xs text-white/35">
                  Games are locked for the cooldown period.
                </p>
                <button
                  onClick={() => navigate("/games")}
                  className="mt-5 rounded-xl bg-white px-5 py-2 text-xs font-semibold text-black"
                >
                  Back to games
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto mt-5 flex w-fit items-center gap-3">
          <button
            onTouchStart={() => mobileHold("ArrowLeft", true)}
            onTouchEnd={() => mobileHold("ArrowLeft", false)}
            className="control"
          >
            ←
          </button>
          <button onTouchStart={() => mobile("ArrowUp")} className="control">↑</button>
          <button
            onTouchStart={() => mobileHold("ArrowRight", true)}
            onTouchEnd={() => mobileHold("ArrowRight", false)}
            className="control"
          >
            →
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/30">
          Arrow keys / WASD to move · Space or ↑ to jump · Jump on enemies to defeat them · The run never ends — survive as long as you can
        </p>
      </div>
    </main>
  );
}