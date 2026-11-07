import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Camera, ChevronRight, Inbox, MapPin, Mic, Truck } from 'lucide-react';
import { ESTADOS_ATIVOS } from '@vrum/shared';
import { get, hora, post } from '../../api';
import { useSessao } from '../../sessao';
import { conectar } from '../../tempo-real';
import { useDados } from '../../ganchos';
import { Avatar, AvisoNotificacoes, SeloEstado, Vazio, Verificado } from '../../componentes';
import type { ItemChamado } from '../../tipos';

interface Convite {
  convite: { id: string; chamadoId: string; distanciaKm: number | null; expiraEm: string; criadoEm: string };
  descricao: string | null; categoria: string; pontoReferencia: string | null; anexos: number;
  guincho: { destino: string | null; veiculoSeMove: boolean | null; condicoesAcesso: string | null };
  veiculo: { marca: string; modelo: string; ano: number; tipo: string; observacoes: string | null };
}

export function Painel() {
  const nav = useNavigate();
  const { eu, vinculo, recarregar, avisar, naoLidas } = useSessao();
  const [convites, setConvites] = useState<Convite[]>([]);
  const [agora, setAgora] = useState(Date.now());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pid = vinculo?.prestador.id;
  const { dados: chamados, recarregar: recarregarChamados } = useDados<ItemChamado[]>(pid ? `/prestadores/${pid}/chamados` : null, [pid]);
  const { dados: perfil } = useDados<{ notaMedia: number | null; totalAvaliacoes: number }>(pid ? `/perfis/${pid}` : null, [pid]);

  const carregarConvites = useCallback(async () => setConvites(await get('/prestador/convites')), []);
  useEffect(() => {
    void carregarConvites();
    const s = conectar();
    const novo = () => { void carregarConvites(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); };
    const fim = (p: { conviteId: string }) => setConvites((cs) => cs.filter((c) => c.convite.id !== p.conviteId));
    const estado = () => { void recarregar(); void recarregarChamados(); };
    s.on('convite:novo', novo);
    s.on('convite:encerrado', fim);
    s.on('chamado:estado', estado);
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => { s.off('convite:novo', novo); s.off('convite:encerrado', fim); s.off('chamado:estado', estado); window.clearInterval(t); };
  }, [carregarConvites, recarregar, recarregarChamados]);

  if (!vinculo || !eu) return <div className="tela"><Vazio titulo="Você ainda não tem um perfil profissional" acao={<button className="btn primario" onClick={() => nav('/tornar-profissional')}>Criar perfil</button>} /></div>;

  const disponivel = vinculo.disponivel;
  async function alternar() {
    try {
      await post(`/prestadores/${pid}/disponibilidade`, { disponivel: !disponivel });
      await recarregar();
      avisar(!disponivel ? 'Você está disponível para novos chamados' : 'Você ficou indisponível');
    } catch (e) { avisar((e as Error).message, true); }
  }
  async function responder(c: Convite, aceitar: boolean) {
    setOcupado(c.convite.id);
    try {
      const r = await post(`/convites/${c.convite.id}/${aceitar ? 'aceitar' : 'recusar'}`);
      await carregarConvites();
      if (aceitar) { await recarregar(); nav(`/chamados/${r.id}`); }
    } catch (e) { avisar((e as Error).message, true); await carregarConvites(); } finally { setOcupado(null); }
  }

  const ativos = (chamados ?? []).filter((c) => ESTADOS_ATIVOS.includes(c.estado));
  const concluidos = (chamados ?? []).filter((c) => c.estado === 'CONCLUIDO').length;
  const encerrados = (chamados ?? []).filter((c) => ['CONCLUIDO', 'CANCELADO'].includes(c.estado)).length;
  const visiveis = convites.filter((c) => new Date(c.convite.expiraEm).getTime() > agora);

  return (
    <div className="tela">
      <div className="entre">
        <div className="linha">
          <Avatar nome={vinculo.prestador.nomeComercial} url={vinculo.prestador.fotoUrl} tamanho={42} />
          <div><strong>{vinculo.prestador.nomeComercial} {vinculo.prestador.verificado && <Verificado tamanho={14} />}</strong><div className="mini">{vinculo.funcao === 'DONO' ? 'Dono' : vinculo.funcao === 'GESTOR' ? 'Gestor' : 'Profissional'}</div></div>
        </div>
        <button className="icone-btn" onClick={() => nav('/notificacoes')} aria-label="Notificações"><Bell size={20} />{naoLidas > 0 && <span className="ponto-aviso" />}</button>
      </div>

      <AvisoNotificacoes texto="Ative as notificações para receber novos chamados mesmo com o VRUM em segundo plano." />

      {vinculo.atende ? (
        <div className="interruptor" style={disponivel ? { boxShadow: 'inset 0 0 0 1.5px var(--verde)' } : undefined}>
          <div>
            <h2>{disponivel ? 'Disponível' : 'Indisponível'}</h2>
            <div className="mini">{disponivel && vinculo.disponivelAte ? `Até ${hora(vinculo.disponivelAte)} · renove para continuar aparecendo` : 'Fique disponível para receber chamados perto de você'}</div>
          </div>
          <button className={`alavanca${disponivel ? ' on' : ''}`} onClick={alternar} aria-label="Alternar disponibilidade" aria-pressed={disponivel} />
        </div>
      ) : <div className="info-msg">Seu perfil nesta empresa é de gestão. Os convites aparecem aqui para você acompanhar.</div>}
      {disponivel && vinculo.disponivelAte && new Date(vinculo.disponivelAte).getTime() - agora < 30 * 60_000 && (
        <button className="btn secundario bloco peq" onClick={async () => { await post(`/prestadores/${pid}/disponibilidade`, { disponivel: true }); await recarregar(); }}>Renovar disponibilidade</button>
      )}

      {visiveis.length > 0 && (
        <section className="secao">
          <h2>Novos chamados</h2>
          {visiveis.map((c) => {
            const total = new Date(c.convite.expiraEm).getTime() - new Date(c.convite.criadoEm).getTime();
            const resta = Math.max(0, new Date(c.convite.expiraEm).getTime() - agora);
            return (
              <div key={c.convite.id} className="convite">
                <div className="entre"><strong style={{ fontSize: 17 }}>{c.categoria}</strong><span className="contagem">{Math.ceil(resta / 1000)}s</span></div>
                <div className="barra-tempo"><div style={{ width: `${(resta / total) * 100}%` }} /></div>
                {c.descricao && <div>{c.descricao}</div>}
                <div className="mini">{c.veiculo.marca} {c.veiculo.modelo} {c.veiculo.ano}{c.veiculo.observacoes ? ` · ${c.veiculo.observacoes}` : ''}</div>
                <div className="linha mini" style={{ flexWrap: 'wrap' }}>
                  {c.convite.distanciaKm != null && <span className="linha" style={{ gap: 4 }}><MapPin size={13} />{c.convite.distanciaKm.toFixed(1)} km</span>}
                  {c.pontoReferencia && <span>· {c.pontoReferencia}</span>}
                  {c.anexos > 0 && <span className="linha" style={{ gap: 4 }}>· <Camera size={13} /><Mic size={13} />{c.anexos} anexo(s)</span>}
                </div>
                {c.guincho.destino && <div className="mini linha"><Truck size={13} />Destino: {c.guincho.destino}{c.guincho.veiculoSeMove === false ? ' · não se movimenta' : ''}</div>}
                <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => nav(`/chamados/${c.convite.chamadoId}`)}>Ver detalhes e anexos</button>
                <div className="dupla">
                  <button className="btn secundario" disabled={!!ocupado} onClick={() => responder(c, false)}>Recusar</button>
                  <button className="btn primario" disabled={!!ocupado || !!vinculo.chamadoAtualId} onClick={() => responder(c, true)}>Aceitar</button>
                </div>
                {vinculo.chamadoAtualId && <span className="mini">Termine o atendimento atual para aceitar outro.</span>}
              </div>
            );
          })}
        </section>
      )}

      {ativos.length > 0 && (
        <section className="secao">
          <h2>Em andamento</h2>
          {ativos.map((c) => (
            <div key={c.id} className="andamento" onClick={() => nav(`/chamados/${c.id}`)}>
              <div className="cresce">
                <strong>{c.categoria.nome}</strong>
                <div className="mini">{c.veiculo.marca} {c.veiculo.modelo}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
                <div style={{ marginTop: 6 }}><SeloEstado estado={c.estado} /></div>
              </div>
              <ChevronRight />
            </div>
          ))}
        </section>
      )}

      {visiveis.length === 0 && ativos.length === 0 && (
        <Vazio icone={Inbox} titulo={disponivel ? 'Aguardando chamados' : 'Nenhum chamado agora'} texto={disponivel ? 'Avisamos aqui e no celular quando chegar um pedido perto de você.' : 'Fique disponível para receber convites.'} />
      )}

      <section className="secao">
        <h2>Indicadores</h2>
        <div className="kpis">
          <div className="kpi"><strong>{concluidos}</strong><span className="mini">concluídos</span></div>
          <div className="kpi"><strong>{encerrados ? Math.round((concluidos / encerrados) * 100) : 0}%</strong><span className="mini">conclusão</span></div>
          <div className="kpi"><strong>{perfil?.notaMedia?.toFixed(1) ?? '—'}</strong><span className="mini">{perfil?.totalAvaliacoes ?? 0} avaliações</span></div>
        </div>
      </section>
    </div>
  );
}
