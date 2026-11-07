/**
 * Teste de integração contra um PostgreSQL real.
 * Usa DATABASE_URL_TESTE (padrão: banco vrum_teste local). O schema é recriado a cada execução.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { io as conectar, type Socket } from 'socket.io-client';
import type pg from 'pg';
import { criarDb, type Db } from '../src/db/cliente.js';
import { migrar } from '../src/db/migrar.js';
import { semear } from '../src/db/seed.js';
import * as s from '../src/db/schema.js';
import { Efeitos, ErroApp, REGRAS_PADRAO, type Contexto } from '../src/nucleo.js';
import * as chamadosSvc from '../src/servicos/chamados.js';
import * as chat from '../src/servicos/chat.js';
import * as contas from '../src/servicos/contas.js';
import * as loc from '../src/servicos/localizacao.js';
import * as prest from '../src/servicos/prestadores.js';
import { criarApp } from '../src/http/app.js';
import { criarTempoReal } from '../src/tempo-real/socket.js';

const URL = process.env.DATABASE_URL_TESTE ?? 'postgresql://vrum@localhost:5432/vrum_teste';
const SORRISO = { lat: -12.5425, lng: -55.7211 };
/** Desloca ~km para o norte. */
const aoNorte = (km: number) => ({ lat: SORRISO.lat + km / 111, lng: SORRISO.lng });

let db: Db;
let pool: pg.Pool;
let relogio = new Date();
const ctx = () => ({ db, regras: REGRAS_PADRAO, agora: () => relogio }) satisfies Contexto;
const avancar = (seg: number) => { relogio = new Date(relogio.getTime() + seg * 1000); };
const fx = () => new Efeitos();

let cidadeId: string;
let catPneus: string;
let n = 0;

async function usuario(nome: string) {
  n++;
  return contas.cadastrar(ctx(), { nome, telefone: `6599900${String(n).padStart(4, '0')}`, email: `u${n}@teste.vrum`, senha: '12345678', cidadeId });
}

async function prestadorDisponivel(nome: string, pos: { lat: number; lng: number }) {
  const u = await usuario(nome);
  const p = await prest.criarPrestador(ctx(), u.id, {
    tipo: 'AUTONOMO', nomeComercial: nome, usuarioNome: `p${n}`, cidadeId, baseLat: pos.lat, baseLng: pos.lng,
    raioCoberturaKm: 30, categorias: [catPneus],
  });
  await prest.definirDisponibilidade(ctx(), u.id, p.id, true);
  return { usuario: u, prestador: p };
}

async function motoristaComCarro(nome: string) {
  const u = await usuario(nome);
  const v = await contas.adicionarVeiculo(ctx(), u.id, { marca: 'Toyota', modelo: 'Hilux', ano: 2022, placa: 'qbx1a23', tipo: 'CAMINHONETE' });
  return { usuario: u, veiculo: v };
}

async function erroDe(p: Promise<unknown>) {
  try { await p; } catch (e) { if (e instanceof ErroApp) return e.codigo; throw e; }
  return 'SEM_ERRO';
}

const convitesDo = (chamadoId: string) => db.select().from(s.convitesChamado).where(eq(s.convitesChamado.chamadoId, chamadoId));

beforeAll(async () => {
  ({ db, pool } = criarDb(URL));
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrar(URL);
  await semear(URL);
  cidadeId = (await db.select().from(s.cidades))[0]!.id;
  catPneus = (await db.select().from(s.categorias).where(eq(s.categorias.slug, 'pneus-rodas')))[0]!.id;
});

afterAll(async () => { await pool?.end(); });

