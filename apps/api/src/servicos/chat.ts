/**
 * Chat do atendimento (seção 11): uma conversa por chamado, mensagens
 * automáticas de mudança de estado e registro das condições negociadas.
 * O VRUM não define preço — apenas registra o que as partes combinaram.
 */
import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { ehFinal } from '@vrum/shared';
import {
  bloqueios, chamados, condicoesAcordadas, conversas, mensagens, participantesConversa,
} from '../db/schema.js';
import type { Tx } from '../db/cliente.js';
import { ErroApp, Efeitos, naoEncontrado, proibido, type Contexto } from '../nucleo.js';
import { notificar } from './notificacoes.js';

type Mensagem = typeof mensagens.$inferSelect;

function paraTempoReal(m: Mensagem) {
  return { id: m.id, conversaId: m.conversaId, autorId: m.autorId, tipo: m.tipo, conteudo: m.conteudo, criadaEm: m.criadaEm.toISOString() };
}

export async function conversaDoChamado(tx: Tx, chamadoId: string) {
  const [c] = await tx.select().from(conversas).where(eq(conversas.chamadoId, chamadoId));
  if (!c) throw naoEncontrado('Conversa');
  return c;
}

export async function adicionarParticipante(tx: Tx, conversaId: string, usuarioId: string) {
  await tx.insert(participantesConversa).values({ conversaId, usuarioId }).onConflictDoNothing();
}

export async function mensagemSistema(tx: Tx, fx: Efeitos, chamadoId: string, texto: string) {
  const conversa = await conversaDoChamado(tx, chamadoId);
  const [m] = await tx.insert(mensagens).values({ conversaId: conversa.id, tipo: 'SISTEMA', conteudo: texto }).returning();
  fx.paraChamado(chamadoId, 'chat:mensagem', paraTempoReal(m!));
}

async function exigirParticipante(tx: Tx, conversaId: string, usuarioId: string) {
  const [p] = await tx.select().from(participantesConversa)
    .where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.usuarioId, usuarioId)));
  if (!p) throw proibido('Você não participa desta conversa.');
  const outros = await tx.select({ id: participantesConversa.usuarioId }).from(participantesConversa)
    .where(eq(participantesConversa.conversaId, conversaId));
  return outros.map((o) => o.id).filter((id) => id !== usuarioId);
}

async function haBloqueio(tx: Tx, a: string, outros: string[]) {
  if (!outros.length) return false;
  const r = await tx.select().from(bloqueios).where(or(
    and(eq(bloqueios.bloqueadorId, a), inArray(bloqueios.bloqueadoId, outros)),
    and(inArray(bloqueios.bloqueadorId, outros), eq(bloqueios.bloqueadoId, a)),
  )).limit(1);
  return r.length > 0;
}

export async function enviarMensagem(
  ctx: Contexto, fx: Efeitos, usuarioId: string, conversaId: string,
  m: { tipo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'LOCALIZACAO'; conteudo?: string; midiaUrl?: string; lat?: number; lng?: number },
) {
  return ctx.db.transaction(async (tx) => {
    const outros = await exigirParticipante(tx, conversaId, usuarioId);
    // Bloqueio impede novas mensagens; durante chamado ativo continua havendo saída
    // por cancelamento ou suporte (seção 11).
    if (await haBloqueio(tx, usuarioId, outros)) throw new ErroApp('BLOQUEADO', 'Não é possível enviar mensagens nesta conversa.', 403);
    const [msg] = await tx.insert(mensagens).values({ conversaId, autorId: usuarioId, ...m }).returning();
    const [conv] = await tx.select().from(conversas).where(eq(conversas.id, conversaId));
    const payload = paraTempoReal(msg!);
    if (conv?.chamadoId) fx.paraChamado(conv.chamadoId, 'chat:mensagem', payload);
    for (const o of outros) fx.paraUsuario(o, 'chat:mensagem', payload);
    return msg!;
  });
}

export async function listarMensagens(ctx: Contexto, usuarioId: string, conversaId: string, depoisDe?: Date) {
  await exigirParticipante(ctx.db, conversaId, usuarioId);
  return ctx.db.select().from(mensagens)
    .where(and(eq(mensagens.conversaId, conversaId), depoisDe ? gt(mensagens.criadaEm, depoisDe) : undefined))
    .orderBy(asc(mensagens.criadaEm)).limit(200);
}

export async function marcarLeitura(ctx: Contexto, fx: Efeitos, usuarioId: string, conversaId: string) {
  const agora = ctx.agora();
  await ctx.db.update(participantesConversa).set({ ultimaLeituraEm: agora })
    .where(and(eq(participantesConversa.conversaId, conversaId), eq(participantesConversa.usuarioId, usuarioId)));
  const outros = await exigirParticipante(ctx.db, conversaId, usuarioId);
  for (const o of outros) fx.paraUsuario(o, 'chat:lida', { conversaId, usuarioId, ate: agora.toISOString() });
}

