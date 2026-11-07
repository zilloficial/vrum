/**
 * Central de notificações (seção 14). O registro no banco é a fonte da
 * verdade; o push (FCM/APNs/Web Push) é só um aviso disparado depois do
 * commit, e o envio real fica para a etapa de integração.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { notificacoes } from '../db/schema.js';
import type { Tx } from '../db/cliente.js';
import type { Efeitos } from '../nucleo.js';

export type TipoNotificacao =
  | 'CONVITE_NOVO' | 'CHAMADO_ACEITO' | 'CONVITE_RECUSADO' | 'ATENDIMENTO_CONFIRMADO'
  | 'PRESTADOR_A_CAMINHO' | 'PRESTADOR_NO_LOCAL' | 'CONCLUSAO_SOLICITADA' | 'CHAMADO_CONCLUIDO'
  | 'CHAMADO_CANCELADO' | 'SEM_ATENDIMENTO' | 'NOVA_MENSAGEM' | 'PROPOSTA_RECEBIDA';

export async function notificar(
  tx: Tx,
  fx: Efeitos,
  n: { usuarioId: string; tipo: TipoNotificacao; titulo: string; corpo: string; chamadoId?: string; dados?: unknown },
) {
  const [registro] = await tx
    .insert(notificacoes)
    .values({ ...n, chamadoId: n.chamadoId ?? null, dados: n.dados ?? null })
    .returning();
  fx.paraUsuario(n.usuarioId, 'notificacao:nova', {
    id: registro!.id, tipo: n.tipo, titulo: n.titulo, corpo: n.corpo, chamadoId: n.chamadoId ?? null,
  });
  // Convites agrupam por chamado (tag) para não empilhar avisos repetidos.
  fx.push(n.usuarioId, {
    titulo: n.titulo, corpo: n.corpo,
    url: n.tipo === 'CONVITE_NOVO' ? '/p' : n.chamadoId ? `/chamados/${n.chamadoId}` : '/notificacoes',
    tag: n.chamadoId ? `chamado-${n.chamadoId}` : undefined,
  });
  return registro!;
}

export function listarNotificacoes(tx: Tx, usuarioId: string, apenasNaoLidas = false) {
  return tx.select().from(notificacoes)
    .where(and(eq(notificacoes.usuarioId, usuarioId), apenasNaoLidas ? isNull(notificacoes.lidaEm) : undefined))
    .orderBy(desc(notificacoes.criadaEm))
    .limit(50);
}

export async function marcarLida(tx: Tx, usuarioId: string, id: string, agora: Date) {
  await tx.update(notificacoes).set({ lidaEm: agora })
    .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, usuarioId)));
}
