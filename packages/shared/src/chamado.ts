/**
 * Máquina de estados do chamado (seção 9).
 *
 * É a única fonte da verdade sobre quais mudanças são permitidas, quem pode
 * fazê-las e o que muda junto (rastreamento, chat). A API valida todas as
 * transições aqui antes de gravar; o app usa as mesmas funções para decidir
 * quais botões mostrar.
 */

export const ESTADOS_CHAMADO = [
  'BUSCANDO_PROFISSIONAL',
  'AGUARDANDO_RESPOSTA',
  'ACEITO_COMBINANDO',
  'CONFIRMADO',
  'A_CAMINHO',
  'NO_LOCAL',
  'EM_ATENDIMENTO',
  'CONCLUSAO_SOLICITADA',
  'CONCLUIDO',
  'CANCELADO',
  'SEM_ATENDIMENTO',
] as const;

export type EstadoChamado = (typeof ESTADOS_CHAMADO)[number];

export const ROTULO_ESTADO: Record<EstadoChamado, string> = {
  BUSCANDO_PROFISSIONAL: 'Buscando profissional',
  AGUARDANDO_RESPOSTA: 'Aguardando resposta',
  ACEITO_COMBINANDO: 'Aceito — combinando atendimento',
  CONFIRMADO: 'Atendimento confirmado',
  A_CAMINHO: 'A caminho',
  NO_LOCAL: 'No local',
  EM_ATENDIMENTO: 'Em atendimento',
  CONCLUSAO_SOLICITADA: 'Conclusão solicitada',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  SEM_ATENDIMENTO: 'Sem atendimento',
};

export type Ator = 'MOTORISTA' | 'PRESTADOR' | 'SISTEMA' | 'ADMIN';

export const EVENTOS_CHAMADO = [
  'CONVITE_ENVIADO',
  'CONVITES_SEM_RESPOSTA',
  'BUSCA_ESGOTADA',
  'REABRIR_BUSCA',
  'ACEITAR',
  'DESISTIR',
  'CONFIRMAR',
  'SAIR_A_CAMINHO',
  'CHEGAR',
  'INICIAR_SERVICO',
  'SOLICITAR_CONCLUSAO',
  'CONFIRMAR_CONCLUSAO',
  'CONTESTAR_CONCLUSAO',
  'CONCLUIR_POR_PRAZO',
  'CANCELAR',
  'ENCERRAR_ABANDONADO',
] as const;

export type EventoChamado = (typeof EVENTOS_CHAMADO)[number];

/** Estados em que já existe um prestador vinculado ao chamado. */
export const ESTADOS_COM_PRESTADOR: readonly EstadoChamado[] = [
  'ACEITO_COMBINANDO',
  'CONFIRMADO',
  'A_CAMINHO',
  'NO_LOCAL',
  'EM_ATENDIMENTO',
  'CONCLUSAO_SOLICITADA',
];

/** Rastreamento só existe com atendimento confirmado (seção 10). */
export const ESTADOS_COM_RASTREAMENTO: readonly EstadoChamado[] = [
  'CONFIRMADO',
  'A_CAMINHO',
  'NO_LOCAL',
  'EM_ATENDIMENTO',
  'CONCLUSAO_SOLICITADA',
];

export const ESTADOS_FINAIS: readonly EstadoChamado[] = ['CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO'];

/** Estados ainda em andamento (um motorista pode ter no máximo um destes ao mesmo tempo). */
export const ESTADOS_ATIVOS: readonly EstadoChamado[] = ESTADOS_CHAMADO.filter(
  (e) => !ESTADOS_FINAIS.includes(e),
);

interface Regra {
  de: readonly EstadoChamado[];
  para: EstadoChamado;
  atores: readonly Ator[];
}

const ANTES_DO_ACEITE = ['BUSCANDO_PROFISSIONAL', 'AGUARDANDO_RESPOSTA'] as const;
const NAO_FINAIS = ESTADOS_ATIVOS;

