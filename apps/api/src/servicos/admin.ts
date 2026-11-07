/**
 * Painel administrativo (seção 16). Toda ação de escrita fica registrada em
 * registros_admin. Localização tem rota própria, com justificativa.
 */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { ESTADOS_ATIVOS, type EstadoChamado } from '@vrum/shared';
import {
  avaliacoes, categorias, chamados, cidades, comentarios, configuracoes, contestacoes, denuncias, documentosVerificacao,
  planos, prestadores, publicacoes, registrosAdmin, usuarios,
} from '../db/schema.js';
import { ErroApp, Efeitos, naoEncontrado, proibido, type Contexto, type Regras } from '../nucleo.js';
import { aplicarTransicao } from './chamados.js';
import { ocultarAvaliacao } from './qualidade.js';

export async function exigirAdmin(ctx: Contexto, usuarioId: string) {
  const [u] = await ctx.db.select({ ehAdmin: usuarios.ehAdmin }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u?.ehAdmin) throw proibido('Área restrita à administração.');
}

async function registrar(ctx: Contexto, adminId: string, acao: string, alvo: string, alvoId: string, dados?: unknown) {
  await ctx.db.insert(registrosAdmin).values({ adminId, acao, alvo, alvoId, dados: dados ?? null });
}

export async function resumo(ctx: Contexto) {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const c = sql<number>`count(*)::int`;
  return {
    usuarios: await n(ctx.db.select({ n: c }).from(usuarios)),
    prestadores: await n(ctx.db.select({ n: c }).from(prestadores)),
    chamadosAtivos: await n(ctx.db.select({ n: c }).from(chamados).where(inArray(chamados.estado, [...ESTADOS_ATIVOS]))),
    chamadosHoje: await n(ctx.db.select({ n: c }).from(chamados).where(sql`${chamados.criadoEm} >= date_trunc('day', now())`)),
    documentosPendentes: await n(ctx.db.select({ n: c }).from(documentosVerificacao).where(eq(documentosVerificacao.estado, 'ENVIADO'))),
    denunciasAbertas: await n(ctx.db.select({ n: c }).from(denuncias).where(inArray(denuncias.estado, ['ABERTA', 'EM_ANALISE']))),
    contestacoesAbertas: await n(ctx.db.select({ n: c }).from(contestacoes).where(inArray(contestacoes.estado, ['ABERTA', 'EM_ANALISE']))),
    porEstado: await ctx.db.select({ estado: chamados.estado, n: c }).from(chamados).groupBy(chamados.estado),
  };
}

// ── Pessoas ──
export function listarUsuarios(ctx: Contexto, busca?: string) {
  const b = busca ? `%${busca}%` : undefined;
  return ctx.db.select({
    id: usuarios.id, nome: usuarios.nome, email: usuarios.email, telefone: usuarios.telefone, ehAdmin: usuarios.ehAdmin,
    suspensoEm: usuarios.suspensoEm, criadoEm: usuarios.criadoEm,
  }).from(usuarios)
    .where(b ? or(ilike(usuarios.nome, b), ilike(usuarios.email, b), ilike(usuarios.telefone, b)) : undefined)
    .orderBy(desc(usuarios.criadoEm)).limit(200);
}

export async function suspenderUsuario(ctx: Contexto, adminId: string, usuarioId: string, suspender: boolean, motivo?: string) {
  if (adminId === usuarioId) throw new ErroApp('INVALIDO', 'Você não pode suspender a própria conta.');
  await ctx.db.update(usuarios).set({ suspensoEm: suspender ? ctx.agora() : null }).where(eq(usuarios.id, usuarioId));
  await registrar(ctx, adminId, suspender ? 'SUSPENDER' : 'REATIVAR', 'usuario', usuarioId, { motivo });
}

export function listarPrestadores(ctx: Contexto, busca?: string) {
  const b = busca ? `%${busca}%` : undefined;
  return ctx.db.select({
    id: prestadores.id, nomeComercial: prestadores.nomeComercial, usuarioNome: prestadores.usuarioNome, tipo: prestadores.tipo,
    verificadoEm: prestadores.verificadoEm, notaMedia: prestadores.notaMedia, totalAvaliacoes: prestadores.totalAvaliacoes,
    cidade: cidades.nome, criadoEm: prestadores.criadoEm,
    documentosPendentes: sql<number>`(select count(*)::int from ${documentosVerificacao} d where d.prestador_id = ${prestadores.id} and d.estado = 'ENVIADO')`,
  }).from(prestadores).innerJoin(cidades, eq(cidades.id, prestadores.cidadeId))
    .where(b ? or(ilike(prestadores.nomeComercial, b), ilike(prestadores.usuarioNome, b)) : undefined)
    .orderBy(desc(prestadores.criadoEm)).limit(200);
}

/** O selo vem só da verificação de documentos — nunca de plano pago (seção 18). */
export async function definirVerificacao(ctx: Contexto, adminId: string, prestadorId: string, verificado: boolean) {
  await ctx.db.update(prestadores).set({ verificadoEm: verificado ? ctx.agora() : null }).where(eq(prestadores.id, prestadorId));
  await registrar(ctx, adminId, verificado ? 'VERIFICAR' : 'REMOVER_VERIFICACAO', 'prestador', prestadorId);
}

