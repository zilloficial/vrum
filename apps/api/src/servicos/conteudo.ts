/** Perfis públicos, publicações e seguidores (seção 5). */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  avaliacoes, categorias, comentarios, curtidas, destaques, membrosPrestador, midias, prestadorCategorias,
  prestadores, publicacoes, salvamentos, seguidores, usuarios,
} from '../db/schema.js';
import { ErroApp, naoEncontrado, proibido, type Contexto } from '../nucleo.js';
import type { Tx } from '../db/cliente.js';

/** Usuário pode agir em nome do prestador (publicar, editar perfil)? */
export async function exigirGestao(tx: Tx, usuarioId: string, prestadorId: string) {
  const [m] = await tx.select().from(membrosPrestador).where(and(
    eq(membrosPrestador.prestadorId, prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true),
  ));
  if (!m || m.funcao === 'PROFISSIONAL') throw proibido('Somente o dono ou gestor pode fazer isso.');
  return m;
}

export async function perfilPublico(ctx: Contexto, idOuUsuario: string, visitanteId?: string) {
  const ehUuid = /^[0-9a-f-]{36}$/i.test(idOuUsuario);
  const [p] = await ctx.db.select().from(prestadores)
    .where(ehUuid ? eq(prestadores.id, idOuUsuario) : eq(prestadores.usuarioNome, idOuUsuario.replace(/^@/, '').toLowerCase()));
  if (!p) throw naoEncontrado('Profissional');
  const agora = ctx.agora();
  const cats = await ctx.db.select({ id: categorias.id, nome: categorias.nome, slug: categorias.slug, especialidades: prestadorCategorias.especialidades })
    .from(prestadorCategorias).innerJoin(categorias, eq(categorias.id, prestadorCategorias.categoriaId))
    .where(eq(prestadorCategorias.prestadorId, p.id));
  const [disp] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(membrosPrestador).where(and(
    eq(membrosPrestador.prestadorId, p.id), eq(membrosPrestador.disponivel, true),
    sql`${membrosPrestador.disponivelAte} > ${agora}`, isNull(membrosPrestador.chamadoAtualId),
  ));
  const [seg] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(seguidores).where(eq(seguidores.prestadorId, p.id));
  const sigo = visitanteId
    ? (await ctx.db.select().from(seguidores).where(and(eq(seguidores.prestadorId, p.id), eq(seguidores.usuarioId, visitanteId)))).length > 0
    : false;
  const ultimasAvaliacoes = await ctx.db.select({
    id: avaliacoes.id, nota: avaliacoes.nota, comentario: avaliacoes.comentario, resposta: avaliacoes.resposta,
    criadaEm: avaliacoes.criadaEm, autor: usuarios.nome,
  }).from(avaliacoes).innerJoin(usuarios, eq(usuarios.id, avaliacoes.autorId))
    .where(and(eq(avaliacoes.prestadorId, p.id), isNull(avaliacoes.ocultadaEm)))
    .orderBy(desc(avaliacoes.criadaEm)).limit(10);

  return {
    id: p.id, tipo: p.tipo, nomeComercial: p.nomeComercial, usuarioNome: p.usuarioNome, apresentacao: p.apresentacao,
    fotoUrl: p.fotoUrl, capaUrl: p.capaUrl, enderecoComercial: p.enderecoComercial, raioCoberturaKm: p.raioCoberturaKm,
    modalidade: p.modalidade, veiculosAtendidos: p.veiculosAtendidos, horarios: p.horarios, plantao: p.plantao,
    infoDeslocamento: p.infoDeslocamento,
    // Base comercial só para oficina fixa; atendimento móvel não expõe endereço exato.
    base: p.modalidade !== 'NO_LOCAL' && p.baseLat !== null ? { lat: p.baseLat, lng: p.baseLng } : null,
    verificado: p.verificadoEm !== null, notaMedia: p.notaMedia, totalAvaliacoes: p.totalAvaliacoes,
    categorias: cats, disponivelAgora: (disp?.n ?? 0) > 0, seguidores: seg?.n ?? 0, sigo, avaliacoes: ultimasAvaliacoes,
  };
}

