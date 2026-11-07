import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { criarDb } from './cliente.js';

export const PASTA_MIGRACOES = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function migrar(url: string) {
  const { db, pool } = criarDb(url);
  try {
    await migrate(db, { migrationsFolder: PASTA_MIGRACOES });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  await migrar(url);
  console.log('Migrações aplicadas.');
}
