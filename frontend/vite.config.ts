import { defineConfig } from 'vite';
import fs from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config'; // Load .env variables

const certDir = resolve(__dirname, '../backend/certificate');
const HOST = process.env.VITE_HOST || 'localhost'; // fallback just in case

export default defineConfig({
  server: {
    host: '0.0.0.0', // still needed for external access
    port: 5173,
    https: {
      key: fs.readFileSync(resolve(certDir, 'key.pem')),
      cert: fs.readFileSync(resolve(certDir, 'cert.pem'))
    },
    strictPort: true,
    hmr: {
      protocol: 'wss',
      host: HOST,
      port: 5173
    }
  }
});
