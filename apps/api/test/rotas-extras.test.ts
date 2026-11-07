/** Conteúdo, qualidade, equipe, upload e administração — exercitados pelas rotas HTTP. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { criarDb, type Db } from '../src/db/cliente.js';
import { migrar } from '../src/db/migrar.js';
import { semear } from '../src/db/seed.js';
import * as s from '../src/db/schema.js';
import { REGRAS_PADRAO, type Contexto } from '../src/nucleo.js';
import { criarApp, type App } from '../src/http/app.js';

const URL = process.env.DATABASE_URL_TESTE ?? 'postgresql://vrum@localhost:5432/vrum_teste';
const SORRISO = { lat: -12.5425, lng: -55.7211 };

let db: Db;
let pool: pg.Pool;
let app: App;
const ctx: Contexto = { db: undefined as unknown as Db, regras: { ...REGRAS_PADRAO }, agora: () => new Date() };

let n = 0;
async function req(metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token?: string, body?: unknown) {
  const r = await app.inject({ method: metodo, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
  return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
}
async function conta(nome: string, cidadeId: string) {
  n++;
  const r = await req('POST', '/auth/cadastro', undefined, { nome, telefone: `6698800${String(n).padStart(4, '0')}`, email: `x${n}@t.vrum`, senha: '12345678', cidadeId });
  expect(r.status).toBe(201);
  return { id: r.json.usuario.id as string, token: r.json.token as string };
}

const st: Record<string, any> = {};

beforeAll(async () => {
  ({ db, pool } = criarDb(URL));
  ctx.db = db;
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrar(URL);
  await semear(URL);
  app = criarApp(ctx, { jwtSecret: 'teste', pastaArquivos: mkdtempSync(join(tmpdir(), 'vrum-')), urlPublica: 'http://teste' });
  await app.ready();
  st.cidadeId = (await req('GET', '/cidades')).json[0].id;
  st.cat = (await req('GET', '/categorias')).json.find((c: any) => c.slug === 'mecanica').id;
});

afterAll(async () => { await app?.close(); await pool?.end(); });

describe('conta e perfil do prestador', () => {
  it('cria empresa, perfil público por @usuário e alternância de áreas em /me', async () => {
    st.dono = await conta('Dono Oficina', st.cidadeId);
    const p = await req('POST', '/prestadores', st.dono.token, {
      tipo: 'EMPRESA', nomeComercial: 'Oficina Central', usuarioNome: '@oficinacentral', cidadeId: st.cidadeId,
      baseLat: SORRISO.lat + 0.01, baseLng: SORRISO.lng, categorias: [st.cat], modalidade: 'AMBOS',
    });
    expect(p.status).toBe(201);
    st.prestadorId = p.json.id;
    const eu = await req('GET', '/me', st.dono.token);
    expect(eu.json.vinculos[0]).toMatchObject({ funcao: 'DONO', atende: false });

    const ed = await req('PATCH', `/prestadores/${st.prestadorId}`, st.dono.token, { apresentacao: 'Mecânica geral desde 2005', plantao: true });
    expect(ed.status).toBe(200);
    const perfil = await req('GET', '/perfis/@oficinacentral');
    expect(perfil.json).toMatchObject({ nomeComercial: 'Oficina Central', plantao: true, verificado: false, disponivelAgora: false });
    expect(perfil.json.categorias[0].slug).toBe('mecanica');
  });

  it('upload aceita foto e recusa formato não permitido', async () => {
    const enviar = (nome: string, tipo: string) => {
      const limite = '----vrum';
      const corpo = `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${tipo}\r\n\r\nconteudo\r\n--${limite}--\r\n`;
      return app.inject({ method: 'POST', url: '/arquivos', payload: corpo,
        headers: { authorization: `Bearer ${st.dono.token}`, 'content-type': `multipart/form-data; boundary=${limite}` } });
    };
    const ok = await enviar('foto.jpg', 'image/jpeg');
    expect(ok.statusCode).toBe(201);
    st.fotoUrl = JSON.parse(ok.body).url;
    expect(st.fotoUrl).toMatch(/^http:\/\/teste\/arquivos\/.+\.jpg$/);
    expect((await enviar('x.exe', 'application/x-msdownload')).statusCode).toBe(400);
  });
});

describe('publicações e seguidores', () => {
  it('publica, curte, comenta, salva e segue', async () => {
    const pub = await req('POST', `/prestadores/${st.prestadorId}/publicacoes`, st.dono.token, {
      descricao: 'Troca de embreagem', categoriaId: st.cat, midias: [{ tipo: 'IMAGEM', url: st.fotoUrl }],
    });
    expect(pub.status).toBe(201);
    st.pubId = pub.json.id;
    st.fan = await conta('Fã', st.cidadeId);
    expect((await req('POST', `/publicacoes/${st.pubId}/curtir`, st.fan.token)).json).toEqual({ curti: true });
    expect((await req('POST', `/publicacoes/${st.pubId}/salvar`, st.fan.token)).json).toEqual({ salvei: true });
    expect((await req('POST', `/prestadores/${st.prestadorId}/seguir`, st.fan.token)).json).toEqual({ sigo: true });
    expect((await req('POST', `/publicacoes/${st.pubId}/comentarios`, st.fan.token, { texto: 'Ótimo serviço!' })).status).toBe(201);

    const feed = await req('GET', '/publicacoes', st.fan.token);
    expect(feed.json[0]).toMatchObject({ id: st.pubId, curtidas: 1, comentarios: 1, curti: true, salvei: true, segue: true, patrocinado: false });
    expect(feed.json[0].midias).toHaveLength(1);
    expect((await req('GET', '/me/salvos', st.fan.token)).json).toHaveLength(1);
    // Quem não é da empresa não publica em nome dela.
    expect((await req('POST', `/prestadores/${st.prestadorId}/publicacoes`, st.fan.token, { midias: [{ tipo: 'IMAGEM', url: st.fotoUrl }] })).status).toBe(403);
  });

  it('“Mensagem” no perfil abre uma conversa direta (sempre a mesma)', async () => {
    const a = await req('POST', `/prestadores/${st.prestadorId}/conversa`, st.fan.token);
    const b = await req('POST', `/prestadores/${st.prestadorId}/conversa`, st.fan.token);
    expect(a.json.id).toBe(b.json.id);
    await req('POST', `/conversas/${a.json.id}/mensagens`, st.fan.token, { tipo: 'TEXTO', conteudo: 'Vocês atendem caminhonete?' });
    const conversasDono = await req('GET', '/me/conversas', st.dono.token);
    expect(conversasDono.json[0]).toMatchObject({ naoLidas: 1, com: 'Fã', ultimaMensagem: 'Vocês atendem caminhonete?' });
  });
});

describe('equipe, distribuição e avaliação', () => {
  it('dono adiciona mecânicos; gestão troca o responsável antes da saída', async () => {
    st.mec1 = await conta('Mecânico Um', st.cidadeId);
    st.mec2 = await conta('Mecânico Dois', st.cidadeId);
    for (const m of [st.mec1, st.mec2]) {
      const r = await req('POST', `/prestadores/${st.prestadorId}/equipe`, st.dono.token, { login: `x${n - (m === st.mec1 ? 1 : 0)}@t.vrum`, funcao: 'PROFISSIONAL' });
      expect(r.status).toBe(201);
      expect((await req('POST', `/prestadores/${st.prestadorId}/disponibilidade`, m.token, { disponivel: true })).status).toBe(200);
    }
    expect((await req('POST', `/prestadores/${st.prestadorId}/equipe`, st.dono.token, { login: 'ninguem@t.vrum', funcao: 'PROFISSIONAL' })).status).toBe(404);
    expect((await req('GET', `/prestadores/${st.prestadorId}/equipe`, st.dono.token)).json).toHaveLength(3);
    expect((await req('GET', `/prestadores/${st.prestadorId}/equipe`, st.mec1.token)).status).toBe(403);

    st.motorista = await conta('Motorista Eva', st.cidadeId);
    const v = await req('POST', '/me/veiculos', st.motorista.token, { marca: 'Fiat', modelo: 'Strada', ano: 2020 });
    const ch = await req('POST', '/chamados', st.motorista.token, {
      veiculoId: v.json.id, categoriaId: st.cat, modalidade: 'ESCOLHER_PROFISSIONAL', prestadorId: st.prestadorId, ponto: SORRISO,
    });
    st.chamadoId = ch.json.id;
    const conv = (await req('GET', '/prestador/convites', st.mec1.token)).json[0].convite.id;
    expect((await req('POST', `/convites/${conv}/aceitar`, st.mec1.token)).status).toBe(200);

    // Mecânico 1 não vê o histórico de outros; dono vê o da empresa.
    expect((await req('GET', `/prestadores/${st.prestadorId}/chamados?ativos=true`, st.dono.token)).json).toHaveLength(1);
    expect((await req('POST', `/chamados/${st.chamadoId}/responsavel`, st.mec1.token, { membroId: st.prestadorId })).status).toBe(403);

    const equipe = (await req('GET', `/prestadores/${st.prestadorId}/equipe`, st.dono.token)).json;
    const m2 = equipe.find((m: any) => m.usuario.id === st.mec2.id);
    await req('POST', `/chamados/${st.chamadoId}/acoes`, st.motorista.token, { evento: 'CONFIRMAR' });
    const troca = await req('POST', `/chamados/${st.chamadoId}/responsavel`, st.dono.token, { membroId: m2.id });
    expect(troca.status).toBe(200);
    const comps = await db.select().from(s.compartilhamentosLocalizacao).where(eq(s.compartilhamentosLocalizacao.chamadoId, st.chamadoId));
    expect(comps.filter((c) => !c.encerradoEm).map((c) => c.usuarioId).sort()).toEqual([st.motorista.id, st.mec2.id].sort());
    // O anterior fica livre; o novo, ocupado.
    const depois = (await req('GET', `/prestadores/${st.prestadorId}/equipe`, st.dono.token)).json;
    expect(depois.find((m: any) => m.usuario.id === st.mec1.id).chamadoAtualId).toBeNull();
    expect(depois.find((m: any) => m.usuario.id === st.mec2.id).chamadoAtualId).toBe(st.chamadoId);
  });

  it('avaliação só após conclusão e atualiza a nota do perfil', async () => {
    expect((await req('POST', `/chamados/${st.chamadoId}/avaliacao`, st.motorista.token, { nota: 5 })).status).toBe(400);
    for (const ev of ['SAIR_A_CAMINHO', 'CHEGAR', 'INICIAR_SERVICO', 'SOLICITAR_CONCLUSAO']) {
      expect((await req('POST', `/chamados/${st.chamadoId}/acoes`, st.mec2.token, { evento: ev })).status).toBe(200);
    }
    await req('POST', `/chamados/${st.chamadoId}/acoes`, st.motorista.token, { evento: 'CONFIRMAR_CONCLUSAO' });
    const av = await req('POST', `/chamados/${st.chamadoId}/avaliacao`, st.motorista.token, { nota: 4, comentario: 'Rápido e honesto' });
    expect(av.status).toBe(201);
    st.avaliacaoId = av.json.id;
    expect((await req('POST', `/chamados/${st.chamadoId}/avaliacao`, st.motorista.token, { nota: 5 })).status).toBe(409);
    const perfil = await req('GET', `/perfis/${st.prestadorId}`);
    expect(perfil.json).toMatchObject({ notaMedia: 4, totalAvaliacoes: 1 });
    expect(perfil.json.avaliacoes[0].comentario).toBe('Rápido e honesto');
    expect((await req('GET', '/me/chamados', st.motorista.token)).json[0]).toMatchObject({ estado: 'CONCLUIDO', prestador: { nomeComercial: 'Oficina Central' } });
  });
});

describe('administração', () => {
  it('só administradores entram; denúncia procedente remove a publicação; tudo vai para a auditoria', async () => {
    expect((await req('GET', '/admin/resumo', st.fan.token)).status).toBe(403);
    st.adm = await conta('Admin', st.cidadeId);
    await db.update(s.usuarios).set({ ehAdmin: true }).where(eq(s.usuarios.id, st.adm.id));

    const resumo = await req('GET', '/admin/resumo', st.adm.token);
    expect(resumo.json.prestadores).toBe(1);

    const den = await req('POST', '/denuncias', st.fan.token, { alvo: 'PUBLICACAO', alvoId: st.pubId, motivo: 'Conteúdo enganoso' });
    expect(den.status).toBe(201);
    const dd = await req('GET', '/admin/denuncias', st.adm.token);
    expect(dd.json).toHaveLength(1);
    await req('POST', `/admin/denuncias/${den.json.id}/resolver`, st.adm.token, { procedente: true });
    expect((await req('GET', '/publicacoes')).json).toHaveLength(0);

    const doc = await req('POST', `/prestadores/${st.prestadorId}/documentos`, st.dono.token, { tipo: 'CNPJ', arquivoUrl: st.fotoUrl });
    await req('POST', `/admin/documentos/${doc.json.id}/analise`, st.adm.token, { aprovar: true });
    await req('POST', `/admin/prestadores/${st.prestadorId}/verificacao`, st.adm.token, { verificado: true });
    expect((await req('GET', `/perfis/${st.prestadorId}`)).json.verificado).toBe(true);

    const regras = await req('PUT', '/admin/regras', st.adm.token, { prazoConviteSeg: 120 });
    expect(regras.json.prazoConviteSeg).toBe(120);
    expect(ctx.regras.prazoConviteSeg).toBe(120);
    expect((await req('PUT', '/admin/regras', st.adm.token, { prazoConviteSeg: 1 })).status).toBe(400);

    await req('POST', `/admin/usuarios/${st.fan.id}/suspensao`, st.adm.token, { suspender: true, motivo: 'teste' });
    expect((await req('POST', '/auth/entrar', undefined, { login: 'x2@t.vrum', senha: '12345678' })).status).toBe(403);

    const acoes = (await req('GET', '/admin/auditoria', st.adm.token)).json.map((r: any) => r.registro.acao);
    expect(acoes).toEqual(expect.arrayContaining(['DENUNCIA_PROCEDENTE', 'APROVAR_DOCUMENTO', 'VERIFICAR', 'ALTERAR_REGRAS', 'SUSPENDER']));
  });
});
