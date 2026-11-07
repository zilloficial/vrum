/**
 * Rotas de conta, conteúdo, qualidade, equipe, arquivos e administração.
 * As rotas do núcleo (chamados, convites, chat, localização) ficam em app.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ESTADOS_CHAMADO } from '@vrum/shared';
import { cidades } from '../db/schema.js';
import { ErroApp, type Contexto, type Efeitos } from '../nucleo.js';
import * as admin from '../servicos/admin.js';
import * as conteudo from '../servicos/conteudo.js';
import * as equipe from '../servicos/equipe.js';
import * as qual from '../servicos/qualidade.js';
import type { Armazenamento } from '../servicos/armazenamento.js';

const uuid = z.string().uuid();
const params = z.object({ id: uuid });
const TIPOS_PERMITIDOS = /^(image\/(jpeg|png|webp|heic)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|aac|ogg|webm|x-m4a)|application\/pdf)$/;

export interface OpcoesExtras {
  pastaArquivos: string;
  urlPublica: string;
  armazenamento: Armazenamento;
  comEfeitos: <T>(fn: (fx: Efeitos) => Promise<T>) => Promise<T>;
}

export async function rotasExtras(app: FastifyInstance, ctx: Contexto, o: OpcoesExtras) {
  const autenticado = async (req: FastifyRequest) => { await req.jwtVerify(); };
  const opcional = async (req: FastifyRequest) => { try { await req.jwtVerify(); } catch { /* visitante */ } };
  const uid = (req: FastifyRequest) => req.user.sub;
  const uidOpcional = (req: FastifyRequest) => (req.user as { sub?: string } | undefined)?.sub;
  const soAdmin = async (req: FastifyRequest) => { await req.jwtVerify(); await admin.exigirAdmin(ctx, uid(req)); };

  // ── Arquivos: Supabase Storage em produção, disco local em desenvolvimento ──
  mkdirSync(o.pastaArquivos, { recursive: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  await app.register(fstatic, { root: resolve(o.pastaArquivos), prefix: '/arquivos/', decorateReply: false });

  app.post('/arquivos', { onRequest: autenticado }, async (req, reply) => {
    const f = await req.file();
    if (!f) throw new ErroApp('ARQUIVO_OBRIGATORIO', 'Envie um arquivo.');
    if (!TIPOS_PERMITIDOS.test(f.mimetype)) throw new ErroApp('TIPO_NAO_PERMITIDO', 'Formato não aceito. Use foto, vídeo, áudio ou PDF.');
    const tipo = f.mimetype.startsWith('image') ? 'IMAGEM' : f.mimetype.startsWith('video') ? 'VIDEO' : f.mimetype.startsWith('audio') ? 'AUDIO' : 'DOCUMENTO';
    const url = await o.armazenamento.salvar(f.file, {
      extensao: extname(f.filename).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6),
      tipoMime: f.mimetype,
      pasta: tipo === 'DOCUMENTO' ? 'documentos' : 'midias',
      conferir: () => { if (f.file.truncated) throw new ErroApp('ARQUIVO_GRANDE', 'Arquivo acima de 50 MB.'); },
    });
    return reply.status(201).send({ url, tipo });
  });

  // ── Conta ──
  app.get('/cidades', () => ctx.db.select().from(cidades).where(eq(cidades.ativa, true)).orderBy(cidades.nome));
  app.get('/me', { onRequest: autenticado }, (req) => equipe.eu(ctx, uid(req)));
  app.patch('/me', { onRequest: autenticado }, (req) => equipe.atualizarConta(ctx, uid(req), z.object({
    nome: z.string().min(2).optional(), fotoUrl: z.string().url().optional(), cidadeId: uuid.optional(),
    localManualLat: z.number().optional(), localManualLng: z.number().optional(),
  }).parse(req.body)));
  app.get('/me/chamados', { onRequest: autenticado }, (req) => equipe.chamadosDoMotorista(ctx, uid(req)));
  app.get('/me/conversas', { onRequest: autenticado }, (req) => equipe.minhasConversas(ctx, uid(req)));
  app.get('/me/salvos', { onRequest: autenticado }, (req) => conteudo.salvos(ctx, uid(req)));
  app.post('/me/dispositivos', { onRequest: autenticado }, async (req, reply) => {
    await equipe.registrarDispositivo(ctx, uid(req), z.object({
      plataforma: z.enum(['ANDROID', 'IOS', 'WEB']), token: z.string().min(10), inscricaoWeb: z.unknown().optional(),
    }).parse(req.body));
    return reply.status(204).send();
  });
  app.post('/usuarios/:id/bloqueio', { onRequest: autenticado }, (req) =>
    qual.bloquear(ctx, uid(req), params.parse(req.params).id, z.object({ bloquear: z.boolean() }).parse(req.body).bloquear));

  // ── Perfis e publicações ──
  app.get('/perfis/:ref', { onRequest: opcional }, (req) =>
    conteudo.perfilPublico(ctx, z.object({ ref: z.string() }).parse(req.params).ref, uidOpcional(req)));
  app.patch('/prestadores/:id', { onRequest: autenticado }, (req) => conteudo.atualizarPerfil(ctx, uid(req), params.parse(req.params).id, z.object({
    nomeComercial: z.string().min(2), apresentacao: z.string().max(2000), fotoUrl: z.string().url(), capaUrl: z.string().url(),
    enderecoComercial: z.string(), baseLat: z.number(), baseLng: z.number(), raioCoberturaKm: z.number().positive().max(200),
    modalidade: z.enum(['NO_LOCAL', 'NA_OFICINA', 'AMBOS']),
    veiculosAtendidos: z.array(z.enum(['CARRO', 'MOTO', 'CAMINHONETE', 'CAMINHAO', 'ONIBUS', 'MAQUINA_AGRICOLA'])),
    horarios: z.record(z.array(z.tuple([z.string(), z.string()]))), plantao: z.boolean(), infoDeslocamento: z.string(),
    categorias: z.array(uuid),
  }).partial().parse(req.body)));
  app.post('/prestadores/:id/seguir', { onRequest: autenticado }, (req) => conteudo.alternarSeguir(ctx, uid(req), params.parse(req.params).id));
  app.post('/prestadores/:id/conversa', { onRequest: autenticado }, (req) => equipe.conversaComPrestador(ctx, uid(req), params.parse(req.params).id));

  app.get('/publicacoes', { onRequest: opcional }, (req) => {
    const q = z.object({ prestadorId: uuid.optional(), antesDe: z.coerce.date().optional(), limite: z.coerce.number().optional() }).parse(req.query);
    return conteudo.feed(ctx, uidOpcional(req), q);
  });
  app.post('/prestadores/:id/publicacoes', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(
    await conteudo.publicar(ctx, uid(req), params.parse(req.params).id, z.object({
      descricao: z.string().max(2200).optional(), categoriaId: uuid.optional(),
      midias: z.array(z.object({ tipo: z.enum(['IMAGEM', 'VIDEO']), url: z.string().url(), miniaturaUrl: z.string().url().optional() })).min(1).max(10),
    }).parse(req.body))));
  app.delete('/publicacoes/:id', { onRequest: autenticado }, async (req, reply) => {
    await conteudo.removerPublicacao(ctx, uid(req), params.parse(req.params).id);
    return reply.status(204).send();
  });
  app.post('/publicacoes/:id/curtir', { onRequest: autenticado }, (req) => conteudo.alternarCurtida(ctx, uid(req), params.parse(req.params).id));
  app.post('/publicacoes/:id/salvar', { onRequest: autenticado }, (req) => conteudo.alternarSalvamento(ctx, uid(req), params.parse(req.params).id));
  app.get('/publicacoes/:id/comentarios', (req) => conteudo.listarComentarios(ctx, params.parse(req.params).id));
  app.post('/publicacoes/:id/comentarios', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(
    await conteudo.comentar(ctx, uid(req), params.parse(req.params).id, z.object({ texto: z.string().max(1000) }).parse(req.body).texto)));

  // ── Qualidade ──
  app.post('/chamados/:id/avaliacao', { onRequest: autenticado }, async (req, reply) => {
    const d = z.object({ nota: z.number().int().min(1).max(5), comentario: z.string().max(1000).optional() }).parse(req.body);
    return reply.status(201).send(await qual.avaliar(ctx, uid(req), params.parse(req.params).id, d.nota, d.comentario));
  });
  app.post('/chamados/:id/contestacao', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(
    await qual.contestarEncerrado(ctx, uid(req), params.parse(req.params).id, z.object({ motivo: z.string().min(5) }).parse(req.body).motivo)));
  app.post('/avaliacoes/:id/resposta', { onRequest: autenticado }, async (req, reply) => {
    await qual.responderAvaliacao(ctx, uid(req), params.parse(req.params).id, z.object({ resposta: z.string().max(1000) }).parse(req.body).resposta);
    return reply.status(204).send();
  });
  app.post('/denuncias', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(await qual.denunciar(ctx, uid(req), z.object({
    alvo: z.enum(['USUARIO', 'PRESTADOR', 'PUBLICACAO', 'COMENTARIO', 'MENSAGEM', 'AVALIACAO']), alvoId: uuid,
    motivo: z.string().min(3).max(200), detalhes: z.string().max(2000).optional(),
  }).parse(req.body))));

  // ── Empresa e equipe ──
  app.get('/prestadores/:id/equipe', { onRequest: autenticado }, (req) => equipe.listarEquipe(ctx, uid(req), params.parse(req.params).id));
  app.post('/prestadores/:id/equipe', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(
    await equipe.adicionarMembro(ctx, uid(req), params.parse(req.params).id, z.object({
      login: z.string().min(3), funcao: z.enum(['GESTOR', 'PROFISSIONAL']), atende: z.boolean().optional(),
    }).parse(req.body))));
  app.patch('/prestadores/:id/equipe/:membroId', { onRequest: autenticado }, (req) => {
    const p = z.object({ id: uuid, membroId: uuid }).parse(req.params);
    return equipe.alterarMembro(ctx, uid(req), p.id, p.membroId, z.object({
      funcao: z.enum(['GESTOR', 'PROFISSIONAL']), atende: z.boolean(), ativo: z.boolean(),
    }).partial().parse(req.body));
  });
  app.get('/prestadores/:id/chamados', { onRequest: autenticado }, (req) => {
    const q = z.object({ ativos: z.coerce.boolean().optional() }).parse(req.query);
    return equipe.chamadosDoPrestador(ctx, uid(req), params.parse(req.params).id, q.ativos);
  });
  app.post('/chamados/:id/responsavel', { onRequest: autenticado }, (req) => o.comEfeitos((fx) =>
    equipe.designarResponsavel(ctx, fx, uid(req), params.parse(req.params).id, z.object({ membroId: uuid }).parse(req.body).membroId)));
  app.get('/prestadores/:id/documentos', { onRequest: autenticado }, (req) => equipe.meusDocumentos(ctx, uid(req), params.parse(req.params).id));
  app.post('/prestadores/:id/documentos', { onRequest: autenticado }, async (req, reply) => reply.status(201).send(
    await equipe.enviarDocumento(ctx, uid(req), params.parse(req.params).id, z.object({ tipo: z.string().min(2), arquivoUrl: z.string().url() }).parse(req.body))));

  // ── Administração ──
  const a = (rota: string) => `/admin${rota}`;
  app.get(a('/resumo'), { onRequest: soAdmin }, () => admin.resumo(ctx));
  app.get(a('/usuarios'), { onRequest: soAdmin }, (req) => admin.listarUsuarios(ctx, z.object({ busca: z.string().optional() }).parse(req.query).busca));
  app.post(a('/usuarios/:id/suspensao'), { onRequest: soAdmin }, async (req, reply) => {
    const d = z.object({ suspender: z.boolean(), motivo: z.string().optional() }).parse(req.body);
    await admin.suspenderUsuario(ctx, uid(req), params.parse(req.params).id, d.suspender, d.motivo);
    return reply.status(204).send();
  });
  app.get(a('/prestadores'), { onRequest: soAdmin }, (req) => admin.listarPrestadores(ctx, z.object({ busca: z.string().optional() }).parse(req.query).busca));
  app.post(a('/prestadores/:id/verificacao'), { onRequest: soAdmin }, async (req, reply) => {
    await admin.definirVerificacao(ctx, uid(req), params.parse(req.params).id, z.object({ verificado: z.boolean() }).parse(req.body).verificado);
    return reply.status(204).send();
  });
  app.get(a('/documentos'), { onRequest: soAdmin }, () => admin.documentosPendentes(ctx));
  app.post(a('/documentos/:id/analise'), { onRequest: soAdmin }, (req) => {
    const d = z.object({ aprovar: z.boolean(), observacao: z.string().optional() }).parse(req.body);
    return admin.analisarDocumento(ctx, uid(req), params.parse(req.params).id, d.aprovar, d.observacao);
  });
  app.get(a('/categorias'), { onRequest: soAdmin }, () => admin.listarCategorias(ctx));
  app.post(a('/categorias'), { onRequest: soAdmin }, (req) => admin.salvarCategoria(ctx, uid(req), z.object({
    id: uuid.optional(), slug: z.string().regex(/^[a-z0-9-]+$/), nome: z.string().min(2), fluxo: z.enum(['IMEDIATO', 'AGENDADO', 'TRIAGEM']),
    exemplos: z.array(z.string()).optional(), exigeDadosGuincho: z.boolean().optional(), ordem: z.number().int().optional(), ativa: z.boolean().optional(),
  }).parse(req.body)));
  app.get(a('/cidades'), { onRequest: soAdmin }, () => admin.listarCidades(ctx));
  app.post(a('/cidades'), { onRequest: soAdmin }, (req) => admin.salvarCidade(ctx, uid(req), z.object({
    id: uuid.optional(), nome: z.string().min(2), uf: z.string().length(2), lat: z.number(), lng: z.number(), ativa: z.boolean().optional(),
  }).parse(req.body)));
  app.get(a('/planos'), { onRequest: soAdmin }, () => admin.listarPlanos(ctx));
  app.post(a('/planos'), { onRequest: soAdmin }, (req) => admin.salvarPlano(ctx, uid(req), z.object({
    id: uuid.optional(), nome: z.string().min(2), precoCentavos: z.number().int().min(0), beneficios: z.array(z.string()), ativo: z.boolean().optional(),
  }).parse(req.body)));
  app.get(a('/chamados'), { onRequest: soAdmin }, (req) => admin.listarChamados(ctx, z.object({
    estado: z.enum(ESTADOS_CHAMADO).optional(), ativos: z.coerce.boolean().optional(),
  }).parse(req.query)));
  app.post(a('/chamados/:id/cancelar'), { onRequest: soAdmin }, (req) => o.comEfeitos((fx) =>
    admin.cancelarChamado(ctx, fx, uid(req), params.parse(req.params).id, z.object({ motivo: z.string().min(5) }).parse(req.body).motivo)));
  app.get(a('/denuncias'), { onRequest: soAdmin }, (req) => admin.listarDenuncias(ctx, z.object({ todas: z.coerce.boolean().optional() }).parse(req.query).todas !== true));
  app.post(a('/denuncias/:id/resolver'), { onRequest: soAdmin }, (req) =>
    admin.resolverDenuncia(ctx, uid(req), params.parse(req.params).id, z.object({ procedente: z.boolean() }).parse(req.body).procedente));
  app.get(a('/contestacoes'), { onRequest: soAdmin }, () => admin.listarContestacoes(ctx));
  app.post(a('/contestacoes/:id/resolver'), { onRequest: soAdmin }, (req) => {
    const d = z.object({ procedente: z.boolean(), resolucao: z.string().min(3) }).parse(req.body);
    return admin.resolverContestacao(ctx, uid(req), params.parse(req.params).id, d.procedente, d.resolucao);
  });
  app.get(a('/avaliacoes'), { onRequest: soAdmin }, () => admin.avaliacoesRecentes(ctx));
  app.post(a('/avaliacoes/:id/ocultar'), { onRequest: soAdmin }, async (req, reply) => {
    await qual.ocultarAvaliacao(ctx, params.parse(req.params).id, z.object({ ocultar: z.boolean() }).parse(req.body).ocultar);
    return reply.status(204).send();
  });
  app.get(a('/regras'), { onRequest: soAdmin }, () => admin.lerRegras(ctx));
  app.put(a('/regras'), { onRequest: soAdmin }, (req) => admin.salvarRegras(ctx, uid(req), z.object({
    prazoConviteSeg: z.number().int().min(15).max(3600), raiosBuscaKm: z.array(z.number().positive()).min(1).max(8),
    prestadoresPorEtapa: z.number().int().min(1).max(50), autoConcluirMin: z.number().int().min(5),
    abandonoHoras: z.number().min(1).max(72), validadeDisponibilidadeHoras: z.number().min(1).max(24),
    posicaoMaxIdadeSeg: z.number().int().min(30).max(900),
  }).partial().parse(req.body)));
  app.get(a('/auditoria'), { onRequest: soAdmin }, () => admin.auditoria(ctx));
}
