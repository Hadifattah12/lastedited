/* src/pages/remote-game.ts
   Remote 1v1 Pong (responsive + optimistic local paddle movement) */

import "../styles/pong.css";
import i18next from "i18next";

/* ===== CONFIG ===== */
const GAME_W = 800;
const GAME_H = 400;
const PADDLE_W = 15;
const PADDLE_H = 80;
const BALL_SIZE = 15;
const LOCAL_PADDLE_SPEED = 9;
const INPUT_INTERVAL_MS = 50;
const KEEPALIVE_INTERVAL = 250;
const SERVER_CORRECTION_THRESHOLD = 20;
const MAX_FRAME_DELTA = 40;
const INITIAL_FAKE_STATE = true;

/* ===== TYPES ===== */
interface RemotePaddle { x:number; y:number; score:number; }
interface RemoteState {
  leftPaddle: RemotePaddle;
  rightPaddle: RemotePaddle;
  ball: { x:number; y:number };
  running: boolean;
}
type Side = "left" | "right";
interface InitMessage { type:"init"; side:Side; state:RemoteState; opponentName?:string; nameOpponent?:string; hostName?:string; name?:string; }
interface StateMessage { type:"state"; state:RemoteState; }
interface ReadyMessage { type:"ready"; opponentName?:string; nameOpponent?:string; hostName?:string; name?:string; }
interface GameOverMessage { type:"gameOver"; winner?:string; }

/* ===== GLOBALS ===== */
let ws: WebSocket | null = null;
let side: Side = "left";
let myName = "";
let opponentName = "…";
let state: RemoteState | null = null;

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let pageActive = false;
let frameId = 0;
let lastFrameTime = performance.now();

const keys = { up:false, down:false };
let controlsEnabled = false;
let lastInputSent = 0;
let lastKeepAlive = 0;

interface DragInfo { pointerStartY:number; paddleStartY:number; }
const activeDrags = new Map<number,DragInfo>();
let canvasRect: DOMRect | null = null;

const LOCAL_DEBUG = localStorage.getItem("LOCAL_DEBUG") === "true";

/* ===== HELPERS ===== */
const qs = <T extends Element = Element>(sel:string, root:ParentNode=document)=>root.querySelector<T>(sel);
function log(...a:any[]){ if(LOCAL_DEBUG) console.log("[remote]", ...a); }
function extractOpponent(src:any){ return src?.opponentName ?? src?.nameOpponent ?? src?.hostName ?? src?.name; }
function clamp(v:number,a:number,b:number){ return v<a?a:v>b?b:v; }
function recalcCanvasRect(){ canvasRect = canvas.getBoundingClientRect(); }

let toastTimer:number|null=null;
function showToast(msg:string,type:"info"|"success"|"error"="info",dur=3000){
  const el=qs<HTMLDivElement>("#toast"); if(!el)return;
  el.textContent=msg; el.className=`toast toast--visible toast--${type}`;
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(()=>el.classList.remove("toast--visible"),dur);
}

