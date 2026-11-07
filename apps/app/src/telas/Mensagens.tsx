import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Image as Imagem, MapPin, MessageCircle, Mic, Send, Square } from 'lucide-react';
import type { MensagemTempoReal } from '@vrum/shared';
import { enviarArquivo, get, hora, post, tempoRelativo } from '../api';
import { useSessao } from '../sessao';
import { conectar } from '../tempo-real';
import { posicaoAtual } from '../localizacao';
import { Avatar, Carregando, Vazio } from '../componentes';
import { useDados } from '../ganchos';
import type { Mensagem } from '../tipos';

interface ItemConversa { id: string; chamadoId: string | null; ultimaMensagem: string | null; ultimaEm: string | null; naoLidas: number; com: string }

export function Mensagens() {
  const nav = useNavigate();
  const { dados, carregando, recarregar } = useDados<ItemConversa[]>('/me/conversas');
  useEffect(() => {
    const s = conectar();
    const f = () => void recarregar();
    s.on('chat:mensagem', f);
    return () => { s.off('chat:mensagem', f); };
  }, [recarregar]);
  return (
    <div className="tela">
      <h1>Mensagens</h1>
      {carregando ? <Carregando /> : !dados?.length ? <Vazio icone={MessageCircle} titulo="Nenhuma conversa" texto="As conversas com profissionais aparecem aqui." /> : (
        <div className="lista">
          {dados.map((c) => (
            <div key={c.id} className="card clicavel linha" onClick={() => nav(`/conversas/${c.id}`)}>
              <Avatar nome={c.com} tamanho={46} />
              <div className="cresce">
                <div className="entre"><strong className="corta">{c.com}</strong>{c.ultimaEm && <span className="mini" style={{ flex: 'none' }}>{tempoRelativo(c.ultimaEm)}</span>}</div>
                <div className="entre">
                  <span className="mini corta">{c.chamadoId && <ClipboardList size={12} style={{ verticalAlign: -2, marginRight: 4 }} />}{c.ultimaMensagem ?? 'Sem mensagens'}</span>
                  {c.naoLidas > 0 && <span className="selo vivo" style={{ padding: '2px 8px' }}>{c.naoLidas}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Conversa() {
  const { id } = useParams();
  const nav = useNavigate();
  const { eu, avisar } = useSessao();
  const { dados: lista } = useDados<ItemConversa[]>('/me/conversas');
  const info = lista?.find((c) => c.id === id);
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null);
  const [texto, setTexto] = useState('');
  const [gravando, setGravando] = useState<MediaRecorder | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<Mensagem[]>(`/conversas/${id}/mensagens`).then(setMsgs).catch((e) => avisar(e.message, true));
    void post(`/conversas/${id}/lida`);
    const s = conectar();
    const chegou = (m: MensagemTempoReal) => {
      if (m.conversaId !== id) return;
      setMsgs((ms) => (ms?.some((x) => x.id === m.id) ? ms : [...(ms ?? []), m as Mensagem]));
      void post(`/conversas/${id}/lida`);
    };
    s.on('chat:mensagem', chegou);
    return () => { s.off('chat:mensagem', chegou); };
  }, [id, avisar]);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs?.length]);

  async function enviar(m: { tipo: 'TEXTO' | 'IMAGEM' | 'AUDIO' | 'LOCALIZACAO'; conteudo?: string; midiaUrl?: string; lat?: number; lng?: number }) {
    try {
      const nova = await post<Mensagem>(`/conversas/${id}/mensagens`, m);
      setMsgs((ms) => (ms?.some((x) => x.id === nova.id) ? ms : [...(ms ?? []), nova]));
    } catch (e) { avisar((e as Error).message, true); }
  }
  async function enviarTexto() {
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    await enviar({ tipo: 'TEXTO', conteudo: t });
  }
  async function enviarFoto(f: File | undefined) {
    if (!f) return;
    try { const r = await enviarArquivo(f, f.name); await enviar({ tipo: 'IMAGEM', midiaUrl: r.url }); } catch (e) { avisar((e as Error).message, true); }
  }
  async function enviarLocal() {
    const p = await posicaoAtual();
    if (!p) return avisar('Não consegui sua localização.', true);
    await enviar({ tipo: 'LOCALIZACAO', lat: p.lat, lng: p.lng, conteudo: 'Minha localização' });
  }
  async function audio() {
    if (gravando) { gravando.stop(); setGravando(null); return; }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(fluxo);
      const partes: Blob[] = [];
      rec.ondataavailable = (e) => partes.push(e.data);
      rec.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        try { const r = await enviarArquivo(new Blob(partes, { type: rec.mimeType || 'audio/webm' }), 'audio.webm'); await enviar({ tipo: 'AUDIO', midiaUrl: r.url }); }
        catch (e) { avisar((e as Error).message, true); }
      };
      rec.start();
      setGravando(rec);
    } catch { avisar('Permita o microfone para gravar.', true); }
  }

  return (
    <div className="tela sem-abas" style={{ gap: 0, paddingBottom: 0 }}>
      <div className="cabecalho" style={{ paddingBottom: 10, borderBottom: '1px solid var(--borda)' }}>
        <button className="voltar" onClick={() => nav(-1)} aria-label="Voltar"><ArrowLeft size={20} /></button>
        <Avatar nome={info?.com ?? '?'} tamanho={38} />
        <div className="cresce"><strong className="corta" style={{ display: 'block' }}>{info?.com ?? 'Conversa'}</strong>
          {info?.chamadoId && <button className="link" style={{ fontSize: 12 }} onClick={() => nav(`/chamados/${info.chamadoId}`)}>Ver atendimento</button>}</div>
      </div>
      <div className="chat">
        {!msgs ? <Carregando /> : msgs.map((m) => {
          const minha = m.autorId === eu?.id;
          const classe = m.tipo === 'SISTEMA' ? 'sistema' : m.tipo === 'PROPOSTA' ? `proposta ${minha ? 'minha' : 'outra'}` : minha ? 'minha' : 'outra';
          return (
            <div key={m.id} className={`bolha ${classe}`} style={m.tipo === 'PROPOSTA' ? { alignSelf: minha ? 'flex-end' : 'flex-start' } : undefined}>
              {m.tipo === 'IMAGEM' && m.midiaUrl && <img src={m.midiaUrl} alt="" />}
              {m.tipo === 'AUDIO' && m.midiaUrl && <audio src={m.midiaUrl} controls style={{ maxWidth: 220 }} />}
              {m.tipo === 'LOCALIZACAO' && m.lat != null && (
                <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer" className="linha"><MapPin size={16} /> Localização compartilhada</a>
              )}
              {m.tipo !== 'LOCALIZACAO' && m.conteudo && <div>{m.conteudo}</div>}
              {m.tipo !== 'SISTEMA' && <div className="hora">{hora(m.criadaEm)}</div>}
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <div className="compositor">
        <button className="icone-btn" style={{ flex: 'none' }} onClick={() => arquivo.current?.click()} aria-label="Foto"><Imagem size={18} /></button>
        <button className="icone-btn" style={{ flex: 'none' }} onClick={enviarLocal} aria-label="Localização"><MapPin size={18} /></button>
        <input className="entrada" placeholder="Mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarTexto()} />
        {texto.trim()
          ? <button className="icone-btn" style={{ flex: 'none', background: 'var(--verde)', color: 'var(--sobre-verde)' }} onClick={enviarTexto} aria-label="Enviar"><Send size={18} /></button>
          : <button className="icone-btn" style={{ flex: 'none', background: gravando ? 'var(--erro)' : undefined }} onClick={audio} aria-label="Áudio">{gravando ? <Square size={16} /> : <Mic size={18} />}</button>}
        <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => enviarFoto(e.target.files?.[0])} />
      </div>
    </div>
  );
}
