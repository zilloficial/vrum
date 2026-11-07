import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Bookmark, Briefcase, Camera, Car, ChevronRight, LogOut, Repeat, Shield, Store } from 'lucide-react';
import { enviarArquivo, patch, post, tempoRelativo } from '../api';
import { useSessao } from '../sessao';
import { useDados } from '../ganchos';
import { Avatar, Cabecalho, Carregando, Vazio } from '../componentes';
import { CartaoPublicacao } from '../publicacao';
import type { Publicacao } from '../tipos';

export function Perfil() {
  const nav = useNavigate();
  const { eu, area, vinculo, trocarArea, sair, naoLidas, recarregar, avisar } = useSessao();
  const foto = useRef<HTMLInputElement>(null);
  if (!eu) return null;

  async function trocarFoto(f?: File) {
    if (!f) return;
    try { const r = await enviarArquivo(f, f.name); await patch('/me', { fotoUrl: r.url }); await recarregar(); }
    catch (e) { avisar((e as Error).message, true); }
  }

  const item = (icone: React.ReactNode, texto: string, aoClicar: () => void, extra?: React.ReactNode) => (
    <button className="card clicavel linha" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={aoClicar}>
      {icone}<span className="cresce" style={{ fontWeight: 700 }}>{texto}</span>{extra}<ChevronRight size={18} color="var(--texto-3)" />
    </button>
  );

  return (
    <div className="tela">
      <div className="linha" style={{ gap: 14 }}>
        <button style={{ background: 'none', border: 0, padding: 0, position: 'relative', cursor: 'pointer' }} onClick={() => foto.current?.click()} aria-label="Trocar foto">
          <Avatar nome={eu.nome} url={eu.fotoUrl} tamanho={68} />
          <span style={{ position: 'absolute', right: -2, bottom: -2, background: 'var(--card-2)', borderRadius: '50%', width: 26, height: 26, display: 'grid', placeItems: 'center' }}><Camera size={14} /></span>
        </button>
        <input ref={foto} type="file" accept="image/*" hidden onChange={(e) => trocarFoto(e.target.files?.[0])} />
        <div className="cresce"><h2>{eu.nome}</h2><div className="mini">{eu.email}</div><div className="mini">{eu.telefone}</div></div>
      </div>

      {eu.vinculos.length > 0 && (
        <div className="coluna">
          <div className="micro">Área</div>
          <div className="trocar-area">
            <button className={area === 'motorista' ? 'ativo' : ''} onClick={() => { trocarArea('motorista'); nav('/'); }}>Motorista</button>
            <button className={area === 'prestador' ? 'ativo' : ''} onClick={() => { trocarArea('prestador', vinculo?.prestador.id); nav('/p'); }}>Profissional</button>
          </div>
          {area === 'prestador' && eu.vinculos.length > 1 && (
            <select className="entrada" value={vinculo?.prestador.id} onChange={(e) => trocarArea('prestador', e.target.value)}>
              {eu.vinculos.map((v) => <option key={v.prestador.id} value={v.prestador.id}>{v.prestador.nomeComercial}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="lista">
        {item(<Bell size={20} />, 'Notificações', () => nav('/notificacoes'), naoLidas > 0 ? <span className="selo vivo">{naoLidas}</span> : null)}
        {area === 'motorista' && item(<Car size={20} />, 'Minha garagem', () => nav('/garagem'))}
        {item(<Bookmark size={20} />, 'Publicações salvas', () => nav('/salvos'))}
        {area === 'prestador' && vinculo && item(<Store size={20} />, 'Perfil do negócio', () => nav('/p/perfil'))}
        {area === 'prestador' && vinculo && vinculo.funcao !== 'PROFISSIONAL' && item(<Shield size={20} />, 'Documentos e verificação', () => nav('/p/documentos'))}
        {area === 'prestador' && vinculo && item(<Repeat size={20} />, 'Ver meu perfil público', () => nav(`/perfis/${vinculo.prestador.usuarioNome}`))}
        {eu.vinculos.length === 0 && item(<Briefcase size={20} color="var(--verde)" />, 'Sou profissional automotivo', () => nav('/tornar-profissional'))}
      </div>

      {eu.vinculos.some((v) => v.funcao !== 'PROFISSIONAL') && (
        <div className="info-msg">Para gerenciar a equipe e ver relatórios, acesse o painel web da empresa.</div>
      )}
      {eu.ehAdmin && <div className="info-msg">Você é administrador. Use o painel web para gerenciar a plataforma.</div>}

      <button className="btn perigo bloco" onClick={sair}><LogOut size={18} /> Sair</button>
    </div>
  );
}

interface Notificacao { id: string; tipo: string; titulo: string; corpo: string; chamadoId: string | null; lidaEm: string | null; criadaEm: string }

export function Notificacoes() {
  const nav = useNavigate();
  const { zerarNaoLidas } = useSessao();
  const { dados } = useDados<Notificacao[]>('/notificacoes');
  useEffect(() => {
    if (!dados) return;
    zerarNaoLidas();
    for (const n of dados.filter((x) => !x.lidaEm)) void post(`/notificacoes/${n.id}/lida`);
  }, [dados, zerarNaoLidas]);
  return (
    <div className="tela sem-abas">
      <Cabecalho titulo="Notificações" />
      {!dados ? <Carregando /> : !dados.length ? <Vazio icone={Bell} titulo="Tudo em dia" texto="Avisos de chamados e mensagens aparecem aqui." /> : (
        <div className="lista">
          {dados.map((n) => (
            <div key={n.id} className={`card linha${n.chamadoId ? ' clicavel' : ''}`} style={!n.lidaEm ? { boxShadow: 'inset 3px 0 0 var(--verde)' } : undefined}
              onClick={() => n.chamadoId && nav(`/chamados/${n.chamadoId}`)}>
              <div className="cresce"><strong>{n.titulo}</strong><div className="mini">{n.corpo}</div></div>
              <span className="mini" style={{ flex: 'none' }}>{tempoRelativo(n.criadaEm)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Salvos() {
  const { dados } = useDados<Publicacao[]>('/me/salvos');
  return (
    <div className="tela">
      <Cabecalho titulo="Salvos" />
      {!dados ? <Carregando /> : !dados.length ? <Vazio icone={Bookmark} titulo="Nada salvo ainda" texto="Toque no marcador das publicações para guardar aqui." /> : dados.map((p) => <CartaoPublicacao key={p.id} pub={p} />)}
    </div>
  );
}