describe('ciclo completo do chamado', () => {
  const st: Record<string, any> = {};

  it('busca em etapas: convida só quem está no raio da primeira etapa', async () => {
    st.p1 = await prestadorDisponivel('Borracharia Um', aoNorte(1));
    st.p2 = await prestadorDisponivel('Borracharia Dois', aoNorte(2));
    st.p3 = await prestadorDisponivel('Borracharia Longe', aoNorte(10));
    st.m = await motoristaComCarro('Ana');

    const ch = await chamadosSvc.criarChamado(ctx(), fx(), st.m.usuario.id, {
      veiculoId: st.m.veiculo.id, categoriaId: catPneus, modalidade: 'BUSCAR_DISPONIVEIS',
      ponto: { ...SORRISO, referencia: 'Em frente ao posto' }, descricao: 'Pneu furado',
    });
    st.ch = ch;
    expect(ch.estado).toBe('AGUARDANDO_RESPOSTA');
    expect(ch.etapaBusca).toBe(1);
    const cv = await convitesDo(ch.id);
    expect(cv.map((c) => c.prestadorId).sort()).toEqual([st.p1.prestador.id, st.p2.prestador.id].sort());
    expect(cv.every((c) => c.distanciaKm! < 3)).toBe(true);
  });

  it('impede um segundo chamado ativo do mesmo motorista', async () => {
    expect(await erroDe(chamadosSvc.criarChamado(ctx(), fx(), st.m.usuario.id, {
      veiculoId: st.m.veiculo.id, categoriaId: catPneus, modalidade: 'BUSCAR_DISPONIVEIS', ponto: SORRISO,
    }))).toBe('CHAMADO_ATIVO_EXISTENTE');
  });

  it('aceites simultâneos: exatamente um prestador fica com o chamado', async () => {
    const cv = await convitesDo(st.ch.id);
    const c1 = cv.find((c) => c.prestadorId === st.p1.prestador.id)!;
    const c2 = cv.find((c) => c.prestadorId === st.p2.prestador.id)!;
    const r = await Promise.allSettled([
      chamadosSvc.aceitarConvite(ctx(), fx(), st.p1.usuario.id, c1.id),
      chamadosSvc.aceitarConvite(ctx(), fx(), st.p2.usuario.id, c2.id),
    ]);
    const ok = r.filter((x) => x.status === 'fulfilled');
    const falhou = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(falhou).toHaveLength(1);
    expect((falhou[0]!.reason as ErroApp).codigo).toBe('CONVITE_ENCERRADO');

    const venceu = r[0]!.status === 'fulfilled' ? st.p1 : st.p2;
    st.vencedor = venceu;
    st.perdedor = venceu === st.p1 ? st.p2 : st.p1;
    const [ch] = await db.select().from(s.chamados).where(eq(s.chamados.id, st.ch.id));
    expect(ch!.estado).toBe('ACEITO_COMBINANDO');
    expect(ch!.prestadorId).toBe(venceu.prestador.id);
    const estados = (await convitesDo(st.ch.id)).map((c) => c.estado).sort();
    expect(estados).toEqual(['ACEITO', 'CANCELADO']);
  });

  it('prestador convidado vê o resumo, mas a placa fica oculta até a confirmação', async () => {
    const v = await chamadosSvc.obterChamado(ctx(), st.vencedor.usuario.id, st.ch.id);
    expect(v.veiculo!.placa).toBeNull();
    expect(v.veiculo!.modelo).toBe('Hilux');
  });

  it('taxa de deslocamento precisa ser aceita antes de confirmar', async () => {
    const taxa = await chat.proporCondicao(ctx(), fx(), st.vencedor.usuario.id, st.ch.id, { tipo: 'TAXA_DESLOCAMENTO', valorCentavos: 3000 });
    expect(await erroDe(chamadosSvc.executarAcao(ctx(), fx(), st.m.usuario.id, st.ch.id, 'CONFIRMAR'))).toBe('TAXA_NAO_ACEITA');
    await chat.responderCondicao(ctx(), fx(), st.m.usuario.id, taxa.id, true);

    // Versão antiga vinda de uma tela desatualizada é recusada.
    expect(await erroDe(chamadosSvc.executarAcao(ctx(), fx(), st.m.usuario.id, st.ch.id, 'CONFIRMAR', { versao: 0 }))).toBe('VERSAO_DESATUALIZADA');

    const ch = await chamadosSvc.executarAcao(ctx(), fx(), st.m.usuario.id, st.ch.id, 'CONFIRMAR');
    expect(ch.estado).toBe('CONFIRMADO');
    const comps = await db.select().from(s.compartilhamentosLocalizacao).where(eq(s.compartilhamentosLocalizacao.chamadoId, st.ch.id));
    expect(comps.map((c) => c.papel).sort()).toEqual(['MOTORISTA', 'PRESTADOR']);
    const v = await chamadosSvc.obterChamado(ctx(), st.vencedor.usuario.id, st.ch.id);
    expect(v.veiculo!.placa).toBe('QBX1A23');
  });

  it('localização: só participantes, nunca fora de ordem, sempre com frescor', async () => {
    const enviar = (u: string, km: number, atrasoSeg = 0) => loc.registrarPosicao(ctx(), u, {
      chamadoId: st.ch.id, ...aoNorte(km), capturadaEm: new Date(relogio.getTime() - atrasoSeg * 1000).toISOString(),
    });
    await enviar(st.vencedor.usuario.id, 0.9);
    await enviar(st.m.usuario.id, 0.01);
    expect(await erroDe(enviar(st.perdedor.usuario.id, 0.5))).toBe('PROIBIDO');
    expect(await erroDe(enviar(st.vencedor.usuario.id, 0.95, 20))).toBe('POSICAO_FORA_DE_ORDEM');
    expect(await erroDe(enviar(st.vencedor.usuario.id, 0.8, 600))).toBe('POSICAO_ANTIGA');

    let visao = await loc.posicoesDoChamado(ctx(), st.m.usuario.id, st.ch.id);
    const doPrestador = () => visao.participantes.find((p) => p.papel === 'PRESTADOR')!;
    expect(doPrestador().frescor).toBe('ATUAL');
    // O ponto de atendimento não muda quando o motorista se move.
    expect(visao.pontoAtendimento.lat).toBeCloseTo(SORRISO.lat, 6);

    avancar(60);
    visao = await loc.posicoesDoChamado(ctx(), st.m.usuario.id, st.ch.id);
    expect(doPrestador().frescor).toBe('DESATUALIZADA');
    expect(await erroDe(loc.posicoesDoChamado(ctx(), st.perdedor.usuario.id, st.ch.id))).toBe('PROIBIDO');
  });

  it('acesso administrativo exige justificativa e fica registrado', async () => {
    const adm = await usuario('Suporte');
    await db.update(s.usuarios).set({ ehAdmin: true }).where(eq(s.usuarios.id, adm.id));
    expect(await erroDe(loc.acessoAdministrativo(ctx(), adm.id, st.ch.id, 'ver'))).toBe('JUSTIFICATIVA_OBRIGATORIA');
    await loc.acessoAdministrativo(ctx(), adm.id, st.ch.id, 'Motorista relatou que o prestador não chegou');
    expect(await db.select().from(s.acessosAdminLocalizacao)).toHaveLength(1);
    expect(await erroDe(loc.acessoAdministrativo(ctx(), st.m.usuario.id, st.ch.id, 'curiosidade qualquer'))).toBe('PROIBIDO');
  });

  it('prestador conduz o atendimento; sem resposta do motorista, conclui por prazo e encerra o rastreamento', async () => {
    const u = st.vencedor.usuario.id;
    expect(await erroDe(chamadosSvc.executarAcao(ctx(), fx(), st.m.usuario.id, st.ch.id, 'CHEGAR'))).toBe('TRANSICAO_INVALIDA');
    for (const ev of ['SAIR_A_CAMINHO', 'CHEGAR', 'INICIAR_SERVICO', 'SOLICITAR_CONCLUSAO'] as const) {
      await chamadosSvc.executarAcao(ctx(), fx(), u, st.ch.id, ev);
    }
    // O motorista não pode confirmar a conclusão no lugar do prestador e vice-versa.
    expect(await erroDe(chamadosSvc.executarAcao(ctx(), fx(), u, st.ch.id, 'CONFIRMAR_CONCLUSAO'))).toBe('ATOR_NAO_PERMITIDO');

    avancar(REGRAS_PADRAO.autoConcluirMin * 60 + 1);
    const r = await chamadosSvc.processarPrazos(ctx(), fx());
    expect(r.concluidosPorPrazo).toBe(1);

    const [ch] = await db.select().from(s.chamados).where(eq(s.chamados.id, st.ch.id));
    expect(ch!.estado).toBe('CONCLUIDO');
    const abertos = await db.select().from(s.compartilhamentosLocalizacao)
      .where(and(eq(s.compartilhamentosLocalizacao.chamadoId, st.ch.id), isNull(s.compartilhamentosLocalizacao.encerradoEm)));
    expect(abertos).toHaveLength(0);
    expect(await db.select().from(s.posicoesAtuais).where(eq(s.posicoesAtuais.chamadoId, st.ch.id))).toHaveLength(0);
    const [membro] = await db.select().from(s.membrosPrestador).where(eq(s.membrosPrestador.usuarioId, u));
    expect(membro!.chamadoAtualId).toBeNull();
    expect(await erroDe(loc.registrarPosicao(ctx(), u, { chamadoId: st.ch.id, ...SORRISO, capturadaEm: relogio.toISOString() })))
      .toBe('RASTREAMENTO_INATIVO');

    const historico = (await db.select().from(s.eventosChamado).where(eq(s.eventosChamado.chamadoId, st.ch.id)).orderBy(s.eventosChamado.criadoEm))
      .map((e) => e.evento);
    expect(historico).toEqual(['CRIADO', 'CONVITE_ENVIADO', 'ACEITAR', 'CONFIRMAR', 'SAIR_A_CAMINHO', 'CHEGAR',
      'INICIAR_SERVICO', 'SOLICITAR_CONCLUSAO', 'CONCLUIR_POR_PRAZO']);
  });
});

