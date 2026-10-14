import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the site runs on 5173 and talks to the server on 5174. Every other path is a page of
// the app: Vite answers it with index.html.
const server = 'http://127.0.0.1:5174';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/uploads': server,
      '/media': server,
      // made by the server from its data
      '/robots.txt': server,
      '/sitemap.xml': server,
      '/ws': { target: server, ws: true },
    },
  },
});
