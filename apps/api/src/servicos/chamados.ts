/**
 * Ciclo de vida do chamado (seções 7, 8 e 9).
 *
 * Toda mudança de estado passa por `aplicarTransicao`, que:
 *  1. valida a regra na máquina de estados compartilhada (@vrum/shared);
 *  2. grava com controle de versão (o chamado está travado com FOR UPDATE);
 *  3. registra o evento no histórico;
 *  4. executa os efeitos do novo estado (rastreamento, ocupação, avisos).
 *
 * Ordem de travas para evitar deadlock: sempre chamado → convites → membros.
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  ESTADOS_COM_PRESTADOR, ROTULO_ESTADO, transicionar,
  type Ator, type EstadoChamado, type EventoChamado,
} from '@vrum/shared';
import {
  anexosChamado, categorias, chamados, condicoesAcordadas, contestacoes, conversas, convitesChamado,
  eventosChamado, membrosPrestador, participantesConversa, usuarios, veiculos, compartilhamentosLocalizacao,
} from '../db/schema.js';
import type { Tx } from '../db/cliente.js';
import { ErroApp, Efeitos, conflito, naoEncontrado, proibido, somarSeg, type Contexto } from '../nucleo.js';
import { adicionarParticipante, mensagemSistema, taxaDeslocamentoPendente } from './chat.js';
import { notificar } from './notificacoes.js';
import { abrirRastreamento, encerrarRastreamento } from './localizacao.js';

export type Chamado = typeof chamados.$inferSelect;
type MudancasChamado = Partial<typeof chamados.$inferInsert>;

// ───────────────────────────── utilitários ─────────────────────────────

export function violouUnico(e: unknown, indice?: string): boolean {
  const err = (e as { cause?: { code?: string; constraint?: string }; code?: string; constraint?: string });
  const alvo = err?.code ? err : err?.cause;
  return alvo?.code === '23505' && (!indice || alvo.constraint === indice);
}

async function travarChamado(tx: Tx, id: string) {
  const [ch] = await tx.select().from(chamados).where(eq(chamados.id, id)).for('update');
  if (!ch) throw naoEncontrado('Chamado');
  return ch;
}

/** Usuários que devem ser avisados em nome de um prestador: donos, gestores e quem atende. */
async function usuariosDoPrestador(tx: Tx, prestadorId: string) {
  const r = await tx.select({ id: membrosPrestador.usuarioId }).from(membrosPrestador)
    .where(and(eq(membrosPrestador.prestadorId, prestadorId), eq(membrosPrestador.ativo, true)));
  return r.map((m) => m.id);
}

async function usuarioResponsavel(tx: Tx, ch: Chamado) {
  if (!ch.responsavelId) return null;
  const [m] = await tx.select({ usuarioId: membrosPrestador.usuarioId }).from(membrosPrestador)
    .where(eq(membrosPrestador.id, ch.responsavelId));
  return m?.usuarioId ?? null;
}

// ───────────────────────────── transição central ─────────────────────────────

export async function aplicarTransicao(
  tx: Tx, fx: Efeitos, ctx: Contexto, ch: Chamado, evento: EventoChamado,
  ator: { tipo: Ator; id?: string },
  opts: { mudancas?: MudancasChamado; dados?: Record<string, unknown>; taxaPendente?: boolean } = {},
): Promise<Chamado> {
  const r = transicionar(ch.estado, evento, { ator: ator.tipo, taxaDeslocamentoPendente: opts.taxaPendente });
  if (!r.ok) throw new ErroApp(r.codigo, r.motivo, r.codigo === 'ATOR_NAO_PERMITIDO' ? 403 : 409);

  const [novo] = await tx.update(chamados)
    .set({ ...opts.mudancas, estado: r.para, versao: ch.versao + 1 })
    .where(and(eq(chamados.id, ch.id), eq(chamados.versao, ch.versao)))
    .returning();
  if (!novo) throw conflito('O chamado foi alterado por outra ação. Atualize e tente novamente.');

  await tx.insert(eventosChamado).values({
    chamadoId: ch.id, evento, de: ch.estado, para: r.para, ator: ator.tipo, atorId: ator.id ?? null, dados: opts.dados ?? null,
  });

  const aviso = { chamadoId: ch.id, estado: novo.estado, evento, versao: novo.versao };
  fx.paraChamado(ch.id, 'chamado:estado', aviso);
  fx.paraUsuario(ch.motoristaId, 'chamado:estado', aviso);

  await efeitosDoEstado(tx, fx, ctx, ch, novo, evento);
  return novo;
}

