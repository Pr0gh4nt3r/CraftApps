import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  // Für "npm run dev:web": API-Aufrufe an den lokal laufenden Server weiterreichen
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
