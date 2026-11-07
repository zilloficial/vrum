/**
 * Dados de demonstração em Sorriso–MT. Use só em desenvolvimento:
 *   npm run db:demo
 * Contas (senha de todas: vrum1234):
 *   motorista  ana@vrum.app
 *   autônomo   ze@vrum.app      (Borracharia do Zé)
 *   empresa    oficina@vrum.app (Auto Center Teles Pires) + mecânico joao@vrum.app
 *   admin      admin@vrum.app
 */
import { eq, inArray } from 'drizzle-orm';
import { criarDb } from './cliente.js';
import * as s from './schema.js';
import { REGRAS_PADRAO, type Contexto } from '../nucleo.js';
import * as contas from '../servicos/contas.js';
import * as prest from '../servicos/prestadores.js';
import * as conteudo from '../servicos/conteudo.js';
import * as equipe from '../servicos/equipe.js';

const SORRISO = { lat: -12.5425, lng: -55.7211 };

/** Ilustração simples (SVG) para as publicações de exemplo. */
function ilustracao(titulo: string, cor: string, simbolo: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1e24"/><stop offset="1" stop-color="${cor}"/></linearGradient></defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <circle cx="400" cy="430" r="220" fill="none" stroke="#c6ff00" stroke-width="18" opacity=".9"/>
  <text x="400" y="500" font-size="200" text-anchor="middle" fill="#f5f7fa" font-family="sans-serif">${simbolo}</text>
  <text x="400" y="820" font-size="56" text-anchor="middle" fill="#f5f7fa" font-family="sans-serif" font-weight="800">${titulo}</text>
</svg>`;
}

export async function demo(url: string, pastaArquivos: string, urlPublica: string) {
  const { db, pool } = criarDb(url);
  const ctx: Contexto = { db, regras: REGRAS_PADRAO, agora: () => new Date() };
  try {
    const [ja] = await db.select().from(s.usuarios).where(eq(s.usuarios.email, 'ana@vrum.app'));
    if (ja) { console.log('Dados de demonstração já existem.'); return; }
    const [cidade] = await db.select().from(s.cidades).where(eq(s.cidades.slug, 'sorriso-mt'));
    if (!cidade) throw new Error('Rode o seed antes (npm run db:seed).');
    const cats = Object.fromEntries((await db.select().from(s.categorias)).map((c) => [c.slug, c.id]));
    const conta = (nome: string, email: string, telefone: string) =>
      contas.cadastrar(ctx, { nome, email, telefone, senha: 'vrum1234', cidadeId: cidade.id });

    // Imagens embutidas (data URI): sobrevivem a servidores com disco temporário.
    void pastaArquivos; void urlPublica;
    const imagem = (_nome: string, titulo: string, cor: string, simbolo: string) =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ilustracao(titulo, cor, simbolo))}`;

    const ana = await conta('Ana Souza', 'ana@vrum.app', '66999990001');
    await contas.adicionarVeiculo(ctx, ana.id, { tipo: 'CAMINHONETE', marca: 'Toyota', modelo: 'Hilux', ano: 2022, versao: 'SRV', combustivel: 'Diesel', cor: 'Prata', placa: 'QBX1A23', observacoes: 'Estepe sob a caçamba' });
    await contas.adicionarVeiculo(ctx, ana.id, { marca: 'Fiat', modelo: 'Argo', ano: 2020, combustivel: 'Flex', cor: 'Branco' });

    const ze = await conta('José Ferreira', 'ze@vrum.app', '66999990002');
    const borracharia = await prest.criarPrestador(ctx, ze.id, {
      tipo: 'AUTONOMO', nomeComercial: 'Borracharia do Zé', usuarioNome: 'borrachariadoze', cidadeId: cidade.id,
      baseLat: SORRISO.lat + 0.012, baseLng: SORRISO.lng - 0.006, raioCoberturaKm: 25, categorias: [cats['pneus-rodas']!, cats['bateria-partida']!], modalidade: 'NO_LOCAL',
    });
    await conteudo.atualizarPerfil(ctx, ze.id, borracharia.id, {
      apresentacao: 'Socorro de pneus 24h em Sorriso e região. Vou até você na cidade e na BR-163.', plantao: true,
      enderecoComercial: 'Av. Blumenau, Centro', infoDeslocamento: 'Taxa de deslocamento a partir de R$ 30 fora do perímetro urbano.',
      horarios: { seg: [['06:00', '22:00']], ter: [['06:00', '22:00']], qua: [['06:00', '22:00']], qui: [['06:00', '22:00']], sex: [['06:00', '22:00']], sab: [['06:00', '18:00']] },
    });
    await prest.definirDisponibilidade(ctx, ze.id, borracharia.id, true, 24);

    const dono = await conta('Marcos Teles', 'oficina@vrum.app', '66999990003');
    const oficina = await prest.criarPrestador(ctx, dono.id, {
      tipo: 'EMPRESA', nomeComercial: 'Auto Center Teles Pires', usuarioNome: 'autocentertp', cidadeId: cidade.id,
      baseLat: SORRISO.lat - 0.008, baseLng: SORRISO.lng + 0.01, raioCoberturaKm: 40,
      categorias: [cats['mecanica']!, cats['autoeletrica']!, cats['guincho']!, cats['arrefecimento']!, cats['agendados']!, cats['nao-sei']!], modalidade: 'AMBOS',
    });
    await conteudo.atualizarPerfil(ctx, dono.id, oficina.id, {
      apresentacao: 'Mecânica diesel e flex, autoelétrica e guincho próprio. Atendemos caminhonetes e caminhões.',
      enderecoComercial: 'Rua das Palmeiras, 1200 — Industrial', veiculosAtendidos: ['CARRO', 'CAMINHONETE', 'CAMINHAO'],
      horarios: { seg: [['07:30', '18:00']], ter: [['07:30', '18:00']], qua: [['07:30', '18:00']], qui: [['07:30', '18:00']], sex: [['07:30', '18:00']], sab: [['08:00', '12:00']] },
    });
    const joao = await conta('João Batista', 'joao@vrum.app', '66999990004');
    await equipe.adicionarMembro(ctx, dono.id, oficina.id, { login: 'joao@vrum.app', funcao: 'PROFISSIONAL' });
    await prest.definirDisponibilidade(ctx, joao.id, oficina.id, true, 24);
    await db.update(s.prestadores).set({ verificadoEm: new Date() }).where(inArray(s.prestadores.id, [oficina.id, borracharia.id]));

    const pubs: [string, string, string, string, string, string, string][] = [
      [oficina.id, dono.id, 'Revisão completa de Hilux 2.8 diesel: troca de óleo, filtros e correia.', 'mecanica', 'revisao.svg', 'Revisão diesel', '#2b3a12'],
      [borracharia.id, ze.id, 'Socorro na BR-163 às 23h — pneu estourado trocado em 20 minutos.', 'pneus-rodas', 'pneu.svg', 'Socorro 24h', '#12233a'],
      [oficina.id, dono.id, 'Guincho plataforma levando S10 até a oficina. Atendemos zona rural.', 'guincho', 'guincho.svg', 'Guincho', '#3a1f12'],
      [borracharia.id, ze.id, 'Carga de bateria no estacionamento do mercado. Carro ligou na hora!', 'bateria-partida', 'bateria.svg', 'Carga de bateria', '#2a123a'],
    ];
    for (const [pid, autor, descricao, slug, arq, titulo, cor] of pubs) {
      await conteudo.publicar(ctx, autor, pid, { descricao, categoriaId: cats[slug], midias: [{ tipo: 'IMAGEM', url: imagem(arq, titulo, cor, '⚙') }] });
    }

    const adm = await conta('Admin VRUM', 'admin@vrum.app', '66999990009');
    await db.update(s.usuarios).set({ ehAdmin: true }).where(eq(s.usuarios.id, adm.id));
    console.log('Dados de demonstração criados. Senha de todas as contas: vrum1234');
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const porta = process.env.PORT ?? '3333';
  await demo(url, process.env.PASTA_ARQUIVOS ?? './arquivos', process.env.URL_PUBLICA ?? `http://localhost:${porta}`);
}
