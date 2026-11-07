/** Sessão: conta, área atual (motorista ou prestador), catálogo e avisos. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';
import { carregarToken, get, post, quandoSessaoExpirar, salvarToken } from './api';
import { conectar, desconectar } from './tempo-real';
import type { Categoria, Eu, Vinculo } from './tipos';

type Area = 'motorista' | 'prestador';

interface Sessao {
  carregando: boolean;
  eu: Eu | null;
  area: Area;
  vinculo: Vinculo | null;
  categorias: Categoria[];
  naoLidas: number;
  entrar(login: string, senha: string): Promise<void>;
  cadastrar(d: { nome: string; telefone: string; email: string; senha: string; cidadeId?: string }): Promise<void>;
  sair(): Promise<void>;
  recarregar(): Promise<void>;
  trocarArea(a: Area, prestadorId?: string): void;
  avisar(texto: string, erro?: boolean): void;
  zerarNaoLidas(): void;
}

const Ctx = createContext<Sessao>(null as unknown as Sessao);
export const useSessao = () => useContext(Ctx);

async function registrarPush() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return;
    await PushNotifications.addListener('registration', (t) => {
      void post('/me/dispositivos', { plataforma: Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID', token: t.value });
    });
    await PushNotifications.register();
  } catch { /* push é só aviso; a central de notificações continua funcionando */ }
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [eu, setEu] = useState<Eu | null>(null);
  const [area, setArea] = useState<Area>('motorista');
  const [prestadorId, setPrestadorId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [toast, setToast] = useState<{ texto: string; erro?: boolean } | null>(null);
  const timer = useRef<number>();

  const avisar = useCallback((texto: string, erro?: boolean) => {
    setToast({ texto, erro });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const recarregar = useCallback(async () => {
    const dados = await get<Eu>('/me');
    setEu(dados);
    const n = await get<{ lidaEm: string | null }[]>('/notificacoes');
    setNaoLidas(n.filter((x) => !x.lidaEm).length);
  }, []);

  const iniciar = useCallback(async () => {
    await recarregar();
    const salvo = (await Preferences.get({ key: 'vrum.area' })).value;
    if (salvo) {
      const [a, pid] = salvo.split(':');
      setArea(a as Area);
      setPrestadorId(pid || null);
    }
    const s = conectar();
    s.on('notificacao:nova', (n) => {
      setNaoLidas((x) => x + 1);
      avisar(n.titulo);
    });
    void registrarPush();
  }, [recarregar, avisar]);

  useEffect(() => {
    quandoSessaoExpirar(() => { void sair(); });
    (async () => {
      get<Categoria[]>('/categorias').then(setCategorias).catch(() => undefined);
      if (await carregarToken()) {
        try { await iniciar(); } catch { await salvarToken(null); }
      }
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sair = useCallback(async () => {
    await salvarToken(null);
    await Preferences.remove({ key: 'vrum.area' });
    desconectar();
    setEu(null);
    setArea('motorista');
  }, []);

  const valor = useMemo<Sessao>(() => {
    const vinculo = eu?.vinculos.find((v) => v.prestador.id === prestadorId) ?? eu?.vinculos[0] ?? null;
    return {
      carregando, eu, categorias, naoLidas,
      area: area === 'prestador' && vinculo ? 'prestador' : 'motorista',
      vinculo,
      async entrar(login, senha) {
        const r = await post<{ token: string }>('/auth/entrar', { login, senha });
        await salvarToken(r.token);
        await iniciar();
      },
      async cadastrar(d) {
        const r = await post<{ token: string }>('/auth/cadastro', d);
        await salvarToken(r.token);
        await iniciar();
      },
      sair,
      recarregar,
      trocarArea(a, pid) {
        setArea(a);
        if (pid) setPrestadorId(pid);
        void Preferences.set({ key: 'vrum.area', value: `${a}:${pid ?? prestadorId ?? ''}` });
      },
      avisar,
      zerarNaoLidas: () => setNaoLidas(0),
    };
  }, [carregando, eu, categorias, naoLidas, area, prestadorId, iniciar, sair, recarregar, avisar]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      {toast && <div className={`toast${toast.erro ? ' erro' : ''}`} role="status">{toast.texto}</div>}
    </Ctx.Provider>
  );
}
