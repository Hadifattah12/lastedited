import "../styles/pong.css";
import i18next from 'i18next';
import { apiFetch } from '../utils/api';
// Canvas dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;

// Game elements dimensions
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 15;
const PADDLE_SPEED = 8;
const INITIAL_BALL_SPEED = 5;
const MAX_SCORE = 5;

// Game state interface
interface GameState {
  // Paddles
  leftPaddle: { x: number; y: number; score: number };
  rightPaddle: { x: number; y: number; score: number };
  // Balla
  ball: { x: number; y: number; dx: number; dy: number; speed: number };
  // Game control
  isRunning: boolean;
  isPaused: boolean;
  winner: string | null;
  gameStarted: boolean;
}

// Key state tracking
const keys: { [key: string]: boolean } = {};

let gameState: GameState;
let animationFrameId: number;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let lastTimestamp = 0;
let gameData: { player1: string; player2: string } | null = null;

export function renderGame(): HTMLElement {
  const container = document.createElement('div');
  
  // Get game data from localStorage
  const gameDataStr = localStorage.getItem('gameData');
  gameData = gameDataStr ? JSON.parse(gameDataStr) : { player1: 'Player 1', player2: 'Player 2' };

  container.innerHTML = `
    <div class="home-wrapper ">
    <div class="game-container">
      <div class="game-header">
        <h1>${i18next.t('title')}</h1>
        <div class="score-board">
          <div class="player-score left-player">
            <span class="player-name">${gameData?.player1 || "palyer one"}</span>
            <span class="score" id="player1-score">0</span>
          </div>
          <div class="vs-divider">${i18next.t('vs')}</div>
          <div class="player-score right-player">
            <span class="player-name">${gameData?.player2}</span>
            <span class="score" id="player2-score">0</span>
          </div>
        </div>
      </div>
      
      <div class="game-area">
        <canvas id="game-canvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
        <div id="game-overlay" class="game-overlay">
          <div class="overlay-content">
            <h2 id="overlay-title">${i18next.t('ready')}</h2>
            <p id="overlay-message">${i18next.t('pressSpace')}</p>
          </div>
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
    </div>
  `;

  // Initialize the game
  initializeGame(container);

  return container;
}

function initializeGame(container: HTMLElement) {
  canvas = container.querySelector("#game-canvas") as HTMLCanvasElement;
  ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  
  // Initialize game state
  initGame();

  // Set up event listeners
  const startButton = container.querySelector("#start-button") as HTMLButtonElement;
  const pauseButton = container.querySelector("#pause-button") as HTMLButtonElement;
  const homeButton = container.querySelector("#home-button") as HTMLButtonElement;

  startButton?.addEventListener("click", handleStartGame);
  pauseButton?.addEventListener("click", handlePauseGame);
  homeButton?.addEventListener("click", handleHomeButton);

  // Set up keyboard event listeners
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  
  // Initial draw
  drawGame();
  showOverlay("Ready to Play?", "Press SPACE or click Start to begin!");
}

function initGame() {
  gameState = {
    leftPaddle: {
      x: 30,
      y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0
    },
    rightPaddle: {
      x: CANVAS_WIDTH - 30 - PADDLE_WIDTH,
      y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0
    },
    ball: {
      x: CANVAS_WIDTH / 2 - BALL_SIZE / 2,
      y: CANVAS_HEIGHT / 2 - BALL_SIZE / 2,
      dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED : -INITIAL_BALL_SPEED,
      dy: (Math.random() * 2 - 1) * INITIAL_BALL_SPEED * 0.5,
      speed: INITIAL_BALL_SPEED
    },
    isRunning: false,
    isPaused: false,
    winner: null,
    gameStarted: false
  };
}

function handleStartGame() {
  if (gameState.isRunning || gameState.gameStarted) return;
  
  const startButton = document.getElementById("start-button") as HTMLButtonElement;
  const pauseButton = document.getElementById("pause-button") as HTMLButtonElement;
  
  // Update UI
  startButton.disabled = true;
  pauseButton.disabled = false;
  
  // Hide overlay
  hideOverlay();
  
  // Start countdown
  startCountdown();
}

