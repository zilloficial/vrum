import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Truck } from 'lucide-react';
import { useSessao } from '../../sessao';
import { useCentro, useDados } from '../../ganchos';
import { Mapa } from '../../mapa';
import { Avatar, Nota, Verificado } from '../../componentes';
import type { PrestadorProximo } from '../../tipos';

export function MapaPrestadores() {
  const nav = useNavigate();
  const { categorias } = useSessao();
  const { centro } = useCentro();
  const [categoriaId, setCategoriaId] = useState('');
  const [soDisponiveis, setSoDisponiveis] = useState(true);
  const [movel, setMovel] = useState(false);
  const [boaNota, setBoaNota] = useState(false);
  const [raio, setRaio] = useState(15);
  const [sel, setSel] = useState<PrestadorProximo | null>(null);

  const q = new URLSearchParams({ lat: String(centro.lat), lng: String(centro.lng), raioKm: String(raio) });
  if (categoriaId) q.set('categoriaId', categoriaId);
  if (soDisponiveis) q.set('disponiveis', 'true');
  if (movel) q.set('movel', 'true');
  const { dados } = useDados<PrestadorProximo[]>(`/prestadores/proximos?${q}`, [q.toString()]);
  const lista = (dados ?? []).filter((p) => !boaNota || (p.notaMedia ?? 0) >= 4);

  return (
    <div className="tela" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0, gap: 0 }}>
      <div style={{ position: 'relative' }}>
        <Mapa
          centro={centro} altura="56vh"
          pinos={[
            { id: 'eu', ...centro, tipo: 'motorista' },
            ...lista.map((p) => ({
              id: p.id, lat: p.posicao.lat, lng: p.posicao.lng, tipo: (p.disponivel ? 'verde' : 'cinza') as 'verde' | 'cinza',
              rotulo: p.nomeComercial[0], aoClicar: () => setSel(p),
            })),
          ]}
        />
        <div style={{ position: 'absolute', top: 'calc(12px + var(--topo))', left: 16, right: 16, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            <button className={`chip${soDisponiveis ? ' ativo' : ''}`} onClick={() => setSoDisponiveis(!soDisponiveis)}>Disponíveis</button>
            <button className={`chip${movel ? ' ativo' : ''}`} onClick={() => setMovel(!movel)}>Vai até mim</button>
            <button className={`chip${boaNota ? ' ativo' : ''}`} onClick={() => setBoaNota(!boaNota)}>Nota 4+</button>
            {[5, 15, 30].map((r) => <button key={r} className={`chip${raio === r ? ' ativo' : ''}`} onClick={() => setRaio(r)}>{r} km</button>)}
          </div>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            <button className={`chip${!categoriaId ? ' ativo' : ''}`} onClick={() => setCategoriaId('')}>Todos</button>
            {categorias.map((c) => <button key={c.id} className={`chip${categoriaId === c.id ? ' ativo' : ''}`} onClick={() => setCategoriaId(c.id)}>{c.nome}</button>)}
          </div>
        </div>
      </div>

      <div className="painel-chamado" style={{ paddingBottom: 'calc(96px + var(--base))' }}>
        <div className="entre"><h2>{lista.length} {lista.length === 1 ? 'resultado' : 'resultados'}</h2><span className="mini">Parceiros VRUM</span></div>
        {lista.map((p) => (
          <div key={p.id} className="card clicavel prest" onClick={() => setSel(p)}>
            <Avatar nome={p.nomeComercial} url={p.fotoUrl} />
            <div className="cresce">
              <div style={{ fontWeight: 800 }} className="corta">{p.nomeComercial} {p.verificado && <Verificado tamanho={14} />}</div>
              <div className="linha" style={{ gap: '2px 10px', flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
                <Nota nota={p.notaMedia} total={p.totalAvaliacoes} />
                <span className="mini linha" style={{ gap: 3 }}><MapPin size={12} />{p.distanciaKm} km</span>
                {p.modalidade !== 'NA_OFICINA' && <span className="mini linha" style={{ gap: 3 }}><Truck size={12} />Vai até você</span>}
              </div>
            </div>
            {p.disponivel ? <span className="selo vivo"><span className="pt" />Livre</span> : <span className="selo">Indisponível</span>}
          </div>
        ))}
        {dados && lista.length === 0 && <div className="mini card">Nenhum profissional com esses filtros. Tente aumentar o raio.</div>}
        <p className="mini" style={{ margin: 0 }}>Profissionais que atendem no local aparecem em posição aproximada. A localização exata só é compartilhada durante um atendimento.</p>
      </div>

      {sel && (
        <div className="fundo-modal" onClick={() => setSel(null)}>
          <div className="folha" onClick={(e) => e.stopPropagation()}>
            <div className="alca" />
            <div className="prest">
              <Avatar nome={sel.nomeComercial} url={sel.fotoUrl} tamanho={56} />
              <div className="cresce">
                <h2>{sel.nomeComercial} {sel.verificado && <Verificado />}</h2>
                <div className="linha"><Nota nota={sel.notaMedia} total={sel.totalAvaliacoes} /><span className="mini">{sel.distanciaKm} km</span></div>
              </div>
            </div>
            <div className="dupla">
              <button className="btn secundario" onClick={() => nav(`/perfis/${sel.usuarioNome}`)}>Ver perfil</button>
              <button className="btn primario" onClick={() => nav(`/solicitar?prestador=${sel.id}`)}>Chamar profissional</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