const REGRAS: Record<EventoChamado, Regra> = {
  CONVITE_ENVIADO: { de: ['BUSCANDO_PROFISSIONAL'], para: 'AGUARDANDO_RESPOSTA', atores: ['SISTEMA', 'MOTORISTA'] },
  // Prazo dos convites da etapa venceu; o sistema tenta a próxima etapa.
  CONVITES_SEM_RESPOSTA: { de: ['AGUARDANDO_RESPOSTA'], para: 'BUSCANDO_PROFISSIONAL', atores: ['SISTEMA'] },
  BUSCA_ESGOTADA: { de: ANTES_DO_ACEITE, para: 'SEM_ATENDIMENTO', atores: ['SISTEMA'] },
  // Motorista amplia a busca ou escolhe outro profissional.
  REABRIR_BUSCA: { de: ['SEM_ATENDIMENTO'], para: 'BUSCANDO_PROFISSIONAL', atores: ['MOTORISTA'] },
  ACEITAR: { de: ['AGUARDANDO_RESPOSTA'], para: 'ACEITO_COMBINANDO', atores: ['PRESTADOR'] },
  // Não houve acordo durante a negociação: o chamado volta a procurar.
  DESISTIR: { de: ['ACEITO_COMBINANDO'], para: 'BUSCANDO_PROFISSIONAL', atores: ['PRESTADOR', 'MOTORISTA'] },
  CONFIRMAR: { de: ['ACEITO_COMBINANDO'], para: 'CONFIRMADO', atores: ['MOTORISTA'] },
  SAIR_A_CAMINHO: { de: ['CONFIRMADO'], para: 'A_CAMINHO', atores: ['PRESTADOR'] },
  CHEGAR: { de: ['A_CAMINHO'], para: 'NO_LOCAL', atores: ['PRESTADOR'] },
  INICIAR_SERVICO: { de: ['NO_LOCAL'], para: 'EM_ATENDIMENTO', atores: ['PRESTADOR'] },
  SOLICITAR_CONCLUSAO: { de: ['EM_ATENDIMENTO'], para: 'CONCLUSAO_SOLICITADA', atores: ['PRESTADOR'] },
  CONFIRMAR_CONCLUSAO: { de: ['CONCLUSAO_SOLICITADA'], para: 'CONCLUIDO', atores: ['MOTORISTA'] },
  CONTESTAR_CONCLUSAO: { de: ['CONCLUSAO_SOLICITADA'], para: 'EM_ATENDIMENTO', atores: ['MOTORISTA'] },
  CONCLUIR_POR_PRAZO: { de: ['CONCLUSAO_SOLICITADA'], para: 'CONCLUIDO', atores: ['SISTEMA'] },
  CANCELAR: { de: NAO_FINAIS, para: 'CANCELADO', atores: ['MOTORISTA', 'PRESTADOR', 'ADMIN'] },
  ENCERRAR_ABANDONADO: {
    de: ['ACEITO_COMBINANDO', 'CONFIRMADO', 'A_CAMINHO', 'NO_LOCAL', 'EM_ATENDIMENTO'],
    para: 'CANCELADO',
    atores: ['SISTEMA'],
  },
};

export interface ContextoTransicao {
  ator: Ator;
  /** Há taxa de deslocamento proposta e ainda não aceita pelo motorista. */
  taxaDeslocamentoPendente?: boolean;
}

export type ResultadoTransicao =
  | { ok: true; de: EstadoChamado; para: EstadoChamado }
  | { ok: false; codigo: 'TRANSICAO_INVALIDA' | 'ATOR_NAO_PERMITIDO' | 'TAXA_NAO_ACEITA'; motivo: string };

export function transicionar(
  atual: EstadoChamado,
  evento: EventoChamado,
  ctx: ContextoTransicao,
): ResultadoTransicao {
  const regra = REGRAS[evento];

  if (!regra.de.includes(atual)) {
    return {
      ok: false,
      codigo: 'TRANSICAO_INVALIDA',
      motivo: `"${evento}" não é permitido no estado "${ROTULO_ESTADO[atual]}".`,
    };
  }
  if (!regra.atores.includes(ctx.ator)) {
    return { ok: false, codigo: 'ATOR_NAO_PERMITIDO', motivo: `${ctx.ator} não pode executar "${evento}".` };
  }
  // Prestador só cancela depois de estar vinculado ao chamado.
  if (evento === 'CANCELAR' && ctx.ator === 'PRESTADOR' && !ESTADOS_COM_PRESTADOR.includes(atual)) {
    return { ok: false, codigo: 'ATOR_NAO_PERMITIDO', motivo: 'Prestador ainda não está vinculado ao chamado.' };
  }
  // Taxa de deslocamento deve ser apresentada e aceita antes da saída (seção 8).
  if (evento === 'CONFIRMAR' && ctx.taxaDeslocamentoPendente) {
    return {
      ok: false,
      codigo: 'TAXA_NAO_ACEITA',
      motivo: 'Aceite ou recuse a taxa de deslocamento antes de confirmar o atendimento.',
    };
  }
  return { ok: true, de: atual, para: regra.para };
}

/** Eventos que um ator pode disparar agora — usado pelo app para montar os botões. */
export function eventosDisponiveis(atual: EstadoChamado, ctx: ContextoTransicao): EventoChamado[] {
  return EVENTOS_CHAMADO.filter((ev) => transicionar(atual, ev, ctx).ok);
}

export const rastreamentoAtivo = (e: EstadoChamado) => ESTADOS_COM_RASTREAMENTO.includes(e);
export const ehFinal = (e: EstadoChamado) => ESTADOS_FINAIS.includes(e);
export const temPrestador = (e: EstadoChamado) => ESTADOS_COM_PRESTADOR.includes(e);