async function efeitosDoEstado(tx: Tx, fx: Efeitos, ctx: Contexto, antes: Chamado, ch: Chamado, evento: EventoChamado) {
  const responsavel = await usuarioResponsavel(tx, ch);
  const n = (usuarioId: string | null, tipo: Parameters<typeof notificar>[2]['tipo'], titulo: string, corpo: string) =>
    usuarioId ? notificar(tx, fx, { usuarioId, tipo, titulo, corpo, chamadoId: ch.id }) : undefined;

  if (ESTADOS_COM_PRESTADOR.includes(ch.estado) || ESTADOS_COM_PRESTADOR.includes(antes.estado)) {
    await mensagemSistema(tx, fx, ch.id, `Estado do atendimento: ${ROTULO_ESTADO[ch.estado]}.`);
  }

  switch (ch.estado) {
    case 'ACEITO_COMBINANDO':
      await n(ch.motoristaId, 'CHAMADO_ACEITO', 'Chamado aceito', 'Um profissional aceitou. Combine o atendimento pelo chat.');
      break;
    case 'CONFIRMADO':
      await abrirRastreamento(tx, fx, ch, responsavel!);
      await n(responsavel, 'ATENDIMENTO_CONFIRMADO', 'Atendimento confirmado', 'O motorista confirmou. Inicie o deslocamento quando sair.');
      break;
    case 'A_CAMINHO':
      await n(ch.motoristaId, 'PRESTADOR_A_CAMINHO', 'Profissional a caminho', 'Acompanhe a chegada no mapa.');
      break;
    case 'NO_LOCAL':
      await n(ch.motoristaId, 'PRESTADOR_NO_LOCAL', 'Profissional no local', 'O profissional informou que chegou.');
      break;
    case 'CONCLUSAO_SOLICITADA':
      await n(ch.motoristaId, 'CONCLUSAO_SOLICITADA', 'Serviço finalizado?', 'Confirme a conclusão e avalie o atendimento.');
      break;
    case 'CONCLUIDO':
    case 'CANCELADO': {
      await encerrarRastreamento(tx, fx, ch.id, ch.estado === 'CONCLUIDO' ? 'CONCLUIDO' : 'CANCELADO');
      await tx.update(membrosPrestador).set({ chamadoAtualId: null }).where(eq(membrosPrestador.chamadoAtualId, ch.id));
      await encerrarConvitesPendentes(tx, fx, ch.id, 'CANCELADO');
      if (ch.estado === 'CONCLUIDO') {
        await n(responsavel, 'CHAMADO_CONCLUIDO', 'Atendimento concluído', 'O atendimento foi encerrado.');
        if (evento === 'CONCLUIR_POR_PRAZO') {
          await n(ch.motoristaId, 'CHAMADO_CONCLUIDO', 'Atendimento concluído', 'Encerrado por prazo. Se houver problema, abra uma contestação.');
        }
      } else {
        const outro = ch.canceladoPor === 'MOTORISTA' ? responsavel : ch.motoristaId;
        await n(outro, 'CHAMADO_CANCELADO', 'Chamado cancelado', ch.motivoCancelamento ?? 'O atendimento foi cancelado.');
        if (ch.canceladoPor !== 'MOTORISTA' && ch.canceladoPor !== 'PRESTADOR') await n(responsavel, 'CHAMADO_CANCELADO', 'Chamado cancelado', 'O atendimento foi encerrado.');
      }
      break;
    }
    case 'SEM_ATENDIMENTO':
      await n(ch.motoristaId, 'SEM_ATENDIMENTO', 'Nenhum profissional aceitou', 'Amplie a busca ou escolha outro profissional.');
      break;
  }
}

async function encerrarConvitesPendentes(tx: Tx, fx: Efeitos, chamadoId: string, motivo: 'ACEITO_POR_OUTRO' | 'CANCELADO' | 'EXPIRADO') {
  const encerrados = await tx.update(convitesChamado)
    .set({ estado: motivo === 'EXPIRADO' ? 'EXPIRADO' : 'CANCELADO' })
    .where(and(eq(convitesChamado.chamadoId, chamadoId), eq(convitesChamado.estado, 'PENDENTE')))
    .returning();
  for (const c of encerrados) {
    for (const u of await usuariosDoPrestador(tx, c.prestadorId)) fx.paraUsuario(u, 'convite:encerrado', { conviteId: c.id, motivo });
  }
}

// ───────────────────────────── busca e convites ─────────────────────────────

export interface Candidato { prestadorId: string; distanciaKm: number | null }

