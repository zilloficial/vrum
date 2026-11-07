/** Conta do usuário, equipe da empresa, históricos e conversas (seções 3, 11 e 12). */
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { ESTADOS_ATIVOS } from '@vrum/shared';
import {
  categorias, chamados, compartilhamentosLocalizacao, conversas, dispositivos, documentosVerificacao,
  membrosPrestador, mensagens, participantesConversa, prestadores, usuarios, veiculos,
} from '../db/schema.js';
import { ErroApp, Efeitos, conflito, naoEncontrado, proibido, type Contexto } from '../nucleo.js';
import { exigirGestao } from './conteudo.js';
import { adicionarParticipante, mensagemSistema } from './chat.js';
import { violouUnico } from './chamados.js';

/** Dados da conta e de todas as áreas que a pessoa pode alternar (motorista e prestador). */
export async function eu(ctx: Contexto, usuarioId: string) {
  const [u] = await ctx.db.select({
    id: usuarios.id, nome: usuarios.nome, email: usuarios.email, telefone: usuarios.telefone, fotoUrl: usuarios.fotoUrl,
    cidadeId: usuarios.cidadeId, ehAdmin: usuarios.ehAdmin, localManualLat: usuarios.localManualLat, localManualLng: usuarios.localManualLng,
  }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u) throw naoEncontrado('Usuário');
  const vinculos = await ctx.db.select({
    membroId: membrosPrestador.id, funcao: membrosPrestador.funcao, atende: membrosPrestador.atende,
    disponivel: membrosPrestador.disponivel, disponivelAte: membrosPrestador.disponivelAte, chamadoAtualId: membrosPrestador.chamadoAtualId,
    prestador: { id: prestadores.id, nomeComercial: prestadores.nomeComercial, usuarioNome: prestadores.usuarioNome, tipo: prestadores.tipo, fotoUrl: prestadores.fotoUrl, verificado: sql<boolean>`${prestadores.verificadoEm} is not null` },
  }).from(membrosPrestador).innerJoin(prestadores, eq(prestadores.id, membrosPrestador.prestadorId))
    .where(and(eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true)));
  const agora = ctx.agora();
  return {
    ...u,
    vinculos: vinculos.map((v) => ({ ...v, disponivel: v.disponivel && !!v.disponivelAte && v.disponivelAte > agora })),
  };
}

export async function atualizarConta(ctx: Contexto, usuarioId: string, d: Partial<{ nome: string; fotoUrl: string; cidadeId: string; localManualLat: number; localManualLng: number }>) {
  await ctx.db.update(usuarios).set(d).where(eq(usuarios.id, usuarioId));
  return eu(ctx, usuarioId);
}

// ───────────────────────────── Equipe ─────────────────────────────

export async function listarEquipe(ctx: Contexto, usuarioId: string, prestadorId: string) {
  await exigirGestao(ctx.db, usuarioId, prestadorId);
  return ctx.db.select({
    id: membrosPrestador.id, funcao: membrosPrestador.funcao, atende: membrosPrestador.atende, ativo: membrosPrestador.ativo,
    disponivel: membrosPrestador.disponivel, disponivelAte: membrosPrestador.disponivelAte, chamadoAtualId: membrosPrestador.chamadoAtualId,
    usuario: { id: usuarios.id, nome: usuarios.nome, telefone: usuarios.telefone, fotoUrl: usuarios.fotoUrl },
  }).from(membrosPrestador).innerJoin(usuarios, eq(usuarios.id, membrosPrestador.usuarioId))
    .where(eq(membrosPrestador.prestadorId, prestadorId)).orderBy(membrosPrestador.criadoEm);
}

