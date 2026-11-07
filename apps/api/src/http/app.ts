/** API HTTP (Fastify). Toda regra fica nos serviços; aqui só entrada, saída e autenticação. */
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { asc, eq } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { categorias } from '../db/schema.js';
import { despachar, Efeitos, ErroApp, type Contexto, type Emissor } from '../nucleo.js';
import * as chamadosSvc from '../servicos/chamados.js';
import * as chat from '../servicos/chat.js';
import * as contas from '../servicos/contas.js';
import * as loc from '../servicos/localizacao.js';
import * as notif from '../servicos/notificacoes.js';
import * as prest from '../servicos/prestadores.js';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string; admin?: boolean }; user: { sub: string; admin?: boolean } }
}

const coord = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const uuid = z.string().uuid();
const params = z.object({ id: uuid });

export function criarApp(ctx: Contexto, opts: { jwtSecret: string; corsOrigin?: string; emissor?: () => Emissor | undefined }) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: opts.corsOrigin ?? '*' });
  app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '30d' } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ErroApp) return reply.status(err.status).send({ codigo: err.codigo, mensagem: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ codigo: 'DADOS_INVALIDOS', mensagem: 'Dados inválidos.', detalhes: err.issues });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 401) return reply.status(401).send({ codigo: 'NAO_AUTENTICADO', mensagem: 'Entre novamente.' });
    if (status && status < 500) return reply.status(status).send({ codigo: 'REQUISICAO_INVALIDA', mensagem: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ codigo: 'ERRO_INTERNO', mensagem: 'Algo deu errado. Tente novamente.' });
  });

  const autenticado = async (req: FastifyRequest) => { await req.jwtVerify(); };
  const uid = (req: FastifyRequest) => req.user.sub;
  /** Executa um serviço com efeitos em tempo real e só os dispara após sucesso. */
  async function comEfeitos<T>(fn: (fx: Efeitos) => Promise<T>) {
    const fx = new Efeitos();
    const r = await fn(fx);
    despachar(fx, opts.emissor?.());
    return r;
  }

  // ── Contas ──
  app.post('/auth/cadastro', async (req, reply) => {
    const d = z.object({
      nome: z.string().min(2), telefone: z.string().min(10), email: z.string().email(), senha: z.string(), cidadeId: uuid.optional(),
    }).parse(req.body);
    const u = await contas.cadastrar(ctx, d);
    return reply.status(201).send({ usuario: u, token: app.jwt.sign({ sub: u.id }) });
  });

  app.post('/auth/entrar', async (req) => {
    const d = z.object({ login: z.string(), senha: z.string() }).parse(req.body);
    const u = await contas.entrar(ctx, d.login, d.senha);
    return { usuario: u, token: app.jwt.sign({ sub: u.id, admin: u.ehAdmin }) };
  });

  // ── Garagem ──
  const veiculoSchema = z.object({
    tipo: z.enum(['CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO', 'ONIBUS', 'MAQUINA_AGRICOLA']).optional(),
    marca: z.string().min(1), modelo: z.string().min(1), ano: z.number().int().min(1950).max(2100),
    versao: z.string().optional(), combustivel: z.string().optional(), cor: z.string().optional(),
    placa: z.string().optional(), fotoUrl: z.string().url().optional(), observacoes: z.string().optional(), principal: z.boolean().optional(),
  });
  app.get('/me/veiculos', { onRequest: autenticado }, (req) => contas.garagem(ctx, uid(req)));
  app.post('/me/veiculos', { onRequest: autenticado }, async (req, reply) =>
    reply.status(201).send(await contas.adicionarVeiculo(ctx, uid(req), veiculoSchema.parse(req.body))));
  app.post('/me/veiculos/:id/principal', { onRequest: autenticado }, async (req, reply) => {
    await contas.definirPrincipal(ctx, uid(req), params.parse(req.params).id);
    return reply.status(204).send();
  });

  // ── Catálogo e mapa ──
  app.get('/categorias', () => ctx.db.select().from(categorias).where(eq(categorias.ativa, true)).orderBy(asc(categorias.ordem)));

  app.get('/prestadores/proximos', async (req) => {
    const q = z.object({
      lat: z.coerce.number(), lng: z.coerce.number(), categoriaId: uuid.optional(),
      raioKm: z.coerce.number().optional(), disponiveis: z.coerce.boolean().optional(), movel: z.coerce.boolean().optional(),
    }).parse(req.query);
    return prest.prestadoresProximos(ctx, q, { categoriaId: q.categoriaId, raioKm: q.raioKm, apenasDisponiveis: q.disponiveis, movel: q.movel });
  });

  // ── Prestador ──
  app.post('/prestadores', { onRequest: autenticado }, async (req, reply) => {
    const d = z.object({
      tipo: z.enum(['AUTONOMO', 'EMPRESA']), nomeComercial: z.string().min(2), usuarioNome: z.string().regex(/^@?[a-z0-9_.]{3,30}$/i),
      cidadeId: uuid, baseLat: z.number().optional(), baseLng: z.number().optional(), raioCoberturaKm: z.number().positive().max(200).optional(),
      categorias: z.array(uuid).default([]), modalidade: z.enum(['NO_LOCAL', 'NA_OFICINA', 'AMBOS']).optional(),
    }).parse(req.body);
    return reply.status(201).send(await prest.criarPrestador(ctx, uid(req), d));
  });

  app.post('/prestadores/:id/disponibilidade', { onRequest: autenticado }, async (req) => {
    const d = z.object({ disponivel: z.boolean(), horas: z.number().positive().max(24).optional() }).parse(req.body);
    return prest.definirDisponibilidade(ctx, uid(req), params.parse(req.params).id, d.disponivel, d.horas);
  });

  app.get('/prestador/convites', { onRequest: autenticado }, (req) => chamadosSvc.convitesPendentes(ctx, uid(req)));
  app.post('/convites/:id/aceitar', { onRequest: autenticado }, (req) =>
    comEfeitos((fx) => chamadosSvc.aceitarConvite(ctx, fx, uid(req), params.parse(req.params).id)));
  app.post('/convites/:id/recusar', { onRequest: autenticado }, (req) =>
    comEfeitos((fx) => chamadosSvc.recusarConvite(ctx, fx, uid(req), params.parse(req.params).id)));

  // ── Chamados ──
  app.post('/chamados', { onRequest: autenticado }, async (req, reply) => {
    const d = z.object({
      veiculoId: uuid, categoriaId: uuid,
      modalidade: z.enum(['ESCOLHER_PROFISSIONAL', 'BUSCAR_DISPONIVEIS']),
      prestadorId: uuid.optional(),
      ponto: coord.extend({ referencia: z.string().max(300).optional() }),
      descricao: z.string().max(2000).optional(),
      anexos: z.array(z.object({ tipo: z.enum(['IMAGEM', 'AUDIO', 'VIDEO']), url: z.string().url() })).max(10).optional(),
      guincho: z.object({
        destinoEndereco: z.string().optional(), destinoLat: z.number().optional(), destinoLng: z.number().optional(),
        condicoesAcesso: z.string().optional(), veiculoSeMove: z.boolean().optional(),
      }).optional(),
    }).parse(req.body);
    return reply.status(201).send(await comEfeitos((fx) => chamadosSvc.criarChamado(ctx, fx, uid(req), d)));
  });

  app.get('/chamados/:id', { onRequest: autenticado }, (req) => chamadosSvc.obterChamado(ctx, uid(req), params.parse(req.params).id));

  app.post('/chamados/:id/acoes', { onRequest: autenticado }, async (req) => {
    const d = z.object({
      evento: z.string().refine(chamadosSvc.ehEventoDoApp, 'Ação desconhecida'),
      versao: z.number().int().optional(), motivo: z.string().max(1000).optional(),
      chegadaPrevistaEm: z.coerce.date().optional(), prestadorId: uuid.optional(),
    }).parse(req.body);
    const { evento, ...dados } = d;
    return comEfeitos((fx) => chamadosSvc.executarAcao(ctx, fx, uid(req), params.parse(req.params).id, evento as chamadosSvc.EventoDoApp, dados));
  });

  app.get('/chamados/:id/localizacao', { onRequest: autenticado }, (req) => loc.posicoesDoChamado(ctx, uid(req), params.parse(req.params).id));

  // ── Negociação e chat ──
  app.post('/chamados/:id/propostas', { onRequest: autenticado }, async (req, reply) => {
    const d = z.object({
      tipo: z.enum(['VALOR_SERVICO', 'TAXA_DESLOCAMENTO', 'AVALIACAO_PRESENCIAL', 'OUTRA']),
      valorCentavos: z.number().int().positive().optional(), descricao: z.string().max(500).optional(),
    }).parse(req.body);
    return reply.status(201).send(await comEfeitos((fx) => chat.proporCondicao(ctx, fx, uid(req), params.parse(req.params).id, d)));
  });
  app.post('/propostas/:id/responder', { onRequest: autenticado }, async (req) => {
    const d = z.object({ aceitar: z.boolean() }).parse(req.body);
    return comEfeitos((fx) => chat.responderCondicao(ctx, fx, uid(req), params.parse(req.params).id, d.aceitar));
  });

  app.get('/conversas/:id/mensagens', { onRequest: autenticado }, (req) => {
    const q = z.object({ depoisDe: z.coerce.date().optional() }).parse(req.query);
    return chat.listarMensagens(ctx, uid(req), params.parse(req.params).id, q.depoisDe);
  });
  app.post('/conversas/:id/mensagens', { onRequest: autenticado }, async (req, reply) => {
    const d = z.object({
      tipo: z.enum(['TEXTO', 'IMAGEM', 'AUDIO', 'LOCALIZACAO']), conteudo: z.string().max(4000).optional(),
      midiaUrl: z.string().url().optional(), lat: z.number().optional(), lng: z.number().optional(),
    }).parse(req.body);
    return reply.status(201).send(await comEfeitos((fx) => chat.enviarMensagem(ctx, fx, uid(req), params.parse(req.params).id, d)));
  });
  app.post('/conversas/:id/lida', { onRequest: autenticado }, async (req, reply) => {
    await comEfeitos((fx) => chat.marcarLeitura(ctx, fx, uid(req), params.parse(req.params).id));
    return reply.status(204).send();
  });

  // ── Notificações ──
  app.get('/notificacoes', { onRequest: autenticado }, (req) => notif.listarNotificacoes(ctx.db, uid(req)));
  app.post('/notificacoes/:id/lida', { onRequest: autenticado }, async (req, reply) => {
    await notif.marcarLida(ctx.db, uid(req), params.parse(req.params).id, ctx.agora());
    return reply.status(204).send();
  });

  // ── Administração ──
  app.post('/admin/chamados/:id/localizacao', { onRequest: autenticado }, (req) => {
    const d = z.object({ justificativa: z.string() }).parse(req.body);
    return loc.acessoAdministrativo(ctx, uid(req), params.parse(req.params).id, d.justificativa);
  });

  app.get('/saude', () => ({ ok: true }));
  return app;
}

export type App = ReturnType<typeof criarApp>;
export type { FastifyReply };
