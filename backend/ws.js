/* backend/ws.js */
const { WebSocketServer } = require('ws');
const { v4: uuidv4 }      = require('uuid');
const db                  = require('./db/database');

module.exports.createWebSocketServer = function createWebSocketServer(nodeHttpsServer) {
  const wss   = new WebSocketServer({ server: nodeHttpsServer });
  const rooms = new Map();           // code → room

  /* ── helpers / constants ─────────────────────────────────────────── */
  const CANVAS_WIDTH  = 800, CANVAS_HEIGHT = 400;
  const PADDLE_WIDTH  = 15,  PADDLE_HEIGHT = 80;
  const BALL_SIZE     = 15,  PADDLE_SPEED  = 8;
  const INITIAL_BALL_SPEED = 5, MAX_SCORE = 5;

  const initState = () => ({
    leftPaddle : {
      x: 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0, up: false, down: false
    },
    rightPaddle: {
      x: CANVAS_WIDTH - 30 - PADDLE_WIDTH,
      y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      score: 0, up: false, down: false
    },
    ball: {
      x: CANVAS_WIDTH / 2 - BALL_SIZE / 2,
      y: CANVAS_HEIGHT / 2 - BALL_SIZE / 2,
      dx: Math.random() > 0.5 ? INITIAL_BALL_SPEED : -INITIAL_BALL_SPEED,
      dy: (Math.random() * 2 - 1) * INITIAL_BALL_SPEED * 0.5,
      speed: INITIAL_BALL_SPEED
    },
    running: false,
    winner : null
  });

  /* ── connection handler ─────────────────────────────────────────── */
  wss.on('connection', (ws, req) => {
    const url  = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const name = url.searchParams.get('name') || `Player-${uuidv4().slice(0,4)}`;

    if (!code) return ws.close(1008, 'Missing room code');

    /* create / join room -------------------------------------------- */
    let room = rooms.get(code);
    if (!room) {
      room = { state: initState(), players: [], interval: null };
      rooms.set(code, room);
    }
    if (room.players.length >= 2) return ws.close(1008, 'Room full');

    const side = room.players.length === 0 ? 'left' : 'right';
    room.players.push({ ws, name, side });

    /* send init packet ---------------------------------------------- */
    ws.send(JSON.stringify({
      type : 'init',
      side,
      nameYou      : name,
      nameOpponent : room.players.length === 2 ? room.players[0].name : null,
      state        : room.state
    }));

    /* when both connected, start ------------------------------------ */
    if (room.players.length === 2 && !room.interval) {
           /* NEW: send “ready”, **but keep `running=false` for 3 s** */
     room.players.forEach(p => {
       const other = room.players.find(o => o !== p);
       p.ws.send(JSON.stringify({
         type: 'ready',
         nameOpponent: other?.name || null,
         countdown: 3                        // optional – client may ignore
       }));
     });

     room.state.running = false;                  // ball stays still
     room.interval = setInterval(() => gameLoop(room), 1000 / 60);

     /* after 3 s → start match */
     setTimeout(() => { room.state.running = true; }, 3000);
    }

    /* handle messages ------------------------------------------------ */
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'input') {
        const paddle = side === 'left' ? room.state.leftPaddle
                                       : room.state.rightPaddle;
        paddle.up   = !!m.up;
        paddle.down = !!m.down;
      }
    });

    ws.on('close', () => {
      clearInterval(room.interval);
      rooms.delete(code);
    });
  });

  /* ── game loop & physics ────────────────────────────────────────── */
  function movePaddles(state) {
    const d = PADDLE_SPEED;
    if (state.leftPaddle.up)   state.leftPaddle.y  = Math.max(0, state.leftPaddle.y  - d);
    if (state.leftPaddle.down) state.leftPaddle.y  = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, state.leftPaddle.y + d);
    if (state.rightPaddle.up)  state.rightPaddle.y = Math.max(0, state.rightPaddle.y - d);
    if (state.rightPaddle.down)state.rightPaddle.y = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, state.rightPaddle.y + d);
  }

  function moveBall(state) {
    state.ball.x += state.ball.dx;
    state.ball.y += state.ball.dy;

    /* walls */
    if (state.ball.y <= 0 || state.ball.y + BALL_SIZE >= CANVAS_HEIGHT)
      state.ball.dy = -state.ball.dy;

    /* left paddle */
    if (state.ball.dx < 0 &&
        state.ball.x <= state.leftPaddle.x + PADDLE_WIDTH &&
        state.ball.x + BALL_SIZE >= state.leftPaddle.x &&
        state.ball.y + BALL_SIZE >= state.leftPaddle.y &&
        state.ball.y <= state.leftPaddle.y + PADDLE_HEIGHT) {
      state.ball.dx = Math.abs(state.ball.dx);
    }

    /* right paddle */
    if (state.ball.dx > 0 &&
        state.ball.x + BALL_SIZE >= state.rightPaddle.x &&
        state.ball.x <= state.rightPaddle.x + PADDLE_WIDTH &&
        state.ball.y + BALL_SIZE >= state.rightPaddle.y &&
        state.ball.y <= state.rightPaddle.y + PADDLE_HEIGHT) {
      state.ball.dx = -Math.abs(state.ball.dx);
    }
  }

  function checkScore(room) {
    const s = room.state;
    if (s.ball.x + BALL_SIZE < 0) {          // right scores
      s.rightPaddle.score++;
      resetBall(s, +1);
    } else if (s.ball.x > CANVAS_WIDTH) {    // left scores
      s.leftPaddle.score++;
      resetBall(s, -1);
    }

    if (s.leftPaddle.score >= MAX_SCORE || s.rightPaddle.score >= MAX_SCORE) {
      s.running = false;
      s.winner  = s.leftPaddle.score > s.rightPaddle.score ? 'left' : 'right';
      endMatch(room);
    }
  }

  function resetBall(s, dir) {
    s.ball.x  = CANVAS_WIDTH / 2 - BALL_SIZE / 2;
    s.ball.y  = CANVAS_HEIGHT / 2 - BALL_SIZE / 2;
    s.ball.dx = dir * INITIAL_BALL_SPEED;
    s.ball.dy = (Math.random()*2 - 1) * INITIAL_BALL_SPEED * 0.5;
  }

  function gameLoop(room) {
    if (!room.state.running) return;
    movePaddles(room.state);
    moveBall(room.state);
    checkScore(room);

    const pkt = JSON.stringify({ type:'state', state: room.state });
    room.players.forEach(p => { if (p.ws.readyState === 1) p.ws.send(pkt); });
  }

  /* ── finish & persist ──────────────────────────────────────────── */
  function endMatch(room) {
    clearInterval(room.interval);
    const p1 = room.players.find(p => p.side === 'left').name;
    const p2 = room.players.find(p => p.side === 'right').name;
    const winnerName = room.state.winner === 'left' ? p1 : p2;
    const { leftPaddle, rightPaddle } = room.state;

    /* DB insert */
    db.run(
      `INSERT INTO match_history
         (player1, player2, winner, score1, score2, date)
       VALUES (?,?,?,?,?, datetime('now'))`,
      [p1, p2, winnerName, leftPaddle.score, rightPaddle.score],
      err => { if (err) console.error('DB insert error:', err); }
    );

    /* notify clients */
    const pkt = JSON.stringify({
      type:'gameOver',
      winner: winnerName,
      score1: leftPaddle.score,
      score2: rightPaddle.score
    });
    room.players.forEach(p => { if (p.ws.readyState === 1) p.ws.send(pkt); });

    /* remove room after 10 s */
    setTimeout(() => rooms.delete(room), 10_000);
  }
};
