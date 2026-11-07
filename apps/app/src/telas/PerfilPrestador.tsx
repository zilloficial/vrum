import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Flag, MapPin, MessageCircle, Moon, Play, Truck, Wrench } from 'lucide-react';
import { post, tempoRelativo } from '../api';
import { useSessao } from '../sessao';
import { useDados } from '../ganchos';
import { Avatar, Carregando, Erro, Folha, Nota, Verificado } from '../componentes';
import { CartaoPublicacao } from '../publicacao';
import type { Publicacao } from '../tipos';

interface Perfil {
  id: string; tipo: string; nomeComercial: string; usuarioNome: string; apresentacao: string | null; fotoUrl: string | null; capaUrl: string | null;
  enderecoComercial: string | null; raioCoberturaKm: number; modalidade: 'NO_LOCAL' | 'NA_OFICINA' | 'AMBOS'; veiculosAtendidos: string[];
  horarios: Record<string, [string, string][]> | null; plantao: boolean; infoDeslocamento: string | null; verificado: boolean;
  notaMedia: number | null; totalAvaliacoes: number; categorias: { id: string; nome: string; especialidades: string[] }[];
  disponivelAgora: boolean; seguidores: number; sigo: boolean;
  avaliacoes: { id: string; nota: number; comentario: string | null; resposta: string | null; criadaEm: string; autor: string }[];
}

const MODALIDADE = { NO_LOCAL: 'Vai até você', NA_OFICINA: 'Atende na oficina', AMBOS: 'No local ou na oficina' };
const DIAS: [string, string][] = [['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb'], ['dom', 'Dom']];
const VEICULOS: Record<string, string> = { CARRO: 'Carros', MOTO: 'Motos', CAMINHONETE: 'Caminhonetes', CAMINHAO: 'Caminhões', ONIBUS: 'Ônibus', MAQUINA_AGRICOLA: 'Máquinas agrícolas' };

