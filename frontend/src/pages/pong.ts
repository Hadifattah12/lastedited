import "../styles/pong.css";
import i18next from 'i18next';
import { apiFetch } from '../utils/api';

// Virtual game size (logic coordinates)
const VW = 800;
const VH = 400;

const PADDLE_W = 15;
const PADDLE_H = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 8;
const INITIAL_BALL_SPEED = 5;
const MAX_SCORE = 5;

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

let gameData: { player1: string; player2: string } | null = null;

// Pointer drag mapping
type DragInfo = { side: 'left' | 'right'; startVirtualY: number; pointerStartY: number };
const activeDrags = new Map<number, DragInfo>();

export function renderGame(): HTMLElement {
  const wrapper = document.createElement('div');

  const stored = localStorage.getItem('gameData');
  gameData = stored ? JSON.parse(stored) : { player1: 'Player 1', player2: 'Player 2' };

  wrapper.innerHTML = `
    <div class="pong-wrapper">
      <div class="game-header">
        <h1>${i18next.t('title')}</h1>
        <div class="score-board">
          <div class="player-score left-player">
            <span class="player-name">${gameData?.player1 || 'Player 1'}</span>
            <span class="score" id="player1-score">0</span>
          </div>
          <div class="vs-divider">${i18next.t('vs')}</div>
          <div class="player-score right-player">
            <span class="player-name">${gameData?.player2 || 'Player 2'}</span>
            <span class="score" id="player2-score">0</span>
          </div>
        </div>
      </div>

      <div class="canvas-shell">
        <canvas id="game-canvas" width="${VW}" height="${VH}" aria-label="Pong game"></canvas>

        <div id="game-overlay" class="game-overlay">
          <div class="overlay-content">
            <h2 id="overlay-title">${i18next.t('ready')}</h2>
            <p id="overlay-message">${i18next.t('pressSpace')} • ${i18next.t('tapToStart') || 'Tap to Start'}</p>
          </div>
        </div>

        <div class="touch-layer" aria-hidden="true">
          <div class="touch-half left" data-side="left"></div>
          <div class="touch-half right" data-side="right"></div>
        </div>
      </div>

      <!-- Mobile buttons moved BELOW the game -->
      <div class="mobile-buttons">
        <div class="btn-col">
          <button class="mini-btn" data-btn="left-up">▲</button>
          <button class="mini-btn" data-btn="left-down">▼</button>
        </div>
        <div class="btn-col">
          <button class="mini-btn" data-btn="right-up">▲</button>
          <button class="mini-btn" data-btn="right-down">▼</button>
        </div>
      </div>

      <div class="game-controls">
        <div class="button-group">
          <button id="start-button" class="btn btn-primary">${i18next.t('start')}</button>
          <button id="pause-button" class="btn btn-secondary" disabled>${i18next.t('pause')}</button>
          <button id="home-button" class="btn btn-home">${i18next.t('home')}</button>
        </div>
      </div>

      <div id="game-message" class="game-message"></div>
    </div>
  `;

  setup(wrapper);
  return wrapper;
}

function setup(root: HTMLElement) {
  canvas = root.querySelector('#game-canvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  initGame();
  drawGame();
  showOverlay("Ready?", "Press SPACE / Tap");

  // Buttons
  root.querySelector<HTMLButtonElement>('#start-button')?.addEventListener('click', startHandler);
  root.querySelector<HTMLButtonElement>('#pause-button')?.addEventListener('click', pauseHandler);
  root.querySelector<HTMLButtonElement>('#home-button')?.addEventListener('click', homeHandler);

  // Overlay tap
  root.querySelector('#game-overlay')?.addEventListener('click', () => {
    if (!gameState.gameStarted || gameState.isPaused) {
      if (gameState.isPaused) resumeGame();
      else startHandler();
    }
  });

  // Keyboard
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);

  // Pointer (touch) halves
  root.querySelectorAll<HTMLElement>('.touch-half').forEach(h => {
    h.addEventListener('pointerdown', pointerStart, { passive: false });
    h.addEventListener('pointermove', pointerMove, { passive: false });
    h.addEventListener('pointerup', pointerEnd);
    h.addEventListener('pointercancel', pointerEnd);
    h.addEventListener('pointerleave', pointerEnd);
  });

  // Mobile assist buttons
  root.querySelectorAll<HTMLButtonElement>('.mini-btn').forEach(btn => {
    const code = btn.dataset.btn!;
    const press = (v: boolean) => setVirtualKey(code, v);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); press(true); });
    btn.addEventListener('pointerup', () => press(false));
    btn.addEventListener('pointerleave', () => press(false));
    btn.addEventListener('touchstart', e => { e.preventDefault(); press(true); }, { passive: false });
    btn.addEventListener('touchend', () => press(false));
  });

  window.addEventListener('resize', () => drawGame());
  window.addEventListener('orientationchange', () => setTimeout(drawGame, 200));
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

