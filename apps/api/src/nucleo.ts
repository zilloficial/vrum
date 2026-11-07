/**
 * Peças comuns aos serviços: erros de negócio, regras configuráveis,
 * relógio injetável e o coletor de efeitos em tempo real.
 */
import type { EventosServidor } from '@vrum/shared';
import type { Db } from './db/cliente.js';

export class ErroApp extends Error {
  constructor(
    public codigo: string,
    mensagem: string,
    public status = 400,
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (o = 'Registro') => new ErroApp('NAO_ENCONTRADO', `${o} não encontrado.`, 404);
export const proibido = (m = 'Sem permissão para esta ação.') => new ErroApp('PROIBIDO', m, 403);
export const conflito = (m: string, codigo = 'CONFLITO') => new ErroApp(codigo, m, 409);

/** Prazos e regras (seção 16: configuráveis pelo administrador). */
export interface Regras {
  prazoConviteSeg: number;
  /** Raio de cada etapa da busca por disponíveis, em km. */
  raiosBuscaKm: number[];
  prestadoresPorEtapa: number;
  autoConcluirMin: number;
  abandonoHoras: number;
  validadeDisponibilidadeHoras: number;
  /** Posição mais antiga que isto é recusada no envio. */
  posicaoMaxIdadeSeg: number;
}

export const REGRAS_PADRAO: Regras = {
  prazoConviteSeg: 90,
  raiosBuscaKm: [3, 8, 15, 30],
  prestadoresPorEtapa: 5,
  autoConcluirMin: 60,
  abandonoHoras: 6,
  validadeDisponibilidadeHoras: 8,
  posicaoMaxIdadeSeg: 120,
};

export interface Contexto {
  db: Db;
  regras: Regras;
  agora: () => Date;
}

export const somarSeg = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

type Envio = { [K in keyof EventosServidor]: { evento: K; payload: Parameters<EventosServidor[K]>[0] } }[keyof EventosServidor];

/**
 * Efeitos em tempo real são coletados durante a transação e só despachados
 * depois do commit — nunca se avisa algo que pode ser desfeito.
 */
export class Efeitos {
  readonly fila: ({ sala: string } & Envio)[] = [];

  paraUsuario<K extends keyof EventosServidor>(usuarioId: string, evento: K, payload: Parameters<EventosServidor[K]>[0]) {
    this.fila.push({ sala: `usuario:${usuarioId}`, evento, payload } as { sala: string } & Envio);
  }

  paraChamado<K extends keyof EventosServidor>(chamadoId: string, evento: K, payload: Parameters<EventosServidor[K]>[0]) {
    this.fila.push({ sala: `chamado:${chamadoId}`, evento, payload } as { sala: string } & Envio);
  }
}

export interface Emissor {
  emitir(sala: string, evento: string, payload: unknown): void;
}

export function despachar(fx: Efeitos, emissor?: Emissor) {
  if (!emissor) return;
  for (const e of fx.fila) emissor.emitir(e.sala, e.evento, e.payload);
}