export function PerfilPrestador() {
  const { ref } = useParams();
  const nav = useNavigate();
  const { eu, avisar } = useSessao();
  const { dados: p, erro, setDados } = useDados<Perfil>(`/perfis/${ref}`);
  const { dados: pubs } = useDados<Publicacao[]>(p ? `/publicacoes?prestadorId=${p.id}` : null, [p?.id]);
  const [aba, setAba] = useState<'trabalhos' | 'avaliacoes' | 'sobre'>('trabalhos');
  const [aberta, setAberta] = useState<Publicacao | null>(null);
  const [denunciar, setDenunciar] = useState(false);

  if (erro) return <div className="tela sem-abas"><button className="voltar" onClick={() => nav(-1)}><ArrowLeft size={20} /></button><Erro texto={erro} /></div>;
  if (!p) return <div className="tela sem-abas"><Carregando /></div>;
  const meu = eu?.vinculos.some((v) => v.prestador.id === p.id);

  async function seguir() {
    if (!eu) return nav('/');
    const r = await post<{ sigo: boolean }>(`/prestadores/${p!.id}/seguir`);
    setDados({ ...p!, sigo: r.sigo, seguidores: p!.seguidores + (r.sigo ? 1 : -1) });
  }
  async function mensagem() {
    if (!eu) return nav('/');
    try { const c = await post<{ id: string }>(`/prestadores/${p!.id}/conversa`); nav(`/conversas/${c.id}`); } catch (e) { avisar((e as Error).message, true); }
  }
  async function enviarDenuncia(motivo: string) {
    await post('/denuncias', { alvo: 'PRESTADOR', alvoId: p!.id, motivo });
    setDenunciar(false);
    avisar('Denúncia enviada.');
  }

  return (
    <div className="tela cheia" style={{ paddingBottom: 'calc(110px + var(--base))' }}>
      <div className="capa">
        {p.capaUrl && <img src={p.capaUrl} alt="" />}
        <button className="voltar" onClick={() => nav(-1)} aria-label="Voltar"><ArrowLeft size={20} /></button>
      </div>
      <div className="perfil-topo">
        <div className="entre" style={{ alignItems: 'flex-end' }}>
          <Avatar nome={p.nomeComercial} url={p.fotoUrl} tamanho={84} />
          {eu && !meu && <button className={`btn ${p.sigo ? 'secundario' : 'contorno'} peq`} onClick={seguir}>{p.sigo ? 'Seguindo' : 'Seguir'}</button>}
        </div>
        <div>
          <h1 style={{ fontSize: 23 }}>{p.nomeComercial} {p.verificado && <Verificado tamanho={18} />}</h1>
          <div className="mini">@{p.usuarioNome}</div>
        </div>
        <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
          {p.disponivelAgora ? <span className="selo vivo"><span className="pt" />Disponível agora</span> : <span className="selo">Indisponível agora</span>}
          {p.plantao && <span className="selo info"><Moon size={12} />Plantão</span>}
          <span className="selo pub"><Truck size={12} />{MODALIDADE[p.modalidade]}</span>
        </div>
        {p.apresentacao && <p style={{ margin: 0 }}>{p.apresentacao}</p>}
        <div className="numeros">
          <div><strong>{p.notaMedia?.toFixed(1) ?? '—'}</strong><span className="mini">{p.totalAvaliacoes} avaliações</span></div>
          <div><strong>{p.seguidores}</strong><span className="mini">seguidores</span></div>
          <div><strong>{pubs?.length ?? 0}</strong><span className="mini">trabalhos</span></div>
        </div>
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
          {p.categorias.map((c) => <span key={c.id} className="selo pub"><Wrench size={11} />{c.nome}</span>)}
        </div>

        <div className="trocar-area" style={{ marginTop: 6 }}>
          {(['trabalhos', 'avaliacoes', 'sobre'] as const).map((a) => (
            <button key={a} className={aba === a ? 'ativo' : ''} onClick={() => setAba(a)}>{a === 'trabalhos' ? 'Trabalhos' : a === 'avaliacoes' ? 'Avaliações' : 'Sobre'}</button>
          ))}
        </div>

        {aba === 'trabalhos' && (!pubs?.length ? <p className="mini">Nenhum trabalho publicado ainda.</p> : (
          <div className="grade-fotos">
            {pubs.map((x) => (
              <div key={x.id} onClick={() => setAberta(x)} style={{ position: 'relative' }}>
                {x.midias[0]?.tipo === 'VIDEO'
                  ? <><video src={x.midias[0].url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><Play size={18} style={{ position: 'absolute', top: 6, right: 6 }} /></>
                  : x.midias[0] && <img src={x.midias[0].url} alt="" loading="lazy" />}
              </div>
            ))}
          </div>
        ))}

        {aba === 'avaliacoes' && (
          <div className="lista">
            <Nota nota={p.notaMedia} total={p.totalAvaliacoes} />
            {p.avaliacoes.length === 0 && <p className="mini">Avaliações aparecem depois de atendimentos concluídos pelo VRUM.</p>}
            {p.avaliacoes.map((a) => (
              <div key={a.id} className="card coluna" style={{ gap: 6 }}>
                <div className="entre"><strong>{a.autor}</strong><span className="estrela">{'★'.repeat(a.nota)}<span style={{ color: 'var(--borda)' }}>{'★'.repeat(5 - a.nota)}</span></span></div>
                {a.comentario && <div>{a.comentario}</div>}
                <div className="mini">{tempoRelativo(a.criadaEm)}</div>
                {a.resposta && <div className="mini" style={{ borderLeft: '2px solid var(--borda)', paddingLeft: 10 }}><strong>Resposta:</strong> {a.resposta}</div>}
              </div>
            ))}
          </div>
        )}

        {aba === 'sobre' && (
          <div className="lista">
            {p.enderecoComercial && <div className="card linha"><MapPin size={18} /><div>{p.enderecoComercial}<div className="mini">Atende num raio de {p.raioCoberturaKm} km</div></div></div>}
            {p.veiculosAtendidos.length > 0 && <div className="card"><div className="micro">Veículos atendidos</div>{p.veiculosAtendidos.map((v) => VEICULOS[v]).join(', ')}</div>}
            {p.horarios && (
              <div className="card coluna" style={{ gap: 4 }}>
                <div className="micro linha"><Clock size={12} />Horário de funcionamento</div>
                {DIAS.map(([k, r]) => <div key={k} className="entre mini"><span>{r}</span><span>{p.horarios?.[k]?.map(([a, b]) => `${a}–${b}`).join(', ') || 'Fechado'}</span></div>)}
              </div>
            )}
            {p.infoDeslocamento && <div className="card"><div className="micro">Deslocamento</div>{p.infoDeslocamento}</div>}
            {p.categorias.some((c) => c.especialidades.length) && <div className="card"><div className="micro">Especialidades</div>{p.categorias.flatMap((c) => c.especialidades).join(', ')}</div>}
            {eu && !meu && <button className="link" style={{ alignSelf: 'center' }} onClick={() => setDenunciar(true)}><Flag size={13} /> Denunciar perfil</button>}
          </div>
        )}
      </div>

      {!meu && (
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '12px 16px calc(12px + var(--base))', background: 'linear-gradient(transparent, var(--fundo) 30%)', display: 'flex', gap: 10, zIndex: 50 }}>
          <button className="btn secundario" onClick={mensagem}><MessageCircle size={18} /> Mensagem</button>
          <button className="btn primario cresce" onClick={() => (eu ? nav(`/solicitar?prestador=${p.id}`) : nav('/'))}>Chamar profissional</button>
        </div>
      )}

      <Folha aberta={!!aberta} aoFechar={() => setAberta(null)}>{aberta && <CartaoPublicacao pub={aberta} />}</Folha>
      <Folha aberta={denunciar} aoFechar={() => setDenunciar(false)}>
        <h2>Denunciar perfil</h2>
        {['Perfil falso', 'Golpe ou cobrança abusiva', 'Comportamento inadequado', 'Outro motivo'].map((m) => <button key={m} className="opcao" onClick={() => enviarDenuncia(m)}>{m}</button>)}
      </Folha>
    </div>
  );
}