/** Adiciona um funcionário que já tem conta no VRUM (busca por e-mail ou telefone). */
export async function adicionarMembro(ctx: Contexto, usuarioId: string, prestadorId: string, d: { login: string; funcao: 'GESTOR' | 'PROFISSIONAL'; atende?: boolean }) {
  await exigirGestao(ctx.db, usuarioId, prestadorId);
  const l = d.login.trim().toLowerCase();
  const [alvo] = await ctx.db.select().from(usuarios).where(or(eq(usuarios.email, l), eq(usuarios.telefone, l.replace(/\D/g, '') || l)));
  if (!alvo) throw new ErroApp('USUARIO_NAO_ENCONTRADO', 'Peça para o funcionário criar uma conta no VRUM primeiro.', 404);
  try {
    const [m] = await ctx.db.insert(membrosPrestador).values({ prestadorId, usuarioId: alvo.id, funcao: d.funcao, atende: d.atende ?? true }).returning();
    return m!;
  } catch (e) {
    if (violouUnico(e)) throw conflito('Esta pessoa já faz parte da equipe.');
    throw e;
  }
}

export async function alterarMembro(ctx: Contexto, usuarioId: string, prestadorId: string, membroId: string, d: Partial<{ funcao: 'GESTOR' | 'PROFISSIONAL'; atende: boolean; ativo: boolean }>) {
  await exigirGestao(ctx.db, usuarioId, prestadorId);
  const [m] = await ctx.db.select().from(membrosPrestador).where(and(eq(membrosPrestador.id, membroId), eq(membrosPrestador.prestadorId, prestadorId)));
  if (!m) throw naoEncontrado('Membro');
  if (m.funcao === 'DONO') throw proibido('O dono não pode ser alterado por aqui.');
  if (d.ativo === false && m.chamadoAtualId) throw conflito('Este profissional está em atendimento. Redistribua o chamado antes.');
  const [r] = await ctx.db.update(membrosPrestador).set({ ...d, ...(d.ativo === false || d.atende === false ? { disponivel: false } : {}) })
    .where(eq(membrosPrestador.id, membroId)).returning();
  return r!;
}

/**
 * Distribuição de chamados: a gestão troca o profissional responsável antes da saída.
 * A ocupação passa para o novo profissional e, se o rastreamento já estava aberto,
 * o compartilhamento do anterior é encerrado e o do novo, aberto.
 */
export async function designarResponsavel(ctx: Contexto, fx: Efeitos, usuarioId: string, chamadoId: string, membroId: string) {
  return ctx.db.transaction(async (tx) => {
    const [ch] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId)).for('update');
    if (!ch?.prestadorId) throw naoEncontrado('Chamado');
    await exigirGestao(tx, usuarioId, ch.prestadorId);
    if (!['ACEITO_COMBINANDO', 'CONFIRMADO'].includes(ch.estado)) {
      throw new ErroApp('FORA_DE_HORA', 'O responsável só pode ser trocado antes do deslocamento.', 409);
    }
    const [novo] = await tx.select().from(membrosPrestador).where(and(
      eq(membrosPrestador.id, membroId), eq(membrosPrestador.prestadorId, ch.prestadorId),
      eq(membrosPrestador.ativo, true), eq(membrosPrestador.atende, true),
    )).for('update');
    if (!novo) throw naoEncontrado('Profissional');
    if (novo.id === ch.responsavelId) return ch;
    if (novo.chamadoAtualId) throw conflito('Este profissional já está em outro atendimento.', 'PROFISSIONAL_OCUPADO');

    const [anterior] = ch.responsavelId ? await tx.select().from(membrosPrestador).where(eq(membrosPrestador.id, ch.responsavelId)) : [];
    await tx.update(membrosPrestador).set({ chamadoAtualId: null }).where(eq(membrosPrestador.chamadoAtualId, ch.id));
    await tx.update(membrosPrestador).set({ chamadoAtualId: ch.id }).where(eq(membrosPrestador.id, novo.id));
    const [atualizado] = await tx.update(chamados).set({ responsavelId: novo.id, versao: ch.versao + 1 }).where(eq(chamados.id, ch.id)).returning();

    const [conv] = await tx.select().from(conversas).where(eq(conversas.chamadoId, ch.id));
    await adicionarParticipante(tx, conv!.id, novo.usuarioId);
    if (anterior) {
      await tx.delete(participantesConversa).where(and(eq(participantesConversa.conversaId, conv!.id), eq(participantesConversa.usuarioId, anterior.usuarioId)));
    }
    if (ch.estado === 'CONFIRMADO') {
      if (anterior) {
        await tx.update(compartilhamentosLocalizacao).set({ encerradoEm: ctx.agora(), motivoEncerramento: 'RESPONSAVEL_TROCADO' })
          .where(and(eq(compartilhamentosLocalizacao.chamadoId, ch.id), eq(compartilhamentosLocalizacao.usuarioId, anterior.usuarioId), isNull(compartilhamentosLocalizacao.encerradoEm)));
        fx.paraChamado(ch.id, 'localizacao:compartilhamento', { chamadoId: ch.id, usuarioId: anterior.usuarioId, ativo: false, motivo: 'RESPONSAVEL_TROCADO' });
      }
      await tx.insert(compartilhamentosLocalizacao).values({ chamadoId: ch.id, usuarioId: novo.usuarioId, papel: 'PRESTADOR' }).onConflictDoNothing();
      fx.paraChamado(ch.id, 'localizacao:compartilhamento', { chamadoId: ch.id, usuarioId: novo.usuarioId, ativo: true });
    }
    const [u] = await tx.select({ nome: usuarios.nome }).from(usuarios).where(eq(usuarios.id, novo.usuarioId));
    await mensagemSistema(tx, fx, ch.id, `${u!.nome} é o profissional responsável por este atendimento.`);
    fx.paraUsuario(novo.usuarioId, 'chamado:estado', { chamadoId: ch.id, estado: atualizado!.estado, evento: 'ACEITAR', versao: atualizado!.versao });
    return atualizado!;
  });
}

