/**
 * Inicialização em produção (modo real): aplica migrações, garante os dados básicos
 * (cidade, categorias, prazos), remove os dados de demonstração, promove os
 * administradores de ADMIN_EMAILS e sobe a API. Tudo é idempotente — roda a cada deploy.
 */
import { migrar } from './db/migrar.js';
import { semear } from './db/seed.js';
import { criarDb } from './db/cliente.js';
import { emailsAdmin, promoverAdmins, removerDemo } from './db/producao.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

await migrar(url);
await semear(url);

const { db, pool } = criarDb(url);
try {
  const limpeza = await removerDemo(db);
  if (limpeza.usuarios) {
    console.log(`Demonstração removida: ${limpeza.usuarios} contas, ${limpeza.prestadores} profissionais, ${limpeza.chamados} chamados, ${limpeza.publicacoes} publicações.`);
  }
  const admins = emailsAdmin();
  const promovidos = await promoverAdmins(db, admins);
  console.log(`Administradores configurados: ${admins.length ? admins.join(', ') : 'nenhum (defina ADMIN_EMAILS)'}${promovidos ? ` · ${promovidos} promovido(s) agora` : ''}`);
} finally {
  await pool.end();
}

await import('./server.js');
