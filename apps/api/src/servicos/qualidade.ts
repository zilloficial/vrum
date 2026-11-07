/** Avaliações, denúncias, bloqueios e contestações (seções 5, 9, 11 e 16). */
import { and, avg, count, eq, isNull } from 'drizzle-orm';
import { avaliacoes, bloqueios, chamados, contestacoes, denuncias, membrosPrestador, prestadores } from '../db/schema.js';
import { ErroApp, naoEncontrado, proibido, type Contexto } from '../nucleo.js';
import type { Tx } from '../db/cliente.js';
import { violouUnico } from './chamados.js';

async function recalcularNota(tx: Tx, prestadorId: string) {
  const [r] = await tx.select({ media: avg(avaliacoes.nota), total: count() }).from(avaliacoes)
    .where(and(eq(avaliacoes.prestadorId, prestadorId), isNull(avaliacoes.ocultadaEm)));
  await tx.update(prestadores).set({
    notaMedia: r?.media ? Math.round(Number(r.media) * 10) / 10 : null, totalAvaliacoes: r?.total ?? 0,
  }).where(eq(prestadores.id, prestadorId));
}

/**
 * Só serviços concluídos geram avaliação. O motorista avalia o prestador;
 * o profissional pode avaliar o motorista (fica interna, sem prestadorId).
 */
export async function avaliar(ctx: Contexto, usuarioId: string, chamadoId: string, nota: number, comentario?: string) {
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new ErroApp('NOTA_INVALIDA', 'A nota vai de 1 a 5.');
  try {
    return await ctx.db.transaction(async (tx) => {
      const [ch] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId));
      if (!ch) throw naoEncontrado('Chamado');
      if (ch.estado !== 'CONCLUIDO') throw new ErroApp('NAO_CONCLUIDO', 'Só é possível avaliar atendimentos concluídos.');
      let prestadorId: string | null = null;
      if (ch.motoristaId === usuarioId) prestadorId = ch.prestadorId;
      else {
        const [m] = await tx.select().from(membrosPrestador).where(eq(membrosPrestador.id, ch.responsavelId!));
        if (m?.usuarioId !== usuarioId) throw proibido();
      }
      const [a] = await tx.insert(avaliacoes).values({ chamadoId, autorId: usuarioId, prestadorId, nota, comentario }).returning();
      if (prestadorId) await recalcularNota(tx, prestadorId);
      return a!;
    });
  } catch (e) {
    if (violouUnico(e)) throw new ErroApp('JA_AVALIADO', 'Você já avaliou este atendimento.', 409);
    throw e;
  }
}

export async function responderAvaliacao(ctx: Contexto, usuarioId: string, avaliacaoId: string, resposta: string) {
  const [a] = await ctx.db.select().from(avaliacoes).where(eq(avaliacoes.id, avaliacaoId));
  if (!a?.prestadorId) throw naoEncontrado('Avaliação');
  const [m] = await ctx.db.select().from(membrosPrestador).where(and(
    eq(membrosPrestador.prestadorId, a.prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true),
  ));
  if (!m || m.funcao === 'PROFISSIONAL') throw proibido();
  await ctx.db.update(avaliacoes).set({ resposta }).where(eq(avaliacoes.id, avaliacaoId));
}

export async function ocultarAvaliacao(ctx: Contexto, avaliacaoId: string, ocultar: boolean) {
  const [a] = await ctx.db.update(avaliacoes).set({ ocultadaEm: ocultar ? ctx.agora() : null }).where(eq(avaliacoes.id, avaliacaoId)).returning();
  if (!a) throw naoEncontrado('Avaliação');
  if (a.prestadorId) await recalcularNota(ctx.db, a.prestadorId);
}

export type AlvoDenuncia = 'USUARIO' | 'PRESTADOR' | 'PUBLICACAO' | 'COMENTARIO' | 'MENSAGEM' | 'AVALIACAO';

export async function denunciar(ctx: Contexto, usuarioId: string, d: { alvo: AlvoDenuncia; alvoId: string; motivo: string; detalhes?: string }) {
  const [r] = await ctx.db.insert(denuncias).values({ ...d, autorId: usuarioId }).returning();
  return r!;
}

export async function bloquear(ctx: Contexto, usuarioId: string, bloqueadoId: string, bloquear: boolean) {
  if (usuarioId === bloqueadoId) throw new ErroApp('INVALIDO', 'Você não pode bloquear a si mesmo.');
  if (bloquear) await ctx.db.insert(bloqueios).values({ bloqueadorId: usuarioId, bloqueadoId }).onConflictDoNothing();
  else await ctx.db.delete(bloqueios).where(and(eq(bloqueios.bloqueadorId, usuarioId), eq(bloqueios.bloqueadoId, bloqueadoId)));
  return { bloqueado: bloquear };
}

/** Contestação depois do encerramento (ex.: concluído por prazo sem o serviço estar pronto). */
export async function contestarEncerrado(ctx: Contexto, usuarioId: string, chamadoId: string, motivo: string) {
  const [ch] = await ctx.db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!ch) throw naoEncontrado('Chamado');
  if (ch.motoristaId !== usuarioId) throw proibido();
  if (ch.estado !== 'CONCLUIDO') throw new ErroApp('NAO_CONCLUIDO', 'Use “contestar conclusão” enquanto o atendimento está aberto.');
  const limite = 7 * 24 * 3600 * 1000;
  if (ctx.agora().getTime() - (ch.concluidoEm?.getTime() ?? 0) > limite) throw new ErroApp('PRAZO_ENCERRADO', 'O prazo de contestação (7 dias) terminou.');
  const [c] = await ctx.db.insert(contestacoes).values({ chamadoId, autorId: usuarioId, motivo }).returning();
  return c!;
}
