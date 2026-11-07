/** Modo real: remoção dos dados de demonstração e administrador geral por e-mail. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type pg from 'pg';
import { criarDb, type Db } from '../src/db/cliente.js';
import { migrar } from '../src/db/migrar.js';
import { semear } from '../src/db/seed.js';
import { demo } from '../src/db/demo.js';
import * as s from '../src/db/schema.js';
import { EMAILS_DEMO, emailsAdmin, promoverAdmins, removerDemo } from '../src/db/producao.js';
import { Efeitos, REGRAS_PADRAO, type Contexto } from '../src/nucleo.js';
import * as contas from '../src/servicos/contas.js';
import * as chamadosSvc from '../src/servicos/chamados.js';
import * as chat from '../src/servicos/chat.js';
import * as conteudo from '../src/servicos/conteudo.js';
import * as prest from '../src/servicos/prestadores.js';
import * as equipe from '../src/servicos/equipe.js';

const URL = process.env.DATABASE_URL_TESTE ?? 'postgresql://vrum@localhost:5432/vrum_teste';
const SORRISO = { lat: -12.5425, lng: -55.7211 };
let db: Db; let pool: pg.Pool;
const ctx: Contexto = { db: undefined as unknown as Db, regras: { ...REGRAS_PADRAO }, agora: () => new Date() };
const fx = () => new Efeitos();
const st: Record<string, any> = {};

const contar = async (t: any) => (await db.select().from(t)).length;

beforeAll(async () => {
  ({ db, pool } = criarDb(URL));
  ctx.db = db;
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrar(URL);
  await semear(URL);
  await demo(URL, '/tmp', 'http://teste');

  const id = async (email: string) => (await db.select().from(s.usuarios).where(eq(s.usuarios.email, email)))[0]!.id;
  st.ze = await id('ze@vrum.app');
  st.adminDemo = await id('admin@vrum.app');
  const [borracharia] = await db.select().from(s.prestadores).where(eq(s.prestadores.usuarioNome, 'borrachariadoze'));
  st.borracharia = borracharia!.id;
  const [cidade] = await db.select().from(s.cidades);
  const cat = (await db.select().from(s.categorias).where(eq(s.categorias.slug, 'mecanica')))[0]!.id;

  // Conta real (motorista) que interagiu com a demonstração.
  st.real = await contas.cadastrar(ctx, { nome: 'Cliente Real', telefone: '66988887777', email: 'real@exemplo.com', senha: '12345678', cidadeId: cidade!.id });
  const v = await contas.adicionarVeiculo(ctx, st.real.id, { marca: 'Ford', modelo: 'Ranger', ano: 2021 });
  const ch = await chamadosSvc.criarChamado(ctx, fx(), st.real.id, { veiculoId: v.id, categoriaId: cat, modalidade: 'ESCOLHER_PROFISSIONAL', prestadorId: st.borracharia, ponto: SORRISO });
  const [cv] = await db.select().from(s.convitesChamado).where(eq(s.convitesChamado.chamadoId, ch.id));
  await chamadosSvc.aceitarConvite(ctx, fx(), st.ze, cv!.id);
  const [conv] = await db.select().from(s.conversas).where(eq(s.conversas.chamadoId, ch.id));
  await chat.enviarMensagem(ctx, fx(), st.ze, conv!.id, { tipo: 'TEXTO', conteudo: 'Chego em 10 min' });
  await conteudo.alternarSeguir(ctx, st.real.id, st.borracharia);
  const [pub] = await db.select().from(s.publicacoes).where(eq(s.publicacoes.prestadorId, st.borracharia));
  await conteudo.comentar(ctx, st.real.id, pub!.id, 'Bom trabalho');
  const direta = await equipe.conversaComPrestador(ctx, st.real.id, st.borracharia);
  await chat.enviarMensagem(ctx, fx(), st.real.id, direta.id, { tipo: 'TEXTO', conteudo: 'Oi' });

  // Profissional real com um chamado real (de outra conta real) — não pode ser tocado.
  st.mecanico = await contas.cadastrar(ctx, { nome: 'Mecânico Real', telefone: '66977776666', email: 'mec@exemplo.com', senha: '12345678', cidadeId: cidade!.id });
  st.oficinaReal = await prest.criarPrestador(ctx, st.mecanico.id, { tipo: 'AUTONOMO', nomeComercial: 'Oficina Real', usuarioNome: 'oficinareal', cidadeId: cidade!.id, baseLat: SORRISO.lat, baseLng: SORRISO.lng, categorias: [cat] });
  await conteudo.publicar(ctx, st.mecanico.id, st.oficinaReal.id, { descricao: 'Trabalho real', midias: [{ tipo: 'IMAGEM', url: 'https://x/y.jpg' }] });
  const v2 = await contas.adicionarVeiculo(ctx, st.mecanico.id, { marca: 'Fiat', modelo: 'Uno', ano: 2010 });
  st.outro = await contas.cadastrar(ctx, { nome: 'Outra Real', telefone: '66966665555', email: 'outra@exemplo.com', senha: '12345678', cidadeId: cidade!.id });
  const v3 = await contas.adicionarVeiculo(ctx, st.outro.id, { marca: 'VW', modelo: 'Gol', ano: 2012 });
  st.chamadoReal = await chamadosSvc.criarChamado(ctx, fx(), st.outro.id, { veiculoId: v3.id, categoriaId: cat, modalidade: 'ESCOLHER_PROFISSIONAL', prestadorId: st.oficinaReal.id, ponto: SORRISO });
  void v2;
  // O admin de demonstração agiu sobre o chamado real (fica sem autor, mas o chamado continua).
  await db.insert(s.eventosChamado).values({ chamadoId: st.chamadoReal.id, evento: 'NOTA_SUPORTE', para: st.chamadoReal.estado, ator: 'ADMIN', atorId: st.adminDemo });
  await db.insert(s.registrosAdmin).values({ adminId: st.adminDemo, acao: 'TESTE', alvo: 'chamado', alvoId: st.chamadoReal.id });
});

afterAll(async () => { await pool?.end(); });

describe('remoção dos dados de demonstração', () => {
  it('apaga contas, profissionais, chamados e conteúdo da demonstração', async () => {
    const r = await removerDemo(db);
    expect(r).toMatchObject({ usuarios: 5, prestadores: 2 });
    expect(r.chamados).toBe(1); // o chamado do cliente real com o Zé
    expect(r.publicacoes).toBe(4);
    expect(await db.select().from(s.usuarios).where(inArray(s.usuarios.email, EMAILS_DEMO))).toHaveLength(0);
    expect(await db.select().from(s.prestadores).where(inArray(s.prestadores.usuarioNome, ['borrachariadoze', 'autocentertp']))).toHaveLength(0);
    expect(await db.select().from(s.mensagens).where(eq(s.mensagens.autorId, st.ze))).toHaveLength(0);
    expect(await db.select().from(s.registrosAdmin)).toHaveLength(0);
  });

  it('mantém contas reais, o profissional real, o chamado real e os dados básicos', async () => {
    const emails = (await db.select({ e: s.usuarios.email }).from(s.usuarios)).map((u) => u.e).sort();
    expect(emails).toEqual(['mec@exemplo.com', 'outra@exemplo.com', 'real@exemplo.com']);
    expect(await db.select().from(s.prestadores)).toHaveLength(1);
    const [ch] = await db.select().from(s.chamados).where(eq(s.chamados.id, st.chamadoReal.id));
    expect(ch).toBeDefined();
    const [ev] = await db.select().from(s.eventosChamado).where(eq(s.eventosChamado.evento, 'NOTA_SUPORTE'));
    expect(ev!.atorId).toBeNull();
    expect(await db.select().from(s.veiculos)).toHaveLength(3);
    expect(await db.select().from(s.publicacoes)).toHaveLength(1);
    expect(await contar(s.categorias)).toBe(13);
    expect(await contar(s.cidades)).toBe(1);
    expect((await db.select().from(s.configuracoes)).length).toBeGreaterThan(0);
  });

  it('é idempotente: rodar de novo não apaga nada', async () => {
    expect(await removerDemo(db)).toEqual({ usuarios: 0, prestadores: 0, chamados: 0, publicacoes: 0 });
    expect(await contar(s.usuarios)).toBe(3);
  });
});

describe('administrador geral', () => {
  it('lê ADMIN_EMAILS sem diferenciar maiúsculas e ignora entradas inválidas', () => {
    expect(emailsAdmin({ ADMIN_EMAILS: ' Zilglezio@Gmail.com , , x ' })).toEqual(['zilglezio@gmail.com']);
    expect(emailsAdmin({})).toEqual([]);
  });

  it('promove na inicialização e no login; outras contas não', async () => {
    expect(await promoverAdmins(db, ['real@exemplo.com'])).toBe(1);
    expect(await promoverAdmins(db, ['real@exemplo.com'])).toBe(0);
    const antes = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'MEC@exemplo.com';
    try {
      expect((await contas.entrar(ctx, 'mec@exemplo.com', '12345678')).ehAdmin).toBe(true);
      expect((await contas.entrar(ctx, 'outra@exemplo.com', '12345678')).ehAdmin).toBe(false);
      await expect(contas.entrar(ctx, 'mec@exemplo.com', 'errada')).rejects.toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
    } finally {
      process.env.ADMIN_EMAILS = antes;
    }
    const admins = (await db.select({ e: s.usuarios.email }).from(s.usuarios).where(eq(s.usuarios.ehAdmin, true))).map((u) => u.e).sort();
    expect(admins).toEqual(['mec@exemplo.com', 'real@exemplo.com']);
  });
});
