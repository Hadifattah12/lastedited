// src/pages/pong-ai.ts
import "../styles/pong.css";
import i18next from "i18next";

/* ───────── Constants ───────── */
const VW = 800;
const VH = 400;
const PADDLE_W = 15;
const PADDLE_H = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 8;
const INITIAL_BALL_SPEED = 5;
const MAX_SCORE = 5;

/* ───────── Types / Globals ───────── */
interface GameState {
  leftPaddle: { x: number; y: number; score: number };
  rightPaddle: { x: number; y: number; score: number };
  ball: { x: number; y: number; dx: number; dy: number; speed: number };
  isRunning: boolean;
  isPaused: boolean;
  winner: string | null;
  gameStarted: boolean;
}

const keys: Record<string, boolean> = {};
let gameState: GameState;
let animationFrameId = 0;
let lastTimestamp = 0;

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let rootEl: HTMLElement;
const qs = <T extends Element = Element>(sel: string) =>
  rootEl?.querySelector<T>(sel) ?? null;

let gameData: { player1: string; player2: string; aiLevel?: string } | null = null;

/* ───────── AI Params ───────── */
let aiDifficulty = 0.9;
let aiErrorRate = 0.1;
let aiReactionCounter = 0;

/* Active drag for player paddle */
type DragInfo = { pointerStartY: number; paddleStartY: number };
const activeDrag = new Map<number, DragInfo>();

/* ───────── Entry ───────── */
export function renderPongAI(): HTMLElement {
  const wrapper = document.createElement("div");
  rootEl = wrapper;

  const saved = localStorage.getItem("gameData");
  gameData = saved
    ? JSON.parse(saved)
    : { player1: "Player 1", player2: "AI", aiLevel: "medium" };

  setAIDifficulty(gameData?.aiLevel ?? "medium");

  wrapper.innerHTML = `
    <div class="pong-wrapper">
      <div class="game-header">
        <h1>${i18next.t("playWithAI") || "Play with AI"}</h1>
        <div class="score-board">
          <div class="player-score left-player">
            <span class="player-name">${gameData!.player1}</span>
            <span class="score" id="player1-score">0</span>
          </div>
          <div class="vs-divider">${i18next.t("vs")}</div>
          <div class="player-score right-player">
            <span class="player-name">AI (${gameData!.aiLevel})</span>
            <span class="score" id="player2-score">0</span>
          </div>
        </div>
      </div>

      <div class="canvas-shell">
        <canvas id="game-canvas" width="${VW}" height="${VH}" aria-label="Pong AI game"></canvas>

        <div id="game-overlay" class="game-overlay">
          <div class="overlay-content">
            <h2 id="overlay-title">${i18next.t("ready")}</h2>
            <p id="overlay-message">${i18next.t("pressSpace")} • ${i18next.t("tapToStart") || "Tap to Start"}</p>
          </div>
        </div>

        <!-- Touch halves: left = player drag, right = inert (AI) -->
        <div class="touch-layer" aria-hidden="true">
          <div class="touch-half left" data-side="left"></div>
          <div class="touch-half right" data-side="right"></div>
        </div>
      </div>

      <!-- Mobile arrow buttons BELOW canvas (right side disabled / inert) -->
      <div class="mobile-buttons">
        <div class="btn-col">
          <button class="mini-btn" data-btn="left-up">▲</button>
          <button class="mini-btn" data-btn="left-down">▼</button>
        </div>
        <div class="btn-col ai-disabled">
          <button class="mini-btn" disabled style="opacity:.3;pointer-events:none;">▲</button>
          <button class="mini-btn" disabled style="opacity:.3;pointer-events:none;">▼</button>
        </div>
      </div>

      <div class="game-controls">
        <div class="button-group">
          <button id="start-button" class="btn btn-primary">${i18next.t("start")}</button>
          <button id="pause-button" class="btn btn-secondary" disabled>${i18next.t("pause")}</button>
          <button id="home-button" class="btn btn-home">${i18next.t("home")}</button>
        </div>
      </div>

      <div id="game-message" class="game-message"></div>
    </div>
  `;

  initialize();
  return wrapper;
}

