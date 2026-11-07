/** Solicitação de atendimento em etapas (seção 7). */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Check, Crosshair, MapPin, Mic, Plus, Radar, Square, UserCheck, X } from 'lucide-react';
import { enviarArquivo, get, post } from '../../api';
import { useSessao } from '../../sessao';
import { useCentro, useDados } from '../../ganchos';
import { Mapa } from '../../mapa';
import { posicaoAtual } from '../../localizacao';
import { Avatar, Cabecalho, Erro, IconeCategoria, Nota, Verificado } from '../../componentes';
import type { Veiculo } from '../../tipos';

type Anexo = { tipo: 'IMAGEM' | 'AUDIO' | 'VIDEO'; url: string };
const ETAPAS = ['Veículo', 'Ocorrência', 'Local', 'Detalhes', 'Atendimento'];

export function Solicitar() {
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const { categorias, avisar } = useSessao();
  const { centro } = useCentro();
  const { dados: veiculos } = useDados<Veiculo[]>('/me/veiculos');

  const [etapa, setEtapa] = useState(0);
  const [veiculoId, setVeiculoId] = useState('');
  const [categoriaId, setCategoriaId] = useState(qs.get('categoria') ?? '');
  const [exemplo, setExemplo] = useState('');
  const [ponto, setPonto] = useState(centro);
  const [pontoTocado, setPontoTocado] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [descricao, setDescricao] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [guincho, setGuincho] = useState({ destinoEndereco: '', condicoesAcesso: '', veiculoSeMove: undefined as boolean | undefined });
  const [prestadorId, setPrestadorId] = useState(qs.get('prestador') ?? '');
  const [prestador, setPrestador] = useState<any>(null);
  const [modalidade, setModalidade] = useState<'ESCOLHER_PROFISSIONAL' | 'BUSCAR_DISPONIVEIS'>(qs.get('prestador') ? 'ESCOLHER_PROFISSIONAL' : 'BUSCAR_DISPONIVEIS');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState<MediaRecorder | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (veiculos?.length && !veiculoId) setVeiculoId((veiculos.find((v) => v.principal) ?? veiculos[0]!).id); }, [veiculos, veiculoId]);
  useEffect(() => { if (!pontoTocado) setPonto(centro); }, [centro, pontoTocado]);
  useEffect(() => { if (prestadorId) get(`/perfis/${prestadorId}`).then(setPrestador).catch(() => setPrestadorId('')); }, [prestadorId]);

  const categoria = categorias.find((c) => c.id === categoriaId);
  const ehGuincho = !!categoria?.exigeDadosGuincho;

  const podeAvancar = [
    !!veiculoId,
    !!categoriaId,
    true,
    !ehGuincho || (guincho.destinoEndereco.trim().length > 2 && guincho.veiculoSeMove !== undefined),
    modalidade === 'BUSCAR_DISPONIVEIS' || !!prestadorId,
  ][etapa];

  async function anexar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviandoArquivo(true);
    try {
      for (const f of Array.from(arquivos).slice(0, 6 - anexos.length)) {
        const r = await enviarArquivo(f, f.name);
        if (r.tipo === 'IMAGEM' || r.tipo === 'VIDEO' || r.tipo === 'AUDIO') setAnexos((a) => [...a, { tipo: r.tipo as Anexo['tipo'], url: r.url }]);
      }
    } catch (e) { avisar((e as Error).message, true); } finally { setEnviandoArquivo(false); }
  }

  async function alternarAudio() {
    if (gravando) { gravando.stop(); setGravando(null); return; }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(fluxo);
      const partes: Blob[] = [];
      rec.ondataavailable = (e) => partes.push(e.data);
      rec.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        const blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
        setEnviandoArquivo(true);
        try { const r = await enviarArquivo(blob, 'audio.webm'); setAnexos((a) => [...a, { tipo: 'AUDIO', url: r.url }]); }
        catch (e) { avisar((e as Error).message, true); } finally { setEnviandoArquivo(false); }
      };
      rec.start();
      setGravando(rec);
    } catch { avisar('Permita o microfone para gravar um áudio.', true); }
  }

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const ch = await post('/chamados', {
        veiculoId, categoriaId, modalidade,
        prestadorId: modalidade === 'ESCOLHER_PROFISSIONAL' ? prestadorId : undefined,
        ponto: { ...ponto, referencia: referencia || undefined },
        descricao: [exemplo, descricao].filter(Boolean).join(' — ') || undefined,
        anexos: anexos.length ? anexos : undefined,
        guincho: ehGuincho ? { ...guincho, condicoesAcesso: guincho.condicoesAcesso || undefined } : undefined,
      });
      nav(`/chamados/${ch.id}`, { replace: true });
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  }

  return (
    <div className="tela sem-abas">
      <Cabecalho titulo={ETAPAS[etapa]} voltar={etapa === 0 ? true : false}
        direita={<button className="voltar" aria-label="Fechar" onClick={() => nav(-1)}><X size={20} /></button>} />
      <div className="progresso">{ETAPAS.map((_, i) => <div key={i} className={i <= etapa ? 'feito' : ''} />)}</div>

      {etapa === 0 && (
        <div className="coluna">
          <p className="sub" style={{ margin: 0 }}>Qual veículo precisa de ajuda?</p>
          {veiculos?.map((v) => (
            <button key={v.id} className={`opcao${v.id === veiculoId ? ' ativo' : ''}`} onClick={() => setVeiculoId(v.id)}>
              <span className="marca">{v.id === veiculoId && <Check size={14} />}</span>
              <div className="cresce"><strong>{v.marca} {v.modelo}</strong><div className="mini">{v.ano}{v.cor ? ` · ${v.cor}` : ''}{v.combustivel ? ` · ${v.combustivel}` : ''}</div></div>
            </button>
          ))}
          <button className="btn contorno" onClick={() => nav('/garagem/novo')}><Plus size={18} /> Cadastrar veículo</button>
        </div>
      )}

      {etapa === 1 && (
        <div className="coluna">
          <div className="grade-cat">
            {categorias.map((c) => (
              <button key={c.id} className={`cat${c.id === categoriaId ? ' ativo' : ''}`} onClick={() => { setCategoriaId(c.id); setExemplo(''); }}>
                <span className="ic"><IconeCategoria slug={c.slug} /></span>{c.nome}
              </button>
            ))}
          </div>
          {categoria && (
            <>
              <div className="micro" style={{ marginTop: 6 }}>O que aconteceu?</div>
              <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
                {categoria.exemplos.map((e) => <button key={e} className={`chip${exemplo === e ? ' ativo' : ''}`} onClick={() => setExemplo(exemplo === e ? '' : e)}>{e}</button>)}
              </div>
              {categoria.fluxo === 'AGENDADO' && <div className="info-msg">Serviços agendados: combine data e horário com o profissional pelo chat depois do aceite.</div>}
            </>
          )}
        </div>
      )}

      {etapa === 2 && (
        <div className="coluna">
          <p className="sub" style={{ margin: 0 }}>Arraste o mapa até o pino ficar no ponto de atendimento.</p>
          <div style={{ position: 'relative' }}>
            <Mapa centro={ponto} pinos={[]} altura={320} enquadrar={false} aoMover={(c) => { setPonto(c); setPontoTocado(true); }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', zIndex: 500, pointerEvents: 'none', color: 'var(--verde)' }}>
              <MapPin size={44} fill="#101114" strokeWidth={2.2} />
            </div>
          </div>
          <button className="btn secundario peq" onClick={async () => { const p = await posicaoAtual(); if (p) { setPonto(p); setPontoTocado(true); } else avisar('Não consegui sua localização. Ajuste o pino manualmente.', true); }}>
            <Crosshair size={16} /> Usar minha localização
          </button>
          <div className="campo">
            <label>Ponto de referência</label>
            <input className="entrada" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: em frente ao posto, acostamento da BR-163 km 742" maxLength={300} />
          </div>
          <span className="mini">Este é o destino do profissional. Se você se mover depois, o ponto não muda sozinho.</span>
        </div>
      )}

      {etapa === 3 && (
        <div className="coluna">
          <div className="campo">
            <label>Descreva o problema</label>
            <textarea className="entrada" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que está acontecendo? Desde quando?" maxLength={2000} />
          </div>
          {ehGuincho && (
            <>
              <div className="campo"><label>Destino do guincho</label><input className="entrada" value={guincho.destinoEndereco} onChange={(e) => setGuincho({ ...guincho, destinoEndereco: e.target.value })} placeholder="Oficina, casa ou endereço" /></div>
              <div className="campo"><label>Condições de acesso</label><input className="entrada" value={guincho.condicoesAcesso} onChange={(e) => setGuincho({ ...guincho, condicoesAcesso: e.target.value })} placeholder="Ex.: estrada de terra, garagem subsolo" /></div>
              <div className="micro">O veículo consegue se movimentar?</div>
              <div className="dupla">
                {[true, false].map((v) => (
                  <button key={String(v)} className={`opcao${guincho.veiculoSeMove === v ? ' ativo' : ''}`} onClick={() => setGuincho({ ...guincho, veiculoSeMove: v })}>
                    <span className="marca">{guincho.veiculoSeMove === v && <Check size={14} />}</span>{v ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="micro">Fotos, vídeo ou áudio (opcional)</div>
          <div className="linha" style={{ flexWrap: 'wrap' }}>
            {anexos.map((a, i) => (
              <div key={a.url} style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
                {a.tipo === 'IMAGEM' ? <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>{a.tipo === 'AUDIO' ? <Mic /> : '▶'}</div>}
                <button onClick={() => setAnexos(anexos.filter((_, j) => j !== i))} aria-label="Remover" style={{ position: 'absolute', top: 2, right: 2, border: 0, borderRadius: '50%', background: '#000a', color: '#fff', width: 22, height: 22, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={12} /></button>
              </div>
            ))}
            {anexos.length < 6 && (
              <>
                <button className="cat" style={{ width: 72, minHeight: 72, padding: 0 }} onClick={() => arquivoRef.current?.click()} disabled={enviandoArquivo}><Camera size={22} /></button>
                <button className="cat" style={{ width: 72, minHeight: 72, padding: 0, borderColor: gravando ? 'var(--erro)' : undefined }} onClick={alternarAudio} disabled={enviandoArquivo && !gravando}>
                  {gravando ? <Square size={20} color="var(--erro)" /> : <Mic size={22} />}
                </button>
              </>
            )}
          </div>
          {gravando && <span className="selo erro"><span className="pt" />Gravando… toque para parar</span>}
          {enviandoArquivo && !gravando && <span className="mini">Enviando arquivo…</span>}
          <input ref={arquivoRef} type="file" accept="image/*,video/*" capture="environment" multiple hidden onChange={(e) => anexar(e.target.files)} />
        </div>
      )}

      {etapa === 4 && (
        <div className="coluna">
          <button className={`opcao${modalidade === 'BUSCAR_DISPONIVEIS' ? ' ativo' : ''}`} onClick={() => setModalidade('BUSCAR_DISPONIVEIS')}>
            <span className="marca">{modalidade === 'BUSCAR_DISPONIVEIS' && <Check size={14} />}</span>
            <Radar size={22} color="var(--verde)" />
            <div className="cresce"><strong>Buscar disponíveis perto de mim</strong><div className="mini">Convidamos os mais próximos e ampliamos a busca em etapas.</div></div>
          </button>
          <button className={`opcao${modalidade === 'ESCOLHER_PROFISSIONAL' ? ' ativo' : ''}`} onClick={() => setModalidade('ESCOLHER_PROFISSIONAL')}>
            <span className="marca">{modalidade === 'ESCOLHER_PROFISSIONAL' && <Check size={14} />}</span>
            <UserCheck size={22} color="var(--verde)" />
            <div className="cresce"><strong>Escolher um profissional</strong><div className="mini">O pedido vai só para quem você escolher.</div></div>
          </button>
          {modalidade === 'ESCOLHER_PROFISSIONAL' && (prestador ? (
            <div className="card prest">
              <Avatar nome={prestador.nomeComercial} url={prestador.fotoUrl} />
              <div className="cresce"><strong>{prestador.nomeComercial} {prestador.verificado && <Verificado tamanho={14} />}</strong><Nota nota={prestador.notaMedia} total={prestador.totalAvaliacoes} /></div>
              <button className="link" onClick={() => nav('/mapa')}>Trocar</button>
            </div>
          ) : <button className="btn contorno" onClick={() => nav('/mapa')}>Escolher no mapa</button>)}

          <div className="card coluna" style={{ gap: 6 }}>
            <div className="micro">Resumo</div>
            <div><strong>{categoria?.nome}</strong>{exemplo ? ` · ${exemplo}` : ''}</div>
            <div className="mini">{veiculos?.find((v) => v.id === veiculoId)?.modelo} · {referencia || 'Ponto marcado no mapa'}</div>
            {anexos.length > 0 && <div className="mini">{anexos.length} anexo(s)</div>}
          </div>
          <div className="info-msg">O preço é combinado entre você e o profissional, pelo chat ou pessoalmente. O VRUM não cobra pelo serviço.</div>
          <Erro texto={erro} />
        </div>
      )}

      <div className="rodape-fixo">
        {etapa > 0 && <button className="btn secundario" onClick={() => setEtapa(etapa - 1)}>Voltar</button>}
        {etapa < ETAPAS.length - 1
          ? <button className="btn primario cresce" disabled={!podeAvancar} onClick={() => setEtapa(etapa + 1)}>Continuar</button>
          : <button className="btn primario cresce" disabled={!podeAvancar || enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar solicitação'}</button>}
      </div>
    </div>
  );
}