// ───────────────────────────── Históricos ─────────────────────────────

const camposLista = {
  id: chamados.id, estado: chamados.estado, versao: chamados.versao, criadoEm: chamados.criadoEm, descricao: chamados.descricao,
  pontoReferencia: chamados.pontoReferencia, concluidoEm: chamados.concluidoEm, canceladoEm: chamados.canceladoEm,
  categoria: { id: categorias.id, nome: categorias.nome, slug: categorias.slug },
  veiculo: { marca: veiculos.marca, modelo: veiculos.modelo, ano: veiculos.ano },
  prestador: { id: prestadores.id, nomeComercial: prestadores.nomeComercial, fotoUrl: prestadores.fotoUrl },
};

export function chamadosDoMotorista(ctx: Contexto, usuarioId: string) {
  return ctx.db.select(camposLista).from(chamados)
    .innerJoin(categorias, eq(categorias.id, chamados.categoriaId))
    .innerJoin(veiculos, eq(veiculos.id, chamados.veiculoId))
    .leftJoin(prestadores, eq(prestadores.id, chamados.prestadorId))
    .where(eq(chamados.motoristaId, usuarioId)).orderBy(desc(chamados.criadoEm)).limit(100);
}

export async function chamadosDoPrestador(ctx: Contexto, usuarioId: string, prestadorId: string, apenasAtivos = false) {
  const [m] = await ctx.db.select().from(membrosPrestador).where(and(
    eq(membrosPrestador.prestadorId, prestadorId), eq(membrosPrestador.usuarioId, usuarioId), eq(membrosPrestador.ativo, true)));
  if (!m) throw proibido();
  // Profissional vê os próprios; dono e gestor veem o histórico centralizado da empresa.
  return ctx.db.select({ ...camposLista, responsavelId: chamados.responsavelId, responsavel: usuarios.nome }).from(chamados)
    .innerJoin(categorias, eq(categorias.id, chamados.categoriaId))
    .innerJoin(veiculos, eq(veiculos.id, chamados.veiculoId))
    .leftJoin(prestadores, eq(prestadores.id, chamados.prestadorId))
    .leftJoin(membrosPrestador, eq(membrosPrestador.id, chamados.responsavelId))
    .leftJoin(usuarios, eq(usuarios.id, membrosPrestador.usuarioId))
    .where(and(
      eq(chamados.prestadorId, prestadorId),
      m.funcao === 'PROFISSIONAL' ? eq(chamados.responsavelId, m.id) : undefined,
      apenasAtivos ? inArray(chamados.estado, [...ESTADOS_ATIVOS]) : undefined,
    )).orderBy(desc(chamados.criadoEm)).limit(200);
}