/**
 * Prestadores compatíveis: atendem a categoria e o tipo de veículo, têm um
 * profissional disponível (com validade) e livre, e o ponto está dentro do
 * raio da etapa e da cobertura do prestador. Profissional móvel usa a última
 * posição se for recente; caso contrário, a base comercial.
 */
export async function buscarCandidatos(tx: Tx, ctx: Contexto, ch: Chamado, raioKm: number, limite: number): Promise<Candidato[]> {
  const agora = ctx.agora();
  const recente = new Date(agora.getTime() - 15 * 60_000);
  const dLat = raioKm / 111;
  const dLng = raioKm / (111 * Math.cos((ch.pontoLat * Math.PI) / 180));
  const [veic] = await tx.select({ tipo: veiculos.tipo }).from(veiculos).where(eq(veiculos.id, ch.veiculoId));

  const r = await tx.execute<{ prestador_id: string; distancia_km: number }>(sql`
    with pos as (
      select p.id as prestador_id, p.raio_cobertura_km,
        case when m.ultima_posicao_em > ${recente} then m.ultima_lat else p.base_lat end as lat,
        case when m.ultima_posicao_em > ${recente} then m.ultima_lng else p.base_lng end as lng
      from prestadores p
      join prestador_categorias pc on pc.prestador_id = p.id and pc.categoria_id = ${ch.categoriaId}
      join membros_prestador m on m.prestador_id = p.id
        and m.ativo and m.atende and m.disponivel and m.disponivel_ate > ${agora} and m.chamado_atual_id is null
        and m.usuario_id <> ${ch.motoristaId}
      where (cardinality(p.veiculos_atendidos) = 0 or ${veic!.tipo}::tipo_veiculo = any(p.veiculos_atendidos))
        and not exists (select 1 from convites_chamado c where c.chamado_id = ${ch.id} and c.prestador_id = p.id)
    ), dist as (
      select prestador_id, raio_cobertura_km,
        2 * 6371 * asin(sqrt(
          power(sin(radians(lat - ${ch.pontoLat}) / 2), 2) +
          cos(radians(${ch.pontoLat})) * cos(radians(lat)) * power(sin(radians(lng - ${ch.pontoLng}) / 2), 2)
        )) as distancia_km
      from pos
      where lat between ${ch.pontoLat - dLat} and ${ch.pontoLat + dLat}
        and lng between ${ch.pontoLng - dLng} and ${ch.pontoLng + dLng}
    )
    select prestador_id, min(distancia_km) as distancia_km from dist
    where distancia_km <= least(${raioKm}, raio_cobertura_km)
    group by prestador_id
    order by distancia_km
    limit ${limite}
  `);
  return r.rows.map((x) => ({ prestadorId: x.prestador_id, distanciaKm: Number(x.distancia_km) }));
}

async function convidar(tx: Tx, fx: Efeitos, ctx: Contexto, ch: Chamado, cands: Candidato[], etapa: number) {
  const expiraEm = somarSeg(ctx.agora(), ctx.regras.prazoConviteSeg);
  const criados = await tx.insert(convitesChamado)
    .values(cands.map((c) => ({ chamadoId: ch.id, prestadorId: c.prestadorId, etapa, distanciaKm: c.distanciaKm, expiraEm })))
    .returning();
  for (const c of criados) {
    for (const u of await usuariosDoPrestador(tx, c.prestadorId)) {
      fx.paraUsuario(u, 'convite:novo', { conviteId: c.id, chamadoId: ch.id, expiraEm: expiraEm.toISOString() });
      await notificar(tx, fx, { usuarioId: u, tipo: 'CONVITE_NOVO', titulo: 'Novo chamado', corpo: 'Há um motorista precisando de atendimento.', chamadoId: ch.id });
    }
  }
}

