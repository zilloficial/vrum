import { defineConfig } from 'vitest/config';

// Os testes de integração recriam o mesmo banco: rodam um arquivo por vez.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20_000 } });