function handlePauseGame() {
  if (!gameState.gameStarted) return;
  
  const startButton = document.getElementById("start-button") as HTMLButtonElement;
  const pauseButton = document.getElementById("pause-button") as HTMLButtonElement;
  
  if (gameState.isRunning) {
    // Pause the game
    gameState.isRunning = false;
    gameState.isPaused = true;
    cancelAnimationFrame(animationFrameId);
    
    startButton.disabled = false;
    pauseButton.disabled = true;
    startButton.textContent = "▶️ Resume";
    
  showOverlay(i18next.t('gamePaused'), i18next.t('pressSpace'));


  }
}

function handleHomeButton() {
  // Clean up game resources
  cancelAnimationFrame(animationFrameId);
  document.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("keyup", handleKeyUp);
  
  // Clear game data
  localStorage.removeItem("gameData");
  
  // Navigate back to home
  location.hash = '/home';
}

function startCountdown() {
  let count = 3;
  const countdownInterval = setInterval(() => {
    if (count > 0) {
      showOverlay(i18next.t('getReady'), `${count}`);
      count--;
    } else {
      clearInterval(countdownInterval);
      hideOverlay();
      startGameLoop();
    }
  }, 1000);
}

function startGameLoop() {
  gameState.isRunning = true;
  gameState.gameStarted = true;
  gameState.isPaused = false;
  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp: number) {
  if (!gameState.isRunning) return;
  
  // Calculate delta time for smooth animations
  const deltaTime = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  
  // Update game state
  updateGameState(deltaTime / 16.67); // Normalize by 60fps
  
  // Draw game
  drawGame();
  
  // Check for winner
  if (gameState.leftPaddle.score >= MAX_SCORE) {
    endGame(gameData?.player1 || "Player 1");
  } else if (gameState.rightPaddle.score >= MAX_SCORE) {
    endGame(gameData?.player2 || "Player 2");
  } else if (gameState.isRunning) {
    // Continue game loop
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function updateGameState(deltaMultiplier: number) {
  if (!gameState.isRunning) return;
  
  // Handle paddle movement
  movePaddles(deltaMultiplier);
  
  // Move ball
  moveBall(deltaMultiplier);
  
  // Check for collisions
  checkCollisions();
  
  // Check for scoring
  checkScoring();
}

function movePaddles(deltaMultiplier: number) {
  const moveAmount = PADDLE_SPEED * deltaMultiplier;
  
  // Left paddle (Player 1) - W and S keys
  if (keys["w"] || keys["W"]) {
    gameState.leftPaddle.y = Math.max(0, gameState.leftPaddle.y - moveAmount);
  }
  if (keys["s"] || keys["S"]) {
    gameState.leftPaddle.y = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, gameState.leftPaddle.y + moveAmount);
  }
  
  // Right paddle (Player 2) - Arrow keys
  if (keys["ArrowUp"]) {
    gameState.rightPaddle.y = Math.max(0, gameState.rightPaddle.y - moveAmount);
  }
  if (keys["ArrowDown"]) {
    gameState.rightPaddle.y = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, gameState.rightPaddle.y + moveAmount);
  }
}

function moveBall(deltaMultiplier: number) {
  gameState.ball.x += gameState.ball.dx * deltaMultiplier;
  gameState.ball.y += gameState.ball.dy * deltaMultiplier;
}

function checkCollisions() {
  // Ball collision with top and bottom walls
  if (gameState.ball.y <= 0 || gameState.ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
    gameState.ball.dy = -gameState.ball.dy;
    
    // Keep ball in bounds
    if (gameState.ball.y < 0) {
      gameState.ball.y = 0;
    } else if (gameState.ball.y + BALL_SIZE > CANVAS_HEIGHT) {
      gameState.ball.y = CANVAS_HEIGHT - BALL_SIZE;
    }
    
    // Add sound effect (optional)
    playSound('wall');
  }
  
  // Left paddle collision
  if (gameState.ball.dx < 0 && 
      gameState.ball.x <= gameState.leftPaddle.x + PADDLE_WIDTH &&
      gameState.ball.x + BALL_SIZE >= gameState.leftPaddle.x &&
      gameState.ball.y + BALL_SIZE >= gameState.leftPaddle.y &&
      gameState.ball.y <= gameState.leftPaddle.y + PADDLE_HEIGHT) {
    
    gameState.ball.dx = Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.leftPaddle.x + PADDLE_WIDTH;
    adjustBallAngle(gameState.leftPaddle);
    increaseSpeed();
    playSound('paddle');
  }
  
  // Right paddle collision
  if (gameState.ball.dx > 0 &&
      gameState.ball.x + BALL_SIZE >= gameState.rightPaddle.x &&
      gameState.ball.x <= gameState.rightPaddle.x + PADDLE_WIDTH &&
      gameState.ball.y + BALL_SIZE >= gameState.rightPaddle.y &&
      gameState.ball.y <= gameState.rightPaddle.y + PADDLE_HEIGHT) {
    
    gameState.ball.dx = -Math.abs(gameState.ball.dx);
    gameState.ball.x = gameState.rightPaddle.x - BALL_SIZE;
    adjustBallAngle(gameState.rightPaddle);
    increaseSpeed();
    playSound('paddle');
  }
}