function startHandler() {
  if (gameState.isRunning || gameState.gameStarted) return;
  (document.getElementById('start-button') as HTMLButtonElement).disabled = true;
  (document.getElementById('pause-button') as HTMLButtonElement).disabled = false;
  hideOverlay();
  countdownThenStart();
}

function countdownThenStart() {
  let count = 3;
  showOverlay(i18next.t('getReady'), `${count}`);
  const id = setInterval(() => {
    count--;
    if (count > 0) showOverlay(i18next.t('getReady'), `${count}`);
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
  (document.getElementById('start-button') as HTMLButtonElement).disabled = true;
  (document.getElementById('pause-button') as HTMLButtonElement).disabled = false;
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
  const startBtn = document.getElementById('start-button') as HTMLButtonElement;
  const pauseBtn = document.getElementById('pause-button') as HTMLButtonElement;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  startBtn.textContent = "▶️ Resume";
  showOverlay(i18next.t('gamePaused'), i18next.t('tapToStart') || i18next.t('pressSpace'));
}

function homeHandler() {
  cancelAnimationFrame(animationFrameId);
  document.removeEventListener('keydown', keyDown);
  document.removeEventListener('keyup', keyUp);
  localStorage.removeItem('gameData');
  location.hash = '/home';
}

function loop(t: number) {
  if (!gameState.isRunning) return;
  const dt = (t - lastTimestamp);
  lastTimestamp = t;
  update(dt / 16.67);
  drawGame();

  if (gameState.leftPaddle.score >= MAX_SCORE) endGame(gameData?.player1 || 'Player 1');
  else if (gameState.rightPaddle.score >= MAX_SCORE) endGame(gameData?.player2 || 'Player 2');
  else animationFrameId = requestAnimationFrame(loop);
}

function update(mult: number) {
  movePaddles(mult);
  moveBall(mult);
  collide();
  scoreCheck();
}

function movePaddles(mult: number) {
  const m = PADDLE_SPEED * mult;
  if (keys['w'] || keys['W']) gameState.leftPaddle.y = Math.max(0, gameState.leftPaddle.y - m);
  if (keys['s'] || keys['S']) gameState.leftPaddle.y = Math.min(VH - PADDLE_H, gameState.leftPaddle.y + m);
  if (keys['ArrowUp']) gameState.rightPaddle.y = Math.max(0, gameState.rightPaddle.y - m);
  if (keys['ArrowDown']) gameState.rightPaddle.y = Math.min(VH - PADDLE_H, gameState.rightPaddle.y + m);
}

function moveBall(mult: number) {
  gameState.ball.x += gameState.ball.dx * mult;
  gameState.ball.y += gameState.ball.dy * mult;
}

function collide() {
  if (gameState.ball.y <= 0 || gameState.ball.y + BALL_SIZE >= VH) {
    gameState.ball.dy = -gameState.ball.dy;
    if (gameState.ball.y < 0) gameState.ball.y = 0;
    else if (gameState.ball.y + BALL_SIZE > VH) gameState.ball.y = VH - BALL_SIZE;
    sound('wall');
  }
  // Left paddle
  if (gameState.ball.dx < 0 &&
      gameState.ball.x <= gameState.leftPaddle.x + PADDLE_W &&
      gameState.ball.x + BALL_SIZE >= gameState.leftPaddle.x &&
      gameState.ball.y + BALL_SIZE >= gameState.leftPaddle.y &&
      gameState.ball.y <= gameState.leftPaddle.y + PADDLE_H) {
    gameState.ball.dx = Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.leftPaddle.x + PADDLE_W;
    adjustAngle(gameState.leftPaddle);
    boostSpeed();
    sound('paddle');
  }
  // Right paddle
  if (gameState.ball.dx > 0 &&
      gameState.ball.x + BALL_SIZE >= gameState.rightPaddle.x &&
      gameState.ball.x <= gameState.rightPaddle.x + PADDLE_W &&
      gameState.ball.y + BALL_SIZE >= gameState.rightPaddle.y &&
      gameState.ball.y <= gameState.rightPaddle.y + PADDLE_H) {
    gameState.ball.dx = -Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.rightPaddle.x - BALL_SIZE;
    adjustAngle(gameState.rightPaddle);
    boostSpeed();
    sound('paddle');
  }
}

function scoreCheck() {
  if (gameState.ball.x + BALL_SIZE < 0) {
    gameState.rightPaddle.score++;
    updateScoreDisplay();
    resetBall();
    sound('score');
  } else if (gameState.ball.x > VW) {
    gameState.leftPaddle.score++;
    updateScoreDisplay();
    resetBall();
    sound('score');
  }
}

function drawGame() {
  ctx.clearRect(0, 0, VW, VH);
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#1a1a2e');
  g.addColorStop(1, '#16213e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(VW / 2, 0);
  ctx.lineTo(VW / 2, VH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(VW / 2, VH / 2, 60, 0, Math.PI * 2);
  ctx.stroke();

  drawPaddle(gameState.leftPaddle.x, gameState.leftPaddle.y, '#00ff88');
  drawPaddle(gameState.rightPaddle.x, gameState.rightPaddle.y, '#ff4757');
  drawBall();
}

function drawPaddle(x: number, y: number, c: string) {
  ctx.shadowColor = c;
  ctx.shadowBlur = 10;
  ctx.fillStyle = c;
  ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
  ctx.shadowBlur = 0;
}

function drawBall() {
  const cx = gameState.ball.x + BALL_SIZE / 2;
  const cy = gameState.ball.y + BALL_SIZE / 2;
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function resetBall() {
  gameState.ball.x = VW / 2 - BALL_SIZE / 2;
  gameState.ball.y = VH / 2 - BALL_SIZE / 2;
  gameState.ball.speed = INITIAL_BALL_SPEED;
  const angle = (Math.random() * Math.PI / 3) - Math.PI / 6;
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
  }, 800);
}

function adjustAngle(paddle: { y: number }) {
  const hit = (gameState.ball.y + BALL_SIZE / 2 - paddle.y) / PADDLE_H;
  const clamped = Math.max(0, Math.min(1, hit));
  const ang = (clamped - 0.5) * Math.PI * 0.5;
  const dir = gameState.ball.dx > 0 ? 1 : -1;
  const speed = gameState.ball.speed;
  gameState.ball.dx = dir * Math.cos(ang) * speed;
  gameState.ball.dy = Math.sin(ang) * speed;
}

function boostSpeed() {
  gameState.ball.speed = Math.min(gameState.ball.speed * 1.05, INITIAL_BALL_SPEED * 2);
  const current = Math.hypot(gameState.ball.dx, gameState.ball.dy);
  if (current > 0) {
    const s = gameState.ball.speed / current;
    gameState.ball.dx *= s;
    gameState.ball.dy *= s;
  }
}

function updateScoreDisplay() {
  const p1 = document.getElementById('player1-score');
  const p2 = document.getElementById('player2-score');
  if (p1) p1.textContent = gameState.leftPaddle.score.toString();
  if (p2) p2.textContent = gameState.rightPaddle.score.toString();
}

function endGame(winner: string) {
  gameState.isRunning = false;
  gameState.winner = winner;
  cancelAnimationFrame(animationFrameId);

  (document.getElementById('start-button') as HTMLButtonElement).disabled = true;
  (document.getElementById('pause-button') as HTMLButtonElement).disabled = true;

  showOverlay(
    i18next.t('GAME_WIN_OVERLAY', {
      winner,
      score1: gameState.leftPaddle.score,
      score2: gameState.rightPaddle.score
    }),
    ''
  );
  showMessage(i18next.t('GAME_WIN_MESSAGE', { winner }));
  sound('win');

  const raw = localStorage.getItem('tournamentMatch');
  const tournamentMatch = raw ? JSON.parse(raw) : null;

  async function save(match: any) {
    try {
      const res = await apiFetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(match)
      });
      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) await res.json();
      if (!res.ok) throw new Error('Save error');
    } catch (e) {
      console.error('Match save failed', e);
    }
  }

  if (!tournamentMatch) {
    save({
      player1: gameData?.player1 || 'Player 1',
      player2: gameData?.player2 || 'Player 2',
      winner,
      score1: gameState.leftPaddle.score,
      score2: gameState.rightPaddle.score
    });
  } else if (tournamentMatch.matchId && tournamentMatch.round) {
    apiFetch('/api/tournament/record-winner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: tournamentMatch.matchId,
        winner,
        round: tournamentMatch.round
      })
    }).finally(() => {
      setTimeout(() => { location.hash = '/tournament'; }, 1800);
    });
  }
}

