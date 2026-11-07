/** Conexão Socket.IO única, tipada com o contrato de @vrum/shared. */
import { io, type Socket } from 'socket.io-client';
import type { EventosCliente, EventosServidor } from '@vrum/shared';
import { API_URL, tokenAtual } from './api';

export type SocketVrum = Socket<EventosServidor, EventosCliente>;
let socket: SocketVrum | null = null;

export function conectar(): SocketVrum {
  if (socket) return socket;
  socket = io(API_URL, { auth: (cb) => cb({ token: tokenAtual() }), transports: ['websocket'], reconnectionDelayMax: 8000 });
  return socket;
}

export function desconectar() {
  socket?.disconnect();
  socket = null;
}

export const socketAtual = () => socket;

/** Entra na sala do chamado (e reentra a cada reconexão). Devolve a função de saída. */
export function acompanharChamado(chamadoId: string) {
  const s = conectar();
  const entrar = () => s.emit('chamado:entrar', { chamadoId }, () => undefined);
  entrar();
  s.on('connect', entrar);
  return () => {
    s.off('connect', entrar);
    s.emit('chamado:sair', { chamadoId });
  };
}
