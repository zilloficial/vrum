/**
 * Contrato dos eventos Socket.IO, compartilhado entre o app e a API.
 * Cada chamado tem uma sala "chamado:<id>" e só os participantes entram.
 */
import type { EstadoChamado, EventoChamado } from './chamado.js';

export interface PosicaoEnviada {
  chamadoId: string;
  lat: number;
  lng: number;
  precisaoM?: number;
  rumo?: number;
  velocidadeMs?: number;
  /** Momento da captura no aparelho (ISO). */
  capturadaEm: string;
}

export interface PosicaoRecebida extends Omit<PosicaoEnviada, 'chamadoId'> {
  chamadoId: string;
  usuarioId: string;
  papel: 'MOTORISTA' | 'PRESTADOR';
  recebidaEm: string;
}

export interface MensagemTempoReal {
  id: string;
  conversaId: string;
  autorId: string | null;
  tipo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'LOCALIZACAO' | 'PROPOSTA' | 'SISTEMA';
  conteudo: string | null;
  criadaEm: string;
}

export interface EventosServidor {
  'chamado:estado': (p: { chamadoId: string; estado: EstadoChamado; evento: EventoChamado; versao: number }) => void;
  'localizacao:posicao': (p: PosicaoRecebida) => void;
  'localizacao:compartilhamento': (p: { chamadoId: string; usuarioId: string; ativo: boolean; motivo?: string }) => void;
  'chat:mensagem': (p: MensagemTempoReal) => void;
  'chat:lida': (p: { conversaId: string; usuarioId: string; ate: string }) => void;
  'convite:novo': (p: { conviteId: string; chamadoId: string; expiraEm: string }) => void;
  'convite:encerrado': (p: { conviteId: string; motivo: 'ACEITO_POR_OUTRO' | 'EXPIRADO' | 'CANCELADO' }) => void;
  'notificacao:nova': (p: { id: string; tipo: string; titulo: string; corpo: string; chamadoId: string | null }) => void;
  erro: (p: { codigo: string; mensagem: string }) => void;
}

export type Ack = (r: { ok: true } | { ok: false; codigo: string; mensagem: string }) => void;

export interface EventosCliente {
  'chamado:entrar': (p: { chamadoId: string }, ack: Ack) => void;
  'chamado:sair': (p: { chamadoId: string }) => void;
  'localizacao:enviar': (p: PosicaoEnviada, ack?: Ack) => void;
  'localizacao:pausar': (p: { chamadoId: string }, ack?: Ack) => void;
  'localizacao:retomar': (p: { chamadoId: string }, ack?: Ack) => void;
}
