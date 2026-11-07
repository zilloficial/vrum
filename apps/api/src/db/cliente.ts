import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
/** Banco ou transação — os serviços aceitam os dois. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

/**
 * Opções de conexão a partir da URL e do ambiente.
 *
 * - Bancos gerenciados (Supabase, Render, Neon…) exigem SSL. Se a URL pedir SSL
 *   (sslmode=…) ou for do Supabase, a conexão é criptografada.
 * - Com DATABASE_CA (o certificado em PEM, ex.: o "SSL certificate" do Supabase),
 *   o certificado do servidor também é verificado. Sem ele, a conexão continua
 *   criptografada, mas sem verificar quem é o servidor.
 * - DATABASE_POOL limita as conexões simultâneas (o pooler gratuito do Supabase aceita poucas).
 */
export function opcoesConexao(url: string, env: Record<string, string | undefined> = process.env): pg.PoolConfig {
  const u = new URL(url);
  const modo = u.searchParams.get('sslmode');
  const gerenciado = /supabase\.(co|com)$/.test(u.hostname) || /render\.com$/.test(u.hostname);
  const querSsl = (modo !== null && modo !== 'disable') || gerenciado || !!env.DATABASE_CA;
  // O sslmode da URL é tratado aqui; removê-lo evita que o driver o reinterprete.
  u.searchParams.delete('sslmode');
  const padraoPool = /pooler\.supabase\.com$/.test(u.hostname) ? 5 : 10;
  return {
    connectionString: u.toString(),
    max: Number(env.DATABASE_POOL ?? padraoPool),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: !querSsl ? undefined
      : env.DATABASE_CA ? { ca: env.DATABASE_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  };
}

export function criarDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool(opcoesConexao(url));
  // Conexões ociosas derrubadas pelo provedor não podem derrubar a API.
  pool.on('error', (e) => console.warn('Conexão com o banco encerrada:', e.message));
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}