function checkScoring() {
  // Left side (Player 2 scores)
  if (gameState.ball.x + BALL_SIZE < 0) {
    gameState.rightPaddle.score += 1;
    updateScoreDisplay();
    resetBall();
    playSound('score');
  }
  // Right side (Player 1 scores)
  else if (gameState.ball.x > CANVAS_WIDTH) {
    gameState.leftPaddle.score += 1;
    updateScoreDisplay();
    resetBall();
    playSound('score');
  }
}

function drawGame() {
  // Clear canvas with gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  // Draw center line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw center circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 60, 0, Math.PI * 2);
  ctx.stroke();
  
  // Draw paddles with glow effect
  drawPaddle(gameState.leftPaddle.x, gameState.leftPaddle.y, '#00ff88');
  drawPaddle(gameState.rightPaddle.x, gameState.rightPaddle.y, '#ff4757');
  
  // Draw ball with glow effect
  drawBall();
}

function drawPaddle(x: number, y: number, color: string) {
  // Glow effect
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, PADDLE_WIDTH, PADDLE_HEIGHT);
  
  // Reset shadow
  ctx.shadowBlur = 0;
}

function drawBall() {
  const ballCenterX = gameState.ball.x + BALL_SIZE / 2;
  const ballCenterY = gameState.ball.y + BALL_SIZE / 2;
  
  // Glow effect
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ballCenterX, ballCenterY, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Reset shadow
  ctx.shadowBlur = 0;
}

function resetBall() {
  // Center the ball
  gameState.ball.x = CANVAS_WIDTH / 2 - BALL_SIZE / 2;
  gameState.ball.y = CANVAS_HEIGHT / 2 - BALL_SIZE / 2;
  
  // Reset ball speed
  gameState.ball.speed = INITIAL_BALL_SPEED;
  
  // Random direction
  const angle = (Math.random() * Math.PI / 3) - Math.PI / 6; // -30 to 30 degrees
  const direction = Math.random() > 0.5 ? 1 : -1;
  
  gameState.ball.dx = direction * Math.cos(angle) * INITIAL_BALL_SPEED;
  gameState.ball.dy = Math.sin(angle) * INITIAL_BALL_SPEED;
  
  // Brief pause before resuming
  const wasRunning = gameState.isRunning;
  gameState.isRunning = false;
  
  setTimeout(() => {
    if (wasRunning && !gameState.winner) {
      gameState.isRunning = true;
      lastTimestamp = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
    }
  }, 1000);
}

function adjustBallAngle(paddle: { x: number; y: number }) {
  const hitPosition = (gameState.ball.y + BALL_SIZE / 2 - paddle.y) / PADDLE_HEIGHT;
  const clampedHitPosition = Math.max(0, Math.min(1, hitPosition));
  const angle = (clampedHitPosition - 0.5) * Math.PI * 0.5;
  
  const direction = paddle.x < CANVAS_WIDTH / 2 ? 1 : -1;
  const speed = gameState.ball.speed;
  
  gameState.ball.dx = direction * Math.cos(angle) * speed;
  gameState.ball.dy = Math.sin(angle) * speed;
}

function increaseSpeed() {
  gameState.ball.speed = Math.min(gameState.ball.speed * 1.05, INITIAL_BALL_SPEED * 2);
  
  const currentSpeed = Math.sqrt(gameState.ball.dx * gameState.ball.dx + gameState.ball.dy * gameState.ball.dy);
  if (currentSpeed > 0) {
    const speedMultiplier = gameState.ball.speed / currentSpeed;
    gameState.ball.dx *= speedMultiplier;
    gameState.ball.dy *= speedMultiplier;
  }
}

function updateScoreDisplay() {
  const player1ScoreElement = document.getElementById("player1-score");
  const player2ScoreElement = document.getElementById("player2-score");
  
  if (player1ScoreElement) player1ScoreElement.textContent = gameState.leftPaddle.score.toString();
  if (player2ScoreElement) player2ScoreElement.textContent = gameState.rightPaddle.score.toString();
}