/* ===== ENTRY ===== */
export function renderRemoteGame(): HTMLElement {
  pageActive = true;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="pong-wrapper">
      <div id="toast" class="toast" aria-live="polite" aria-atomic="true"></div>
      <div class="game-header">
        <h1>${i18next.t("onlineMatch") || "Online Match"}</h1>
        <div class="score-board">
          <div class="player-score left-player">
            <span class="player-name" id="left-name">P1</span>
            <span class="score" id="left-score">0</span>
          </div>
          <div class="vs-divider">${i18next.t("vs") || "VS"}</div>
          <div class="player-score right-player">
            <span class="player-name" id="right-name">P2</span>
            <span class="score" id="right-score">0</span>
          </div>
        </div>
      </div>

      <div class="canvas-shell">
        <canvas id="game-canvas" width="${GAME_W}" height="${GAME_H}"></canvas>

        <div id="game-overlay" class="game-overlay" style="display:none;">
          <div class="overlay-content">
            <h2 id="overlay-title">${i18next.t("getReady") || "Get Ready"}</h2>
            <p id="overlay-message">3</p>
          </div>
        </div>

        <div class="touch-layer" aria-hidden="true">
            <div class="touch-half left" data-side="left"></div>
            <div class="touch-half right" data-side="right"></div>
        </div>
      </div>

      <div class="mobile-buttons" id="mobile-buttons">
        <div class="btn-col" id="col-left">
          <button class="mini-btn" data-btn="left-up">▲</button>
          <button class="mini-btn" data-btn="left-down">▼</button>
        </div>
        <div class="btn-col" id="col-right">
          <button class="mini-btn" data-btn="right-up">▲</button>
          <button class="mini-btn" data-btn="right-down">▼</button>
        </div>
      </div>

      <div class="game-controls">
        <div class="button-group">
          <button id="home-button" class="btn btn-home">${i18next.t("home")}</button>
        </div>
      </div>

      <div id="game-message" class="game-message"></div>
    </div>
  `;

  canvas = qs<HTMLCanvasElement>("#game-canvas", wrapper)!;
  ctx     = canvas.getContext("2d") as CanvasRenderingContext2D;
  recalcCanvasRect();

  qs<HTMLButtonElement>("#home-button",wrapper)!.addEventListener("click", () => {
    cleanup(); location.hash = "/home";
  });

  attachKeyboard();
  attachTouch(wrapper);
  attachMobileButtons(wrapper);

  window.addEventListener("hashchange", hashWatcher);
  window.addEventListener("resize", recalcCanvasRect);
  window.addEventListener("orientationchange", ()=>setTimeout(recalcCanvasRect,150));

  if (INITIAL_FAKE_STATE) bootstrapTempState();

  connectWS();
  startRenderLoop();

  return wrapper;
}

/* ===== TEMP STATE ===== */
function bootstrapTempState(){
  if (state) return;
  state = {
    leftPaddle:  { x:30, y: GAME_H/2 - PADDLE_H/2, score:0 },
    rightPaddle: { x: GAME_W - 30 - PADDLE_W, y: GAME_H/2 - PADDLE_H/2, score:0 },
    ball: { x: GAME_W/2 - BALL_SIZE/2, y: GAME_H/2 - BALL_SIZE/2 },
    running: false
  };
  controlsEnabled = true;
  updateNames();
  updateScores();
}

/* ===== WS ===== */
function buildWsUrl(code:string, playerName:string): string {
  const direct = localStorage.getItem("REMOTE_WS_URL");
  if (direct) return `${direct}?code=${encodeURIComponent(code)}&name=${encodeURIComponent(playerName)}`;
  const sameOrigin = localStorage.getItem("REMOTE_SAME_ORIGIN")==="1";
  const proto = location.protocol==="https:" ? "wss" : "ws";
  const host  = location.hostname;
  const port  = sameOrigin ? (location.port||"") : (localStorage.getItem("REMOTE_WS_PORT") || "3000");
  return `${proto}://${host}${port?":"+port:""}/?code=${encodeURIComponent(code)}&name=${encodeURIComponent(playerName)}`;
}

function connectWS(){
  myName = JSON.parse(localStorage.getItem("user")||"{}")?.name || "Player";
  const code = localStorage.getItem("remoteGameCode") || "";
  const url  = buildWsUrl(code, myName);
  try { ws = new WebSocket(url); } catch { showToast("WebSocket init failed","error"); return; }

  ws.onopen = () => showToast(i18next.t("connected") || "Connected","info",1100);

  ws.onmessage = evt => {
    if (!pageActive) return;
    let msg:any; try { msg = JSON.parse(evt.data); } catch { return; }
    switch (msg.type) {
      case "init": handleInit(msg as InitMessage); break;
      case "ready": handleReady(msg as ReadyMessage); break;
      case "state": handleState(msg as StateMessage); break;
      case "gameOver": handleGameOver(msg as GameOverMessage); break;
      default: log("Unknown message", msg);
    }
  };

  ws.onerror = () => pageActive && showToast(i18next.t("connectionError") || "Connection error","error",3500);
  ws.onclose = () => pageActive && showToast(i18next.t("playerLeft") || "Opponent left","error",3500);
}