/** Envia os convites da próxima etapa. Sem candidatos em nenhuma etapa → sem atendimento. */
async function procurar(tx: Tx, fx: Efeitos, ctx: Contexto, ch: Chamado): Promise<Chamado> {
  if (ch.modalidade === 'ESCOLHER_PROFISSIONAL') {
    const pid = ch.prestadorEscolhidoId!;
    const jaConvidado = await tx.select({ id: convitesChamado.id }).from(convitesChamado)
      .where(and(eq(convitesChamado.chamadoId, ch.id), eq(convitesChamado.prestadorId, pid)));
    if (jaConvidado.length) return aplicarTransicao(tx, fx, ctx, ch, 'BUSCA_ESGOTADA', { tipo: 'SISTEMA' });
    await convidar(tx, fx, ctx, ch, [{ prestadorId: pid, distanciaKm: null }], ch.etapaBusca + 1);
    return aplicarTransicao(tx, fx, ctx, ch, 'CONVITE_ENVIADO', { tipo: 'SISTEMA' }, { mudancas: { etapaBusca: ch.etapaBusca + 1 } });
  }

  const { raiosBuscaKm, prestadoresPorEtapa } = ctx.regras;
  for (let etapa = ch.etapaBusca; etapa < raiosBuscaKm.length; etapa++) {
    const cands = await buscarCandidatos(tx, ctx, ch, raiosBuscaKm[etapa]!, prestadoresPorEtapa);
    if (cands.length) {
      await convidar(tx, fx, ctx, ch, cands, etapa + 1);
      return aplicarTransicao(tx, fx, ctx, ch, 'CONVITE_ENVIADO', { tipo: 'SISTEMA' }, {
        mudancas: { etapaBusca: etapa + 1 }, dados: { raioKm: raiosBuscaKm[etapa], convites: cands.length },
      });
    }
  }
  return aplicarTransicao(tx, fx, ctx, ch, 'BUSCA_ESGOTADA', { tipo: 'SISTEMA' }, { mudancas: { etapaBusca: raiosBuscaKm.length } });
}

/** Sem convites pendentes na etapa atual: tenta a próxima ou encerra a busca. */
async function avancarSeSemPendentes(tx: Tx, fx: Efeitos, ctx: Contexto, ch: Chamado) {
  if (ch.estado !== 'AGUARDANDO_RESPOSTA') return ch;
  const pend = await tx.select({ id: convitesChamado.id }).from(convitesChamado)
    .where(and(eq(convitesChamado.chamadoId, ch.id), eq(convitesChamado.estado, 'PENDENTE'))).limit(1);
  if (pend.length) return ch;
  if (ch.modalidade === 'ESCOLHER_PROFISSIONAL') return aplicarTransicao(tx, fx, ctx, ch, 'BUSCA_ESGOTADA', { tipo: 'SISTEMA' });
  const buscando = await aplicarTransicao(tx, fx, ctx, ch, 'CONVITES_SEM_RESPOSTA', { tipo: 'SISTEMA' });
  return procurar(tx, fx, ctx, buscando);
}

// ───────────────────────────── criação ─────────────────────────────

export interface NovoChamado {
  veiculoId: string;
  categoriaId: string;
  modalidade: 'ESCOLHER_PROFISSIONAL' | 'BUSCAR_DISPONIVEIS';
  prestadorId?: string;
  ponto: { lat: number; lng: number; referencia?: string };
  descricao?: string;
  anexos?: { tipo: 'IMAGEM' | 'AUDIO' | 'VIDEO'; url: string }[];
  guincho?: { destinoEndereco?: string; destinoLat?: number; destinoLng?: number; condicoesAcesso?: string; veiculoSeMove?: boolean };
}

export async function criarChamado(ctx: Contexto, fx: Efeitos, motoristaId: string, d: NovoChamado) {
  try {
    return await ctx.db.transaction(async (tx) => {
      const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, motoristaId));
      if (!u?.cidadeId) throw new ErroApp('CIDADE_OBRIGATORIA', 'Informe sua cidade antes de solicitar atendimento.');
      const [v] = await tx.select().from(veiculos).where(and(eq(veiculos.id, d.veiculoId), eq(veiculos.motoristaId, motoristaId)));
      if (!v || v.arquivadoEm) throw naoEncontrado('Veículo');
      const [cat] = await tx.select().from(categorias).where(and(eq(categorias.id, d.categoriaId), eq(categorias.ativa, true)));
      if (!cat) throw naoEncontrado('Categoria');
      if (cat.exigeDadosGuincho && (d.guincho?.veiculoSeMove === undefined || !d.guincho?.destinoEndereco)) {
        throw new ErroApp('DADOS_GUINCHO', 'Para guincho, informe o destino e se o veículo consegue se movimentar.');
      }
      if (d.modalidade === 'ESCOLHER_PROFISSIONAL' && !d.prestadorId) {
        throw new ErroApp('PRESTADOR_OBRIGATORIO', 'Escolha o profissional ou busque disponíveis.');
      }

      const [ch] = await tx.insert(chamados).values({
        motoristaId, veiculoId: v.id, categoriaId: cat.id, cidadeId: u.cidadeId,
        modalidade: d.modalidade, prestadorEscolhidoId: d.prestadorId ?? null, descricao: d.descricao,
        pontoLat: d.ponto.lat, pontoLng: d.ponto.lng, pontoReferencia: d.ponto.referencia,
        ...d.guincho,
      }).returning();
      await tx.insert(eventosChamado).values({ chamadoId: ch!.id, evento: 'CRIADO', para: ch!.estado, ator: 'MOTORISTA', atorId: motoristaId });
      if (d.anexos?.length) await tx.insert(anexosChamado).values(d.anexos.map((a) => ({ ...a, chamadoId: ch!.id })));
      const [conv] = await tx.insert(conversas).values({ chamadoId: ch!.id }).returning();
      await adicionarParticipante(tx, conv!.id, motoristaId);

      return procurar(tx, fx, ctx, ch!);
    });
  } catch (e) {
    if (violouUnico(e, 'chamado_um_ativo_por_motorista')) throw conflito('Você já tem um chamado em andamento.', 'CHAMADO_ATIVO_EXISTENTE');
    throw e;
  }
}

