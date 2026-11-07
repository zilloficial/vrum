/**
 * Socket.IO: estados, chat e posições em tempo real.
 *
 * Salas:
 *  - usuario:<id>  → avisos pessoais (convites, notificações);
 *  - chamado:<id>  → estado e chat, para os participantes do chamado;
 *  - rastreio:<id> → posições, SOMENTE motorista e profissional responsável.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import type { EventosCliente, EventosServidor } from '@vrum/shared';
import { chamados, membrosPrestador } from '../db/schema.js';
import { despachar, Efeitos, ErroApp, type Contexto, type Emissor } from '../nucleo.js';
import { definirPausa, papelNoRastreamento, registrarPosicao } from '../servicos/localizacao.js';

type Sock = Socket<EventosCliente, EventosServidor, Record<string, never>, { usuarioId: string }>;

function falha(e: unknown) {
  if (e instanceof ErroApp) return { ok: false as const, codigo: e.codigo, mensagem: e.message };
  console.error(e);
  return { ok: false as const, codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado.' };
}

export function criarTempoReal(
  http: HttpServer, ctx: Contexto,
  verificarToken: (token: string) => { sub: string },
  corsOrigin = '*',
) {
  const io = new Server<EventosCliente, EventosServidor, Record<string, never>, { usuarioId: string }>(http, {
    cors: { origin: corsOrigin },
  });
  const emissor: Emissor = { emitir: (sala, ev, p) => io.to(sala).emit(ev as keyof EventosServidor, p as never) };

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('sem token');
      socket.data.usuarioId = verificarToken(token).sub;
      next();
    } catch {
      next(new Error('NAO_AUTENTICADO'));
    }
  });

  io.on('connection', (socket: Sock) => {
    const usuarioId = socket.data.usuarioId;
    void socket.join(`usuario:${usuarioId}`);

    socket.on('chamado:entrar', async ({ chamadoId }, ack) => {
      try {
        const [ch] = await ctx.db.select().from(chamados).where(eq(chamados.id, chamadoId));
        if (!ch) throw new ErroApp('NAO_ENCONTRADO', 'Chamado não encontrado.', 404);
        let participa = ch.motoristaId === usuarioId;
        if (!participa && ch.prestadorId) {
          const m = await ctx.db.select({ id: membrosPrestador.id }).from(membrosPrestador).where(and(
            eq(membrosPrestador.prestadorId, ch.prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true),
          ));
          participa = m.length > 0;
        }
        if (!participa) throw new ErroApp('PROIBIDO', 'Você não participa deste chamado.', 403);
        await socket.join(`chamado:${ch.id}`);
        if (await papelNoRastreamento(ctx.db, ch, usuarioId)) await socket.join(`rastreio:${ch.id}`);
        ack({ ok: true });
      } catch (e) {
        ack(falha(e));
      }
    });

    socket.on('chamado:sair', ({ chamadoId }) => {
      void socket.leave(`chamado:${chamadoId}`);
      void socket.leave(`rastreio:${chamadoId}`);
    });

    socket.on('localizacao:enviar', async (p, ack) => {
      try {
        const pos = await registrarPosicao(ctx, usuarioId, p);
        socket.to(`rastreio:${pos.chamadoId}`).emit('localizacao:posicao', pos);
        ack?.({ ok: true });
      } catch (e) {
        ack?.(falha(e));
      }
    });

    for (const [evento, pausar] of [['localizacao:pausar', true], ['localizacao:retomar', false]] as const) {
      socket.on(evento, async ({ chamadoId }, ack) => {
        try {
          const fx = new Efeitos();
          await definirPausa(ctx, fx, usuarioId, chamadoId, pausar);
          despachar(fx, emissor);
          ack?.({ ok: true });
        } catch (e) {
          ack?.(falha(e));
        }
      });
    }
  });

  return { io, emissor };
}