/* ───────── AI Difficulty ───────── */
function setAIDifficulty(level: string) {
  switch (level) {
    case "easy":
      aiDifficulty = 0.7;
      aiErrorRate = 0.25;
      break;
    case "medium":
      aiDifficulty = 0.9;
      aiErrorRate = 0.10;
      break;
    case "hard":
      aiDifficulty = 0.99;
      aiErrorRate = 0.02;
      break;
    default:
      aiDifficulty = 0.9;
      aiErrorRate = 0.10;
  }
}

/* ───────── Init ───────── */
function initialize() {
  canvas = qs<HTMLCanvasElement>("#game-canvas")!;
  ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  initGame();
  drawGame();
  showOverlay("Ready?", "Press SPACE / Tap");

  // Buttons
  qs<HTMLButtonElement>("#start-button")!.addEventListener("click", startHandler);
  qs<HTMLButtonElement>("#pause-button")!.addEventListener("click", pauseHandler);
  qs<HTMLButtonElement>("#home-button")!.addEventListener("click", homeHandler);

  // Overlay tap
  qs("#game-overlay")!.addEventListener("click", () => {
    if (!gameState.gameStarted || gameState.isPaused) {
      if (gameState.isPaused) resumeGame();
      else startHandler();
    }
  });

  // Keyboard
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);

  // Touch halves (only LEFT affects paddle; right just blocks scroll)
  rootEl.querySelectorAll<HTMLElement>(".touch-half").forEach(zone => {
    zone.addEventListener("pointerdown", pointerStart, { passive: false });
    zone.addEventListener("pointermove", pointerMove, { passive: false });
    zone.addEventListener("pointerup", pointerEnd);
    zone.addEventListener("pointercancel", pointerEnd);
    zone.addEventListener("pointerleave", pointerEnd);
  });

  // Mobile arrow buttons (left only)
  rootEl.querySelectorAll<HTMLButtonElement>(".mini-btn[data-btn]").forEach(btn => {
    const code = btn.dataset.btn!;
    btn.addEventListener("pointerdown", e => { e.preventDefault(); mapButton(code, true); });
    btn.addEventListener("pointerup", () => mapButton(code, false));
    btn.addEventListener("pointerleave", () => mapButton(code, false));
    btn.addEventListener("touchstart", e => { e.preventDefault(); mapButton(code, true); }, { passive: false });
    btn.addEventListener("touchend", () => mapButton(code, false));
  });

  window.addEventListener("resize", () => drawGame());
  window.addEventListener("orientationchange", () => setTimeout(drawGame, 200));
}

function initGame() {
  gameState = {
    leftPaddle: { x: 30, y: VH / 2 - PADDLE_H / 2, score: 0 },
    rightPaddle: { x: VW - 30 - PADDLE_W, y: VH / 2 - PADDLE_H / 2, score: 0 },
    ball: {
      x: VW / 2 - BALL_SIZE / 2,
      y: VH / 2 - BALL_SIZE / 2,
      dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED : -INITIAL_BALL_SPEED,
      dy: (Math.random() * 2 - 1) * INITIAL_BALL_SPEED * 0.5,
      speed: INITIAL_BALL_SPEED
    },
    isRunning: false,
    isPaused: false,
    winner: null,
    gameStarted: false
  };
  updateScoreDisplay();
}

/* ───────── Control Handlers ───────── */
function startHandler() {
  if (gameState.isRunning || gameState.gameStarted) return;
  qs<HTMLButtonElement>("#start-button")!.disabled = true;
  qs<HTMLButtonElement>("#pause-button")!.disabled = false;
  hideOverlay();
  countdown();
}

function countdown() {
  let c = 3;
  showOverlay(i18next.t("getReady") || "Get Ready", String(c));
  const id = setInterval(() => {
    c--;
    if (c > 0) showOverlay(i18next.t("getReady") || "Get Ready", String(c));
    else {
      clearInterval(id);
      hideOverlay();
      beginLoop();
    }
  }, 1000);
}

function beginLoop() {
  gameState.isRunning = true;
  gameState.gameStarted = true;
  gameState.isPaused = false;
  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(loop);
}

function resumeGame() {
  if (!gameState.isPaused) return;
  hideOverlay();
  qs<HTMLButtonElement>("#start-button")!.disabled = true;
  qs<HTMLButtonElement>("#pause-button")!.disabled = false;
  gameState.isPaused = false;
  gameState.isRunning = true;
  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(loop);
}

