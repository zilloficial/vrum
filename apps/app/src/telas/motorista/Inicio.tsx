import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, LifeBuoy, MapPin, Search, Car } from 'lucide-react';
import { useSessao } from '../../sessao';
import { useCentro, useChamadoAtivo, useDados } from '../../ganchos';
import { Avatar, AvisoNotificacoes, IconeCategoria, Nota, SeloEstado, Vazio, Verificado } from '../../componentes';
import { CartaoPublicacao } from '../../publicacao';
import type { PrestadorProximo, Publicacao, Veiculo } from '../../tipos';

export function Inicio() {
  const nav = useNavigate();
  const { eu, categorias, naoLidas } = useSessao();
  const { centro } = useCentro();
  const { ativo } = useChamadoAtivo();
  const { dados: veiculos } = useDados<Veiculo[]>('/me/veiculos');
  const { dados: proximos } = useDados<PrestadorProximo[]>(`/prestadores/proximos?lat=${centro.lat}&lng=${centro.lng}&raioKm=20`, [centro.lat]);
  const { dados: feed } = useDados<Publicacao[]>('/publicacoes');
  const [busca, setBusca] = useState('');

  const veiculo = veiculos?.find((v) => v.principal) ?? veiculos?.[0];
  const termo = busca.trim().toLowerCase();
  const catFiltradas = useMemo(() => !termo ? categorias
    : categorias.filter((c) => c.nome.toLowerCase().includes(termo) || c.exemplos.some((e) => e.toLowerCase().includes(termo))), [categorias, termo]);
  const prestFiltrados = (proximos ?? []).filter((p) => !termo || p.nomeComercial.toLowerCase().includes(termo) || p.usuarioNome.includes(termo));
  const disponiveis = prestFiltrados.filter((p) => p.disponivel);

  return (
    <div className="tela">
      <div className="entre">
        <img src="/logo.png" alt="vrum" style={{ height: 30 }} />
        <button className="icone-btn" aria-label="Notificações" onClick={() => nav('/notificacoes')}>
          <Bell size={20} />{naoLidas > 0 && <span className="ponto-aviso" />}
        </button>
      </div>

      <div>
        <div className="mini">Olá, {eu?.nome.split(' ')[0]}</div>
        <h1>Do que seu carro precisa?</h1>
      </div>

      {ativo ? (
        <div className="andamento" onClick={() => nav(`/chamados/${ativo.id}`)}>
          <div className="cresce">
            <div className="micro" style={{ color: 'var(--verde)' }}>Atendimento em andamento</div>
            <div style={{ fontWeight: 800 }} className="corta">{ativo.categoria.nome}{ativo.prestador ? ` · ${ativo.prestador.nomeComercial}` : ''}</div>
            <div style={{ marginTop: 4 }}><SeloEstado estado={ativo.estado} /></div>
          </div>
          <ChevronRight />
        </div>
      ) : (
        <button className="ajuda" onClick={() => nav('/solicitar')}>
          <div className="circ"><LifeBuoy size={28} /></div>
          <div><strong>Preciso de ajuda</strong><span>Encontre um profissional disponível agora</span></div>
        </button>
      )}

      <AvisoNotificacoes texto="Ative as notificações para saber na hora quando um profissional aceitar ou estiver chegando." />

      <button className="card clicavel linha" style={{ border: 0, textAlign: 'left' }} onClick={() => nav(veiculo ? '/garagem' : '/garagem/novo')}>
        <div className="avatar" style={{ width: 42, height: 42, borderRadius: 12 }}><Car size={20} /></div>
        <div className="cresce">
          <div className="micro">Veículo selecionado</div>
          <div style={{ fontWeight: 800 }}>{veiculo ? `${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}` : 'Cadastre seu veículo'}</div>
        </div>
        <ChevronRight size={18} color="var(--texto-3)" />
      </button>

      <label className="linha card" style={{ padding: '4px 16px' }}>
        <Search size={18} color="var(--texto-3)" />
        <input className="entrada" style={{ background: 'none', padding: '12px 0' }} placeholder="Buscar serviço, empresa ou profissional"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>

      <section className="secao">
        <h2>Serviços</h2>
        <div className="grade-cat">
          {catFiltradas.map((c) => (
            <button key={c.id} className="cat" onClick={() => nav(`/solicitar?categoria=${c.id}`)}>
              <span className="ic"><IconeCategoria slug={c.slug} /></span>{c.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="secao">
        <div className="entre"><h2>Disponíveis perto de você</h2><a onClick={() => nav('/mapa')}>Ver mapa</a></div>
        {!proximos ? <div className="esqueleto" style={{ height: 140 }} /> : disponiveis.length === 0 ? (
          <div className="card mini">Nenhum profissional disponível agora num raio de 20 km. Você ainda pode enviar o pedido — avisamos quem ficar disponível.</div>
        ) : (
          <div className="horiz">
            {disponiveis.map((p) => (
              <div key={p.id} className="mini-prest" onClick={() => nav(`/perfis/${p.usuarioNome}`)}>
                <Avatar nome={p.nomeComercial} url={p.fotoUrl} tamanho={48} />
                <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{p.nomeComercial} {p.verificado && <Verificado tamanho={14} />}</div>
                <Nota nota={p.notaMedia} total={p.totalAvaliacoes} />
                <div className="mini linha" style={{ gap: 4 }}><MapPin size={12} />{p.distanciaKm} km</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="secao">
        <h2>Trabalhos recentes</h2>
        {!feed ? <div className="esqueleto" style={{ height: 380 }} /> : feed.length === 0
          ? <Vazio titulo="Nenhuma publicação ainda" texto="Os profissionais da sua região vão aparecer aqui." />
          : feed.map((p) => <CartaoPublicacao key={p.id} pub={p} />)}
      </section>
    </div>
  );
}
