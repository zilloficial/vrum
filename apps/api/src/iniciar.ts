/**
 * Inicialização em produção: aplica migrações, garante os dados básicos
 * (cidade, categorias, prazos), carrega a demonstração se DEMO=1 e sobe a API.
 * Tudo é idempotente — pode rodar a cada deploy.
 */
import { migrar } from './db/migrar.js';
import { semear } from './db/seed.js';
import { demo } from './db/demo.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

await migrar(url);
await semear(url);
if (process.env.DEMO === '1') {
  const publica = process.env.URL_PUBLICA ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${process.env.PORT ?? 3333}`;
  await demo(url, process.env.PASTA_ARQUIVOS ?? './arquivos', publica);
}
await import('./server.js');
