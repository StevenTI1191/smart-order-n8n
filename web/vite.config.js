import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` hanya untuk tampilan. API (/api/*) berjalan lewat `npm run preview` (wrangler dev).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