function pauseHandler() {
  if (!gameState.gameStarted || !gameState.isRunning) return;
  gameState.isRunning = false;
  gameState.isPaused = true;
  cancelAnimationFrame(animationFrameId);
  const startBtn = qs<HTMLButtonElement>("#start-button")!;
  const pauseBtn = qs<HTMLButtonElement>("#pause-button")!;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  startBtn.textContent = "▶️ Resume";
  showOverlay(i18next.t("gamePaused") || "Paused", i18next.t("tapToStart") || i18next.t("pressSpace") || "Tap / Space");
}

function homeHandler() {
  cancelAnimationFrame(animationFrameId);
  document.removeEventListener("keydown", keyDown);
  document.removeEventListener("keyup", keyUp);
  localStorage.removeItem("gameData");
  location.hash = "/home";
}

/* ───────── Game Loop ───────── */
function loop(ts: number) {
  if (!gameState.isRunning) return;
  const mult = (ts - lastTimestamp) / 16.67;
  lastTimestamp = ts;
  update(mult);
  drawGame();
  if (gameState.leftPaddle.score >= MAX_SCORE) endGame(gameData?.player1 || "Player 1");
  else if (gameState.rightPaddle.score >= MAX_SCORE) endGame("AI");
  else animationFrameId = requestAnimationFrame(loop);
}

/* ───────── Update ───────── */
function update(mult: number) {
  movePlayer(mult);
  moveAIPaddle(mult);
  moveBall(mult);
  collisions();
  scoring();
}

function movePlayer(mult: number) {
  const d = PADDLE_SPEED * mult;
  if (keys["w"] || keys["W"]) gameState.leftPaddle.y = Math.max(0, gameState.leftPaddle.y - d);
  if (keys["s"] || keys["S"]) gameState.leftPaddle.y = Math.min(VH - PADDLE_H, gameState.leftPaddle.y + d);
}

function moveAIPaddle(mult: number) {
  const ballMid = gameState.ball.y + BALL_SIZE / 2;
  const paddleMid = gameState.rightPaddle.y + PADDLE_H / 2;
  let predicted = ballMid;

  if (gameState.ball.dx > 0) {
    const t = (gameState.rightPaddle.x - gameState.ball.x) / gameState.ball.dx;
    if (t > 0) {
      predicted = gameState.ball.y + gameState.ball.dy * t * aiDifficulty;
      if (aiDifficulty > 0.8) {
        // approximate wall bounces
        if (predicted < 0) predicted = Math.abs(predicted);
        else if (predicted > VH) predicted = VH - (predicted - VH);
      }
    }
  }

  // Reaction gating
  if (++aiReactionCounter < Math.max(1, 15 * (1 - aiDifficulty))) return;
  aiReactionCounter = 0;

  let target = predicted;
  if (Math.random() < aiErrorRate) {
    target += (Math.random() - 0.5) * 80 * (1 - aiDifficulty);
  }

  const diff = target - paddleMid;
  let speed = PADDLE_SPEED * aiDifficulty * mult;
  if (Math.abs(gameState.ball.x - gameState.rightPaddle.x) < 200 && gameState.ball.dx > 0) {
    speed *= 1.5;
  }

  if (aiDifficulty > 0.95 && Math.abs(diff) < 5) {
    gameState.rightPaddle.y = target - PADDLE_H / 2;
  } else if (Math.abs(diff) > speed) {
    gameState.rightPaddle.y = clamp(
      gameState.rightPaddle.y + Math.sign(diff) * speed,
      0,
      VH - PADDLE_H
    );
  }
}

function moveBall(mult: number) {
  gameState.ball.x += gameState.ball.dx * mult;
  gameState.ball.y += gameState.ball.dy * mult;
}