/* ===== WS HANDLERS ===== */
function handleInit(msg: InitMessage){
  side = msg.side === "right" ? "right" : "left";
  opponentName = extractOpponent(msg) || opponentName;
  state = msg.state;
  controlsEnabled = true;
  updateNames();
  updateScores();
  configureMobileColumns();
  log("Init side=", side);
}

function handleReady(msg: ReadyMessage){
  opponentName = extractOpponent(msg) || opponentName;
  updateNames();
  startCountdown();
}

function handleState(msg: StateMessage){
  if (!state) { state = msg.state; updateScores(); return; }
  const incoming = msg.state;
  if (side === "left") {
    state.leftPaddle.score  = incoming.leftPaddle.score;
    state.rightPaddle       = incoming.rightPaddle;
    const serverY = incoming.leftPaddle.y;
    if (Math.abs(serverY - state.leftPaddle.y) > SERVER_CORRECTION_THRESHOLD) {
      state.leftPaddle.y = serverY;
    }
  } else {
    state.rightPaddle.score = incoming.rightPaddle.score;
    state.leftPaddle        = incoming.leftPaddle;
    const serverY = incoming.rightPaddle.y;
    if (Math.abs(serverY - state.rightPaddle.y) > SERVER_CORRECTION_THRESHOLD) {
      state.rightPaddle.y = serverY;
    }
  }
  state.ball    = incoming.ball;
  state.running = incoming.running;
  updateScores();
}

function handleGameOver(msg: GameOverMessage){
  controlsEnabled = false;
  showOverlay(
    i18next.t("GAME_WIN_OVERLAY", {
      winner: msg.winner || "—",
      score1: state?.leftPaddle.score ?? 0,
      score2: state?.rightPaddle.score ?? 0
    }) || `Winner: ${msg.winner || "—"}`,
    ""
  );
  showToast(
    (i18next.t("gameOverWinner") || "Winner: {{winner}}").replace("{{winner}}", msg.winner || "—"),
    "success", 4500
  );
  showMessage(i18next.t("GAME_WIN_MESSAGE", { winner: msg.winner }) || `${msg.winner || "—"} wins!`);
}

/* ===== COUNTDOWN / OVERLAY ===== */
function startCountdown(){
  showOverlay(i18next.t("getReady") || "Get Ready", "3");
  let n = 3;
  const id = setInterval(()=>{
    n--;
    if (n>0) setOverlayCount(String(n));
    else {
      clearInterval(id);
      hideOverlay();
      showToast(i18next.t("go") || "Go!", "info", 800);
    }
  },1000);
}

function showOverlay(title:string,msg:string){
  const ov=qs<HTMLDivElement>("#game-overlay");
  const t=qs<HTMLElement>("#overlay-title");
  const m=qs<HTMLElement>("#overlay-message");
  if (ov && t && m) { t.textContent=title; m.textContent=msg; ov.style.display="flex"; }
}
function setOverlayCount(v:string){ const m=qs<HTMLElement>("#overlay-message"); if (m) m.textContent=v; }
function hideOverlay(){ const ov=qs<HTMLDivElement>("#game-overlay"); if (ov) ov.style.display="none"; }

/* ===== INPUT: KEYBOARD ===== */
function attachKeyboard(){
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
}
function keyDown(e:KeyboardEvent){
  if (!controlsEnabled) return;
  let changed = false;
  if (["ArrowUp","w","W"].includes(e.key)) { if (!keys.up) { keys.up=true; changed=true; } e.preventDefault(); }
  if (["ArrowDown","s","S"].includes(e.key)) { if (!keys.down){ keys.down=true; changed=true; } e.preventDefault(); }
  if (changed) sendInput(true);
}
function keyUp(e:KeyboardEvent){
  let changed=false;
  if (["ArrowUp","w","W"].includes(e.key)) { if (keys.up){ keys.up=false; changed=true; } }
  if (["ArrowDown","s","S"].includes(e.key)) { if (keys.down){ keys.down=false; changed=true; } }
  if (changed) sendInput(true);
}

