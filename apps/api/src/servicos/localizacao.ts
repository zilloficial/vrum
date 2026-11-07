/**
 * Localização em tempo real (seção 10).
 *
 * - Só existe com chamado confirmado e só entre motorista e profissional responsável.
 * - O ponto de atendimento fica no chamado; a posição atual do motorista é outra
 *   coisa e nunca altera o destino do prestador.
 * - Cada posição guarda o horário de captura; o app mostra se está desatualizada.
 * - Ao concluir/cancelar/abandonar, o compartilhamento é encerrado e as posições apagadas.
 * - Acesso administrativo exige justificativa e fica registrado.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  coordenadaValida, frescorPosicao, rastreamentoAtivo,
  type PosicaoEnviada, type PosicaoRecebida,
} from '@vrum/shared';
import {
  acessosAdminLocalizacao, chamados, compartilhamentosLocalizacao, membrosPrestador, posicoesAtuais, usuarios,
} from '../db/schema.js';
import type { Tx } from '../db/cliente.js';
import { ErroApp, Efeitos, naoEncontrado, proibido, type Contexto } from '../nucleo.js';

type Chamado = typeof chamados.$inferSelect;
type Papel = 'MOTORISTA' | 'PRESTADOR';

export async function abrirRastreamento(tx: Tx, fx: Efeitos, ch: Chamado, responsavelUsuarioId: string) {
  const participantes: [string, Papel][] = [[ch.motoristaId, 'MOTORISTA'], [responsavelUsuarioId, 'PRESTADOR']];
  for (const [usuarioId, papel] of participantes) {
    await tx.insert(compartilhamentosLocalizacao).values({ chamadoId: ch.id, usuarioId, papel }).onConflictDoNothing();
    fx.paraChamado(ch.id, 'localizacao:compartilhamento', { chamadoId: ch.id, usuarioId, ativo: true });
  }
}

export async function encerrarRastreamento(tx: Tx, fx: Efeitos, chamadoId: string, motivo: string) {
  const fechados = await tx.update(compartilhamentosLocalizacao)
    .set({ encerradoEm: new Date(), motivoEncerramento: motivo })
    .where(and(eq(compartilhamentosLocalizacao.chamadoId, chamadoId), isNull(compartilhamentosLocalizacao.encerradoEm)))
    .returning();
  // Retenção limitada: a última posição deixa de existir junto com o atendimento.
  await tx.delete(posicoesAtuais).where(eq(posicoesAtuais.chamadoId, chamadoId));
  for (const c of fechados) {
    fx.paraChamado(chamadoId, 'localizacao:compartilhamento', { chamadoId, usuarioId: c.usuarioId, ativo: false, motivo });
  }
}

/** Quem pode ver/enviar localização deste chamado: o motorista e o profissional responsável. */
export async function papelNoRastreamento(tx: Tx, ch: Chamado, usuarioId: string): Promise<Papel | null> {
  if (ch.motoristaId === usuarioId) return 'MOTORISTA';
  if (!ch.responsavelId) return null;
  const [m] = await tx.select({ usuarioId: membrosPrestador.usuarioId }).from(membrosPrestador)
    .where(eq(membrosPrestador.id, ch.responsavelId));
  return m?.usuarioId === usuarioId ? 'PRESTADOR' : null;
}

export async function registrarPosicao(ctx: Contexto, usuarioId: string, p: PosicaoEnviada): Promise<PosicaoRecebida> {
  if (!coordenadaValida(p)) throw new ErroApp('COORDENADA_INVALIDA', 'Coordenadas inválidas.');
  const capturadaEm = new Date(p.capturadaEm);
  const agora = ctx.agora();
  if (Number.isNaN(capturadaEm.getTime())) throw new ErroApp('DATA_INVALIDA', 'Horário de captura inválido.');
  if (capturadaEm.getTime() - agora.getTime() > 30_000) throw new ErroApp('DATA_FUTURA', 'Horário de captura no futuro.');
  if ((agora.getTime() - capturadaEm.getTime()) / 1000 > ctx.regras.posicaoMaxIdadeSeg) {
    throw new ErroApp('POSICAO_ANTIGA', 'Posição antiga demais para ser exibida como atual.');
  }

  return ctx.db.transaction(async (tx) => {
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, p.chamadoId));
    if (!ch) throw naoEncontrado('Chamado');
    if (!rastreamentoAtivo(ch.estado)) throw new ErroApp('RASTREAMENTO_INATIVO', 'O compartilhamento não está ativo neste chamado.', 409);
    const papel = await papelNoRastreamento(tx, ch, usuarioId);
    if (!papel) throw proibido('Você não participa deste atendimento.');

    const [comp] = await tx.select().from(compartilhamentosLocalizacao).where(and(
      eq(compartilhamentosLocalizacao.chamadoId, ch.id), eq(compartilhamentosLocalizacao.usuarioId, usuarioId),
      isNull(compartilhamentosLocalizacao.encerradoEm),
    ));
    if (!comp) throw new ErroApp('RASTREAMENTO_INATIVO', 'Compartilhamento encerrado.', 409);
    if (comp.pausadoEm) throw new ErroApp('RASTREAMENTO_PAUSADO', 'Você interrompeu o compartilhamento.', 409);

    const valores = {
      lat: p.lat, lng: p.lng, precisaoM: p.precisaoM ?? null, rumo: p.rumo ?? null,
      velocidadeMs: p.velocidadeMs ?? null, capturadaEm, recebidaEm: agora,
    };
    // Envios fora de ordem não sobrescrevem uma posição mais nova.
    const gravada = await tx.insert(posicoesAtuais).values({ chamadoId: ch.id, usuarioId, ...valores })
      .onConflictDoUpdate({
        target: [posicoesAtuais.chamadoId, posicoesAtuais.usuarioId],
        set: valores,
        setWhere: sql`${posicoesAtuais.capturadaEm} < ${capturadaEm}`,
      }).returning();
    if (!gravada.length) throw new ErroApp('POSICAO_FORA_DE_ORDEM', 'Já existe uma posição mais recente.', 409);

    if (papel === 'PRESTADOR') {
      await tx.update(membrosPrestador).set({ ultimaLat: p.lat, ultimaLng: p.lng, ultimaPosicaoEm: capturadaEm })
        .where(eq(membrosPrestador.id, ch.responsavelId!));
    }

    return {
      chamadoId: ch.id, usuarioId, papel, lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, rumo: p.rumo,
      velocidadeMs: p.velocidadeMs, capturadaEm: capturadaEm.toISOString(), recebidaEm: agora.toISOString(),
    };
  });
}

