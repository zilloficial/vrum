/** Supabase Storage, OpenRouteService e Web Push — com os serviços externos simulados. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import type pg from 'pg';
import { criarDb, type Db } from '../src/db/cliente.js';
import { migrar } from '../src/db/migrar.js';
import { semear } from '../src/db/seed.js';
import * as s from '../src/db/schema.js';
import { ErroApp, REGRAS_PADRAO, type Contexto } from '../src/nucleo.js';
import { criarApp, type App } from '../src/http/app.js';
import { armazenamentoSupabase } from '../src/servicos/armazenamento.js';
import { openRouteService, semRotas, type ServicoRotas } from '../src/servicos/rotas.js';
import { webPush } from '../src/servicos/push.js';

const URL = process.env.DATABASE_URL_TESTE ?? 'postgresql://vrum@localhost:5432/vrum_teste';
const SORRISO = { lat: -12.5425, lng: -55.7211 };

function respostaFalsa(status: number, corpo: unknown) {
  return new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

describe('Supabase Storage', () => {
  it('envia o arquivo com a chave de serviço e devolve a URL pública', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const arm = armazenamentoSupabase({
      url: 'https://abc.supabase.co/', chave: 'chave-servico', bucket: 'vrum',
      fetch: (async (url: string, init: RequestInit) => { chamadas.push({ url, init }); return respostaFalsa(200, { Key: 'ok' }); }) as typeof fetch,
    });
    const url = await arm.salvar(Readable.from([Buffer.from('foto')]), { extensao: '.jpg', tipoMime: 'image/jpeg', pasta: 'midias' });
    expect(chamadas[0]!.url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/vrum\/midias\/\d{4}-\d{2}\/[0-9a-f-]+\.jpg$/);
    expect((chamadas[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer chave-servico');
    expect(url).toBe(chamadas[0]!.url.replace('/object/vrum/', '/object/public/vrum/'));
  });

  it('aceita a URL do projeto colada com /rest/v1/', async () => {
    const urls: string[] = [];
    const arm = armazenamentoSupabase({ url: ' https://abc.supabase.co/rest/v1/ ', chave: 'sb_secret_x', bucket: 'vrum',
      fetch: (async (u: string, init: RequestInit) => { urls.push(u); expect((init.headers as Record<string, string>).authorization).toBeUndefined(); return respostaFalsa(200, {}); }) as typeof fetch });
    const url = await arm.salvar(Readable.from([Buffer.from('x')]), { extensao: '.png', tipoMime: 'image/png', pasta: 'midias' });
    expect(urls[0]).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/vrum\//);
    expect(url).toMatch(/^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/vrum\//);
  });

  it('não publica arquivo acima do limite e traduz falhas do serviço', async () => {
    let chamou = false;
    const arm = armazenamentoSupabase({ url: 'https://abc.supabase.co', chave: 'k', bucket: 'vrum',
      fetch: (async () => { chamou = true; return respostaFalsa(500, 'erro'); }) as typeof fetch });
    await expect(arm.salvar(Readable.from([Buffer.from('x')]), {
      extensao: '.mp4', tipoMime: 'video/mp4', pasta: 'midias', conferir: () => { throw new ErroApp('ARQUIVO_GRANDE', 'grande'); },
    })).rejects.toMatchObject({ codigo: 'ARQUIVO_GRANDE' });
    expect(chamou).toBe(false);
    await expect(arm.salvar(Readable.from([Buffer.from('x')]), { extensao: '.jpg', tipoMime: 'image/jpeg', pasta: 'midias' }))
      .rejects.toMatchObject({ codigo: 'FALHA_ARMAZENAMENTO' });
  });
});

describe('OpenRouteService', () => {
  it('converte a rota GeoJSON ([lng, lat]) para o mapa ([lat, lng])', async () => {
    let corpo: any;
    const ors = openRouteService('chave-ors', (async (_u: string, init: RequestInit) => {
      corpo = JSON.parse(String(init.body));
      return respostaFalsa(200, { features: [{ properties: { summary: { distance: 2345.6, duration: 312.4 } }, geometry: { coordinates: [[-55.72, -12.53], [-55.721, -12.54]] } }] });
    }) as typeof fetch);
    const t = await ors.calcular({ lat: -12.53, lng: -55.72 }, SORRISO);
    expect(corpo.coordinates[0]).toEqual([-55.72, -12.53]);
    expect(t).toEqual({ distanciaM: 2346, duracaoS: 312, linha: [[-12.53, -55.72], [-12.54, -55.721]] });
  });

  it('falha do serviço vira null (o app cai para a linha reta)', async () => {
    const ors = openRouteService('k', (async () => respostaFalsa(403, { error: 'quota' })) as typeof fetch);
    expect(await ors.calcular(SORRISO, SORRISO)).toBeNull();
  });
});

describe('rota do chamado e Web Push (com banco)', () => {
  let db: Db; let pool: pg.Pool; let app: App;
  const ctx: Contexto = { db: undefined as unknown as Db, regras: { ...REGRAS_PADRAO }, agora: () => new Date() };
  const envios: { endpoint: string; corpo: any }[] = [];
  let respostaPush = 201;
  let calculos = 0;
  let rotas: ServicoRotas = {
    nome: 'openrouteservice',
    async calcular(o, d) { calculos++; return { distanciaM: 1500, duracaoS: 240, linha: [[o.lat, o.lng], [d.lat, d.lng]] }; },
  };

  async function req(m: 'GET' | 'POST', url: string, token?: string, body?: unknown) {
    const r = await app.inject({ method: m, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
    return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
  }
  let n = 0;
  async function conta(nome: string, cidadeId: string) {
    n++;
    const r = await req('POST', '/auth/cadastro', undefined, { nome, telefone: `6697700${String(n).padStart(4, '0')}`, email: `i${n}@t.vrum`, senha: '12345678', cidadeId });
    return { id: r.json.usuario.id as string, token: r.json.token as string };
  }

  beforeAll(async () => {
    ({ db, pool } = criarDb(URL));
    ctx.db = db;
    await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
    await migrar(URL);
    await semear(URL);
    const push = webPush(db, { enviar: async (sub, corpo) => {
      if (respostaPush >= 400) throw Object.assign(new Error('gone'), { statusCode: respostaPush });
      envios.push({ endpoint: sub.endpoint, corpo: JSON.parse(corpo) });
    } });
    app = criarApp(ctx, {
      jwtSecret: 't', push,
      rotas: { nome: 'openrouteservice', calcular: (o, d) => rotas.calcular(o, d) },
      emissor: () => ({ emitir() { /* sem socket */ }, push: (u, a) => push.enviar(u, a) }),
    });
    await app.ready();
  });
  afterAll(async () => { await app?.close(); await pool?.end(); });

  it('chave pública do push é gerada uma vez e reaproveitada', async () => {
    const ra = await req('GET', '/push/chave-publica');
    const a = ra.json.chave;
    const b = (await req('GET', '/push/chave-publica')).json.chave;
    expect(a).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b).toBe(a);
    const [linha] = await db.select().from(s.configuracoes).where(eq(s.configuracoes.chave, 'vapid'));
    expect((linha!.valor as any).publicKey).toBe(a);
    // A chave privada nunca aparece nas regras expostas ao painel.
    expect(JSON.stringify(ctx.regras)).not.toContain('privateKey');
  });

  it('convite novo chega por push no navegador do profissional; inscrição expirada é desativada', async () => {
    const cidadeId = (await req('GET', '/cidades')).json[0].id;
    const cat = (await req('GET', '/categorias')).json.find((c: any) => c.slug === 'pneus-rodas').id;
    const pro = await conta('Pro', cidadeId);
    const p = await req('POST', '/prestadores', pro.token, { tipo: 'AUTONOMO', nomeComercial: 'Pneus Já', usuarioNome: 'pneusja', cidadeId, baseLat: SORRISO.lat, baseLng: SORRISO.lng, categorias: [cat] });
    await req('POST', `/prestadores/${p.json.id}/disponibilidade`, pro.token, { disponivel: true });
    const insc = { endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'x', auth: 'y' } };
    expect((await req('POST', '/me/dispositivos', pro.token, { plataforma: 'WEB', token: insc.endpoint, inscricaoWeb: insc })).status).toBe(204);

    const mot = await conta('Mot', cidadeId);
    const v = await req('POST', '/me/veiculos', mot.token, { marca: 'VW', modelo: 'Gol', ano: 2015 });
    const ch = await req('POST', '/chamados', mot.token, { veiculoId: v.json.id, categoriaId: cat, modalidade: 'BUSCAR_DISPONIVEIS', ponto: SORRISO });
    expect(ch.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ endpoint: insc.endpoint, corpo: { titulo: 'Novo chamado', url: '/p', tag: `chamado-${ch.json.id}` } });

    Object.assign(globalThis, { __st: { pro, mot, chamadoId: ch.json.id, cidadeId } });
    respostaPush = 410;
    const conv = (await req('GET', '/prestador/convites', pro.token)).json[0].convite.id;
    await req('POST', `/convites/${conv}/aceitar`, pro.token); // gera aviso ao motorista (sem inscrição)
    await req('POST', `/chamados/${ch.json.id}/acoes`, mot.token, { evento: 'CONFIRMAR' }); // aviso ao profissional → 410
    await new Promise((r) => setTimeout(r, 50));
    const [disp] = await db.select().from(s.dispositivos).where(eq(s.dispositivos.token, insc.endpoint));
    expect(disp!.invalidadoEm).not.toBeNull();
  });

  it('rota: só com posição recente, com cache, e cai para linha reta sem serviço', async () => {
    const { pro, mot, chamadoId } = (globalThis as any).__st;
    expect((await req('GET', `/chamados/${chamadoId}/rota`, mot.token)).json).toMatchObject({ disponivel: false, motivo: 'SEM_POSICAO_RECENTE' });

    const longe = { lat: SORRISO.lat + 0.02, lng: SORRISO.lng };
    await db.insert(s.posicoesAtuais).values({ chamadoId, usuarioId: pro.id, ...longe, capturadaEm: new Date() });
    const r1 = (await req('GET', `/chamados/${chamadoId}/rota`, mot.token)).json;
    expect(r1).toMatchObject({ disponivel: true, fonte: 'ROTA', distanciaM: 1500, duracaoS: 240 });
    expect(new Date(r1.chegadaEstimada).getTime()).toBeGreaterThan(Date.now());
    await req('GET', `/chamados/${chamadoId}/rota`, pro.token);
    expect(calculos).toBe(1); // mesma posição: usa o cache

    const estranho = await conta('Estranho', (globalThis as any).__st.cidadeId);
    expect((await req('GET', `/chamados/${chamadoId}/rota`, estranho.token)).status).toBe(403);

    rotas = semRotas;
    await db.update(s.posicoesAtuais).set({ lat: longe.lat + 0.01, capturadaEm: new Date() }).where(eq(s.posicoesAtuais.usuarioId, pro.id));
    const r2 = (await req('GET', `/chamados/${chamadoId}/rota`, mot.token)).json;
    expect(r2).toMatchObject({ fonte: 'LINHA_RETA', duracaoS: null, chegadaEstimada: null });
    expect(r2.distanciaM).toBeGreaterThan(3000);
  });
});
