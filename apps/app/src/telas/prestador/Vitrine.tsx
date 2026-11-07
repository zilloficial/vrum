import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Images, Play, Plus, Trash2, X } from 'lucide-react';
import { api, enviarArquivo, post } from '../../api';
import { useSessao } from '../../sessao';
import { useDados } from '../../ganchos';
import { Cabecalho, Carregando, Erro, Folha, Vazio } from '../../componentes';
import { CartaoPublicacao } from '../../publicacao';
import type { Publicacao } from '../../tipos';

export function Vitrine() {
  const nav = useNavigate();
  const { vinculo, avisar } = useSessao();
  const { dados, recarregar } = useDados<Publicacao[]>(vinculo ? `/publicacoes?prestadorId=${vinculo.prestador.id}&limite=50` : null, [vinculo?.prestador.id]);
  const [aberta, setAberta] = useState<Publicacao | null>(null);
  const podePublicar = vinculo && vinculo.funcao !== 'PROFISSIONAL';

  async function remover(p: Publicacao) {
    if (!confirm('Remover esta publicação?')) return;
    await api('DELETE', `/publicacoes/${p.id}`);
    setAberta(null);
    avisar('Publicação removida');
    await recarregar();
  }

  return (
    <div className="tela">
      <div className="entre">
        <h1>Vitrine</h1>
        {podePublicar && <button className="btn primario peq" onClick={() => nav('/p/publicar')}><Plus size={16} /> Publicar</button>}
      </div>
      <p className="mini" style={{ margin: 0 }}>Mostre seus trabalhos. Cada publicação tem um botão para o motorista solicitar o serviço.</p>
      {!dados ? <Carregando /> : !dados.length ? (
        <Vazio icone={Images} titulo="Nenhuma publicação" texto="Fotos e vídeos de serviços bem feitos ajudam motoristas a escolher você." />
      ) : (
        <div className="grade-fotos">
          {dados.map((x) => (
            <div key={x.id} onClick={() => setAberta(x)} style={{ position: 'relative' }}>
              {x.midias[0]?.tipo === 'VIDEO'
                ? <><video src={x.midias[0].url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><Play size={18} style={{ position: 'absolute', top: 6, right: 6 }} /></>
                : x.midias[0] && <img src={x.midias[0].url} alt="" />}
            </div>
          ))}
        </div>
      )}
      <Folha aberta={!!aberta} aoFechar={() => setAberta(null)}>
        {aberta && <>
          <CartaoPublicacao pub={aberta} />
          {podePublicar && <button className="btn perigo bloco" onClick={() => remover(aberta)}><Trash2 size={16} /> Remover</button>}
        </>}
      </Folha>
    </div>
  );
}

export function Publicar() {
  const nav = useNavigate();
  const { vinculo, categorias, avisar } = useSessao();
  const [midias, setMidias] = useState<{ tipo: 'IMAGEM' | 'VIDEO'; url: string }[]>([]);
  const [descricao, setDescricao] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function adicionar(fs: FileList | null) {
    if (!fs) return;
    setEnviando(true);
    try {
      for (const f of Array.from(fs).slice(0, 10 - midias.length)) {
        const r = await enviarArquivo(f, f.name);
        if (r.tipo === 'IMAGEM' || r.tipo === 'VIDEO') setMidias((m) => [...m, { tipo: r.tipo as 'IMAGEM' | 'VIDEO', url: r.url }]);
      }
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }
  async function publicar() {
    setErro(null);
    try {
      await post(`/prestadores/${vinculo!.prestador.id}/publicacoes`, { midias, descricao: descricao || undefined, categoriaId: categoriaId || undefined });
      avisar('Publicado!');
      nav('/p/publicacoes', { replace: true });
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <div className="tela sem-abas">
      <Cabecalho titulo="Nova publicação" />
      <div className="linha" style={{ flexWrap: 'wrap' }}>
        {midias.map((m, i) => (
          <div key={m.url} style={{ position: 'relative', width: 96, height: 120, borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
            {m.tipo === 'IMAGEM' ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <video src={m.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            <button onClick={() => setMidias(midias.filter((_, j) => j !== i))} aria-label="Remover" style={{ position: 'absolute', top: 4, right: 4, border: 0, borderRadius: '50%', background: '#000a', color: '#fff', width: 24, height: 24, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={13} /></button>
          </div>
        ))}
        {midias.length < 10 && <button className="cat" style={{ width: 96, minHeight: 120 }} onClick={() => entrada.current?.click()} disabled={enviando}><ImagePlus size={26} />{enviando ? 'Enviando…' : 'Fotos ou vídeo'}</button>}
      </div>
      <input ref={entrada} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => adicionar(e.target.files)} />
      <div className="campo"><label>Descrição</label><textarea className="entrada" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2200} placeholder="Conte o que foi feito" /></div>
      <div className="campo"><label>Serviço</label>
        <select className="entrada" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <Erro texto={erro} />
      <div className="rodape-fixo"><button className="btn primario cresce" disabled={!midias.length || enviando} onClick={publicar}>Publicar</button></div>
    </div>
  );
}
