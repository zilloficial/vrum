/**
 * Armazenamento de arquivos (fotos, vídeos, áudios e documentos).
 *
 * - Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: grava no Supabase Storage
 *   (bucket público SUPABASE_BUCKET, padrão "vrum"). Os arquivos sobrevivem a
 *   reinícios do servidor.
 * - Sem essas variáveis: grava no disco local (desenvolvimento).
 *
 * Os nomes são aleatórios (UUID), então não dá para adivinhar o endereço de um arquivo.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { ErroApp } from '../nucleo.js';

export interface Armazenamento {
  nome: 'supabase' | 'disco';
  /** `conferir` roda depois de ler o arquivo e antes de publicá-lo (ex.: limite de tamanho). */
  salvar(fluxo: Readable, opts: { extensao: string; tipoMime: string; pasta: string; conferir?: () => void }): Promise<string>;
}

export function armazenamentoEmDisco(pasta: string, urlPublica: string): Armazenamento {
  mkdirSync(pasta, { recursive: true });
  return {
    nome: 'disco',
    async salvar(fluxo, { extensao, conferir }) {
      const nome = `${randomUUID()}${extensao}`;
      await pipeline(fluxo, createWriteStream(resolve(pasta, nome)));
      conferir?.();
      return `${urlPublica}/arquivos/${nome}`;
    },
  };
}

async function lerTudo(fluxo: Readable): Promise<Buffer> {
  const partes: Buffer[] = [];
  for await (const p of fluxo) partes.push(Buffer.isBuffer(p) ? p : Buffer.from(p));
  return Buffer.concat(partes);
}

export function armazenamentoSupabase(c: { url: string; chave: string; bucket: string; fetch?: typeof fetch }): Armazenamento {
  const base = c.url.replace(/\/$/, '');
  const f = c.fetch ?? fetch;
  return {
    nome: 'supabase',
    async salvar(fluxo, { extensao, tipoMime, pasta, conferir }) {
      const caminho = `${pasta}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${extensao}`;
      const corpo = await lerTudo(fluxo);
      conferir?.();
      const r = await f(`${base}/storage/v1/object/${c.bucket}/${caminho}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${c.chave}`, apikey: c.chave,
          'content-type': tipoMime, 'x-upsert': 'false', 'cache-control': '31536000',
        },
        body: new Uint8Array(corpo),
      });
      if (!r.ok) {
        const detalhe = await r.text().catch(() => '');
        console.error('Falha no Supabase Storage', r.status, detalhe.slice(0, 300));
        throw new ErroApp('FALHA_ARMAZENAMENTO', 'Não foi possível salvar o arquivo agora. Tente novamente.', 502);
      }
      return `${base}/storage/v1/object/public/${c.bucket}/${caminho}`;
    },
  };
}

/** Escolhe o armazenamento pelas variáveis de ambiente. */
export function armazenamentoDoAmbiente(pastaLocal: string, urlPublica: string): Armazenamento {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && chave) return armazenamentoSupabase({ url, chave, bucket: process.env.SUPABASE_BUCKET ?? 'vrum' });
  return armazenamentoEmDisco(pastaLocal, urlPublica);
}
