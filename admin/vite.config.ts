import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  // For "npm run dev:web": forward API calls to the locally running server
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