export function documentosPendentes(ctx: Contexto) {
  return ctx.db.select({ doc: documentosVerificacao, prestador: prestadores.nomeComercial })
    .from(documentosVerificacao).innerJoin(prestadores, eq(prestadores.id, documentosVerificacao.prestadorId))
    .where(eq(documentosVerificacao.estado, 'ENVIADO')).orderBy(documentosVerificacao.criadoEm);
}

export async function analisarDocumento(ctx: Contexto, adminId: string, docId: string, aprovar: boolean, observacao?: string) {
  const [d] = await ctx.db.update(documentosVerificacao)
    .set({ estado: aprovar ? 'APROVADO' : 'REPROVADO', observacao, analisadoPor: adminId, analisadoEm: ctx.agora() })
    .where(eq(documentosVerificacao.id, docId)).returning();
  if (!d) throw naoEncontrado('Documento');
  await registrar(ctx, adminId, aprovar ? 'APROVAR_DOCUMENTO' : 'REPROVAR_DOCUMENTO', 'documento', docId, { observacao });
  return d;
}

// ── Catálogo, cidades e planos ──
export function listarCategorias(ctx: Contexto) {
  return ctx.db.select().from(categorias).orderBy(categorias.ordem);
}

export async function salvarCategoria(ctx: Contexto, adminId: string, d: {
  id?: string; slug: string; nome: string; fluxo: 'IMEDIATO' | 'AGENDADO' | 'TRIAGEM'; exemplos?: string[];
  exigeDadosGuincho?: boolean; ordem?: number; ativa?: boolean;
}) {
  const { id, ...v } = d;
  const [c] = id
    ? await ctx.db.update(categorias).set(v).where(eq(categorias.id, id)).returning()
    : await ctx.db.insert(categorias).values(v).returning();
  if (!c) throw naoEncontrado('Categoria');
  await registrar(ctx, adminId, id ? 'EDITAR_CATEGORIA' : 'CRIAR_CATEGORIA', 'categoria', c.id, v);
  return c;
}

export function listarCidades(ctx: Contexto) {
  return ctx.db.select().from(cidades).orderBy(desc(cidades.ativa), cidades.nome);
}

