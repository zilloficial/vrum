import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envDir: mode === 'lovable' ? '../..' : '.',
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
}));