// ───────────────────────────── resposta do prestador ─────────────────────────────

export async function aceitarConvite(ctx: Contexto, fx: Efeitos, usuarioId: string, conviteId: string) {
  try {
    return await ctx.db.transaction(async (tx) => {
      const [previa] = await tx.select({ chamadoId: convitesChamado.chamadoId }).from(convitesChamado).where(eq(convitesChamado.id, conviteId));
      if (!previa) throw naoEncontrado('Convite');
      const ch = await travarChamado(tx, previa.chamadoId);
      const [cv] = await tx.select().from(convitesChamado).where(eq(convitesChamado.id, conviteId)).for('update');

      // Convite antigo (notificação atrasada) nunca pode ser aceito.
      if (cv!.estado !== 'PENDENTE' || ch.estado !== 'AGUARDANDO_RESPOSTA') {
        throw conflito('Este convite não está mais disponível.', 'CONVITE_ENCERRADO');
      }
      if (cv!.expiraEm <= ctx.agora()) throw conflito('O prazo deste convite terminou.', 'CONVITE_EXPIRADO');

      const [membro] = await tx.select().from(membrosPrestador).where(and(
        eq(membrosPrestador.prestadorId, cv!.prestadorId), eq(membrosPrestador.usuarioId, usuarioId),
        eq(membrosPrestador.ativo, true), eq(membrosPrestador.atende, true),
      )).for('update');
      if (!membro) throw proibido('Você não atende por este prestador.');
      if (membro.chamadoAtualId) throw conflito('Você já está em outro atendimento.', 'PROFISSIONAL_OCUPADO');

      const agora = ctx.agora();
      const novo = await aplicarTransicao(tx, fx, ctx, ch, 'ACEITAR', { tipo: 'PRESTADOR', id: usuarioId }, {
        mudancas: {
          prestadorId: cv!.prestadorId, responsavelId: membro.id, aceitoEm: agora,
          abandonoEm: somarSeg(agora, ctx.regras.abandonoHoras * 3600),
        },
        dados: { conviteId },
      });
      await tx.update(convitesChamado).set({ estado: 'ACEITO', respondidoEm: agora, respondidoPor: usuarioId }).where(eq(convitesChamado.id, conviteId));
      await encerrarConvitesPendentes(tx, fx, ch.id, 'ACEITO_POR_OUTRO');
      await tx.update(membrosPrestador).set({ chamadoAtualId: ch.id }).where(eq(membrosPrestador.id, membro.id));
      const [conv] = await tx.select().from(conversas).where(eq(conversas.chamadoId, ch.id));
      await adicionarParticipante(tx, conv!.id, usuarioId);
      return novo;
    });
  } catch (e) {
    // Barreiras do banco: um convite aceito por chamado; um atendimento por profissional.
    if (violouUnico(e, 'convite_um_aceito_por_chamado')) throw conflito('Este convite não está mais disponível.', 'CONVITE_ENCERRADO');
    if (violouUnico(e, 'membro_um_chamado_por_vez')) throw conflito('Você já está em outro atendimento.', 'PROFISSIONAL_OCUPADO');
    throw e;
  }
}

export async function recusarConvite(ctx: Contexto, fx: Efeitos, usuarioId: string, conviteId: string) {
  return ctx.db.transaction(async (tx) => {
    const [previa] = await tx.select({ chamadoId: convitesChamado.chamadoId }).from(convitesChamado).where(eq(convitesChamado.id, conviteId));
    if (!previa) throw naoEncontrado('Convite');
    const ch = await travarChamado(tx, previa.chamadoId);
    const [cv] = await tx.select().from(convitesChamado).where(eq(convitesChamado.id, conviteId)).for('update');
    if (!(await usuariosDoPrestador(tx, cv!.prestadorId)).includes(usuarioId)) throw proibido();
    if (cv!.estado !== 'PENDENTE') throw conflito('Este convite não está mais disponível.', 'CONVITE_ENCERRADO');
    await tx.update(convitesChamado).set({ estado: 'RECUSADO', respondidoEm: ctx.agora(), respondidoPor: usuarioId })
      .where(eq(convitesChamado.id, conviteId));
    return avancarSeSemPendentes(tx, fx, ctx, ch);
  });
}