export async function salvarCidade(ctx: Contexto, adminId: string, d: { id?: string; nome: string; uf: string; lat: number; lng: number; ativa?: boolean }) {
  const { id, ...v } = d;
  const slug = `${v.nome}-${v.uf}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [c] = id
    ? await ctx.db.update(cidades).set({ ...v, slug }).where(eq(cidades.id, id)).returning()
    : await ctx.db.insert(cidades).values({ ...v, slug }).returning();
  if (!c) throw naoEncontrado('Cidade');
  await registrar(ctx, adminId, id ? 'EDITAR_CIDADE' : 'CRIAR_CIDADE', 'cidade', c.id, v);
  return c;
}

export function listarPlanos(ctx: Contexto) {
  return ctx.db.select().from(planos);
}

export async function salvarPlano(ctx: Contexto, adminId: string, d: { id?: string; nome: string; precoCentavos: number; beneficios: unknown; ativo?: boolean }) {
  const { id, ...v } = d;
  const [p] = id ? await ctx.db.update(planos).set(v).where(eq(planos.id, id)).returning() : await ctx.db.insert(planos).values(v).returning();
  if (!p) throw naoEncontrado('Plano');
  await registrar(ctx, adminId, id ? 'EDITAR_PLANO' : 'CRIAR_PLANO', 'plano', p.id, v);
  return p;
}

// ── Chamados ──
export function listarChamados(ctx: Contexto, f: { estado?: EstadoChamado; ativos?: boolean } = {}) {
  return ctx.db.select({
    id: chamados.id, estado: chamados.estado, criadoEm: chamados.criadoEm, descricao: chamados.descricao,
    categoria: categorias.nome, motorista: usuarios.nome, prestador: prestadores.nomeComercial,
  }).from(chamados)
    .innerJoin(categorias, eq(categorias.id, chamados.categoriaId))
    .innerJoin(usuarios, eq(usuarios.id, chamados.motoristaId))
    .leftJoin(prestadores, eq(prestadores.id, chamados.prestadorId))
    .where(and(
      f.estado ? eq(chamados.estado, f.estado) : undefined,
      f.ativos ? inArray(chamados.estado, [...ESTADOS_ATIVOS]) : undefined,
    )).orderBy(desc(chamados.criadoEm)).limit(200);
}

export async function cancelarChamado(ctx: Contexto, fx: Efeitos, adminId: string, chamadoId: string, motivo: string) {
  const r = await ctx.db.transaction(async (tx) => {
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId)).for('update');
    if (!ch) throw naoEncontrado('Chamado');
    const agora = ctx.agora();
    return aplicarTransicao(tx, fx, ctx, ch, 'CANCELAR', { tipo: 'ADMIN', id: adminId }, {
      mudancas: { canceladoEm: agora, canceladoPor: 'ADMIN', motivoCancelamento: `Encerrado pelo suporte: ${motivo}` }, dados: { motivo },
    });
  });
  await registrar(ctx, adminId, 'CANCELAR_CHAMADO', 'chamado', chamadoId, { motivo });
  return r;
}

// ── Moderação ──
export function listarDenuncias(ctx: Contexto, abertas = true) {
  return ctx.db.select({ denuncia: denuncias, autor: usuarios.nome }).from(denuncias)
    .innerJoin(usuarios, eq(usuarios.id, denuncias.autorId))
    .where(abertas ? inArray(denuncias.estado, ['ABERTA', 'EM_ANALISE']) : undefined)
    .orderBy(desc(denuncias.criadaEm)).limit(200);
}

/** Denúncia procedente remove o conteúdo (publicação, comentário ou avaliação). */
export async function resolverDenuncia(ctx: Contexto, adminId: string, denunciaId: string, procedente: boolean) {
  const [d] = await ctx.db.update(denuncias)
    .set({ estado: procedente ? 'PROCEDENTE' : 'IMPROCEDENTE', resolvidaPor: adminId, resolvidaEm: ctx.agora() })
    .where(eq(denuncias.id, denunciaId)).returning();
  if (!d) throw naoEncontrado('Denúncia');
  if (procedente) {
    const agora = ctx.agora();
    if (d.alvo === 'PUBLICACAO') await ctx.db.update(publicacoes).set({ removidaEm: agora }).where(eq(publicacoes.id, d.alvoId));
    if (d.alvo === 'COMENTARIO') await ctx.db.update(comentarios).set({ removidoEm: agora }).where(eq(comentarios.id, d.alvoId));
    if (d.alvo === 'AVALIACAO') await ocultarAvaliacao(ctx, d.alvoId, true);
  }
  await registrar(ctx, adminId, procedente ? 'DENUNCIA_PROCEDENTE' : 'DENUNCIA_IMPROCEDENTE', 'denuncia', denunciaId);
  return d;
}

export function listarContestacoes(ctx: Contexto) {
  return ctx.db.select({ contestacao: contestacoes, autor: usuarios.nome, estadoChamado: chamados.estado })
    .from(contestacoes).innerJoin(usuarios, eq(usuarios.id, contestacoes.autorId))
    .innerJoin(chamados, eq(chamados.id, contestacoes.chamadoId))
    .orderBy(desc(contestacoes.criadaEm)).limit(200);
}

export async function resolverContestacao(ctx: Contexto, adminId: string, id: string, procedente: boolean, resolucao: string) {
  const [c] = await ctx.db.update(contestacoes)
    .set({ estado: procedente ? 'PROCEDENTE' : 'IMPROCEDENTE', resolucao, resolvidaEm: ctx.agora() })
    .where(eq(contestacoes.id, id)).returning();
  if (!c) throw naoEncontrado('Contestação');
  await registrar(ctx, adminId, 'RESOLVER_CONTESTACAO', 'contestacao', id, { procedente, resolucao });
  return c;
}

export function avaliacoesRecentes(ctx: Contexto) {
  return ctx.db.select({ avaliacao: avaliacoes, autor: usuarios.nome, prestador: prestadores.nomeComercial })
    .from(avaliacoes).innerJoin(usuarios, eq(usuarios.id, avaliacoes.autorId))
    .leftJoin(prestadores, eq(prestadores.id, avaliacoes.prestadorId))
    .where(isNull(avaliacoes.ocultadaEm)).orderBy(desc(avaliacoes.criadaEm)).limit(100);
}

// ── Configuração e auditoria ──
export async function lerRegras(ctx: Contexto) {
  return ctx.regras;
}

/** Altera prazos e regras; vale imediatamente e fica gravado no banco. */
export async function salvarRegras(ctx: Contexto, adminId: string, novas: Partial<Regras>) {
  for (const [chave, valor] of Object.entries(novas)) {
    if (!(chave in ctx.regras)) throw new ErroApp('REGRA_DESCONHECIDA', `Regra desconhecida: ${chave}`);
    await ctx.db.insert(configuracoes).values({ chave, valor }).onConflictDoUpdate({ target: configuracoes.chave, set: { valor } });
  }
  Object.assign(ctx.regras, novas);
  await registrar(ctx, adminId, 'ALTERAR_REGRAS', 'configuracao', '*', novas);
  return ctx.regras;
}

/** Carrega do banco as regras gravadas pelo painel (na inicialização). */
export async function carregarRegras(ctx: Contexto) {
  const linhas = await ctx.db.select().from(configuracoes);
  for (const l of linhas) if (l.chave in ctx.regras) (ctx.regras as unknown as Record<string, unknown>)[l.chave] = l.valor;
  return ctx.regras;
}

export function auditoria(ctx: Contexto) {
  return ctx.db.select({ registro: registrosAdmin, admin: usuarios.nome }).from(registrosAdmin)
    .innerJoin(usuarios, eq(usuarios.id, registrosAdmin.adminId))
    .orderBy(desc(registrosAdmin.criadoEm)).limit(300);
}