function showOverlay(title: string, msg: string) {
  const overlay = document.getElementById('game-overlay');
  const ot = document.getElementById('overlay-title');
  const om = document.getElementById('overlay-message');
  if (overlay && ot && om) {
    ot.textContent = title;
    om.textContent = msg;
    overlay.style.display = 'flex';
  }
}
function hideOverlay() {
  const overlay = document.getElementById('game-overlay');
  if (overlay) overlay.style.display = 'none';
}
function showMessage(msg: string) {
  const el = document.getElementById('game-message');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

// Input helpers
function keyDown(e: KeyboardEvent) {
  if (["w", "W", "s", "S", "ArrowUp", "ArrowDown"].includes(e.key)) {
    keys[e.key] = true;
    e.preventDefault();
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!gameState.gameStarted || gameState.isPaused) {
      if (gameState.isPaused) resumeGame();
      else startHandler();
    }
  }
  if (e.key.toLowerCase() === 'p' && gameState.isRunning) {
    pauseHandler();
  }
}
function keyUp(e: KeyboardEvent) {
  if (["w", "W", "s", "S", "ArrowUp", "ArrowDown"].includes(e.key)) {
    keys[e.key] = false;
  }
}

function setVirtualKey(code: string, pressed: boolean) {
  switch (code) {
    case 'left-up': keys['w'] = pressed; break;
    case 'left-down': keys['s'] = pressed; break;
    case 'right-up': keys['ArrowUp'] = pressed; break;
    case 'right-down': keys['ArrowDown'] = pressed; break;
  }
}