/* ===== INPUT: MOBILE BUTTONS ===== */
function attachMobileButtons(root:HTMLElement){
  root.querySelectorAll<HTMLButtonElement>(".mini-btn[data-btn]").forEach(btn=>{
    const code=btn.dataset.btn!;
    const press=(p:boolean)=>{ if(!controlsEnabled) return; mapButton(code,p); };
    btn.addEventListener("pointerdown", e=>{e.preventDefault(); press(true);});
    ["pointerup","pointerleave"].forEach(ev=>btn.addEventListener(ev,()=>press(false)));
    btn.addEventListener("touchstart", e=>{e.preventDefault(); press(true);},{passive:false});
    btn.addEventListener("touchend", ()=>press(false));
  });
}
function mapButton(code:string, pressed:boolean){
  if (side === "left") {
    if (code==="left-up") keys.up = pressed;
    if (code==="left-down") keys.down = pressed;
  } else {
    if (code==="right-up") keys.up = pressed;
    if (code==="right-down") keys.down = pressed;
  }
  sendInput(false);
}

/* ===== ENABLE/DISABLE MOBILE COLUMNS ===== */
function configureMobileColumns() {
  const left  = qs<HTMLDivElement>("#col-left");
  const right = qs<HTMLDivElement>("#col-right");
  if (!left || !right) return;

  if (side === "left") {
    left.style.opacity = "1";
    left.querySelectorAll("button").forEach(b => { b.disabled = false; });
    right.style.opacity = "0.25";
    right.querySelectorAll("button").forEach(b => { b.disabled = true;  });
  } else {
    right.style.opacity = "1";
    right.querySelectorAll("button").forEach(b => { b.disabled = false; });
    left.style.opacity = "0.25";
    left.querySelectorAll("button").forEach(b => { b.disabled = true;  });
  }
}

/* ===== INPUT: TOUCH DRAG ===== */
function attachTouch(root:HTMLElement){
  root.querySelectorAll<HTMLElement>(".touch-half").forEach(zone=>{
    zone.addEventListener("pointerdown",touchStart,{passive:false});
    zone.addEventListener("pointermove",touchMove,{passive:false});
    zone.addEventListener("pointerup",touchEnd);
    zone.addEventListener("pointercancel",touchEnd);
    zone.addEventListener("pointerleave",touchEnd);
  });
}
function touchStart(e:PointerEvent){
  if(!controlsEnabled || !state) return;
  const zone = e.currentTarget as HTMLElement;
  if (zone.dataset.side !== side) return;
  e.preventDefault();
  recalcCanvasRect();
  const p = side==="left"?state.leftPaddle:state.rightPaddle;
  activeDrags.set(e.pointerId,{ pointerStartY:e.clientY, paddleStartY:p.y });
  zone.setPointerCapture(e.pointerId);
}
function touchMove(e:PointerEvent){
  const info = activeDrags.get(e.pointerId);
  if (!info || !controlsEnabled || !state) return;
  e.preventDefault();
  if (!canvasRect) recalcCanvasRect();
  const p = side==="left"?state.leftPaddle:state.rightPaddle;
  const rect = canvasRect!;
  const deltaPx = e.clientY - info.pointerStartY;
  const virtualDelta = deltaPx * (GAME_H / rect.height);
  p.y = clamp(info.paddleStartY + virtualDelta, 0, GAME_H - PADDLE_H);
  if (virtualDelta < -2) { keys.up=true; keys.down=false; }
  else if (virtualDelta > 2) { keys.down=true; keys.up=false; }
  else { keys.up=false; keys.down=false; }
  sendInput(false);
}
function touchEnd(e:PointerEvent){
  if(activeDrags.delete(e.pointerId)){
    keys.up=false; keys.down=false;
    sendInput(true);
  }
}

