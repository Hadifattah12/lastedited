/* src/pages/remote-game.ts
   ——————————————————————————————————————————————————————— */
import "../styles/pong.css";
import i18next from "i18next";
import { wsBase } from "../utils/api";

/* Canvas constants */
const W = 800, H = 400, P = 15, PH = 80, B = 15;

/* Server-sent state */
interface RemoteState {
  leftPaddle:  { x: number; y: number; score: number };
  rightPaddle: { x: number; y: number; score: number };
  ball:        { x: number; y: number };
  running: boolean;
}

/* Globals */
let ws: WebSocket | null = null;
let side: "left" | "right";
let myName       = "";
let opponentName = "…";
let currentState: RemoteState | null = null;
let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
const keys = { up: false, down: false };
let controlsEnabled = false;           // ⬅️  gate key input
let frameId = 0, pageActive = false;

/* ── helper: get opponent name ───────────────────────────────── */
function extractOpponent(pkt: any): string | undefined {
  return (
    pkt.nameOpponent ??
    pkt.opponentName ??
    pkt.hostName     ??
    pkt.name
  );
}

/* ── entry point ────────────────────────────────────────────── */
export function renderRemoteGame(): HTMLElement {
  pageActive = true;

  const root = document.createElement("div");
  root.className = "home-wrapper";
  root.innerHTML = `
    <div class="game-container">
      <div class="score-board">
        <span id="left-name">P1</span>&nbsp;<span id="left-score">0</span>
        &nbsp;|&nbsp;
        <span id="right-score">0</span>&nbsp;<span id="right-name">P2</span>
      </div>

      <!-- overlay for the 3-second countdown -->
      <div id="overlay" class="game-overlay" style="display:none;">
        <div class="overlay-content">
          <h2 id="ov-title">Get Ready</h2>
          <p id="ov-msg">3</p>
        </div>
      </div>

      <canvas id="remote-canvas" width="${W}" height="${H}"></canvas>
      <button id="homeBtn" class="btn btn-home">${i18next.t("home")}</button>
    </div>`;

  canvas = root.querySelector("#remote-canvas") as HTMLCanvasElement;
  ctx    = canvas.getContext("2d") as CanvasRenderingContext2D;

  root.querySelector<HTMLButtonElement>("#homeBtn")!
      .addEventListener("click", () => { cleanup(); location.hash = "/home"; });

  window.addEventListener("hashchange", hashWatcher);

  connectWebSocket();
  addKeyboardListeners();
  draw();                                   // start render loop
  return root;
}

/* ── WebSocket ─────────────────────────────────────────────── */
function connectWebSocket() {
  const code = localStorage.getItem("remoteGameCode");
  myName = JSON.parse(localStorage.getItem("user") || "{}")?.name || "Player";
  const url = `${wsBase()}://${location.hostname}:3000/?code=${code}&name=${encodeURIComponent(myName)}`;
  ws = new WebSocket(url);

  ws.onmessage = ({ data }) => {
    if (!pageActive) return;
    const msg = JSON.parse(data);

    switch (msg.type) {
      case "init": {
        side = msg.side;
        const opp = extractOpponent(msg);
        if (opp) opponentName = opp;
        currentState = msg.state;
        updateNames(); updateScores();
        break;
      }

      /* host sends this when both connected */
      case "ready": {
        const opp = extractOpponent(msg);
        if (opp) opponentName = opp;
        updateNames();
        startCountdown();                 // ⬅️  start the 3-s timer
        break;
      }

      case "state":
        currentState = msg.state;
        updateScores();
        break;

      case "gameOver":
        alert(i18next.t("GAME_WIN_MESSAGE", { winner: msg.winner }));
        break;

      default:
        console.warn("Unknown ws packet", msg);
    }
  };

  ws.onclose = () => { if (pageActive) alert(i18next.t("playerLeft")); };
}

/* ── 3-second overlay/countdown ─────────────────────────────── */
function startCountdown() {
  controlsEnabled = false;          // freeze paddles until countdown ends
  const ov   = document.getElementById("overlay")!;
  const ovMsg= document.getElementById("ov-msg")!;
  ov.style.display = "flex";

  let n = 3;
  ovMsg.textContent = String(n);
  const tick = setInterval(() => {
    n -= 1;
    if (n > 0) {
      ovMsg.textContent = String(n);
    } else {
      clearInterval(tick);
      ov.style.display = "none";
      controlsEnabled = true;       // allow input after 3 s
    }
  }, 1000);
}

/* ── send paddle input to server ─────────────────────────────── */
function sendInput() {
  if (!controlsEnabled) return;     // ignore keys until countdown ends
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({ type:"input", up: keys.up, down: keys.down }));
  }
}

/* ── key handling ────────────────────────────────────────────── */
function onKeyDown(e: KeyboardEvent){
  if (["ArrowUp","w","W"].includes(e.key))    { keys.up   = true;  sendInput(); }
  if (["ArrowDown","s","S"].includes(e.key))  { keys.down = true;  sendInput(); }
}
function onKeyUp(e: KeyboardEvent){
  if (["ArrowUp","w","W"].includes(e.key))    { keys.up   = false; sendInput(); }
  if (["ArrowDown","s","S"].includes(e.key))  { keys.down = false; sendInput(); }
}
function addKeyboardListeners(){
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup",   onKeyUp);
}

/* ── render loop (draws whatever state the server sends) ────── */
function draw(){
  if (!pageActive) return;
  frameId = requestAnimationFrame(draw);
  if (!currentState) return;

  ctx.clearRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#1a1a2e"); g.addColorStop(1,"#16213e");
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.setLineDash([10,10]);
  ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#00ff88";
  ctx.fillRect(currentState.leftPaddle.x, currentState.leftPaddle.y, P, PH);
  ctx.fillStyle = "#ff4757";
  ctx.fillRect(currentState.rightPaddle.x, currentState.rightPaddle.y, P, PH);

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(currentState.ball.x+B/2, currentState.ball.y+B/2, B/2, 0, Math.PI*2);
  ctx.fill();
}

/* ── scoreboard helpers ─────────────────────────────────────── */
function updateNames(){
  const l = document.getElementById("left-name")!;
  const r = document.getElementById("right-name")!;
  l.textContent = side==="left" ? myName : opponentName;
  r.textContent = side==="right"? myName : opponentName;
  console.log("🏷️ Names →", { myName, opponentName, side });
}
function updateScores(){
  if (!currentState) return;
  (document.getElementById("left-score")  as HTMLElement).textContent = String(currentState.leftPaddle.score);
  (document.getElementById("right-score") as HTMLElement).textContent = String(currentState.rightPaddle.score);
}

/* ── cleanup ────────────────────────────────────────────────── */
function cleanup(){
  pageActive = false;
  cancelAnimationFrame(frameId);
  ws?.close(); ws = null;
  document.removeEventListener("keydown",onKeyDown);
  document.removeEventListener("keyup",onKeyUp);
  window.removeEventListener("hashchange", hashWatcher);
}
function hashWatcher(){
  if (location.hash !== "#/remote-game") cleanup();
}