/**
 * Proposta enviada pelo chat: valor do serviço, taxa de deslocamento ou
 * "valor depende de avaliação presencial". Substitui a proposta anterior do mesmo tipo.
 */
export async function proporCondicao(
  ctx: Contexto, fx: Efeitos, usuarioId: string, chamadoId: string,
  p: { tipo: 'VALOR_SERVICO' | 'TAXA_DESLOCAMENTO' | 'AVALIACAO_PRESENCIAL' | 'OUTRA'; valorCentavos?: number; descricao?: string },
) {
  return ctx.db.transaction(async (tx) => {
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId)).for('update');
    if (!ch) throw naoEncontrado('Chamado');
    if (ehFinal(ch.estado)) throw new ErroApp('CHAMADO_ENCERRADO', 'O chamado já foi encerrado.');
    const conversa = await conversaDoChamado(tx, chamadoId);
    const outros = await exigirParticipante(tx, conversa.id, usuarioId);
    if (p.tipo === 'TAXA_DESLOCAMENTO' && !['ACEITO_COMBINANDO'].includes(ch.estado)) {
      throw new ErroApp('FORA_DE_HORA', 'A taxa de deslocamento deve ser combinada antes da confirmação e da saída.');
    }
    if ((p.tipo === 'VALOR_SERVICO' || p.tipo === 'TAXA_DESLOCAMENTO') && !(p.valorCentavos && p.valorCentavos > 0)) {
      throw new ErroApp('VALOR_INVALIDO', 'Informe um valor maior que zero.');
    }

    await tx.update(condicoesAcordadas).set({ estado: 'SUBSTITUIDA' }).where(and(
      eq(condicoesAcordadas.chamadoId, chamadoId), eq(condicoesAcordadas.tipo, p.tipo), eq(condicoesAcordadas.estado, 'PROPOSTA'),
    ));
    const texto = p.tipo === 'AVALIACAO_PRESENCIAL'
      ? 'Valor depende de avaliação presencial.'
      : `${p.tipo === 'TAXA_DESLOCAMENTO' ? 'Taxa de deslocamento' : 'Proposta'}: R$ ${((p.valorCentavos ?? 0) / 100).toFixed(2).replace('.', ',')}`
        + (p.descricao ? ` — ${p.descricao}` : '');
    const [msg] = await tx.insert(mensagens).values({ conversaId: conversa.id, autorId: usuarioId, tipo: 'PROPOSTA', conteudo: texto }).returning();
    const [cond] = await tx.insert(condicoesAcordadas).values({
      chamadoId, tipo: p.tipo, valorCentavos: p.valorCentavos, descricao: p.descricao, propostaPor: usuarioId, mensagemId: msg!.id,
      // Avaliação presencial é um registro informativo, não exige aceite.
      estado: p.tipo === 'AVALIACAO_PRESENCIAL' ? 'ACEITA' : 'PROPOSTA',
    }).returning();

    fx.paraChamado(chamadoId, 'chat:mensagem', paraTempoReal(msg!));
    for (const o of outros) {
      await notificar(tx, fx, { usuarioId: o, tipo: 'PROPOSTA_RECEBIDA', titulo: 'Nova proposta', corpo: texto, chamadoId });
    }
    return cond!;
  });
}

export async function responderCondicao(ctx: Contexto, fx: Efeitos, usuarioId: string, condicaoId: string, aceitar: boolean) {
  return ctx.db.transaction(async (tx) => {
    const [cond] = await tx.select().from(condicoesAcordadas).where(eq(condicoesAcordadas.id, condicaoId)).for('update');
    if (!cond) throw naoEncontrado('Proposta');
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, cond.chamadoId));
    if (ch!.motoristaId !== usuarioId) throw proibido('Somente o motorista responde às propostas.');
    if (cond.estado !== 'PROPOSTA') throw new ErroApp('PROPOSTA_ENCERRADA', 'Esta proposta não está mais aberta.', 409);

    const [atualizada] = await tx.update(condicoesAcordadas)
      .set({ estado: aceitar ? 'ACEITA' : 'RECUSADA', respondidaEm: ctx.agora() })
      .where(eq(condicoesAcordadas.id, condicaoId)).returning();
    const rotulo = cond.tipo === 'TAXA_DESLOCAMENTO' ? 'Taxa de deslocamento' : 'Proposta';
    await mensagemSistema(tx, fx, cond.chamadoId, `${rotulo} ${aceitar ? 'aceita' : 'recusada'} pelo motorista.`);
    return atualizada!;
  });
}

/** Há taxa de deslocamento proposta e não aceita? Bloqueia a confirmação. */
export async function taxaDeslocamentoPendente(tx: Tx, chamadoId: string) {
  const r = await tx.select({ id: condicoesAcordadas.id }).from(condicoesAcordadas).where(and(
    eq(condicoesAcordadas.chamadoId, chamadoId),
    eq(condicoesAcordadas.tipo, 'TAXA_DESLOCAMENTO'),
    eq(condicoesAcordadas.estado, 'PROPOSTA'),
  )).limit(1);
  return r.length > 0;
}
