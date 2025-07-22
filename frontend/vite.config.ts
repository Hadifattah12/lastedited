import { defineConfig } from 'vite';
import fs from 'node:fs';
import { resolve } from 'node:path';

const certDir = resolve(__dirname, '../backend/certificate');

export default defineConfig({
  server: {
    host: '0.0.0.0',       // Accept connections from outside
    port: 5173,
    https: {
      key: fs.readFileSync(resolve(certDir, 'key.pem')),
      cert: fs.readFileSync(resolve(certDir, 'cert.pem'))
    },
    strictPort: true,
    hmr: {
      protocol: 'wss',                         // secure WebSocket
      host: 'c1r4s7.42beirut.com',             // 👈 domain you're using to access
      port: 5173
    }
  }
});
