import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  server: {
    // For "npm run dev:web": forward API calls to the locally running server
    proxy: { '/api': 'http://localhost:3000' },
    // The local server writes the apps and the start page into data/ – no reason to reload the UI
    watch: { ignored: ['**/data/**'] },
  },
});