describe('prazos e etapas', () => {
  it('convites expirados avançam a busca para um raio maior; notificação antiga não aceita', async () => {
    const longe = await prestadorDisponivel('Socorro 12 km', aoNorte(12));
    const m = await motoristaComCarro('Bruno');
    // Deixa só os prestadores próximos desta etapa disponíveis para o teste ser determinístico.
    const ch = await chamadosSvc.criarChamado(ctx(), fx(), m.usuario.id, {
      veiculoId: m.veiculo.id, categoriaId: catPneus, modalidade: 'BUSCAR_DISPONIVEIS', ponto: SORRISO,
    });
    const etapa1 = await convitesDo(ch.id);
    expect(ch.etapaBusca).toBe(1);
    expect(etapa1.length).toBeGreaterThan(0);

    avancar(REGRAS_PADRAO.prazoConviteSeg + 1);
    const r = await chamadosSvc.processarPrazos(ctx(), fx());
    expect(r.convitesExpirados).toBe(etapa1.length);

    const [depois] = await db.select().from(s.chamados).where(eq(s.chamados.id, ch.id));
    expect(depois!.estado).toBe('AGUARDANDO_RESPOSTA');
    expect(depois!.etapaBusca).toBe(3); // etapa 2 (8 km) sem ninguém novo; etapa 3 (15 km) alcança 10 e 12 km
    const novos = (await convitesDo(ch.id)).filter((c) => c.etapa === 3).map((c) => c.prestadorId);
    expect(novos).toContain(longe.prestador.id);

    const antigo = etapa1[0]!;
    const dono = await db.select().from(s.membrosPrestador).where(eq(s.membrosPrestador.prestadorId, antigo.prestadorId));
    expect(await erroDe(chamadosSvc.aceitarConvite(ctx(), fx(), dono[0]!.usuarioId, antigo.id))).toBe('CONVITE_ENCERRADO');

    // Motorista cancela: convites pendentes são encerrados.
    await chamadosSvc.executarAcao(ctx(), fx(), m.usuario.id, ch.id, 'CANCELAR', { motivo: 'Resolvi sozinho' });
    expect((await convitesDo(ch.id)).some((c) => c.estado === 'PENDENTE')).toBe(false);
  });

  it('profissional escolhido que recusa → sem atendimento; motorista pode ampliar a busca', async () => {
    const alvo = await prestadorDisponivel('Escolhido', aoNorte(1.5));
    const m = await motoristaComCarro('Carla');
    const ch = await chamadosSvc.criarChamado(ctx(), fx(), m.usuario.id, {
      veiculoId: m.veiculo.id, categoriaId: catPneus, modalidade: 'ESCOLHER_PROFISSIONAL', prestadorId: alvo.prestador.id, ponto: SORRISO,
    });
    const [cv] = await convitesDo(ch.id);
    const r = await chamadosSvc.recusarConvite(ctx(), fx(), alvo.usuario.id, cv!.id);
    expect(r.estado).toBe('SEM_ATENDIMENTO');
    const reaberto = await chamadosSvc.executarAcao(ctx(), fx(), m.usuario.id, ch.id, 'REABRIR_BUSCA');
    expect(reaberto.estado).toBe('AGUARDANDO_RESPOSTA');
    expect(reaberto.modalidade).toBe('BUSCAR_DISPONIVEIS');
    await chamadosSvc.executarAcao(ctx(), fx(), m.usuario.id, ch.id, 'CANCELAR');
  });

  it('disponibilidade vence sem renovação', async () => {
    avancar(REGRAS_PADRAO.validadeDisponibilidadeHoras * 3600 + 1);
    const r = await chamadosSvc.processarPrazos(ctx(), fx());
    expect(r.disponibilidadesVencidas).toBeGreaterThan(0);
    const ainda = await db.select().from(s.membrosPrestador).where(eq(s.membrosPrestador.disponivel, true));
    expect(ainda).toHaveLength(0);
  });
});