// Pointer drag handling
function pointerStart(e: PointerEvent) {
  e.preventDefault();
  const half = e.currentTarget as HTMLElement;
  const side: 'left' | 'right' = half.dataset.side === 'right' ? 'right' : 'left';
  const paddle = side === 'left' ? gameState.leftPaddle : gameState.rightPaddle;

  activeDrags.set(e.pointerId, {
    side,
    pointerStartY: e.clientY,
    startVirtualY: paddle.y
  });
  half.setPointerCapture(e.pointerId);
}

function pointerMove(e: PointerEvent) {
  if (!activeDrags.has(e.pointerId)) return;
  e.preventDefault();
  const info = activeDrags.get(e.pointerId)!;
  const rect = canvas.getBoundingClientRect();
  const deltaPixels = e.clientY - info.pointerStartY;
  const deltaVirtual = deltaPixels * (VH / rect.height);
  const paddle = info.side === 'left' ? gameState.leftPaddle : gameState.rightPaddle;
  paddle.y = clamp(info.startVirtualY + deltaVirtual, 0, VH - PADDLE_H);
}

function pointerEnd(e: PointerEvent) {
  activeDrags.delete(e.pointerId);
}

// Utility
function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }

function sound(type: 'paddle' | 'wall' | 'score' | 'win') {
  try {
    const ctxA = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctxA.createOscillator();
    const g = ctxA.createGain();
    osc.connect(g); g.connect(ctxA.destination);
    const map = { paddle: 800, wall: 420, score: 600, win: 1000 };
    osc.frequency.value = map[type];
    g.gain.value = 0.12;
    const t = ctxA.currentTime;
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.start(t); osc.stop(t + 0.12);
  } catch { /* ignore */ }
}