// ───────────────────────────── ações das partes ─────────────────────────────

const EVENTOS_DO_APP = [
  'DESISTIR', 'CONFIRMAR', 'SAIR_A_CAMINHO', 'CHEGAR', 'INICIAR_SERVICO', 'SOLICITAR_CONCLUSAO',
  'CONFIRMAR_CONCLUSAO', 'CONTESTAR_CONCLUSAO', 'CANCELAR', 'REABRIR_BUSCA',
] as const satisfies readonly EventoChamado[];
export type EventoDoApp = (typeof EVENTOS_DO_APP)[number];
export const ehEventoDoApp = (e: string): e is EventoDoApp => (EVENTOS_DO_APP as readonly string[]).includes(e);

export interface DadosAcao {
  /** Versão vista pelo app; se mudou, a ação é recusada em vez de agir sobre um estado antigo. */
  versao?: number;
  motivo?: string;
  chegadaPrevistaEm?: Date;
  prestadorId?: string; // REABRIR_BUSCA escolhendo outro profissional
}

async function papelNoChamado(tx: Tx, ch: Chamado, usuarioId: string): Promise<'MOTORISTA' | 'PRESTADOR' | null> {
  if (ch.motoristaId === usuarioId) return 'MOTORISTA';
  if (!ch.prestadorId) return null;
  const [m] = await tx.select().from(membrosPrestador).where(and(
    eq(membrosPrestador.prestadorId, ch.prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true),
  ));
  if (!m) return null;
  // Responsável designado ou gestão da empresa.
  return m.id === ch.responsavelId || m.funcao !== 'PROFISSIONAL' ? 'PRESTADOR' : null;
}

export async function executarAcao(ctx: Contexto, fx: Efeitos, usuarioId: string, chamadoId: string, evento: EventoDoApp, d: DadosAcao = {}) {
  try {
    return await ctx.db.transaction(async (tx) => {
      const ch = await travarChamado(tx, chamadoId);
      if (d.versao !== undefined && d.versao !== ch.versao) {
        throw conflito('O chamado mudou desde a última atualização. Confira o estado atual.', 'VERSAO_DESATUALIZADA');
      }
      const papel = await papelNoChamado(tx, ch, usuarioId);
      if (!papel) throw proibido('Você não participa deste chamado.');
      const ator = { tipo: papel, id: usuarioId } as const;
      const agora = ctx.agora();

      switch (evento) {
        case 'CONFIRMAR':
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator, {
            taxaPendente: await taxaDeslocamentoPendente(tx, ch.id),
            mudancas: { confirmadoEm: agora, abandonoEm: somarSeg(agora, ctx.regras.abandonoHoras * 3600) },
          });
        case 'SAIR_A_CAMINHO':
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator, { mudancas: { chegadaPrevistaEm: d.chegadaPrevistaEm } });
        case 'SOLICITAR_CONCLUSAO':
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator, {
            mudancas: { conclusaoSolicitadaEm: agora, autoConcluirEm: somarSeg(agora, ctx.regras.autoConcluirMin * 60) },
          });
        case 'CONFIRMAR_CONCLUSAO':
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator, { mudancas: { concluidoEm: agora, autoConcluirEm: null } });
        case 'CONTESTAR_CONCLUSAO': {
          if (!d.motivo) throw new ErroApp('MOTIVO_OBRIGATORIO', 'Conte o que ficou pendente.');
          const novo = await aplicarTransicao(tx, fx, ctx, ch, evento, ator, {
            mudancas: { autoConcluirEm: null, conclusaoSolicitadaEm: null }, dados: { motivo: d.motivo },
          });
          await tx.insert(contestacoes).values({ chamadoId: ch.id, autorId: usuarioId, motivo: d.motivo });
          return novo;
        }
        case 'CANCELAR':
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator, {
            mudancas: { canceladoEm: agora, canceladoPor: papel, motivoCancelamento: d.motivo ?? null }, dados: { motivo: d.motivo },
          });
        case 'DESISTIR': {
          const buscando = await aplicarTransicao(tx, fx, ctx, ch, evento, ator, {
            mudancas: { prestadorId: null, responsavelId: null, aceitoEm: null, abandonoEm: null }, dados: { motivo: d.motivo },
          });
          await tx.update(convitesChamado).set({ estado: 'RECUSADO', respondidoEm: agora })
            .where(and(eq(convitesChamado.chamadoId, ch.id), eq(convitesChamado.estado, 'ACEITO')));
          await tx.update(membrosPrestador).set({ chamadoAtualId: null }).where(eq(membrosPrestador.chamadoAtualId, ch.id));
          await tx.update(condicoesAcordadas).set({ estado: 'SUBSTITUIDA' })
            .where(and(eq(condicoesAcordadas.chamadoId, ch.id), eq(condicoesAcordadas.estado, 'PROPOSTA')));
          if (ch.responsavelId) {
            const [m] = await tx.select({ u: membrosPrestador.usuarioId }).from(membrosPrestador).where(eq(membrosPrestador.id, ch.responsavelId));
            const [conv] = await tx.select().from(conversas).where(eq(conversas.chamadoId, ch.id));
            if (m && conv) await tx.delete(participantesConversa).where(and(eq(participantesConversa.conversaId, conv.id), eq(participantesConversa.usuarioId, m.u)));
          }
          return buscando.modalidade === 'ESCOLHER_PROFISSIONAL'
            ? aplicarTransicao(tx, fx, ctx, buscando, 'BUSCA_ESGOTADA', { tipo: 'SISTEMA' })
            : procurar(tx, fx, ctx, buscando);
        }
        case 'REABRIR_BUSCA': {
          const mudancas: MudancasChamado = d.prestadorId
            ? { modalidade: 'ESCOLHER_PROFISSIONAL', prestadorEscolhidoId: d.prestadorId }
            : { modalidade: 'BUSCAR_DISPONIVEIS', prestadorEscolhidoId: null, etapaBusca: 0 };
          const reaberto = await aplicarTransicao(tx, fx, ctx, ch, evento, ator, { mudancas });
          return procurar(tx, fx, ctx, reaberto);
        }
        default:
          return aplicarTransicao(tx, fx, ctx, ch, evento, ator);
      }
    });
  } catch (e) {
    if (violouUnico(e, 'chamado_um_ativo_por_motorista')) throw conflito('Você já tem outro chamado em andamento.', 'CHAMADO_ATIVO_EXISTENTE');
    throw e;
  }
}