describe('tempo real (HTTP + Socket.IO)', () => {
  it('posição do prestador chega ao motorista; terceiros não entram na sala', async () => {
    relogio = new Date();
    const app = criarApp(ctx(), { jwtSecret: 'teste' });
    await app.ready();
    const { io } = criarTempoReal(app.server, ctx(), (t) => app.jwt.verify(t));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const sockets: Socket[] = [];

    try {
      const p = await prestadorDisponivel('Guincho Rápido', aoNorte(1));
      const m = await motoristaComCarro('Duda');
      const estranho = await usuario('Estranho');
      const token = (id: string) => app.jwt.sign({ sub: id });
      const http = async (metodo: string, rota: string, uid: string, body?: unknown) => {
        const r = await fetch(base + rota, {
          method: metodo,
          headers: { authorization: `Bearer ${token(uid)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, json: (await r.json().catch(() => null)) as any };
      };

      const criado = await http('POST', '/chamados', m.usuario.id, {
        veiculoId: m.veiculo.id, categoriaId: catPneus, modalidade: 'ESCOLHER_PROFISSIONAL', prestadorId: p.prestador.id, ponto: SORRISO,
      });
      expect(criado.status).toBe(201);
      const chamadoId = criado.json.id as string;
      const convites = await http('GET', '/prestador/convites', p.usuario.id);
      expect(convites.json).toHaveLength(1);
      expect((await http('POST', `/convites/${convites.json[0].convite.id}/aceitar`, p.usuario.id)).status).toBe(200);
      expect((await http('POST', `/chamados/${chamadoId}/acoes`, m.usuario.id, { evento: 'CONFIRMAR' })).json.estado).toBe('CONFIRMADO');
      expect((await http('POST', `/chamados/${chamadoId}/acoes`, m.usuario.id, { evento: 'INVENTADO' })).status).toBe(400);

      const abrir = (uid: string) => new Promise<Socket>((ok, falha) => {
        const sk = conectar(base, { auth: { token: token(uid) }, transports: ['websocket'] });
        sockets.push(sk);
        sk.on('connect', () => ok(sk));
        sk.on('connect_error', falha);
      });
      const entrar = (sk: Socket) => new Promise<{ ok: boolean; codigo?: string }>((ok) => sk.emit('chamado:entrar', { chamadoId }, ok));

      const [skM, skP, skE] = await Promise.all([abrir(m.usuario.id), abrir(p.usuario.id), abrir(estranho.id)]);
      expect(await entrar(skM)).toEqual({ ok: true });
      expect(await entrar(skP)).toEqual({ ok: true });
      expect((await entrar(skE)).codigo).toBe('PROIBIDO');

      const recebida = new Promise<any>((ok) => skM.once('localizacao:posicao', ok));
      const vazou = new Promise<boolean>((ok) => { skE.once('localizacao:posicao', () => ok(true)); setTimeout(() => ok(false), 500); });
      const ack = await new Promise<any>((ok) => skP.emit('localizacao:enviar',
        { chamadoId, ...aoNorte(0.7), precisaoM: 8, capturadaEm: new Date().toISOString() }, ok));
      expect(ack).toEqual({ ok: true });
      const pos = await recebida;
      expect(pos.papel).toBe('PRESTADOR');
      expect(pos.lat).toBeCloseTo(aoNorte(0.7).lat, 6);
      expect(await vazou).toBe(false);

      await http('POST', `/chamados/${chamadoId}/acoes`, m.usuario.id, { evento: 'CANCELAR', motivo: 'teste' });
    } finally {
      sockets.forEach((sk) => sk.close());
      io.close();
      await app.close();
    }
  });
});
