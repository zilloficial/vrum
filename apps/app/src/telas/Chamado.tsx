/**
 * Tela do chamado — a mesma para motorista e prestador. Os botões vêm de
 * `eventosDisponiveis` (@vrum/shared), então tela e servidor nunca discordam.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Car, Clock, MapPin, MessageCircle, Navigation, Pause, Play, Radar, Receipt, Share2,
} from 'lucide-react';
import {
  eventosDisponiveis, frescorPosicao, rastreamentoAtivo, ROTULO_ESTADO,
  type EstadoChamado, type EventoChamado, type MensagemTempoReal, type PosicaoRecebida,
} from '@vrum/shared';
import { get, hora, post, reais, tempoRelativo } from '../api';
import { useSessao } from '../sessao';
import { acompanharChamado, conectar } from '../tempo-real';
import { iniciarRastreamento, type EstadoEnvio } from '../localizacao';
import { Mapa, type Pino } from '../mapa';
import { Avatar, Carregando, Erro, Estrelas, Folha, IconeCategoria, SeloEstado } from '../componentes';
import type { VisaoChamado } from '../tipos';

type Visao = VisaoChamado & {
  conversaId: string | null; avaliado: boolean;
  motorista: { id: string; nome: string; fotoUrl: string | null };
  prestador: { id: string; nomeComercial: string; usuarioNome: string; fotoUrl: string | null } | null;
  responsavel: { usuarioId: string; nome: string; fotoUrl: string | null } | null;
  categoria: { nome: string; slug: string };
};
type Participante = {
  usuarioId: string; papel: 'MOTORISTA' | 'PRESTADOR'; pausado: boolean;
  posicao: { lat: number; lng: number; capturadaEm: string } | null;
};

const ROTULO_ACAO: Partial<Record<EventoChamado, string>> = {
  CONFIRMAR: 'Confirmar atendimento', SAIR_A_CAMINHO: 'Estou a caminho', CHEGAR: 'Cheguei ao local',
  INICIAR_SERVICO: 'Iniciar serviço', SOLICITAR_CONCLUSAO: 'Finalizei o serviço', CONFIRMAR_CONCLUSAO: 'Confirmar conclusão',
  CONTESTAR_CONCLUSAO: 'Ainda não terminou', DESISTIR: 'Desistir deste atendimento', CANCELAR: 'Cancelar chamado',
};
const PERIGOSAS: EventoChamado[] = ['CANCELAR', 'DESISTIR', 'CONTESTAR_CONCLUSAO'];
const PASSOS: EstadoChamado[] = ['AGUARDANDO_RESPOSTA', 'ACEITO_COMBINANDO', 'CONFIRMADO', 'A_CAMINHO', 'NO_LOCAL', 'EM_ATENDIMENTO', 'CONCLUIDO'];

export function TelaChamado() {
  const { id } = useParams();
  const nav = useNavigate();
  const { eu, avisar } = useSessao();
  const [v, setV] = useState<Visao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [agora, setAgora] = useState(Date.now());
  const [envio, setEnvio] = useState<EstadoEnvio>({ ativo: false });
  const [acao, setAcao] = useState<EventoChamado | null>(null);
  const [motivo, setMotivo] = useState('');
  const [proposta, setProposta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const pararRef = useRef<(() => void) | null>(null);

  const carregar = useCallback(async () => {
    try { setV(await get<Visao>(`/chamados/${id}`)); } catch (e) { setErro((e as Error).message); }
  }, [id]);
  const carregarPosicoes = useCallback(async () => {
    try { setParticipantes((await get<{ participantes: Participante[] }>(`/chamados/${id}/localizacao`)).participantes); } catch { /* sem rastreamento */ }
  }, [id]);

  // Tempo real: estado, posições e compartilhamento.
  useEffect(() => {
    void carregar();
    const sair = acompanharChamado(id!);
    const s = conectar();
    const aoEstado = (p: { chamadoId: string }) => { if (p.chamadoId === id) void carregar(); };
    const aoPosicao = (p: PosicaoRecebida) => {
      if (p.chamadoId !== id) return;
      setParticipantes((ps) => {
        const outros = ps.filter((x) => x.usuarioId !== p.usuarioId);
        const atual = ps.find((x) => x.usuarioId === p.usuarioId);
        return [...outros, { usuarioId: p.usuarioId, papel: p.papel, pausado: false, ...atual, posicao: { lat: p.lat, lng: p.lng, capturadaEm: p.capturadaEm } }];
      });
    };
    const aoCompartilhamento = (p: { chamadoId: string }) => { if (p.chamadoId === id) void carregarPosicoes(); };
    // Propostas e respostas chegam pelo chat do atendimento: atualiza as condições.
    const aoMensagem = (m: MensagemTempoReal) => { if (m.tipo === 'PROPOSTA' || m.tipo === 'SISTEMA') void carregar(); };
    s.on('chat:mensagem', aoMensagem);
    s.on('chamado:estado', aoEstado);
    s.on('localizacao:posicao', aoPosicao);
    s.on('localizacao:compartilhamento', aoCompartilhamento);
    const relogio = window.setInterval(() => setAgora(Date.now()), 5000);
    return () => {
      sair();
      s.off('chamado:estado', aoEstado);
      s.off('localizacao:posicao', aoPosicao);
      s.off('localizacao:compartilhamento', aoCompartilhamento);
      s.off('chat:mensagem', aoMensagem);
      window.clearInterval(relogio);
    };
  }, [id, carregar, carregarPosicoes]);

  const estado = v?.chamado.estado;
  const rastreando = !!estado && rastreamentoAtivo(estado);
  const eu_ = participantes.find((p) => p.usuarioId === eu?.id);
  const pausado = !!eu_?.pausado;

  // Compartilhar a própria localização só enquanto o atendimento estiver confirmado e não pausado.
  useEffect(() => {
    if (!rastreando || pausado || !id) { pararRef.current?.(); pararRef.current = null; setEnvio({ ativo: false }); return; }
    void carregarPosicoes();
    let cancelado = false;
    iniciarRastreamento(id, setEnvio).then((parar) => { if (cancelado) parar(); else pararRef.current = parar; });
    return () => { cancelado = true; pararRef.current?.(); pararRef.current = null; };
  }, [rastreando, pausado, id, carregarPosicoes]);

  if (erro) return <div className="tela sem-abas"><button className="voltar" onClick={() => nav(-1)}><ArrowLeft size={20} /></button><Erro texto={erro} /></div>;
  if (!v || !estado) return <div className="tela sem-abas"><Carregando /></div>;

  const ch = v.chamado;
  const souMotorista = v.papel === 'MOTORISTA';
  const taxaPendente = v.condicoes.find((c) => c.tipo === 'TAXA_DESLOCAMENTO' && c.estado === 'PROPOSTA');
  const acoes = eventosDisponiveis(estado, { ator: v.papel, taxaDeslocamentoPendente: false })
    .filter((e) => e in ROTULO_ACAO && !(e === 'CANCELAR' && !souMotorista && !v.prestador));
  const principais = acoes.filter((e) => !PERIGOSAS.includes(e));
  const secundarias = acoes.filter((e) => PERIGOSAS.includes(e));

  const outro = participantes.find((p) => p.usuarioId !== eu?.id && p.posicao);
  const frescorOutro = outro?.posicao ? frescorPosicao(new Date(outro.posicao.capturadaEm), new Date(agora)) : null;
  const pinos: Pino[] = [{ id: 'ponto', lat: ch.pontoLat, lng: ch.pontoLng, tipo: 'branco', rotulo: '●' }];
  for (const p of participantes) {
    if (!p.posicao) continue;
    const f = frescorPosicao(new Date(p.posicao.capturadaEm), new Date(agora));
    if (p.papel === 'PRESTADOR') pinos.push({ id: p.usuarioId, ...p.posicao, tipo: 'verde', rotulo: '🔧', velho: f !== 'ATUAL' });
    else pinos.push({ id: p.usuarioId, ...p.posicao, tipo: 'motorista' });
  }
  const posPrestador = participantes.find((p) => p.papel === 'PRESTADOR')?.posicao;

  async function executar(evento: EventoChamado, extra: Record<string, unknown> = {}) {
    setOcupado(true);
    try {
      await post(`/chamados/${id}/acoes`, { evento, versao: ch.versao, ...extra });
      setAcao(null);
      setMotivo('');
      await carregar();
    } catch (e) {
      avisar((e as Error).message, true);
      await carregar();
    } finally { setOcupado(false); }
  }

  function clicar(evento: EventoChamado) {
    if (evento === 'CONFIRMAR' && taxaPendente) return avisar('Responda à taxa de deslocamento primeiro.', true);
    if (PERIGOSAS.includes(evento)) { setAcao(evento); return; }
    void executar(evento);
  }

  async function responderTaxa(aceitar: boolean) {
    if (!taxaPendente) return;
    try { await post(`/propostas/${taxaPendente.id}/responder`, { aceitar }); await carregar(); } catch (e) { avisar((e as Error).message, true); }
  }

  function pausar(p: boolean) {
    conectar().emit(p ? 'localizacao:pausar' : 'localizacao:retomar', { chamadoId: id! }, (r) => {
      if (!r.ok) avisar(r.mensagem, true); else void carregarPosicoes();
    });
  }

  const idxPasso = PASSOS.indexOf(estado === 'BUSCANDO_PROFISSIONAL' ? 'AGUARDANDO_RESPOSTA' : estado === 'CONCLUSAO_SOLICITADA' ? 'EM_ATENDIMENTO' : estado);
  const navExterna = `https://www.google.com/maps/dir/?api=1&destination=${ch.pontoLat},${ch.pontoLng}`;
  const nomeOutro = souMotorista ? (v.responsavel?.nome ?? v.prestador?.nomeComercial) : v.motorista.nome;

  return (
    <div className="tela cheia">
      <div style={{ position: 'relative' }}>
        <Mapa centro={{ lat: ch.pontoLat, lng: ch.pontoLng }} pinos={pinos} altura="42vh"
          linha={posPrestador ? [[posPrestador.lat, posPrestador.lng], [ch.pontoLat, ch.pontoLng]] : undefined} />
        <button className="voltar" style={{ position: 'absolute', top: 'calc(12px + var(--topo))', left: 12, zIndex: 500, background: '#101114cc' }} onClick={() => nav(-1)} aria-label="Voltar"><ArrowLeft size={20} /></button>
        {rastreando && (
          <div style={{ position: 'absolute', top: 'calc(14px + var(--topo))', right: 12, zIndex: 500 }}>
            {pausado ? <span className="selo alerta">Compartilhamento pausado</span>
              : envio.erro ? <span className="selo alerta"><AlertTriangle size={12} />{envio.erro}</span>
              : <span className="selo vivo"><span className="pt" />Localização compartilhada</span>}
          </div>
        )}
      </div>

      <div className="painel-chamado">
        <div className="entre">
          <SeloEstado estado={estado} />
          <span className="mini">Pedido {tempoRelativo(ch.criadoEm)}</span>
        </div>

        {/* Mensagem principal do estado */}
        {(estado === 'BUSCANDO_PROFISSIONAL' || estado === 'AGUARDANDO_RESPOSTA') && (
          <div className="card linha">
            <Radar size={28} color="var(--verde)" className="girando" style={{ margin: 0, border: 0, width: 28, height: 28 }} />
            <div><h3>{ch.modalidade === 'ESCOLHER_PROFISSIONAL' ? 'Aguardando resposta do profissional' : 'Procurando profissionais perto de você'}</h3>
              <div className="mini">{ch.modalidade === 'BUSCAR_DISPONIVEIS' ? `Etapa ${ch.etapaBusca} da busca. Ampliamos o raio se ninguém aceitar.` : 'Você será avisado assim que ele responder.'}</div></div>
          </div>
        )}
        {estado === 'SEM_ATENDIMENTO' && souMotorista && (
          <div className="card coluna">
            <h3>Ninguém aceitou a tempo</h3>
            <p className="mini" style={{ margin: 0 }}>Você pode ampliar a busca para todos os disponíveis ou escolher outro profissional.</p>
            <div className="dupla">
              <button className="btn primario" disabled={ocupado} onClick={() => executar('REABRIR_BUSCA' as EventoChamado)}>Ampliar busca</button>
              <button className="btn secundario" onClick={() => nav('/mapa')}>Escolher outro</button>
            </div>
          </div>
        )}
        {estado === 'CONCLUSAO_SOLICITADA' && souMotorista && (
          <div className="aviso-msg">O profissional informou que terminou. Confirme a conclusão{ch.autoConcluirEm ? ` até ${hora(ch.autoConcluirEm)}` : ''} ou conte o que ficou pendente.</div>
        )}
        {estado === 'CANCELADO' && ch.motivoCancelamento && <div className="erro-msg">{ch.motivoCancelamento}</div>}

        {/* Quem está atendendo */}
        {(v.prestador || !souMotorista) && (
          <div className="card prest">
            <Avatar nome={nomeOutro ?? '?'} url={souMotorista ? (v.responsavel?.fotoUrl ?? v.prestador?.fotoUrl) : v.motorista.fotoUrl} tamanho={50} />
            <div className="cresce">
              <div className="micro">{souMotorista ? 'Profissional' : 'Motorista'}</div>
              <div style={{ fontWeight: 800 }} className="corta">{nomeOutro}</div>
              {souMotorista && v.prestador && v.responsavel && <div className="mini corta">{v.prestador.nomeComercial}</div>}
              {rastreando && outro?.posicao && (
                <div className={`mini${frescorOutro !== 'ATUAL' ? '' : ''}`} style={{ color: frescorOutro === 'ATUAL' ? 'var(--verde)' : 'var(--alerta)' }}>
                  {frescorOutro === 'ATUAL' ? 'Posição ao vivo' : frescorOutro === 'DESATUALIZADA' ? `Localização desatualizada · ${hora(outro.posicao.capturadaEm)}` : `Sem sinal desde ${hora(outro.posicao.capturadaEm)}`}
                </div>
              )}
              {rastreando && !outro?.posicao && <div className="mini" style={{ color: 'var(--alerta)' }}>Aguardando a localização da outra parte</div>}
            </div>
            {v.conversaId && <button className="icone-btn" aria-label="Conversa" onClick={() => nav(`/conversas/${v.conversaId}`)}><MessageCircle size={20} /></button>}
          </div>
        )}
        {ch.chegadaPrevistaEm && ['A_CAMINHO', 'CONFIRMADO'].includes(estado) && (
          <div className="linha mini"><Clock size={14} /> Chegada prevista às {hora(ch.chegadaPrevistaEm)}</div>
        )}

        {/* Taxa de deslocamento: precisa ser aceita antes da saída */}
        {taxaPendente && (
          <div className="card coluna" style={{ boxShadow: 'inset 0 0 0 1.5px var(--alerta)' }}>
            <div className="linha"><Receipt size={18} color="var(--alerta)" /><strong>Taxa de deslocamento: {reais(taxaPendente.valorCentavos ?? 0)}</strong></div>
            {souMotorista ? (
              <div className="dupla">
                <button className="btn secundario" onClick={() => responderTaxa(false)}>Recusar</button>
                <button className="btn primario" onClick={() => responderTaxa(true)}>Aceitar</button>
              </div>
            ) : <span className="mini">Aguardando o motorista aceitar.</span>}
          </div>
        )}
        {v.condicoes.filter((c) => c.estado === 'ACEITA').map((c) => (
          <div key={c.id} className="linha mini"><Receipt size={14} />
            {c.tipo === 'AVALIACAO_PRESENCIAL' ? 'Valor depende de avaliação presencial' : `${c.tipo === 'TAXA_DESLOCAMENTO' ? 'Taxa de deslocamento aceita' : 'Valor combinado'}: ${reais(c.valorCentavos ?? 0)}`}
          </div>
        ))}

        {/* Ações */}
        {principais.map((e) => (
          <button key={e} className="btn primario bloco" disabled={ocupado} onClick={() => clicar(e)}>{ROTULO_ACAO[e]}</button>
        ))}
        {!souMotorista && estado === 'ACEITO_COMBINANDO' && (
          <button className="btn secundario bloco" onClick={() => setProposta(true)}>Enviar valor ou taxa</button>
        )}
        {!souMotorista && rastreando && (
          <a className="btn secundario bloco" href={navExterna} target="_blank" rel="noreferrer"><Navigation size={18} /> Abrir navegação</a>
        )}
        {rastreando && (
          <button className="btn contorno bloco peq" onClick={() => pausar(!pausado)}>
            {pausado ? <><Play size={16} /> Retomar compartilhamento</> : <><Pause size={16} /> Interromper compartilhamento</>}
          </button>
        )}

        {/* Avaliação */}
        {estado === 'CONCLUIDO' && !v.avaliado && <Avaliar chamadoId={ch.id} souMotorista={souMotorista} aoAvaliar={carregar} />}
        {estado === 'CONCLUIDO' && souMotorista && <ContestarDepois chamadoId={ch.id} />}

        {/* Linha do tempo */}
        {!['CANCELADO', 'SEM_ATENDIMENTO'].includes(estado) && (
          <div className="card linha-tempo">
            {PASSOS.map((p, i) => (
              <div key={p} className={`passo${i < idxPasso || estado === 'CONCLUIDO' ? ' feito' : i === idxPasso ? ' atual' : ''}`}>
                <div className="bola" /><span>{ROTULO_ESTADO[p]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Detalhes */}
        <div className="card coluna">
          <div className="linha"><span className="ic" style={{ color: 'var(--verde)' }}><IconeCategoria slug={v.categoria.slug} /></span><strong>{v.categoria.nome}</strong></div>
          {ch.descricao && <p style={{ margin: 0 }}>{ch.descricao}</p>}
          {v.veiculo && <div className="linha mini"><Car size={14} />{v.veiculo.marca} {v.veiculo.modelo} {v.veiculo.ano}{v.veiculo.cor ? ` · ${v.veiculo.cor}` : ''}{v.veiculo.placa ? ` · ${v.veiculo.placa}` : ''}</div>}
          {v.veiculo?.observacoes && <div className="mini">Obs.: {v.veiculo.observacoes}</div>}
          <div className="linha mini"><MapPin size={14} />{ch.pontoReferencia ?? 'Ponto marcado no mapa'}</div>
          {ch.destinoEndereco && <div className="mini">Destino do guincho: {ch.destinoEndereco}{ch.veiculoSeMove === false ? ' · veículo não se movimenta' : ''}</div>}
          {ch.condicoesAcesso && <div className="mini">Acesso: {ch.condicoesAcesso}</div>}
          {v.anexos.length > 0 && (
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              {v.anexos.map((a) => a.tipo === 'IMAGEM'
                ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} /></a>
                : a.tipo === 'AUDIO' ? <audio key={a.id} src={a.url} controls style={{ height: 36 }} /> : <a key={a.id} className="link" href={a.url} target="_blank" rel="noreferrer">Vídeo</a>)}
            </div>
          )}
        </div>

        {secundarias.map((e) => (
          <button key={e} className="btn perigo bloco" onClick={() => clicar(e)}>{ROTULO_ACAO[e]}</button>
        ))}
        {souMotorista && v.prestador && (
          <button className="link" style={{ alignSelf: 'center' }} onClick={() => nav(`/perfis/${v.prestador!.usuarioNome}`)}><Share2 size={14} /> Ver perfil do profissional</button>
        )}
      </div>

      <Folha aberta={acao !== null} aoFechar={() => setAcao(null)}>
        <h2>{acao && ROTULO_ACAO[acao]}</h2>
        <p className="sub" style={{ margin: 0 }}>
          {acao === 'CONTESTAR_CONCLUSAO' ? 'Conte o que ainda falta. O atendimento volta para “em atendimento”.'
            : acao === 'DESISTIR' ? 'O chamado volta a procurar outro profissional.' : 'A outra parte será avisada e o compartilhamento de localização termina.'}
        </p>
        <textarea className="entrada" placeholder={acao === 'CONTESTAR_CONCLUSAO' ? 'O que ficou pendente?' : 'Motivo (opcional)'} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <button className="btn perigo bloco" disabled={ocupado || (acao === 'CONTESTAR_CONCLUSAO' && motivo.trim().length < 3)}
          onClick={() => acao && executar(acao, { motivo: motivo || undefined })}>Confirmar</button>
        <button className="btn secundario bloco" onClick={() => setAcao(null)}>Voltar</button>
      </Folha>

      <Proposta aberta={proposta} chamadoId={ch.id} aoFechar={() => setProposta(false)} aoEnviar={carregar} />
    </div>
  );
}

function Proposta({ aberta, chamadoId, aoFechar, aoEnviar }: { aberta: boolean; chamadoId: string; aoFechar: () => void; aoEnviar: () => void }) {
  const { avisar } = useSessao();
  const [tipo, setTipo] = useState<'VALOR_SERVICO' | 'TAXA_DESLOCAMENTO' | 'AVALIACAO_PRESENCIAL'>('VALOR_SERVICO');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  async function enviar() {
    const centavos = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
    try {
      await post(`/chamados/${chamadoId}/propostas`, { tipo, valorCentavos: tipo === 'AVALIACAO_PRESENCIAL' ? undefined : centavos, descricao: descricao || undefined });
      avisar('Enviado no chat');
      setValor(''); setDescricao('');
      aoFechar(); aoEnviar();
    } catch (e) { avisar((e as Error).message, true); }
  }
  return (
    <Folha aberta={aberta} aoFechar={aoFechar}>
      <h2>Combinar com o motorista</h2>
      {([['VALOR_SERVICO', 'Valor do serviço'], ['TAXA_DESLOCAMENTO', 'Taxa de deslocamento'], ['AVALIACAO_PRESENCIAL', 'Valor depende de avaliação no local']] as const).map(([t, r]) => (
        <button key={t} className={`opcao${tipo === t ? ' ativo' : ''}`} onClick={() => setTipo(t)}><span className="marca" />{r}</button>
      ))}
      {tipo !== 'AVALIACAO_PRESENCIAL' && <input className="entrada" inputMode="decimal" placeholder="R$ 0,00" value={valor} onChange={(e) => setValor(e.target.value)} />}
      <input className="entrada" placeholder="Observação (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      {tipo === 'TAXA_DESLOCAMENTO' && <span className="mini">A taxa precisa ser aceita pelo motorista antes da confirmação.</span>}
      <button className="btn primario bloco" disabled={tipo !== 'AVALIACAO_PRESENCIAL' && !Number(valor.replace(',', '.'))} onClick={enviar}>Enviar</button>
    </Folha>
  );
}

function Avaliar({ chamadoId, souMotorista, aoAvaliar }: { chamadoId: string; souMotorista: boolean; aoAvaliar: () => void }) {
  const { avisar } = useSessao();
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  async function enviar() {
    try { await post(`/chamados/${chamadoId}/avaliacao`, { nota, comentario: comentario || undefined }); avisar('Obrigado pela avaliação!'); aoAvaliar(); }
    catch (e) { avisar((e as Error).message, true); }
  }
  return (
    <div className="card coluna" style={{ textAlign: 'center' }}>
      <h3>{souMotorista ? 'Como foi o atendimento?' : 'Como foi com este motorista?'}</h3>
      <Estrelas valor={nota} aoMudar={setNota} />
      {nota > 0 && <>
        <textarea className="entrada" placeholder="Conte como foi (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <button className="btn primario bloco" onClick={enviar}>Enviar avaliação</button>
      </>}
    </div>
  );
}

function ContestarDepois({ chamadoId }: { chamadoId: string }) {
  const { avisar } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  async function enviar() {
    try { await post(`/chamados/${chamadoId}/contestacao`, { motivo }); avisar('Contestação enviada ao suporte.'); setAberto(false); }
    catch (e) { avisar((e as Error).message, true); }
  }
  return (
    <>
      <button className="link" style={{ alignSelf: 'center' }} onClick={() => setAberto(true)}>Algo deu errado? Abrir contestação</button>
      <Folha aberta={aberto} aoFechar={() => setAberto(false)}>
        <h2>Contestar encerramento</h2>
        <p className="sub" style={{ margin: 0 }}>Nossa equipe de suporte vai analisar. Prazo: 7 dias após a conclusão.</p>
        <textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O que aconteceu?" />
        <button className="btn primario bloco" disabled={motivo.trim().length < 5} onClick={enviar}>Enviar</button>
      </Folha>
    </>
  );
}
