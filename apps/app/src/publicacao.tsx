import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Flag, Heart, MessageCircle, Send, Share2, Wrench } from 'lucide-react';
import { get, post, tempoRelativo } from './api';
import { Avatar, Folha, Verificado } from './componentes';
import { useSessao } from './sessao';
import type { Publicacao } from './tipos';

export function CartaoPublicacao({ pub, aoMudar }: { pub: Publicacao; aoMudar?: (p: Publicacao) => void }) {
  const nav = useNavigate();
  const { avisar } = useSessao();
  const [p, setP] = useState(pub);
  const [comentarios, setComentarios] = useState<{ id: string; texto: string; autor: string; criadoEm: string }[] | null>(null);
  const [texto, setTexto] = useState('');
  const [denunciar, setDenunciar] = useState(false);
  const atualizar = (n: Publicacao) => { setP(n); aoMudar?.(n); };

  async function curtir() {
    const r = await post<{ curti: boolean }>(`/publicacoes/${p.id}/curtir`);
    atualizar({ ...p, curti: r.curti, curtidas: p.curtidas + (r.curti ? 1 : -1) });
  }
  async function salvar() {
    const r = await post<{ salvei: boolean }>(`/publicacoes/${p.id}/salvar`);
    atualizar({ ...p, salvei: r.salvei });
    avisar(r.salvei ? 'Salvo' : 'Removido dos salvos');
  }
  async function abrirComentarios() { setComentarios(await get(`/publicacoes/${p.id}/comentarios`)); }
  async function comentar() {
    if (!texto.trim()) return;
    await post(`/publicacoes/${p.id}/comentarios`, { texto });
    setTexto('');
    atualizar({ ...p, comentarios: p.comentarios + 1 });
    await abrirComentarios();
  }
  async function compartilhar() {
    const url = `${location.origin}/perfis/${p.prestador.usuarioNome}`;
    if (navigator.share) await navigator.share({ title: p.prestador.nomeComercial, text: p.descricao ?? '', url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); avisar('Link copiado'); }
  }
  async function enviarDenuncia(motivo: string) {
    await post('/denuncias', { alvo: 'PUBLICACAO', alvoId: p.id, motivo });
    setDenunciar(false);
    avisar('Denúncia enviada. Obrigado.');
  }

  return (
    <article className="pub">
      <div className="topo">
        <button className="linha cresce" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => nav(`/perfis/${p.prestador.usuarioNome}`)}>
          <Avatar nome={p.prestador.nomeComercial} url={p.prestador.fotoUrl} tamanho={38} />
          <div className="cresce">
            <div style={{ fontWeight: 800 }} className="corta">{p.prestador.nomeComercial} {p.prestador.verificado && <Verificado tamanho={14} />}</div>
            <div className="mini">{p.patrocinado ? 'Publicidade' : `@${p.prestador.usuarioNome} · ${tempoRelativo(p.criadaEm)}`}</div>
          </div>
        </button>
        <button className="icone-btn" style={{ width: 34, height: 34, background: 'none' }} aria-label="Denunciar" onClick={() => setDenunciar(true)}><Flag size={16} color="var(--texto-3)" /></button>
      </div>
      <div className="midia">
        <div className="carrossel">
          {p.midias.map((m) => m.tipo === 'VIDEO'
            ? <video key={m.id} src={m.url} poster={m.miniaturaUrl ?? undefined} controls playsInline preload="metadata" />
            : <img key={m.id} src={m.url} alt="" loading="lazy" />)}
        </div>
        {p.midias.length > 1 && <span className="selo pub" style={{ position: 'absolute', top: 10, right: 10 }}>1/{p.midias.length}</span>}
      </div>
      <div className="acoes">
        <button className={p.curti ? 'on' : ''} onClick={curtir} aria-label="Curtir"><Heart size={21} fill={p.curti ? 'currentColor' : 'none'} />{p.curtidas}</button>
        <button onClick={abrirComentarios} aria-label="Comentários"><MessageCircle size={21} />{p.comentarios}</button>
        <button onClick={compartilhar} aria-label="Compartilhar"><Share2 size={20} /></button>
        <span className="cresce" />
        <button className={p.salvei ? 'on' : ''} onClick={salvar} aria-label="Salvar"><Bookmark size={21} fill={p.salvei ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="texto coluna" style={{ gap: 10 }}>
        {p.descricao && <p style={{ margin: 0 }}>{p.descricao}</p>}
        <button className="btn secundario peq" onClick={() => nav(`/solicitar?prestador=${p.prestador.id}${p.categoriaId ? `&categoria=${p.categoriaId}` : ''}`)}>
          <Wrench size={16} /> Solicitar este serviço
        </button>
      </div>

      <Folha aberta={comentarios !== null} aoFechar={() => setComentarios(null)}>
        <h2>Comentários</h2>
        {comentarios?.length === 0 && <p className="mini">Seja o primeiro a comentar.</p>}
        {comentarios?.map((c) => (
          <div key={c.id} className="linha" style={{ alignItems: 'flex-start' }}>
            <Avatar nome={c.autor} tamanho={32} />
            <div><strong>{c.autor}</strong> <span className="mini">{tempoRelativo(c.criadoEm)}</span><div>{c.texto}</div></div>
          </div>
        ))}
        <div className="compositor">
          <input className="entrada" placeholder="Escreva um comentário" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && comentar()} />
          <button className="icone-btn" style={{ background: 'var(--verde)', color: 'var(--sobre-verde)', flex: 'none' }} onClick={comentar} aria-label="Enviar"><Send size={18} /></button>
        </div>
      </Folha>

      <Folha aberta={denunciar} aoFechar={() => setDenunciar(false)}>
        <h2>Denunciar publicação</h2>
        {['Conteúdo enganoso', 'Golpe ou fraude', 'Conteúdo ofensivo', 'Não é um serviço automotivo'].map((m) => (
          <button key={m} className="opcao" onClick={() => enviarDenuncia(m)}>{m}</button>
        ))}
      </Folha>
    </article>
  );
}