/* ===== NETWORK INPUT ===== */
function sendInput(force:boolean){
  if(!ws || ws.readyState !== WebSocket.OPEN || !controlsEnabled) return;
  const now = performance.now();
  const since = now - lastInputSent;
  const sinceKeep = now - lastKeepAlive;
  if (!force && since < INPUT_INTERVAL_MS && sinceKeep < KEEPALIVE_INTERVAL) return;
  lastInputSent = now;
  if (sinceKeep >= KEEPALIVE_INTERVAL) lastKeepAlive = now;
  ws.send(JSON.stringify({ type:"input", up:keys.up, down:keys.down }));
}

/* ===== LOCAL PADDLE UPDATE ===== */
function updateLocalPaddle(deltaMs:number){
  if (!controlsEnabled || !state) return;
  const p = side==="left"?state.leftPaddle:state.rightPaddle;
  let vy=0;
  if (keys.up) vy -= LOCAL_PADDLE_SPEED;
  if (keys.down) vy += LOCAL_PADDLE_SPEED;
  if (vy!==0){
    const scale = deltaMs / (1000/60);
    p.y = clamp(p.y + vy*scale, 0, GAME_H - PADDLE_H);
  }
}

/* ===== RENDER LOOP ===== */
function startRenderLoop(){
  const loop = () => {
    if (!pageActive) return;
    frameId = requestAnimationFrame(loop);

    const now = performance.now();
    let delta = now - lastFrameTime;
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
    lastFrameTime = now;

    updateLocalPaddle(delta);
    draw();
  };
  lastFrameTime = performance.now();
  frameId = requestAnimationFrame(loop);
}

function draw(){
  if (!state) return;
  ctx.clearRect(0,0,GAME_W,GAME_H);

  const g = ctx.createLinearGradient(0,0,0,GAME_H);
  g.addColorStop(0,"#1a1a2e");
  g.addColorStop(1,"#16213e");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,GAME_W,GAME_H);

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.setLineDash([10,10]);
  ctx.beginPath();
  ctx.moveTo(GAME_W/2,0);
  ctx.lineTo(GAME_W/2,GAME_H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle="rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(GAME_W/2,GAME_H/2,60,0,Math.PI*2);
  ctx.stroke();

  ctx.fillStyle="#00ff88";
  ctx.fillRect(state.leftPaddle.x,state.leftPaddle.y,PADDLE_W,PADDLE_H);
  ctx.fillStyle="#ff4757";
  ctx.fillRect(state.rightPaddle.x,state.rightPaddle.y,PADDLE_W,PADDLE_H);

  ctx.fillStyle="#ffffff";
  ctx.beginPath();
  ctx.arc(state.ball.x+BALL_SIZE/2,state.ball.y+BALL_SIZE/2,BALL_SIZE/2,0,Math.PI*2);
  ctx.fill();
}

/* ===== UI HELPERS ===== */
function updateNames(){
  const ln=qs<HTMLElement>("#left-name");
  const rn=qs<HTMLElement>("#right-name");
  if(!ln||!rn)return;
  ln.textContent = side==="left" ? myName : opponentName;
  rn.textContent = side==="right"? myName : opponentName;
  ln.toggleAttribute("data-local", side==="left");
  rn.toggleAttribute("data-local", side==="right");
}
function updateScores(){
  if(!state)return;
  const ls=qs<HTMLElement>("#left-score");
  const rs=qs<HTMLElement>("#right-score");
  if(ls) ls.textContent=String(state.leftPaddle.score);
  if(rs) rs.textContent=String(state.rightPaddle.score);
}
function showMessage(msg:string){
  const el=qs<HTMLElement>("#game-message");
  if(el){ el.textContent=msg; el.style.display="block"; }
}

/* ===== CLEANUP ===== */
function cleanup(){
  pageActive=false;
  cancelAnimationFrame(frameId);
  ws?.close(); ws=null;
  document.removeEventListener("keydown", keyDown);
  document.removeEventListener("keyup", keyUp);
  window.removeEventListener("hashchange", hashWatcher);
  window.removeEventListener("resize", recalcCanvasRect);
  window.removeEventListener("orientationchange", recalcCanvasRect as any);
  activeDrags.clear();
}
function hashWatcher(){
  if (location.hash !== "#/remote-game") cleanup();
}
