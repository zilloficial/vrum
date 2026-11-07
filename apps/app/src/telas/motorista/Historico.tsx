import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { ESTADOS_ATIVOS } from '@vrum/shared';
import { tempoRelativo } from '../../api';
import { useDados } from '../../ganchos';
import { Carregando, IconeCategoria, SeloEstado, Vazio } from '../../componentes';
import type { ItemChamado } from '../../tipos';

export function ListaChamados({ itens, mostrarResponsavel }: { itens: ItemChamado[]; mostrarResponsavel?: boolean }) {
  const nav = useNavigate();
  const ativos = itens.filter((c) => ESTADOS_ATIVOS.includes(c.estado));
  const antigos = itens.filter((c) => !ESTADOS_ATIVOS.includes(c.estado));
  const item = (c: ItemChamado) => (
    <div key={c.id} className={`card clicavel linha${ESTADOS_ATIVOS.includes(c.estado) ? ' destaque' : ''}`} onClick={() => nav(`/chamados/${c.id}`)}>
      <div className="avatar" style={{ width: 44, height: 44, borderRadius: 12 }}><IconeCategoria slug={c.categoria.slug} tamanho={20} /></div>
      <div className="cresce">
        <div className="entre"><strong className="corta">{c.categoria.nome}</strong><span className="mini" style={{ flex: 'none' }}>{tempoRelativo(c.criadoEm)}</span></div>
        <div className="mini corta">{c.veiculo.marca} {c.veiculo.modelo}{c.prestador ? ` · ${c.prestador.nomeComercial}` : ''}{mostrarResponsavel && c.responsavel ? ` · ${c.responsavel}` : ''}</div>
        <div style={{ marginTop: 6 }}><SeloEstado estado={c.estado} /></div>
      </div>
      <ChevronRight size={18} color="var(--texto-3)" />
    </div>
  );
  return (
    <>
      {ativos.length > 0 && <section className="secao"><div className="micro">Em andamento</div><div className="lista">{ativos.map(item)}</div></section>}
      {antigos.length > 0 && <section className="secao"><div className="micro">Histórico</div><div className="lista">{antigos.map(item)}</div></section>}
    </>
  );
}

export function Historico() {
  const nav = useNavigate();
  const { dados, carregando } = useDados<ItemChamado[]>('/me/chamados');
  return (
    <div className="tela">
      <h1>Chamados</h1>
      {carregando ? <Carregando /> : !dados?.length
        ? <Vazio icone={ClipboardList} titulo="Nenhum chamado ainda" texto="Quando precisar, toque em “Preciso de ajuda”." acao={<button className="btn primario" onClick={() => nav('/solicitar')}>Preciso de ajuda</button>} />
        : <ListaChamados itens={dados} />}
    </div>
  );
}