/** Interromper/retomar o compartilhamento, avisando a outra parte. */
export async function definirPausa(ctx: Contexto, fx: Efeitos, usuarioId: string, chamadoId: string, pausar: boolean) {
  await ctx.db.transaction(async (tx) => {
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId));
    if (!ch) throw naoEncontrado('Chamado');
    if (!(await papelNoRastreamento(tx, ch, usuarioId))) throw proibido();
    const r = await tx.update(compartilhamentosLocalizacao).set({ pausadoEm: pausar ? ctx.agora() : null }).where(and(
      eq(compartilhamentosLocalizacao.chamadoId, chamadoId), eq(compartilhamentosLocalizacao.usuarioId, usuarioId),
      isNull(compartilhamentosLocalizacao.encerradoEm),
    )).returning();
    if (!r.length) throw new ErroApp('RASTREAMENTO_INATIVO', 'Compartilhamento encerrado.', 409);
    if (pausar) await tx.delete(posicoesAtuais).where(and(eq(posicoesAtuais.chamadoId, chamadoId), eq(posicoesAtuais.usuarioId, usuarioId)));
    fx.paraChamado(chamadoId, 'localizacao:compartilhamento', {
      chamadoId, usuarioId, ativo: !pausar, motivo: pausar ? 'INTERROMPIDO_PELO_USUARIO' : undefined,
    });
  });
}

/** Posições visíveis para um participante, sempre com o frescor calculado. */
export async function posicoesDoChamado(ctx: Contexto, usuarioId: string, chamadoId: string) {
  const [ch] = await ctx.db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!ch) throw naoEncontrado('Chamado');
  if (!(await papelNoRastreamento(ctx.db, ch, usuarioId))) throw proibido();
  return montarVisao(ctx, ch);
}

async function montarVisao(ctx: Contexto, ch: Chamado) {
  const ativo = rastreamentoAtivo(ch.estado);
  const pos = ativo ? await ctx.db.select().from(posicoesAtuais).where(eq(posicoesAtuais.chamadoId, ch.id)) : [];
  const comps = await ctx.db.select().from(compartilhamentosLocalizacao).where(and(
    eq(compartilhamentosLocalizacao.chamadoId, ch.id), isNull(compartilhamentosLocalizacao.encerradoEm),
  ));
  return {
    ativo,
    pontoAtendimento: { lat: ch.pontoLat, lng: ch.pontoLng, referencia: ch.pontoReferencia },
    chegadaPrevistaEm: ch.chegadaPrevistaEm,
    participantes: comps.map((c) => {
      const p = pos.find((x) => x.usuarioId === c.usuarioId);
      return {
        usuarioId: c.usuarioId, papel: c.papel, pausado: c.pausadoEm !== null,
        posicao: p ? { lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, rumo: p.rumo, capturadaEm: p.capturadaEm } : null,
        frescor: p ? frescorPosicao(p.capturadaEm, ctx.agora()) : 'PERDIDA',
      };
    }),
  };
}

/** Acesso de suporte: restrito a administradores, com justificativa registrada. */
export async function acessoAdministrativo(ctx: Contexto, adminId: string, chamadoId: string, justificativa: string) {
  const [admin] = await ctx.db.select().from(usuarios).where(eq(usuarios.id, adminId));
  if (!admin?.ehAdmin) throw proibido();
  if (justificativa.trim().length < 10) throw new ErroApp('JUSTIFICATIVA_OBRIGATORIA', 'Descreva o motivo do acesso (suporte).');
  const [ch] = await ctx.db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!ch) throw naoEncontrado('Chamado');
  await ctx.db.insert(acessosAdminLocalizacao).values({ adminId, chamadoId, justificativa });
  return montarVisao(ctx, ch);
}
