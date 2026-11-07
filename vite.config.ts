import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import appConfig from './apps/app/vite.config';

// Reutiliza o aplicativo existente sem mover suas telas ou projetos nativos.
export default mergeConfig(appConfig, {
  root: fileURLToPath(new URL('./apps/app/', import.meta.url)),
  envDir: fileURLToPath(new URL('./', import.meta.url)),
  server: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['.lovable.app', '.lovableproject.com'],
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
  },
});
