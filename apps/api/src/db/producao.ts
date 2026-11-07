/**
 * Rotinas do modo real (produção), executadas a cada inicialização. São idempotentes.
 *
 *  - removerDemo: apaga as contas e os profissionais de demonstração e tudo o que
 *    eles geraram (chamados, mensagens, avaliações, publicações…). Contas reais e os
 *    dados básicos (cidades, categorias, prazos) não são tocados.
 *  - promoverAdmins: dá acesso de administrador aos e-mails de ADMIN_EMAILS.
 */
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { Db } from './cliente.js';
import * as s from './schema.js';

/** Contas criadas por `npm run db:demo` (e pela antiga opção DEMO=1). */
export const EMAILS_DEMO = ['ana@vrum.app', 'ze@vrum.app', 'oficina@vrum.app', 'joao@vrum.app', 'admin@vrum.app'];

/** Lista de administradores a partir do ambiente (separados por vírgula). */
export function emailsAdmin(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
}

export interface ResultadoLimpeza {
  usuarios: number; prestadores: number; chamados: number; publicacoes: number;
}

export async function removerDemo(db: Db): Promise<ResultadoLimpeza> {
  return db.transaction(async (tx) => {
    const usuarios = (await tx.select({ id: s.usuarios.id }).from(s.usuarios).where(inArray(s.usuarios.email, EMAILS_DEMO))).map((u) => u.id);
    if (!usuarios.length) return { usuarios: 0, prestadores: 0, chamados: 0, publicacoes: 0 };

    // Profissionais de demonstração: todo prestador cuja equipe é formada só por contas de demonstração.
    const vinculados = (await tx.selectDistinct({ id: s.membrosPrestador.prestadorId }).from(s.membrosPrestador)
      .where(inArray(s.membrosPrestador.usuarioId, usuarios))).map((p) => p.id);
    const comMembroReal = vinculados.length
      ? (await tx.selectDistinct({ id: s.membrosPrestador.prestadorId }).from(s.membrosPrestador)
        .where(and(inArray(s.membrosPrestador.prestadorId, vinculados), notInArray(s.membrosPrestador.usuarioId, usuarios)))).map((p) => p.id)
      : [];
    const prestadores = vinculados.filter((id) => !comMembroReal.includes(id));
    // Se uma conta real faz parte de uma equipe de demonstração, só o vínculo da conta demo sai.
    const P = prestadores.length ? prestadores : ['00000000-0000-0000-0000-000000000000'];

    // Chamados ligados à demonstração (como motorista ou como profissional).
    const chamados = (await tx.select({ id: s.chamados.id }).from(s.chamados).where(or(
      inArray(s.chamados.motoristaId, usuarios), inArray(s.chamados.prestadorId, P), inArray(s.chamados.prestadorEscolhidoId, P),
    ))).map((c) => c.id);
    const C = chamados.length ? chamados : ['00000000-0000-0000-0000-000000000000'];

    // 1) Registros que apontam para chamados, contas ou profissionais sem exclusão em cascata.
    await tx.delete(s.avaliacoes).where(or(inArray(s.avaliacoes.chamadoId, C), inArray(s.avaliacoes.autorId, usuarios), inArray(s.avaliacoes.prestadorId, P)));
    await tx.delete(s.contestacoes).where(or(inArray(s.contestacoes.chamadoId, C), inArray(s.contestacoes.autorId, usuarios)));
    await tx.delete(s.acessosAdminLocalizacao).where(or(inArray(s.acessosAdminLocalizacao.chamadoId, C), inArray(s.acessosAdminLocalizacao.adminId, usuarios)));
    await tx.delete(s.condicoesAcordadas).where(or(inArray(s.condicoesAcordadas.chamadoId, C), inArray(s.condicoesAcordadas.propostaPor, usuarios)));
    await tx.delete(s.convitesChamado).where(or(inArray(s.convitesChamado.chamadoId, C), inArray(s.convitesChamado.prestadorId, P)));
    await tx.update(s.membrosPrestador).set({ chamadoAtualId: null }).where(inArray(s.membrosPrestador.chamadoAtualId, C));
    // Ações de contas demo em chamados reais (ex.: o admin de teste encerrou um chamado) ficam sem autor.
    await tx.update(s.eventosChamado).set({ atorId: null }).where(and(inArray(s.eventosChamado.atorId, usuarios), notInArray(s.eventosChamado.chamadoId, C)));
    await tx.update(s.convitesChamado).set({ respondidoPor: null }).where(inArray(s.convitesChamado.respondidoPor, usuarios));

    // 2) Chamados (levam junto anexos, eventos, conversa do atendimento, localização).
    const apagados = await tx.delete(s.chamados).where(inArray(s.chamados.id, C)).returning({ id: s.chamados.id });

    // 3) Conversas diretas com contas demo e mensagens restantes delas.
    const conversasDemo = (await tx.selectDistinct({ id: s.participantesConversa.conversaId }).from(s.participantesConversa)
      .innerJoin(s.conversas, eq(s.conversas.id, s.participantesConversa.conversaId))
      .where(and(inArray(s.participantesConversa.usuarioId, usuarios), isNull(s.conversas.chamadoId)))).map((c) => c.id);
    if (conversasDemo.length) await tx.delete(s.conversas).where(inArray(s.conversas.id, conversasDemo));
    await tx.delete(s.mensagens).where(inArray(s.mensagens.autorId, usuarios));

    // 4) Conteúdo e moderação.
    const pubs = await tx.delete(s.publicacoes).where(or(inArray(s.publicacoes.prestadorId, P), inArray(s.publicacoes.autorId, usuarios))).returning({ id: s.publicacoes.id });
    await tx.delete(s.denuncias).where(or(inArray(s.denuncias.autorId, usuarios), inArray(s.denuncias.alvoId, [...usuarios, ...P])));
    await tx.update(s.denuncias).set({ resolvidaPor: null }).where(inArray(s.denuncias.resolvidaPor, usuarios));
    await tx.update(s.documentosVerificacao).set({ analisadoPor: null }).where(inArray(s.documentosVerificacao.analisadoPor, usuarios));
    await tx.delete(s.registrosAdmin).where(inArray(s.registrosAdmin.adminId, usuarios));
    await tx.delete(s.assinaturas).where(inArray(s.assinaturas.prestadorId, P));
    await tx.delete(s.destaques).where(inArray(s.destaques.prestadorId, P));

    // 5) Profissionais e contas (levam junto equipe, garagem, seguidores, curtidas, notificações, aparelhos).
    const prest = prestadores.length ? await tx.delete(s.prestadores).where(inArray(s.prestadores.id, prestadores)).returning({ id: s.prestadores.id }) : [];
    const users = await tx.delete(s.usuarios).where(inArray(s.usuarios.id, usuarios)).returning({ id: s.usuarios.id });

    return { usuarios: users.length, prestadores: prest.length, chamados: apagados.length, publicacoes: pubs.length };
  });
}

/** Marca como administrador as contas dos e-mails informados. Devolve quantas foram promovidas agora. */
export async function promoverAdmins(db: Db, emails: string[]): Promise<number> {
  if (!emails.length) return 0;
  const r = await db.update(s.usuarios).set({ ehAdmin: true })
    .where(and(inArray(sql`lower(${s.usuarios.email})`, emails), eq(s.usuarios.ehAdmin, false)))
    .returning({ id: s.usuarios.id });
  return r.length;
}
