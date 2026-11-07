import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BatteryCharging, BadgeCheck, CalendarClock, Car, CircleHelp, Cog, Droplets, Fuel, Gauge, Home,
  KeyRound, LayoutDashboard, Map as IconeMapa, MessageCircle, ClipboardList, Star, Thermometer, Truck, User,
  Wrench, Zap, Disc3, BellRing, type LucideIcon, Images,
} from 'lucide-react';
import { ROTULO_ESTADO, type EstadoChamado } from '@vrum/shared';
import { useSessao } from './sessao';
import { ativarPush, estadoPush } from './notificacoes-web';

export function Cabecalho({ titulo, voltar = true, direita }: { titulo: ReactNode; voltar?: boolean | string; direita?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="cabecalho">
      {voltar && (
        <button className="voltar" aria-label="Voltar" onClick={() => (typeof voltar === 'string' ? nav(voltar) : nav(-1))}>
          <ArrowLeft size={20} />
        </button>
      )}
      <h1 className="cresce corta">{titulo}</h1>
      {direita}
    </div>
  );
}

export function Avatar({ nome, url, tamanho = 44 }: { nome: string; url?: string | null; tamanho?: number }) {
  if (url) return <img className="avatar" src={url} alt="" style={{ width: tamanho, height: tamanho }} />;
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return <div className="avatar" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}>{iniciais}</div>;
}

export function Verificado({ tamanho = 16 }: { tamanho?: number }) {
  return <span className="verificado" title="Verificado pelo VRUM"><BadgeCheck size={tamanho} /></span>;
}

export function Nota({ nota, total }: { nota: number | null; total: number }) {
  if (!total) return <span className="mini">Novo no VRUM</span>;
  return <span className="estrela"><Star size={13} fill="currentColor" /> {nota?.toFixed(1)} <span className="mini">({total})</span></span>;
}

const CLASSE_ESTADO: Partial<Record<EstadoChamado, string>> = {
  BUSCANDO_PROFISSIONAL: 'info', AGUARDANDO_RESPOSTA: 'info', ACEITO_COMBINANDO: 'alerta',
  CONFIRMADO: 'vivo', A_CAMINHO: 'vivo', NO_LOCAL: 'vivo', EM_ATENDIMENTO: 'vivo', CONCLUSAO_SOLICITADA: 'alerta',
  CONCLUIDO: 'ok', CANCELADO: 'erro', SEM_ATENDIMENTO: 'erro',
};
export function SeloEstado({ estado }: { estado: EstadoChamado }) {
  return <span className={`selo ${CLASSE_ESTADO[estado] ?? ''}`}><span className="pt" />{ROTULO_ESTADO[estado]}</span>;
}

const ICONES: Record<string, LucideIcon> = {
  guincho: Truck, 'pneus-rodas': Disc3, 'bateria-partida': BatteryCharging, mecanica: Wrench, arrefecimento: Thermometer,
  autoeletrica: Zap, chaveiro: KeyRound, combustivel: Fuel, 'freios-direcao-suspensao': Gauge, 'cambio-embreagem': Cog,
  'vidros-visibilidade': Droplets, agendados: CalendarClock, 'nao-sei': CircleHelp,
};
export function IconeCategoria({ slug, tamanho = 22 }: { slug: string; tamanho?: number }) {
  const I = ICONES[slug] ?? Car;
  return <I size={tamanho} />;
}

export const Carregando = () => <div className="girando" aria-label="Carregando" />;

export function Vazio({ icone: I = ClipboardList, titulo, texto, acao }: { icone?: LucideIcon; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="vazio">
      <I size={36} />
      <h3 style={{ color: 'var(--texto)' }}>{titulo}</h3>
      {texto && <p className="mini" style={{ margin: 0 }}>{texto}</p>}
      {acao}
    </div>
  );
}

export function Folha({ aberta, aoFechar, children }: { aberta: boolean; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberta, aoFechar]);
  if (!aberta) return null;
  return (
    <div className="fundo-modal" onClick={aoFechar}>
      <div className="folha" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="alca" />
        {children}
      </div>
    </div>
  );
}

export function Estrelas({ valor, aoMudar }: { valor: number; aoMudar: (n: number) => void }) {
  return (
    <div className="estrelas">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={n <= valor ? 'on' : ''} onClick={() => aoMudar(n)} aria-label={`${n} estrelas`}>
          <Star size={36} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export function Erro({ texto }: { texto: string | null }) {
  return texto ? <div className="erro-msg" role="alert">{texto}</div> : null;
}

export function Abas() {
  const { area, naoLidas } = useSessao();
  const abas = area === 'prestador'
    ? [
        { para: '/p', icone: LayoutDashboard, nome: 'Painel', fim: true },
        { para: '/p/chamados', icone: ClipboardList, nome: 'Chamados' },
        { para: '/p/publicacoes', icone: Images, nome: 'Vitrine' },
        { para: '/mensagens', icone: MessageCircle, nome: 'Mensagens' },
        { para: '/perfil', icone: User, nome: 'Perfil' },
      ]
    : [
        { para: '/', icone: Home, nome: 'Início', fim: true },
        { para: '/mapa', icone: IconeMapa, nome: 'Mapa' },
        { para: '/chamados', icone: ClipboardList, nome: 'Chamados' },
        { para: '/mensagens', icone: MessageCircle, nome: 'Mensagens' },
        { para: '/perfil', icone: User, nome: 'Perfil' },
      ];
  return (
    <nav className="abas">
      {abas.map(({ para, icone: I, nome, fim }) => (
        <NavLink key={para} to={para} end={fim} className={({ isActive }) => `aba${isActive ? ' ativa' : ''}`}>
          <I size={22} />
          {nome}
          {nome === 'Perfil' && naoLidas > 0 && <span className="contador">{naoLidas}</span>}
        </NavLink>
      ))}
    </nav>
  );
}



/** Convite para ativar as notificações do navegador (só aparece enquanto estiver pendente). */
export function AvisoNotificacoes({ texto }: { texto: string }) {
  const { avisar } = useSessao();
  const [estado, setEstado] = useState(estadoPush());
  const [fechado, setFechado] = useState(() => { try { return sessionStorage.getItem('vrum.aviso-push') === '1'; } catch { return false; } });
  if (estado !== 'pendente' || fechado) return null;
  async function ativar() {
    try {
      const r = await ativarPush();
      setEstado(r);
      avisar(r === 'ativado' ? 'Notificações ativadas' : r === 'bloqueado' ? 'Notificações bloqueadas no navegador' : 'Notificações não ativadas', r !== 'ativado');
    } catch (e) { avisar((e as Error).message, true); }
  }
  return (
    <div className="card linha" style={{ boxShadow: 'inset 0 0 0 1.5px #4da3ff55' }}>
      <BellRing size={22} color="var(--info)" style={{ flex: 'none' }} />
      <div className="cresce mini" style={{ color: 'var(--texto)' }}>{texto}</div>
      <button className="btn primario peq" onClick={ativar}>Ativar</button>
      <button className="link" style={{ color: 'var(--texto-3)' }} aria-label="Dispensar"
        onClick={() => { setFechado(true); try { sessionStorage.setItem('vrum.aviso-push', '1'); } catch { /* */ } }}>✕</button>
    </div>
  );
}