export async function atualizarPerfil(ctx: Contexto, usuarioId: string, prestadorId: string, d: Partial<{
  nomeComercial: string; apresentacao: string; fotoUrl: string; capaUrl: string; enderecoComercial: string;
  baseLat: number; baseLng: number; raioCoberturaKm: number; modalidade: 'NO_LOCAL' | 'NA_OFICINA' | 'AMBOS';
  veiculosAtendidos: ('CARRO' | 'MOTO' | 'CAMINHONETE' | 'CAMINHAO' | 'ONIBUS' | 'MAQUINA_AGRICOLA')[];
  horarios: unknown; plantao: boolean; infoDeslocamento: string; categorias: string[];
}>) {
  return ctx.db.transaction(async (tx) => {
    await exigirGestao(tx, usuarioId, prestadorId);
    const { categorias: cats, ...campos } = d;
    if (Object.keys(campos).length) await tx.update(prestadores).set(campos).where(eq(prestadores.id, prestadorId));
    if (cats) {
      await tx.delete(prestadorCategorias).where(eq(prestadorCategorias.prestadorId, prestadorId));
      if (cats.length) await tx.insert(prestadorCategorias).values(cats.map((categoriaId) => ({ prestadorId, categoriaId })));
    }
    const [p] = await tx.select().from(prestadores).where(eq(prestadores.id, prestadorId));
    return p!;
  });
}

// ───────────────────────────── Publicações ─────────────────────────────

export async function publicar(ctx: Contexto, usuarioId: string, prestadorId: string, d: {
  descricao?: string; categoriaId?: string; midias: { tipo: 'IMAGEM' | 'VIDEO'; url: string; miniaturaUrl?: string }[];
}) {
  if (!d.midias.length) throw new ErroApp('MIDIA_OBRIGATORIA', 'Adicione ao menos uma foto ou vídeo.');
  return ctx.db.transaction(async (tx) => {
    await exigirGestao(tx, usuarioId, prestadorId);
    const [pub] = await tx.insert(publicacoes).values({ prestadorId, autorId: usuarioId, descricao: d.descricao, categoriaId: d.categoriaId }).returning();
    await tx.insert(midias).values(d.midias.map((m, ordem) => ({ ...m, publicacaoId: pub!.id, ordem })));
    return pub!;
  });
}

export async function removerPublicacao(ctx: Contexto, usuarioId: string, publicacaoId: string, comoAdmin = false) {
  const [pub] = await ctx.db.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
  if (!pub) throw naoEncontrado('Publicação');
  if (!comoAdmin) await exigirGestao(ctx.db, usuarioId, pub.prestadorId);
  await ctx.db.update(publicacoes).set({ removidaEm: ctx.agora() }).where(eq(publicacoes.id, publicacaoId));
}

/**
 * Feed: publicações de quem o usuário segue primeiro, depois as recentes da cidade.
 * Destaques pagos vêm marcados como publicidade (seção 18).
 */
