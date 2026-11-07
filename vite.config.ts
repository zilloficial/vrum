import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import appConfig from './apps/app/vite.config';

// Resolve a configuração do aplicativo antes de combinar as opções da raiz.
export default defineConfig(async (env) => {
  const config = await (typeof appConfig === 'function' ? appConfig(env) : appConfig);

  return mergeConfig(config, {
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
});
