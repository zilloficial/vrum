/** Cliente da API, sessão e peças comuns do painel. */
import { createContext, useCallback, useContext, useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ROTULO_ESTADO, type EstadoChamado } from '@vrum/shared';

/** Aceita a URL completa ou só o domínio (como o Render informa): nesse caso, usa https. */
function urlDaApi(bruta: string | undefined) {
  if (!bruta) return 'http://localhost:3333';
  const limpa = bruta.trim().replace(/\/$/, '');
  if (/^https?:\/\//.test(limpa)) return limpa;
  // O Render pode informar só o nome interno do serviço (ex.: "vrum-api"), que o navegador
  // não alcança. Sem domínio, usa o endereço público dele: <nome>.onrender.com.
  return limpa.includes('.') ? `https://${limpa}` : `https://${limpa}.onrender.com`;
}
export const API_URL = urlDaApi(import.meta.env.VITE_API_URL as string | undefined);
let token = (() => { try { return localStorage.getItem('vrum.painel.token'); } catch { return null; } })();

export async function api<T = any>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const r = await fetch(API_URL + rota, {
    method: metodo,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  }).catch(() => { throw new Error('Sem conexão com o servidor.'); });
  if (r.status === 204) return undefined as T;
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.mensagem ?? 'Algo deu errado.');
  return d as T;
}
export const get = <T = any>(r: string) => api<T>('GET', r);
export const post = <T = any>(r: string, c?: unknown) => api<T>('POST', r, c ?? {});

export interface Vinculo { membroId: string; funcao: 'DONO' | 'GESTOR' | 'PROFISSIONAL'; prestador: { id: string; nomeComercial: string; usuarioNome: string; verificado: boolean } }
export interface Eu { id: string; nome: string; email: string; ehAdmin: boolean; vinculos: Vinculo[] }

interface Sessao {
  eu: Eu | null; empresa: Vinculo | null; carregando: boolean;
  entrar(l: string, s: string): Promise<void>; sair(): void; escolherEmpresa(id: string): void; avisar(t: string, erro?: boolean): void;
}
const Ctx = createContext<Sessao>(null as unknown as Sessao);
export const useSessao = () => useContext(Ctx);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ t: string; erro?: boolean } | null>(null);

  const carregar = useCallback(async () => {
    try { setEu(await get('/me')); } catch { token = null; setEu(null); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { if (token) void carregar(); else setCarregando(false); }, [carregar]);

  const gestao = eu?.vinculos.filter((v) => v.funcao !== 'PROFISSIONAL') ?? [];
  const valor: Sessao = {
    eu, carregando,
    empresa: gestao.find((v) => v.prestador.id === empresaId) ?? gestao[0] ?? null,
    async entrar(login, senha) {
      const r = await post<{ token: string }>('/auth/entrar', { login, senha });
      token = r.token;
      try { localStorage.setItem('vrum.painel.token', r.token); } catch { /* sem armazenamento */ }
      await carregar();
    },
    sair() { token = null; try { localStorage.removeItem('vrum.painel.token'); } catch { /* */ } setEu(null); },
    escolherEmpresa: setEmpresaId,
    avisar(t, erro) { setToast({ t, erro }); setTimeout(() => setToast(null), 3000); },
  };
  return <Ctx.Provider value={valor}>{children}{toast && <div className={`toast${toast.erro ? ' erro' : ''}`}>{toast.t}</div>}</Ctx.Provider>;
}

/** Carrega uma rota e oferece recarregar. */
export function useDados<T>(rota: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = useCallback(async () => {
    if (!rota) return;
    try { setDados(await get<T>(rota)); setErro(null); } catch (e) { setErro((e as Error).message); }
  }, [rota]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

const CLASSE: Partial<Record<EstadoChamado, string>> = {
  BUSCANDO_PROFISSIONAL: 'info', AGUARDANDO_RESPOSTA: 'info', ACEITO_COMBINANDO: 'alerta', CONFIRMADO: 'vivo', A_CAMINHO: 'vivo',
  NO_LOCAL: 'vivo', EM_ATENDIMENTO: 'vivo', CONCLUSAO_SOLICITADA: 'alerta', CONCLUIDO: 'ok', CANCELADO: 'erro', SEM_ATENDIMENTO: 'erro',
};
export const Estado = ({ e }: { e: EstadoChamado }) => <span className={`selo ${CLASSE[e] ?? ''}`}><span className="pt" />{ROTULO_ESTADO[e]}</span>;

export const data = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function Tabela<T>({ linhas, colunas, vazio = 'Nada por aqui.' }: {
  linhas: T[] | null; colunas: { titulo: string; celula: (l: T) => ReactNode; largura?: number }[]; vazio?: string;
}) {
  if (!linhas) return <div className="card vazio">Carregando…</div>;
  if (!linhas.length) return <div className="card vazio">{vazio}</div>;
  return (
    <div className="rolagem">
      <table className="tabela">
        <thead><tr>{colunas.map((c) => <th key={c.titulo} style={c.largura ? { width: c.largura } : undefined}>{c.titulo}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{colunas.map((c) => <td key={c.titulo}>{c.celula(l)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Modal({ aberto, titulo, aoFechar, children }: { aberto: boolean; titulo: string; aoFechar: () => void; children: ReactNode }) {
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog"><h2>{titulo}</h2>{children}</div>
    </div>
  );
}

/** Pede um texto (motivo, justificativa) antes de executar uma ação. */
export function usePedirTexto() {
  const [estado, setEstado] = useState<{ titulo: string; rotulo: string; minimo: number; ok: (t: string) => Promise<void> } | null>(null);
  const [texto, setTexto] = useState('');
  const { avisar } = useSessao();
  const pedir = (titulo: string, rotulo: string, ok: (t: string) => Promise<void>, minimo = 5) => { setTexto(''); setEstado({ titulo, rotulo, minimo, ok }); };
  const elemento = (
    <Modal aberto={!!estado} titulo={estado?.titulo ?? ''} aoFechar={() => setEstado(null)}>
      <div className="campo"><label>{estado?.rotulo}</label><textarea className="entrada" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button className="btn secundario" onClick={() => setEstado(null)}>Voltar</button>
        <button className="btn primario" disabled={texto.trim().length < (estado?.minimo ?? 0)}
          onClick={async () => { try { await estado!.ok(texto.trim()); setEstado(null); } catch (e) { avisar((e as Error).message, true); } }}>Confirmar</button>
      </div>
    </Modal>
  );
  return { pedir, elemento };
}

export const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Campo de senha com botão para mostrar/esconder o que está sendo digitado. */
export function CampoSenha(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="campo-senha">
      <input {...props} type={visivel ? 'text' : 'password'} className={props.className ?? 'entrada'}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="olho" onClick={() => setVisivel(!visivel)}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={visivel} title={visivel ? 'Esconder senha' : 'Mostrar senha'}>
        {visivel ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
