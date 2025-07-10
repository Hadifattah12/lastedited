// src/pages/pong-ai.ts
import "../styles/pong.css";
import i18next from "i18next";

// ──────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────────────────
const CANVAS_WIDTH       = 800;
const CANVAS_HEIGHT      = 400;
const PADDLE_WIDTH       = 15;
const PADDLE_HEIGHT      = 80;
const BALL_SIZE          = 15;
const PADDLE_SPEED       = 8;
const INITIAL_BALL_SPEED = 5;
const MAX_SCORE          = 5;

// ──────────────────────────────────────────────────────────────────────────────
// TYPES / GLOBALS
// ──────────────────────────────────────────────────────────────────────────────
interface GameState {
  leftPaddle:  { x: number; y: number; score: number };
  rightPaddle: { x: number; y: number; score: number };
  ball:        { x: number; y: number; dx: number; dy: number; speed: number };
  isRunning: boolean;
  isPaused:  boolean;
  winner:    string | null;
  gameStarted: boolean;
}

const keys: Record<string, boolean> = {};

let gameState: GameState;
let animationFrameId = 0;
let canvas: HTMLCanvasElement;
let ctx:    CanvasRenderingContext2D;
let lastTimestamp = 0;
let gameData: { player1: string; player2: string; aiLevel?: string } | null = null;

let rootEl: HTMLElement;   // <— component root for safe querying
const qs = <T extends Element = Element>(sel: string) =>
  rootEl?.querySelector<T>(sel) ?? null;

// AI tuning
let aiDifficulty = 0.9;
let aiReactionDelay = 0;
let aiErrorRate = 0.1;

// ──────────────────────────────────────────────────────────────────────────────
// ENTRY
// ──────────────────────────────────────────────────────────────────────────────
export function renderPongAI(): HTMLElement {
  const container = document.createElement("div");
  rootEl = container;

  const saved = localStorage.getItem("gameData");
  gameData = saved
    ? JSON.parse(saved)
    : { player1: "Player 1", player2: "AI", aiLevel: "medium" };

  setAIDifficulty(gameData?.aiLevel ?? "medium");

  container.innerHTML = /* html */ `
    <div class="home-wrapper">
      <div class="game-container">
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

        <div class="game-area">
          <canvas id="game-canvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>

          <div id="game-overlay" class="game-overlay">
            <div class="overlay-content">
              <h2 id="overlay-title">${i18next.t("ready")}</h2>
              <p  id="overlay-message">${i18next.t("pressSpace")}</p>
            </div>
          </div>
        </div>

        <div class="game-controls">
          <div class="button-group">
            <button id="start-button" class="btn btn-primary">${i18next.t("start")}</button>
            <button id="pause-button" class="btn btn-secondary" disabled>${i18next.t("pause")}</button>
            <button id="home-button"  class="btn btn-home">${i18next.t("home")}</button>
          </div>
        </div>

        <div id="game-message" class="game-message"></div>
      </div>
    </div>
  `;

  initializeGame(container);
  return container;
}

// ──────────────────────────────────────────────────────────────────────────────
// INITIALISATION
// ──────────────────────────────────────────────────────────────────────────────
function setAIDifficulty(level: string) {
  switch (level) {
    case "easy":   aiDifficulty = 0.7;  aiErrorRate = 0.25; break;
    case "medium": aiDifficulty = 0.9;  aiErrorRate = 0.10; break;
    case "hard":   aiDifficulty = 0.99; aiErrorRate = 0.02; break;
    default:       aiDifficulty = 0.9;  aiErrorRate = 0.10;
  }
}

function initializeGame(container: HTMLElement) {
  canvas = qs<HTMLCanvasElement>("#game-canvas")!;
  ctx    = canvas.getContext("2d") as CanvasRenderingContext2D;

  initGame();

  qs<HTMLButtonElement>("#start-button")!
    .addEventListener("click", handleStartGame);
  qs<HTMLButtonElement>("#pause-button")!
    .addEventListener("click", handlePauseGame);
  qs<HTMLButtonElement>("#home-button")!
    .addEventListener("click", handleHome);

  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup",   handleKeyUp);

  drawGame();
  showOverlay("Ready to Play?", "Press SPACE or click Start to begin!");
}