export async function feed(ctx: Contexto, usuarioId: string | undefined, f: { prestadorId?: string; limite?: number; antesDe?: Date } = {}) {
  const limite = Math.min(f.limite ?? 20, 50);
  const agora = ctx.agora();
  const segue = usuarioId
    ? sql<boolean>`exists (select 1 from ${seguidores} s where s.prestador_id = ${publicacoes.prestadorId} and s.usuario_id = ${usuarioId})`
    : sql<boolean>`false`;
  const patrocinado = sql<boolean>`exists (select 1 from ${destaques} d where d.prestador_id = ${publicacoes.prestadorId} and d.inicio_em <= ${agora} and d.fim_em > ${agora})`;

  const linhas = await ctx.db.select({
    id: publicacoes.id, descricao: publicacoes.descricao, criadaEm: publicacoes.criadaEm, categoriaId: publicacoes.categoriaId,
    prestador: { id: prestadores.id, nomeComercial: prestadores.nomeComercial, usuarioNome: prestadores.usuarioNome, fotoUrl: prestadores.fotoUrl, verificado: sql<boolean>`${prestadores.verificadoEm} is not null` },
    curtidas: sql<number>`(select count(*)::int from ${curtidas} c where c.publicacao_id = ${publicacoes.id})`,
    comentarios: sql<number>`(select count(*)::int from ${comentarios} c where c.publicacao_id = ${publicacoes.id} and c.removido_em is null)`,
    curti: usuarioId ? sql<boolean>`exists (select 1 from ${curtidas} c where c.publicacao_id = ${publicacoes.id} and c.usuario_id = ${usuarioId})` : sql<boolean>`false`,
    salvei: usuarioId ? sql<boolean>`exists (select 1 from ${salvamentos} c where c.publicacao_id = ${publicacoes.id} and c.usuario_id = ${usuarioId})` : sql<boolean>`false`,
    segue, patrocinado,
  }).from(publicacoes).innerJoin(prestadores, eq(prestadores.id, publicacoes.prestadorId))
    .where(and(
      isNull(publicacoes.removidaEm),
      f.prestadorId ? eq(publicacoes.prestadorId, f.prestadorId) : undefined,
      f.antesDe ? sql`${publicacoes.criadaEm} < ${f.antesDe}` : undefined,
    ))
    .orderBy(...(usuarioId ? [desc(segue)] : []), desc(publicacoes.criadaEm))
    .limit(limite);

  const ids = linhas.map((l) => l.id);
  const ms = ids.length ? await ctx.db.select().from(midias).where(inArray(midias.publicacaoId, ids)).orderBy(midias.ordem) : [];
  return linhas.map((l) => ({ ...l, midias: ms.filter((m) => m.publicacaoId === l.id) }));
}

export async function alternarCurtida(ctx: Contexto, usuarioId: string, publicacaoId: string) {
  const apagadas = await ctx.db.delete(curtidas).where(and(eq(curtidas.usuarioId, usuarioId), eq(curtidas.publicacaoId, publicacaoId))).returning();
  if (apagadas.length) return { curti: false };
  await ctx.db.insert(curtidas).values({ usuarioId, publicacaoId }).onConflictDoNothing();
  return { curti: true };
}

export async function alternarSalvamento(ctx: Contexto, usuarioId: string, publicacaoId: string) {
  const apagadas = await ctx.db.delete(salvamentos).where(and(eq(salvamentos.usuarioId, usuarioId), eq(salvamentos.publicacaoId, publicacaoId))).returning();
  if (apagadas.length) return { salvei: false };
  await ctx.db.insert(salvamentos).values({ usuarioId, publicacaoId }).onConflictDoNothing();
  return { salvei: true };
}

export async function comentar(ctx: Contexto, usuarioId: string, publicacaoId: string, texto: string) {
  if (!texto.trim()) throw new ErroApp('TEXTO_VAZIO', 'Escreva um comentário.');
  const [c] = await ctx.db.insert(comentarios).values({ publicacaoId, autorId: usuarioId, texto: texto.trim() }).returning();
  return c!;
}

export function listarComentarios(ctx: Contexto, publicacaoId: string) {
  return ctx.db.select({ id: comentarios.id, texto: comentarios.texto, criadoEm: comentarios.criadoEm, autor: usuarios.nome, autorId: usuarios.id })
    .from(comentarios).innerJoin(usuarios, eq(usuarios.id, comentarios.autorId))
    .where(and(eq(comentarios.publicacaoId, publicacaoId), isNull(comentarios.removidoEm)))
    .orderBy(comentarios.criadoEm);
}

export async function alternarSeguir(ctx: Contexto, usuarioId: string, prestadorId: string) {
  const apagados = await ctx.db.delete(seguidores).where(and(eq(seguidores.usuarioId, usuarioId), eq(seguidores.prestadorId, prestadorId))).returning();
  if (apagados.length) return { sigo: false };
  await ctx.db.insert(seguidores).values({ usuarioId, prestadorId }).onConflictDoNothing();
  return { sigo: true };
}

export async function salvos(ctx: Contexto, usuarioId: string) {
  const ids = await ctx.db.select({ id: salvamentos.publicacaoId }).from(salvamentos).where(eq(salvamentos.usuarioId, usuarioId));
  if (!ids.length) return [];
  const todos = await feed(ctx, usuarioId, { limite: 50 });
  return todos.filter((p) => ids.some((i) => i.id === p.id));
}
