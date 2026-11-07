/** Área do prestador e mapa público (seções 12 e 13). */
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { aproximar, distanciaKm } from '@vrum/shared';
import { membrosPrestador, prestadorCategorias, prestadores } from '../db/schema.js';
import { ErroApp, naoEncontrado, somarSeg, type Contexto } from '../nucleo.js';

export async function criarPrestador(
  ctx: Contexto, donoId: string,
  d: { tipo: 'AUTONOMO' | 'EMPRESA'; nomeComercial: string; usuarioNome: string; cidadeId: string;
       baseLat?: number; baseLng?: number; raioCoberturaKm?: number; categorias: string[];
       modalidade?: 'NO_LOCAL' | 'NA_OFICINA' | 'AMBOS' },
) {
  return ctx.db.transaction(async (tx) => {
    const { categorias, ...dados } = d;
    const [p] = await tx.insert(prestadores).values({ ...dados, usuarioNome: d.usuarioNome.toLowerCase().replace(/^@/, '') }).returning();
    await tx.insert(membrosPrestador).values({ prestadorId: p!.id, usuarioId: donoId, funcao: 'DONO', atende: d.tipo === 'AUTONOMO' });
    if (categorias.length) await tx.insert(prestadorCategorias).values(categorias.map((categoriaId) => ({ prestadorId: p!.id, categoriaId })));
    return p!;
  });
}

/**
 * Liga/desliga a disponibilidade. Ligar sempre tem validade: sem renovação,
 * o profissional deixa de aparecer como disponível (seção 12).
 */
export async function definirDisponibilidade(ctx: Contexto, usuarioId: string, prestadorId: string, disponivel: boolean, horas?: number) {
  const validade = Math.min(horas ?? ctx.regras.validadeDisponibilidadeHoras, 24);
  const [m] = await ctx.db.update(membrosPrestador)
    .set({ disponivel, disponivelAte: disponivel ? somarSeg(ctx.agora(), validade * 3600) : null })
    .where(and(eq(membrosPrestador.prestadorId, prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true)))
    .returning();
  if (!m) throw naoEncontrado('Vínculo com o prestador');
  if (disponivel && !m.atende) throw new ErroApp('NAO_ATENDE', 'Seu perfil nesta empresa não realiza atendimentos.');
  return { disponivel: m.disponivel, disponivelAte: m.disponivelAte };
}

/**
 * Resultados do mapa público. Mostra a base comercial ou uma posição
 * aproximada — nunca a posição exata de um profissional móvel.
 */
export async function prestadoresProximos(
  ctx: Contexto, centro: { lat: number; lng: number }, f: { categoriaId?: string; raioKm?: number; apenasDisponiveis?: boolean; movel?: boolean } = {},
) {
  const raio = Math.min(f.raioKm ?? 15, 50);
  const dLat = raio / 111;
  const dLng = raio / (111 * Math.cos((centro.lat * Math.PI) / 180));
  const agora = ctx.agora();

  const disponiveis = ctx.db.select({ id: membrosPrestador.prestadorId }).from(membrosPrestador).where(and(
    eq(membrosPrestador.disponivel, true), gt(membrosPrestador.disponivelAte, agora),
    eq(membrosPrestador.atende, true), isNull(membrosPrestador.chamadoAtualId),
  ));
  const daCategoria = f.categoriaId
    ? ctx.db.select({ id: prestadorCategorias.prestadorId }).from(prestadorCategorias).where(eq(prestadorCategorias.categoriaId, f.categoriaId))
    : undefined;

  const linhas = await ctx.db.select({
    id: prestadores.id, nomeComercial: prestadores.nomeComercial, usuarioNome: prestadores.usuarioNome,
    fotoUrl: prestadores.fotoUrl, modalidade: prestadores.modalidade, baseLat: prestadores.baseLat, baseLng: prestadores.baseLng,
    notaMedia: prestadores.notaMedia, totalAvaliacoes: prestadores.totalAvaliacoes, verificado: sql<boolean>`${prestadores.verificadoEm} is not null`,
    disponivel: sql<boolean>`${prestadores.id} in (${disponiveis})`,
  }).from(prestadores).where(and(
    sql`${prestadores.baseLat} between ${centro.lat - dLat} and ${centro.lat + dLat}`,
    sql`${prestadores.baseLng} between ${centro.lng - dLng} and ${centro.lng + dLng}`,
    daCategoria ? inArray(prestadores.id, daCategoria) : undefined,
    f.apenasDisponiveis ? inArray(prestadores.id, disponiveis) : undefined,
    f.movel ? inArray(prestadores.modalidade, ['NO_LOCAL', 'AMBOS']) : undefined,
  ));

  return linhas
    .map(({ baseLat, baseLng, ...p }) => {
      const base = { lat: baseLat!, lng: baseLng! };
      return {
        ...p,
        origem: 'PARCEIRO_VRUM' as const,
        // Oficina fixa mostra a base; atendimento móvel, posição aproximada.
        posicao: p.modalidade === 'NA_OFICINA' ? base : aproximar(base),
        distanciaKm: Math.round(distanciaKm(centro, base) * 10) / 10,
      };
    })
    .filter((p) => p.distanciaKm <= raio)
    .sort((a, b) => Number(b.disponivel) - Number(a.disponivel) || a.distanciaKm - b.distanciaKm);
}