function initGame() {
  gameState = {
    leftPaddle:  { x: 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0 },
    rightPaddle: { x: CANVAS_WIDTH - 30 - PADDLE_WIDTH, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, score: 0 },
    ball: {
      x: CANVAS_WIDTH / 2 - BALL_SIZE / 2,
      y: CANVAS_HEIGHT / 2 - BALL_SIZE / 2,
      dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED : -INITIAL_BALL_SPEED,
      dy: (Math.random() * 2 - 1) * INITIAL_BALL_SPEED * 0.5,
      speed: INITIAL_BALL_SPEED
    },
    isRunning: false,
    isPaused:  false,
    winner:    null,
    gameStarted: false
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// BUTTON HANDLERS
// ──────────────────────────────────────────────────────────────────────────────
function handleStartGame() {
  if (gameState.isRunning || gameState.gameStarted) return;

  const startBtn = qs<HTMLButtonElement>("#start-button")!;
  const pauseBtn = qs<HTMLButtonElement>("#pause-button")!;

  startBtn.disabled = true;
  pauseBtn.disabled = false;

  hideOverlay();
  startCountdown();
}

function handlePauseGame() {
  if (!gameState.gameStarted || gameState.isPaused) return;

  gameState.isRunning = false;
  gameState.isPaused  = true;
  cancelAnimationFrame(animationFrameId);

  const startBtn = qs<HTMLButtonElement>("#start-button")!;
  const pauseBtn = qs<HTMLButtonElement>("#pause-button")!;

  startBtn.textContent = "▶️ Resume";
  startBtn.disabled    = false;
  pauseBtn.disabled    = true;

  showOverlay(i18next.t("gamePaused"), i18next.t("pressSpace"));
}

function handleHome() {
  cancelAnimationFrame(animationFrameId);
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("keyup",   handleKeyUp);
  localStorage.removeItem("gameData");
  location.hash = "/home";
}

// ──────────────────────────────────────────────────────────────────────────────
// COUNTDOWN + LOOP
// ──────────────────────────────────────────────────────────────────────────────
function startCountdown() {
  let c = 3;
  const id = setInterval(() => {
    if (c > 0) {
      showOverlay(i18next.t("getReady"), `${c--}`);
    } else {
      clearInterval(id);
      hideOverlay();
      startGameLoop();
    }
  }, 1000);
}

function startGameLoop() {
  gameState.isRunning   = true;
  gameState.gameStarted = true;
  gameState.isPaused    = false;
  lastTimestamp         = performance.now();
  animationFrameId      = requestAnimationFrame(gameLoop);
}

function gameLoop(ts: number) {
  if (!gameState.isRunning) return;

  const mult = (ts - lastTimestamp) / 16.67;
  lastTimestamp = ts;

  updateGameState(mult);
  drawGame();

  if (gameState.leftPaddle.score  >= MAX_SCORE) endGame(gameData!.player1);
  else if (gameState.rightPaddle.score >= MAX_SCORE) endGame("AI");
  else animationFrameId = requestAnimationFrame(gameLoop);
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function updateGameState(mult: number) {
  if (!gameState.isRunning) return;
  movePaddles(mult);
  moveBall(mult);
  checkCollisions();
  checkScoring();
}

function movePaddles(mult: number) {
  const d = PADDLE_SPEED * mult;
  if (keys.w || keys.W) gameState.leftPaddle.y = Math.max(0, gameState.leftPaddle.y - d);
  if (keys.s || keys.S) gameState.leftPaddle.y = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, gameState.leftPaddle.y + d);
  updateAIPaddle(mult);
}

function updateAIPaddle(mult: number) {
  const ballCY   = gameState.ball.y + BALL_SIZE / 2;
  const paddleCY = gameState.rightPaddle.y + PADDLE_HEIGHT / 2;
  let   predY    = ballCY;

  if (gameState.ball.dx > 0) {
    const t = (gameState.rightPaddle.x - gameState.ball.x) / gameState.ball.dx;
    if (t > 0) {
      predY = gameState.ball.y + gameState.ball.dy * t * aiDifficulty;
      if (aiDifficulty > 0.8) {
        if (predY < 0) predY = Math.abs(predY);
        else if (predY > CANVAS_HEIGHT) predY = CANVAS_HEIGHT - (predY - CANVAS_HEIGHT);
      }
    }
  }

  if (++aiReactionDelay < Math.max(1, 15 * (1 - aiDifficulty))) return;
  aiReactionDelay = 0;

  let target = predY;
  if (Math.random() < aiErrorRate) target += (Math.random() - 0.5) * 80 * (1 - aiDifficulty);

  const diff  = target - paddleCY;
  let speed   = PADDLE_SPEED * aiDifficulty * mult;
  if (Math.abs(gameState.ball.x - gameState.rightPaddle.x) < 200 && gameState.ball.dx > 0) speed *= 1.5;

  if (aiDifficulty > 0.95 && Math.abs(diff) < 5) {
    gameState.rightPaddle.y = target - PADDLE_HEIGHT / 2;
  } else if (Math.abs(diff) > speed) {
    gameState.rightPaddle.y = Math.max(0, Math.min(
      CANVAS_HEIGHT - PADDLE_HEIGHT,
      gameState.rightPaddle.y + Math.sign(diff) * speed
    ));
  }
}

function moveBall(mult: number) {
  gameState.ball.x += gameState.ball.dx * mult;
  gameState.ball.y += gameState.ball.dy * mult;
}

function checkCollisions() {
  if (gameState.ball.y <= 0 || gameState.ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
    gameState.ball.dy *= -1;
    gameState.ball.y   = Math.max(0, Math.min(CANVAS_HEIGHT - BALL_SIZE, gameState.ball.y));
    playSound("wall");
  }

  // left paddle
  if (
    gameState.ball.dx < 0 &&
    gameState.ball.x <= gameState.leftPaddle.x + PADDLE_WIDTH &&
    gameState.ball.x + BALL_SIZE >= gameState.leftPaddle.x &&
    gameState.ball.y + BALL_SIZE >= gameState.leftPaddle.y &&
    gameState.ball.y <= gameState.leftPaddle.y + PADDLE_HEIGHT
  ) {
    gameState.ball.dx = Math.abs(gameState.ball.dx);
    gameState.ball.x  = gameState.leftPaddle.x + PADDLE_WIDTH;
    adjustBallAngle(gameState.leftPaddle);
    increaseSpeed();
    playSound("paddle");
  }

  // right paddle
  if (
    gameState.ball.dx > 0 &&
    gameState.ball.x + BALL_SIZE >= gameState.rightPaddle.x &&
    gameState.ball.x <= gameState.rightPaddle.x + PADDLE_WIDTH &&
    gameState.ball.y + BALL_SIZE >= gameState.rightPaddle.y &&
    gameState.ball.y <= gameState.rightPaddle.y + PADDLE_HEIGHT
  ) {
    gameState.ball.dx = -Math.abs(gameState.ball.dx);
    gameState.ball.x  = gameState.rightPaddle.x - BALL_SIZE;
    adjustBallAngleAI(gameState.rightPaddle);
    increaseSpeed();
    playSound("paddle");
  }
}

function checkScoring() {
  if (gameState.ball.x + BALL_SIZE < 0) {
    gameState.rightPaddle.score++;
    updateScoreDisplay();
    resetBall();
    playSound("score");
  } else if (gameState.ball.x > CANVAS_WIDTH) {
    gameState.leftPaddle.score++;
    updateScoreDisplay();
    resetBall();
    playSound("score");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DRAW
// ──────────────────────────────────────────────────────────────────────────────
function drawGame() {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  g.addColorStop(0, "#1a1a2e");
  g.addColorStop(1, "#16213e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,255,255,.2)";
  ctx.beginPath();
  ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 60, 0, Math.PI * 2);
  ctx.stroke();

  drawPaddle(gameState.leftPaddle.x,  gameState.leftPaddle.y,  "#00ff88");
  drawPaddle(gameState.rightPaddle.x, gameState.rightPaddle.y, "#ff4757");
  drawBall();
}

function drawPaddle(x: number, y: number, color: string) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = color;
  ctx.fillRect(x, y, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.shadowBlur  = 0;
}

function drawBall() {
  const cx = gameState.ball.x + BALL_SIZE / 2;
  const cy = gameState.ball.y + BALL_SIZE / 2;
  ctx.shadowColor = "#fff";
  ctx.shadowBlur  = 15;
  ctx.fillStyle   = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// BALL HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function resetBall() {
  gameState.ball.x     = CANVAS_WIDTH / 2 - BALL_SIZE / 2;
  gameState.ball.y     = CANVAS_HEIGHT / 2 - BALL_SIZE / 2;
  gameState.ball.speed = INITIAL_BALL_SPEED;

  const angle = Math.random() * Math.PI / 3 - Math.PI / 6;
  const dir   = Math.random() > 0.5 ? 1 : -1;
  gameState.ball.dx = dir * Math.cos(angle) * INITIAL_BALL_SPEED;
  gameState.ball.dy = Math.sin(angle) * INITIAL_BALL_SPEED;

  const running = gameState.isRunning;
  gameState.isRunning = false;
  setTimeout(() => {
    if (running && !gameState.winner) {
      gameState.isRunning = true;
      lastTimestamp = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
    }
  }, 1000);
}

function adjustBallAngle(p: { x: number; y: number }) {
  const hit = (gameState.ball.y + BALL_SIZE / 2 - p.y) / PADDLE_HEIGHT;
  const ang = (Math.max(0, Math.min(1, hit)) - 0.5) * Math.PI * 0.5;
  const dir = p.x < CANVAS_WIDTH / 2 ? 1 : -1;
  const s   = gameState.ball.speed;
  gameState.ball.dx = dir * Math.cos(ang) * s;
  gameState.ball.dy =       Math.sin(ang) * s;
}

function adjustBallAngleAI(p: { x: number; y: number }) {
  let hit = (gameState.ball.y + BALL_SIZE / 2 - p.y) / PADDLE_HEIGHT;
  hit = Math.max(0, Math.min(1, hit));
  let ang = (hit - 0.5) * Math.PI * 0.5;

  if (aiDifficulty > 0.9) {
    const playerMid = gameState.leftPaddle.y + PADDLE_HEIGHT / 2;
    const targetY   = playerMid > CANVAS_HEIGHT / 2 ? 0 : CANVAS_HEIGHT;
    ang = Math.atan((targetY - gameState.ball.y) / CANVAS_WIDTH);
  }

  const s = gameState.ball.speed;
  gameState.ball.dx = -Math.cos(ang) * s;
  gameState.ball.dy =  Math.sin(ang) * s;
}

function increaseSpeed() {
  gameState.ball.speed = Math.min(gameState.ball.speed * 1.05, INITIAL_BALL_SPEED * 2);
  const cur = Math.hypot(gameState.ball.dx, gameState.ball.dy);
  if (cur > 0) {
    const k = gameState.ball.speed / cur;
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
  gameState.winner    = winner;
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
  showMessage(i18next.t("GAME_WIN_MESSAGE", { winner }) || `🎉 ${winner} wins the game!`);
  playSound("win");
}

// ──────────────────────────────────────────────────────────────────────────────
// OVERLAY / MESSAGE
// ──────────────────────────────────────────────────────────────────────────────
function showOverlay(title: string, msg: string) {
  const ov  = qs<HTMLDivElement>("#game-overlay");
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
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

function clearMessage() {
  const el = qs<HTMLElement>("#game-message");
  if (el) { el.textContent = ""; el.style.display = "none"; }
}

// ──────────────────────────────────────────────────────────────────────────────
// SOUND
// ──────────────────────────────────────────────────────────────────────────────
function playSound(type: "paddle" | "wall" | "score" | "win") {
  try {
    const ctxA = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctxA.createOscillator();
    const g    = ctxA.createGain();
    osc.connect(g); g.connect(ctxA.destination);

    const freq = { paddle: 800, wall: 400, score: 600, win: 1000 }[type];
    osc.frequency.value = freq;

    g.gain.setValueAtTime(0.1, ctxA.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctxA.currentTime + 0.1);

    osc.start(); osc.stop(ctxA.currentTime + 0.1);
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────────────────
// INPUT
// ──────────────────────────────────────────────────────────────────────────────
function handleKeyDown(e: KeyboardEvent) {
  if (["w", "W", "s", "S"].includes(e.key)) { keys[e.key] = true; e.preventDefault(); }

  if (e.key === " ") {
    e.preventDefault();
    if (!gameState.gameStarted) handleStartGame();
    else if (gameState.isPaused) {
      hideOverlay();
      qs<HTMLButtonElement>("#start-button")!.disabled = true;
      qs<HTMLButtonElement>("#pause-button")!.disabled = false;
      gameState.isPaused  = false;
      gameState.isRunning = true;
      lastTimestamp = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
    }
  }

  if (e.key.toLowerCase() === "p" && gameState.isRunning) handlePauseGame();
}

function handleKeyUp(e: KeyboardEvent) {
  if (["w", "W", "s", "S"].includes(e.key)) keys[e.key] = false;
}