// ───────────────────────────── consultas ─────────────────────────────

/** Visão do chamado para um participante. A placa só aparece ao prestador após a confirmação. */
export async function obterChamado(ctx: Contexto, usuarioId: string, chamadoId: string) {
  const db = ctx.db;
  const [ch] = await db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!ch) throw naoEncontrado('Chamado');
  let papel = await papelNoChamado(db, ch, usuarioId);
  if (!papel) {
    // Prestador convidado vê o resumo para decidir (seção 8).
    const convite = await db.select({ id: convitesChamado.id }).from(convitesChamado)
      .innerJoin(membrosPrestador, eq(membrosPrestador.prestadorId, convitesChamado.prestadorId))
      .where(and(eq(convitesChamado.chamadoId, ch.id), eq(membrosPrestador.usuarioId, usuarioId), eq(convitesChamado.estado, 'PENDENTE')));
    if (!convite.length) throw proibido();
    papel = 'PRESTADOR';
  }
  const [veiculo] = await db.select().from(veiculos).where(eq(veiculos.id, ch.veiculoId));
  const mostrarPlaca = papel === 'MOTORISTA' || (ch.confirmadoEm !== null && ch.prestadorId !== null);
  const condicoes = await db.select().from(condicoesAcordadas).where(eq(condicoesAcordadas.chamadoId, ch.id));
  const anexos = await db.select().from(anexosChamado).where(eq(anexosChamado.chamadoId, ch.id));
  const historico = await db.select().from(eventosChamado).where(eq(eventosChamado.chamadoId, ch.id)).orderBy(eventosChamado.criadoEm);
  return {
    chamado: ch,
    papel,
    veiculo: veiculo && { ...veiculo, placa: mostrarPlaca ? veiculo.placa : null },
    condicoes, anexos, historico,
  };
}

export async function convitesPendentes(ctx: Contexto, usuarioId: string) {
  return ctx.db.select({
    convite: convitesChamado,
    descricao: chamados.descricao,
    categoriaId: chamados.categoriaId,
    veiculo: { marca: veiculos.marca, modelo: veiculos.modelo, ano: veiculos.ano, tipo: veiculos.tipo, observacoes: veiculos.observacoes },
  }).from(convitesChamado)
    .innerJoin(membrosPrestador, and(eq(membrosPrestador.prestadorId, convitesChamado.prestadorId), eq(membrosPrestador.usuarioId, usuarioId)))
    .innerJoin(chamados, eq(chamados.id, convitesChamado.chamadoId))
    .innerJoin(veiculos, eq(veiculos.id, chamados.veiculoId))
    .where(and(eq(convitesChamado.estado, 'PENDENTE'), sql`${convitesChamado.expiraEm} > ${ctx.agora()}`));
}