function endGame(winner: string) {

  gameState.isRunning = false;
  gameState.winner = winner;

  cancelAnimationFrame(animationFrameId);

  const startButton = document.getElementById("start-button") as HTMLButtonElement;
  const pauseButton = document.getElementById("pause-button") as HTMLButtonElement;

  startButton.disabled = true;
  pauseButton.disabled = true;

  showOverlay(
  i18next.t('GAME_WIN_OVERLAY', {
    winner,
    score1: gameState.leftPaddle.score,
    score2: gameState.rightPaddle.score
  }),
  i18next.t('') // or another key if you want a specific message
);

showMessage(i18next.t('GAME_WIN_MESSAGE', { winner }));


  playSound('win');
  // ✅ Save 1v1 match history to backend if not a tournament game

  const tournamentMatchRaw = localStorage.getItem('tournamentMatch');
  const tournamentMatch = tournamentMatchRaw ? JSON.parse(tournamentMatchRaw) : null;
  async function saveMatchToBackend(matchData: any) {
  try {

    const res = await apiFetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchData)
    });

    const contentType = res.headers.get('Content-Type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    }

    if (!res.ok) {
      throw new Error(data?.error || `Server error: ${res.status}`);
    }

  } catch (err) {
    console.error("❌ Failed to save match:", err);
  }
}

  if (!tournamentMatch) {
  const matchData = {
    player1: gameData?.player1 || "Player 1",
    player2: gameData?.player2 || "Player 2",
    winner,
    score1: gameState.leftPaddle.score,
    score2: gameState.rightPaddle.score
  };

  saveMatchToBackend(matchData); // ✅ call async function
}

  // Only handle tournament logic if this is actually a tournament match
  if (tournamentMatch && tournamentMatch.matchId && tournamentMatch.round) {
    apiFetch('/api/tournament/record-winner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: tournamentMatch.matchId,
        winner,
        round: tournamentMatch.round
      })
    }).then(() => {
      setTimeout(() => {
        location.hash = '/tournament';
      }, 2000);
    }).catch(() => {
      setTimeout(() => {
        location.hash = '/tournament';
      }, 2000);
    });
  }
  // For regular 1v1 games, don't redirect anywhere - stay in the pong game
  // The user can choose to play again or go home using the buttons
}


function showOverlay(title: string, message: string) {
  const overlay = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMessage = document.getElementById("overlay-message");
  
  if (overlay && overlayTitle && overlayMessage) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlay.style.display = 'flex';
  }
}

function hideOverlay() {
  const overlay = document.getElementById("game-overlay");
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function showMessage(message: string) {
  const messageElement = document.getElementById("game-message");
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.style.display = 'block';
  }
}

function clearMessage() {
  const messageElement = document.getElementById("game-message");
  if (messageElement) {
    messageElement.textContent = '';
    messageElement.style.display = 'none';
  }
}

function playSound(type: 'paddle' | 'wall' | 'score' | 'win') {
  // Simple sound simulation with Web Audio API (optional)
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch (type) {
      case 'paddle':
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        break;
      case 'wall':
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        break;
      case 'score':
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        break;
      case 'win':
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
        break;
    }
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    // Audio not supported, ignore
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (["w", "W", "s", "S", "ArrowUp", "ArrowDown"].includes(e.key)) {
    keys[e.key] = true;
    e.preventDefault();
  }
  
  // Space bar to start/resume game
  if (e.key === " ") {
    e.preventDefault();
    if (!gameState.gameStarted || gameState.isPaused) {
      if (gameState.isPaused) {
        // Resume game
        const startButton = document.getElementById("start-button") as HTMLButtonElement;
        const pauseButton = document.getElementById("pause-button") as HTMLButtonElement;
        
        startButton.disabled = true;
        pauseButton.disabled = false;
        startButton.textContent = "🎮 Start Game";
        
        hideOverlay();
        startGameLoop();
      } else {
        handleStartGame();
      }
    }
  }
  
  // P key to pause
  if(typeof e.key == "string" &&  e.key.toLowerCase() === 'p' && gameState.gameStarted && gameState.isRunning) {
    handlePauseGame();
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (["w", "W", "s", "S", "ArrowUp", "ArrowDown"].includes(e.key)) {
    keys[e.key] = false;
  }
}