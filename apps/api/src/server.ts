import { criarDb } from './db/cliente.js';
import { criarApp } from './http/app.js';
import { despachar, Efeitos, REGRAS_PADRAO, type Contexto, type Emissor } from './nucleo.js';
import { processarPrazos } from './servicos/chamados.js';
import { carregarRegras } from './servicos/admin.js';
import { criarTempoReal } from './tempo-real/socket.js';
import { webPush } from './servicos/push.js';
import { armazenamentoDoAmbiente } from './servicos/armazenamento.js';
import { servicoRotasDoAmbiente } from './servicos/rotas.js';

const url = process.env.DATABASE_URL;
const segredo = process.env.JWT_SECRET;
if (!url || !segredo) throw new Error('Defina DATABASE_URL e JWT_SECRET (veja .env.example).');

const { db, pool } = criarDb(url);
const ctx: Contexto = { db, regras: { ...REGRAS_PADRAO }, agora: () => new Date() };
await carregarRegras(ctx); // prazos alterados pelo painel administrativo

const porta = Number(process.env.PORT ?? 3333);
const pastaArquivos = process.env.PASTA_ARQUIVOS ?? './arquivos';
// No Render, RENDER_EXTERNAL_URL é preenchida automaticamente.
const urlPublica = process.env.URL_PUBLICA ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${porta}`;

// Integrações: cada uma liga sozinha quando a variável de ambiente existe.
const armazenamento = armazenamentoDoAmbiente(pastaArquivos, urlPublica);
const rotas = servicoRotasDoAmbiente();
const push = webPush(db);

let emissor: Emissor | undefined;
const app = criarApp(ctx, {
  jwtSecret: segredo, corsOrigin: process.env.CORS_ORIGIN, emissor: () => emissor,
  pastaArquivos, urlPublica, armazenamento, rotas, push,
});
await app.ready();
const tempoReal = criarTempoReal(app.server, ctx, (t) => app.jwt.verify(t), process.env.CORS_ORIGIN).emissor;
emissor = { emitir: tempoReal.emitir, push: (usuarioId, aviso) => push.enviar(usuarioId, aviso) };
app.log.info(`Arquivos: ${armazenamento.nome} · Rotas: ${rotas.nome} · Push: web (chaves ${process.env.VAPID_PUBLICA ? 'do ambiente' : 'do banco'})`);

// Prazos: convites, conclusão automática, abandono e disponibilidade.
// O advisory lock garante uma única execução mesmo com várias instâncias da API.
const TRAVA_PRAZOS = 7861;
setInterval(async () => {
  const conexao = await pool.connect();
  try {
    const { rows } = await conexao.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [TRAVA_PRAZOS]);
    if (!rows[0]?.ok) return;
    try {
      const fx = new Efeitos();
      await processarPrazos(ctx, fx);
      despachar(fx, emissor);
    } finally {
      await conexao.query('select pg_advisory_unlock($1)', [TRAVA_PRAZOS]);
    }
  } catch (e) {
    app.log.error(e, 'falha ao processar prazos');
  } finally {
    conexao.release();
  }
}, 5_000);

await app.listen({ port: porta, host: '0.0.0.0' });