// ───────────────────────────── prazos (job periódico) ─────────────────────────────

async function emChamado(ctx: Contexto, fx: Efeitos, chamadoId: string, fn: (tx: Tx, ch: Chamado, fxLocal: Efeitos) => Promise<unknown>) {
  const fxLocal = new Efeitos();
  try {
    await ctx.db.transaction(async (tx) => fn(tx, await travarChamado(tx, chamadoId), fxLocal));
    fx.fila.push(...fxLocal.fila);
    return true;
  } catch (e) {
    if (e instanceof ErroApp) return false; // estado mudou entre a consulta e a trava — ignora
    throw e;
  }
}

/**
 * Executado a cada poucos segundos. Garante que nada fique ativo indefinidamente:
 * convites expiram, conclusões sem resposta são encerradas, chamados abandonados
 * param o rastreamento e disponibilidades vencidas são desligadas.
 */
export async function processarPrazos(ctx: Contexto, fx: Efeitos) {
  const agora = ctx.agora();
  const r = { convitesExpirados: 0, concluidosPorPrazo: 0, abandonados: 0, disponibilidadesVencidas: 0 };

  const expirados = await ctx.db.update(convitesChamado).set({ estado: 'EXPIRADO' })
    .where(and(eq(convitesChamado.estado, 'PENDENTE'), lte(convitesChamado.expiraEm, agora)))
    .returning({ id: convitesChamado.id, chamadoId: convitesChamado.chamadoId, prestadorId: convitesChamado.prestadorId });
  r.convitesExpirados = expirados.length;
  for (const c of expirados) {
    for (const u of await usuariosDoPrestador(ctx.db, c.prestadorId)) fx.paraUsuario(u, 'convite:encerrado', { conviteId: c.id, motivo: 'EXPIRADO' });
  }
  for (const chamadoId of new Set(expirados.map((c) => c.chamadoId))) {
    await emChamado(ctx, fx, chamadoId, (tx, ch, f) => avancarSeSemPendentes(tx, f, ctx, ch));
  }

  const aConcluir = await ctx.db.select({ id: chamados.id }).from(chamados)
    .where(and(eq(chamados.estado, 'CONCLUSAO_SOLICITADA'), lte(chamados.autoConcluirEm, agora)));
  for (const { id } of aConcluir) {
    if (await emChamado(ctx, fx, id, (tx, ch, f) =>
      aplicarTransicao(tx, f, ctx, ch, 'CONCLUIR_POR_PRAZO', { tipo: 'SISTEMA' }, { mudancas: { concluidoEm: agora, autoConcluirEm: null } }))) r.concluidosPorPrazo++;
  }

  const abandonaveis: EstadoChamado[] = ['ACEITO_COMBINANDO', 'CONFIRMADO', 'A_CAMINHO', 'NO_LOCAL', 'EM_ATENDIMENTO'];
  const abandonados = await ctx.db.select({ id: chamados.id }).from(chamados)
    .where(and(inArray(chamados.estado, abandonaveis), lte(chamados.abandonoEm, agora)));
  for (const { id } of abandonados) {
    if (await emChamado(ctx, fx, id, (tx, ch, f) =>
      aplicarTransicao(tx, f, ctx, ch, 'ENCERRAR_ABANDONADO', { tipo: 'SISTEMA' }, {
        mudancas: { canceladoEm: agora, canceladoPor: 'SISTEMA', motivoCancelamento: 'Encerrado automaticamente por inatividade.' },
      }))) r.abandonados++;
  }

  const vencidas = await ctx.db.update(membrosPrestador).set({ disponivel: false })
    .where(and(eq(membrosPrestador.disponivel, true), lte(membrosPrestador.disponivelAte, agora)))
    .returning({ id: membrosPrestador.id });
  r.disponibilidadesVencidas = vencidas.length;

  // Compartilhamentos órfãos (defesa extra): chamado já final, compartilhamento ainda aberto.
  await ctx.db.execute(sql`
    update ${compartilhamentosLocalizacao} set encerrado_em = ${agora}, motivo_encerramento = 'CHAMADO_ENCERRADO'
    where encerrado_em is null and chamado_id in (
      select id from ${chamados} where estado in ('CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO'))`);

  return r;
}