function collisions() {
  // Walls
  if (gameState.ball.y <= 0 || gameState.ball.y + BALL_SIZE >= VH) {
    gameState.ball.dy = -gameState.ball.dy;
    gameState.ball.y = clamp(gameState.ball.y, 0, VH - BALL_SIZE);
    sound("wall");
  }

  // Left paddle
  if (
    gameState.ball.dx < 0 &&
    gameState.ball.x <= gameState.leftPaddle.x + PADDLE_W &&
    gameState.ball.x + BALL_SIZE >= gameState.leftPaddle.x &&
    gameState.ball.y + BALL_SIZE >= gameState.leftPaddle.y &&
    gameState.ball.y <= gameState.leftPaddle.y + PADDLE_H
  ) {
    gameState.ball.dx = Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.leftPaddle.x + PADDLE_W;
    adjustPlayerAngle(gameState.leftPaddle);
    speedUp();
    sound("paddle");
  }

  // Right (AI) paddle
  if (
    gameState.ball.dx > 0 &&
    gameState.ball.x + BALL_SIZE >= gameState.rightPaddle.x &&
    gameState.ball.x <= gameState.rightPaddle.x + PADDLE_W &&
    gameState.ball.y + BALL_SIZE >= gameState.rightPaddle.y &&
    gameState.ball.y <= gameState.rightPaddle.y + PADDLE_H
  ) {
    gameState.ball.dx = -Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.rightPaddle.x - BALL_SIZE;
    adjustAIAngle(gameState.rightPaddle);
    speedUp();
    sound("paddle");
  }
}

function scoring() {
  if (gameState.ball.x + BALL_SIZE < 0) {
    gameState.rightPaddle.score++;
    updateScoreDisplay();
    resetBall();
    sound("score");
  } else if (gameState.ball.x > VW) {
    gameState.leftPaddle.score++;
    updateScoreDisplay();
    resetBall();
    sound("score");
  }
}

/* ───────── Draw ───────── */
function drawGame() {
  const grad = ctx.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, "#1a1a2e");
  grad.addColorStop(1, "#16213e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VW, VH);

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(VW / 2, 0);
  ctx.lineTo(VW / 2, VH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(VW / 2, VH / 2, 60, 0, Math.PI * 2);
  ctx.stroke();

  drawPaddle(gameState.leftPaddle.x, gameState.leftPaddle.y, "#00ff88");
  drawPaddle(gameState.rightPaddle.x, gameState.rightPaddle.y, "#ff4757");
  drawBall();
}

function drawPaddle(x: number, y: number, color: string) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
  ctx.shadowBlur = 0;
}

function drawBall() {
  const cx = gameState.ball.x + BALL_SIZE / 2;
  const cy = gameState.ball.y + BALL_SIZE / 2;
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/* ───────── Ball helpers ───────── */
function resetBall() {
  gameState.ball.x = VW / 2 - BALL_SIZE / 2;
  gameState.ball.y = VH / 2 - BALL_SIZE / 2;
  gameState.ball.speed = INITIAL_BALL_SPEED;

  const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
  const dir = Math.random() > 0.5 ? 1 : -1;
  gameState.ball.dx = dir * Math.cos(angle) * INITIAL_BALL_SPEED;
  gameState.ball.dy = Math.sin(angle) * INITIAL_BALL_SPEED;

  const wasRunning = gameState.isRunning;
  gameState.isRunning = false;
  setTimeout(() => {
    if (wasRunning && !gameState.winner) {
      gameState.isRunning = true;
      lastTimestamp = performance.now();
      animationFrameId = requestAnimationFrame(loop);
    }
  }, 900);
}

function adjustPlayerAngle(p: { y: number }) {
  const hit = (gameState.ball.y + BALL_SIZE / 2 - p.y) / PADDLE_H;
  const ang = (clamp(hit, 0, 1) - 0.5) * Math.PI * 0.5;
  const s = gameState.ball.speed;
  gameState.ball.dx = Math.cos(ang) * s;
  gameState.ball.dy = Math.sin(ang) * s;
}

function adjustAIAngle(p: { y: number }) {
  let hit = (gameState.ball.y + BALL_SIZE / 2 - p.y) / PADDLE_H;
  hit = clamp(hit, 0, 1);
  let ang = (hit - 0.5) * Math.PI * 0.5;

  if (aiDifficulty > 0.9) {
    // Slightly bias angle to vary gameplay
    ang += (Math.random() - 0.5) * 0.15;
  }

  const s = gameState.ball.speed;
  gameState.ball.dx = -Math.cos(ang) * s;
  gameState.ball.dy = Math.sin(ang) * s;
}

function speedUp() {
  gameState.ball.speed = Math.min(gameState.ball.speed * 1.05, INITIAL_BALL_SPEED * 2);
  const current = Math.hypot(gameState.ball.dx, gameState.ball.dy);
  if (current > 0) {
    const k = gameState.ball.speed / current;
    gameState.ball.dx *= k;
    gameState.ball.dy *= k;
  }
}

function updateScoreDisplay() {
  qs("#player1-score")!.textContent = String(gameState.leftPaddle.score);
  qs("#player2-score")!.textContent = String(gameState.rightPaddle.score);
}

function endGame(winner: string) {
  gameState.isRunning = false;
  gameState.winner = winner;
  cancelAnimationFrame(animationFrameId);

  qs<HTMLButtonElement>("#start-button")!.disabled = true;
  qs<HTMLButtonElement>("#pause-button")!.disabled = true;

  showOverlay(
    i18next.t("GAME_WIN_OVERLAY", {
      winner,
      score1: gameState.leftPaddle.score,
      score2: gameState.rightPaddle.score
    }) || `${winner} Wins!`,
    ""
  );
  showMessage(i18next.t("GAME_WIN_MESSAGE", { winner }) || `${winner} wins!`);
  sound("win");
}

/* ───────── Overlay / Message ───────── */
function showOverlay(title: string, msg: string) {
  const ov = qs<HTMLDivElement>("#game-overlay");
  const ttl = qs<HTMLElement>("#overlay-title");
  const txt = qs<HTMLElement>("#overlay-message");
  if (ov && ttl && txt) {
    ttl.textContent = title;
    txt.textContent = msg;
    ov.style.display = "flex";
  }
}
function hideOverlay() {
  const ov = qs<HTMLDivElement>("#game-overlay");
  if (ov) ov.style.display = "none";
}
function showMessage(msg: string) {
  const el = qs<HTMLElement>("#game-message");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  }
}

