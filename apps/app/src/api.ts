/** Cliente da API do VRUM. Guarda o token com o Preferences do Capacitor (cai no localStorage na web). */
import { Preferences } from '@capacitor/preferences';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3333';

let token: string | null = null;

export async function carregarToken() {
  token = (await Preferences.get({ key: 'vrum.token' })).value;
  return token;
}
export async function salvarToken(t: string | null) {
  token = t;
  if (t) await Preferences.set({ key: 'vrum.token', value: t });
  else await Preferences.remove({ key: 'vrum.token' });
}
export const tokenAtual = () => token;

export class ErroApi extends Error {
  constructor(public codigo: string, mensagem: string, public status: number) { super(mensagem); }
}

let aoSair: (() => void) | undefined;
export const quandoSessaoExpirar = (fn: () => void) => { aoSair = fn; };

export async function api<T = any>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_URL + rota, {
      method: metodo,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi('SEM_CONEXAO', 'Sem conexão com o servidor. Verifique sua internet.', 0);
  }
  if (r.status === 204) return undefined as T;
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && token) aoSair?.();
    throw new ErroApi(dados?.codigo ?? 'ERRO', dados?.mensagem ?? 'Algo deu errado.', r.status);
  }
  return dados as T;
}

export const get = <T = any>(rota: string) => api<T>('GET', rota);
export const post = <T = any>(rota: string, corpo?: unknown) => api<T>('POST', rota, corpo ?? {});
export const patch = <T = any>(rota: string, corpo: unknown) => api<T>('PATCH', rota, corpo);

/** Envia foto, vídeo, áudio ou documento e devolve a URL pública. */
export async function enviarArquivo(arquivo: Blob, nome = 'arquivo') {
  const fd = new FormData();
  fd.append('arquivo', arquivo, nome);
  const r = await fetch(API_URL + '/arquivos', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(dados?.codigo ?? 'ERRO', dados?.mensagem ?? 'Falha no envio.', r.status);
  return dados as { url: string; tipo: 'IMAGEM' | 'VIDEO' | 'AUDIO' | 'DOCUMENTO' };
}

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function tempoRelativo(d: string | Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} d`;
  return new Date(d).toLocaleDateString('pt-BR');
}

export const hora = (d: string | Date) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