// ───────────────────────────── Conversas ─────────────────────────────

export async function minhasConversas(ctx: Contexto, usuarioId: string) {
  const r = await ctx.db.execute<{
    id: string; chamado_id: string | null; ultima: string | null; ultima_em: Date | null; nao_lidas: number; outros: string | null;
  }>(sql`
    select c.id, c.chamado_id,
      (select m.conteudo from ${mensagens} m where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima,
      (select max(m.criada_em) from ${mensagens} m where m.conversa_id = c.id) as ultima_em,
      (select count(*)::int from ${mensagens} m where m.conversa_id = c.id and m.autor_id is distinct from ${usuarioId}
         and m.criada_em > coalesce(p.ultima_leitura_em, 'epoch')) as nao_lidas,
      (select string_agg(u.nome, ', ') from ${participantesConversa} o join ${usuarios} u on u.id = o.usuario_id
         where o.conversa_id = c.id and o.usuario_id <> ${usuarioId}) as outros
    from ${conversas} c join ${participantesConversa} p on p.conversa_id = c.id and p.usuario_id = ${usuarioId}
    order by ultima_em desc nulls last limit 100`);
  return r.rows.map((x) => ({
    id: x.id, chamadoId: x.chamado_id, ultimaMensagem: x.ultima, ultimaEm: x.ultima_em, naoLidas: x.nao_lidas, com: x.outros ?? 'Conversa',
  }));
}

/** Botão “Mensagem” do perfil: conversa direta com o prestador, antes de um chamado. */
export async function conversaComPrestador(ctx: Contexto, usuarioId: string, prestadorId: string) {
  return ctx.db.transaction(async (tx) => {
    const [dono] = await tx.select().from(membrosPrestador).where(and(eq(membrosPrestador.prestadorId, prestadorId), eq(membrosPrestador.funcao, 'DONO')));
    if (!dono) throw naoEncontrado('Profissional');
    if (dono.usuarioId === usuarioId) throw new ErroApp('INVALIDO', 'Este é o seu próprio perfil.');
    const existente = await tx.execute<{ id: string }>(sql`
      select c.id from ${conversas} c
      join ${participantesConversa} a on a.conversa_id = c.id and a.usuario_id = ${usuarioId}
      join ${participantesConversa} b on b.conversa_id = c.id and b.usuario_id = ${dono.usuarioId}
      where c.chamado_id is null limit 1`);
    if (existente.rows[0]) return { id: existente.rows[0].id };
    const [c] = await tx.insert(conversas).values({}).returning();
    await adicionarParticipante(tx, c!.id, usuarioId);
    await adicionarParticipante(tx, c!.id, dono.usuarioId);
    return { id: c!.id };
  });
}

// ───────────────────────────── Dispositivos e documentos ─────────────────────────────

export async function registrarDispositivo(ctx: Contexto, usuarioId: string, d: { plataforma: 'ANDROID' | 'IOS' | 'WEB'; token: string; inscricaoWeb?: unknown }) {
  await ctx.db.insert(dispositivos).values({ ...d, usuarioId, inscricaoWeb: d.inscricaoWeb ?? null })
    .onConflictDoUpdate({ target: dispositivos.token, set: { usuarioId, ultimoUsoEm: ctx.agora(), invalidadoEm: null } });
}

export async function enviarDocumento(ctx: Contexto, usuarioId: string, prestadorId: string, d: { tipo: string; arquivoUrl: string }) {
  await exigirGestao(ctx.db, usuarioId, prestadorId);
  const [doc] = await ctx.db.insert(documentosVerificacao).values({ ...d, prestadorId }).returning();
  return doc!;
}

export async function meusDocumentos(ctx: Contexto, usuarioId: string, prestadorId: string) {
  await exigirGestao(ctx.db, usuarioId, prestadorId);
  return ctx.db.select().from(documentosVerificacao).where(eq(documentosVerificacao.prestadorId, prestadorId)).orderBy(desc(documentosVerificacao.criadoEm));
}
