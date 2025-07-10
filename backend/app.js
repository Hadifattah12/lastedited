// app.js – auto-detects LAN IP for CORS and WebSocket
require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();

const path = require('path');
const fs   = require('fs');
const os   = require('os');

/* --------------------------- Helper: get LAN IP --------------------------- */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address; // e.g. 10.11.4.7
      }
    }
  }
  return 'localhost';
}

const myIP = getLocalIP();

/* --------------------------- HTTPS certs --------------------------- */
const keyPath  = path.resolve(__dirname, 'certificate', 'key.pem');
const certPath = path.resolve(__dirname, 'certificate', 'cert.pem');

let useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);
if (!useHttps) {
  console.warn('❗ No HTTPS certs found – server will use HTTP');
}

/* ------------------------- Fastify instance ------------------------ */
const fastify = require('fastify')({
  logger: true,
  ...(useHttps ? {
    https: {
      key : fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }
  } : {})
});

/* ---------------------------- plugins ------------------------------ */
const fastifyCors   = require('@fastify/cors');
const fastifyCookie = require('@fastify/cookie');          // NEW 👈
const fastifyJwt    = require('@fastify/jwt');
const fastifyStatic = require('@fastify/static');
const multipart     = require('@fastify/multipart');

// CORS – allow frontend from localhost AND your LAN IP
fastify.register(fastifyCors, {
  origin: [
    `https://${myIP}:5173`,
    `http://${myIP}:5173`,
    'https://localhost:5173',
    'http://localhost:5173',
    'https://127.0.0.1:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

/* ---- register cookie plugin *before* JWT so jwt can read cookies ---- */
fastify.register(fastifyCookie, {
  // If you ever want signed cookies, add a secret here.
  // parseOptions lets you tweak default cookie.parse behaviour.
});

/* ---------------- JWT now uses a cookie called access_token --------- */
fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'forsecret',
  cookie: {
    cookieName: 'access_token',
    signed     : false          // we didn’t sign above
  }
});

fastify.register(multipart, {
  limits: { fileSize: 2 * 1024 * 1024 }
});

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'uploads'),
  prefix: '/uploads/'
});

/* ----------------------------- routes ------------------------------ */
fastify.register(require('./routes/avatar'));
fastify.register(require('./routes/auth'),    { prefix: '/api' });
fastify.register(require('./routes/match'));
fastify.register(require('./routes/friends'), { prefix: '/api' });

fastify.get('/', (_req, reply) => {
  reply.type('text/html').send(`<script>location.href = '#/home'</script>`);
});

/* ----------------------- online users set -------------------------- */
fastify.decorate('onlineUsers', new Set());

/* -------------------------- WebSockets ----------------------------- */
const { createWebSocketServer } = require('./ws');

/* --------------------------- start-up ------------------------------ */
(async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });

    const protocol = useHttps ? 'https' : 'http';
    console.log(`🚀 Server ready at ${protocol}://${myIP}:${port}`);
    console.log(`🔐 CORS allows: ${protocol}://${myIP}:5173`);
    console.log(`🛰️  WebSocket:  ${protocol === 'https' ? 'wss' : 'ws'}://${myIP}:${port}/`);

    createWebSocketServer(fastify.server);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();
