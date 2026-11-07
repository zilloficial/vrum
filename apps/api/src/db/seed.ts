/** Dados iniciais: cidade de lançamento, categorias e prazos padrão. */
import { categoriasIniciais } from '@vrum/shared';
import { criarDb } from './cliente.js';
import { categorias, cidades, configuracoes } from './schema.js';
import { REGRAS_PADRAO } from '../nucleo.js';

export async function semear(url: string) {
  const { db, pool } = criarDb(url);
  try {
    await db.insert(cidades).values({ nome: 'Sorriso', uf: 'MT', slug: 'sorriso-mt', ativa: true, lat: -12.5425, lng: -55.7211 })
      .onConflictDoNothing();
    await db.insert(categorias).values(categoriasIniciais.map((c, ordem) => ({
      slug: c.slug, nome: c.nome, fluxo: c.fluxo, exemplos: c.exemplos, exigeDadosGuincho: c.exigeDadosGuincho ?? false, ordem,
    }))).onConflictDoNothing();
    await db.insert(configuracoes).values(Object.entries(REGRAS_PADRAO).map(([chave, valor]) => ({ chave, valor })))
      .onConflictDoNothing();
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  await semear(url);
  console.log('Seed aplicado: Sorriso–MT, categorias e prazos padrão.');
}