/* ───────── Input: Keyboard ───────── */
function keyDown(e: KeyboardEvent) {
  if (["w", "W", "s", "S"].includes(e.key)) {
    keys[e.key] = true;
    e.preventDefault();
  }
  if (e.key === " ") {
    e.preventDefault();
    if (!gameState.gameStarted) startHandler();
    else if (gameState.isPaused) resumeGame();
  }
  if (e.key.toLowerCase() === "p" && gameState.isRunning) {
    pauseHandler();
  }
}
function keyUp(e: KeyboardEvent) {
  if (["w", "W", "s", "S"].includes(e.key)) keys[e.key] = false;
}

/* ───────── Input: Mobile Buttons ───────── */
function mapButton(code: string, pressed: boolean) {
  switch (code) {
    case "left-up":
      keys["w"] = pressed;
      break;
    case "left-down":
      keys["s"] = pressed;
      break;
    // Right buttons disabled / inert
  }
}

/* ───────── Input: Pointer Drag (left half only) ───────── */
function pointerStart(e: PointerEvent) {
  const zone = e.currentTarget as HTMLElement;
  const side = zone.dataset.side;
  if (side !== "left") return; // ignore right half (AI)
  e.preventDefault();
  const paddle = gameState.leftPaddle;
  activeDrag.set(e.pointerId, {
    pointerStartY: e.clientY,
    paddleStartY: paddle.y
  });
  zone.setPointerCapture(e.pointerId);
}

function pointerMove(e: PointerEvent) {
  if (!activeDrag.has(e.pointerId)) return;
  e.preventDefault();
  const info = activeDrag.get(e.pointerId)!;
  const rect = canvas.getBoundingClientRect();
  const deltaPx = e.clientY - info.pointerStartY;
  const deltaVirtual = deltaPx * (VH / rect.height);
  gameState.leftPaddle.y = clamp(info.paddleStartY + deltaVirtual, 0, VH - PADDLE_H);
}

function pointerEnd(e: PointerEvent) {
  activeDrag.delete(e.pointerId);
}

/* ───────── Utility ───────── */
function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function sound(type: "paddle" | "wall" | "score" | "win") {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    const freq = { paddle: 800, wall: 400, score: 600, win: 1000 }[type];
    osc.frequency.value = freq;
    const t = ac.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.12);
  } catch { /* ignore */ }
}
