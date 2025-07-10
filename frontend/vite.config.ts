import { defineConfig } from 'vite';
import fs   from 'node:fs';
import { resolve } from 'node:path';

const certDir = resolve(__dirname, '../backend/certificate');
export default defineConfig({
  server: {
    host : 'localhost',
    port : 5173,
    https: {
      key : fs.readFileSync(resolve(certDir, 'key.pem')),
      cert: fs.readFileSync(resolve(certDir, 'cert.pem'))
    },
    strictPort: true
  }
});
