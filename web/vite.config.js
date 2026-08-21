import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buKlasor = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // VITE_ degerleri projenin kokundeki TEK .env dosyasindan okunur.
  envDir: path.join(buKlasor, '..'),
  server: {
    port: 5173,
    // Gelistirme sirasinda /api istekleri Node sunucusuna gider.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
