import { ClipboardList } from 'lucide-react';
import { useSessao } from '../../sessao';
import { useDados } from '../../ganchos';
import { Carregando, Vazio } from '../../componentes';
import { ListaChamados } from '../motorista/Historico';
import type { ItemChamado } from '../../tipos';

export function ChamadosPrestador() {
  const { vinculo } = useSessao();
  const { dados } = useDados<ItemChamado[]>(vinculo ? `/prestadores/${vinculo.prestador.id}/chamados` : null, [vinculo?.prestador.id]);
  return (
    <div className="tela">
      <h1>Chamados</h1>
      {vinculo?.funcao !== 'PROFISSIONAL' && <p className="mini" style={{ margin: 0 }}>Histórico centralizado de {vinculo?.prestador.nomeComercial}.</p>}
      {!dados ? <Carregando /> : !dados.length ? <Vazio icone={ClipboardList} titulo="Nenhum atendimento ainda" texto="Os chamados aceitos aparecem aqui." /> : <ListaChamados itens={dados} mostrarResponsavel />}
    </div>
  );
}
