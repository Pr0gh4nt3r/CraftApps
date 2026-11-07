import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    rollupOptions: {
      // The admin UI and, as a second entry, the styles of the start page
      input: { index: 'index.html', overview: 'src/overview/overview.scss' },
      output: {
        // The start page's CSS without a hash next to its browser icons (public/overview): the
        // admin copies it from there next to the start page's index.html
        assetFileNames: (asset) =>
          asset.names.includes('overview.css') ? 'overview/overview.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    // For "npm run dev:web": forward API calls to the locally running server
    proxy: { '/api': 'http://localhost:3000' },
    // The local server writes the apps and the start page into data/ – no reason to reload the UI
    watch: { ignored: ['**/data/**'] },
  },
});
