import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Crosshair, FileText, Upload } from 'lucide-react';
import { enviarArquivo, get, patch, post, tempoRelativo } from '../../api';
import { useSessao } from '../../sessao';
import { posicaoAtual } from '../../localizacao';
import { useDados } from '../../ganchos';
import { Cabecalho, Carregando, Erro, IconeCategoria } from '../../componentes';

const VEICULOS = [['CARRO', 'Carro'], ['CAMINHONETE', 'Caminhonete'], ['MOTO', 'Moto'], ['CAMINHAO', 'Caminhão'], ['ONIBUS', 'Ônibus'], ['MAQUINA_AGRICOLA', 'Máquina agrícola']] as const;
const MODALIDADES = [['NO_LOCAL', 'Vou até o cliente'], ['NA_OFICINA', 'Atendo no meu estabelecimento'], ['AMBOS', 'Os dois']] as const;
const DIAS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'], ['dom', 'Domingo']] as const;

function SeletorCategorias({ valor, aoMudar }: { valor: string[]; aoMudar: (v: string[]) => void }) {
  const { categorias } = useSessao();
  return (
    <div className="grade-cat">
      {categorias.map((c) => (
        <button key={c.id} type="button" className={`cat${valor.includes(c.id) ? ' ativo' : ''}`}
          onClick={() => aoMudar(valor.includes(c.id) ? valor.filter((x) => x !== c.id) : [...valor, c.id])}>
          <span className="ic"><IconeCategoria slug={c.slug} /></span>{c.nome}
        </button>
      ))}
    </div>
  );
}

export function TornarProfissional() {
  const nav = useNavigate();
  const { eu, recarregar, trocarArea } = useSessao();
  const [tipo, setTipo] = useState<'AUTONOMO' | 'EMPRESA'>('AUTONOMO');
  const [nomeComercial, setNome] = useState('');
  const [usuarioNome, setUsuario] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [modalidade, setModalidade] = useState<'NO_LOCAL' | 'NA_OFICINA' | 'AMBOS'>('AMBOS');
  const [base, setBase] = useState<{ lat: number; lng: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { posicaoAtual().then(setBase); }, []);

  async function criar() {
    setErro(null);
    try {
      const p = await post('/prestadores', { tipo, nomeComercial, usuarioNome, cidadeId: eu!.cidadeId, categorias: cats, modalidade, baseLat: base?.lat, baseLng: base?.lng });
      await recarregar();
      trocarArea('prestador', p.id);
      nav('/p', { replace: true });
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <div className="tela sem-abas">
      <Cabecalho titulo="Perfil profissional" />
      <p className="sub" style={{ margin: 0 }}>Divulgue seus serviços, receba chamados de motoristas perto de você e combine o valor direto com eles.</p>
      <div className="trocar-area">
        <button className={tipo === 'AUTONOMO' ? 'ativo' : ''} onClick={() => setTipo('AUTONOMO')}>Autônomo</button>
        <button className={tipo === 'EMPRESA' ? 'ativo' : ''} onClick={() => setTipo('EMPRESA')}>Empresa</button>
      </div>
      <div className="campo"><label>Nome comercial</label><input className="entrada" value={nomeComercial} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Borracharia do Zé" /></div>
      <div className="campo"><label>@usuário</label><input className="entrada" value={usuarioNome} onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/[^a-z0-9_.@]/g, ''))} placeholder="@borrachariadoze" /></div>
      <div className="micro">Como você atende?</div>
      {MODALIDADES.map(([v, r]) => <button key={v} className={`opcao${modalidade === v ? ' ativo' : ''}`} onClick={() => setModalidade(v)}><span className="marca">{modalidade === v && <Check size={14} />}</span>{r}</button>)}
      <div className="micro">Serviços que você faz</div>
      <SeletorCategorias valor={cats} aoMudar={setCats} />
      <div className="card linha"><Crosshair size={18} /><div className="cresce mini">{base ? 'Sua base comercial será o local atual. Você pode ajustar depois.' : 'Permita a localização para definir sua base de atendimento.'}</div>
        <button className="link" onClick={() => posicaoAtual().then(setBase)}>Atualizar</button></div>
      {tipo === 'EMPRESA' && <div className="info-msg">Como empresa, você poderá adicionar funcionários pelo painel web e distribuir os chamados entre eles.</div>}
      <Erro texto={erro} />
      <div className="rodape-fixo"><button className="btn primario cresce" disabled={nomeComercial.length < 2 || usuarioNome.length < 3 || !cats.length} onClick={criar}>Criar perfil</button></div>
    </div>
  );
}

export function EditarPerfil() {
  const { vinculo, avisar, recarregar } = useSessao();
  const pid = vinculo?.prestador.id;
  const { dados: p } = useDados<any>(pid ? `/perfis/${pid}` : null, [pid]);
  const [f, setF] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const foto = useRef<HTMLInputElement>(null);
  const capa = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (p && !f) setF({
      nomeComercial: p.nomeComercial, apresentacao: p.apresentacao ?? '', enderecoComercial: p.enderecoComercial ?? '', fotoUrl: p.fotoUrl, capaUrl: p.capaUrl,
      raioCoberturaKm: p.raioCoberturaKm, modalidade: p.modalidade, veiculosAtendidos: p.veiculosAtendidos, plantao: p.plantao,
      infoDeslocamento: p.infoDeslocamento ?? '', categorias: p.categorias.map((c: any) => c.id),
      horarios: p.horarios ?? { seg: [['07:00', '18:00']], ter: [['07:00', '18:00']], qua: [['07:00', '18:00']], qui: [['07:00', '18:00']], sex: [['07:00', '18:00']], sab: [['07:00', '12:00']] },
    });
  }, [p, f]);

  if (!f) return <div className="tela sem-abas"><Carregando /></div>;
  const somenteLeitura = vinculo?.funcao === 'PROFISSIONAL';

  async function subir(campo: 'fotoUrl' | 'capaUrl', arq?: File) {
    if (!arq) return;
    try { const r = await enviarArquivo(arq, arq.name); setF({ ...f, [campo]: r.url }); } catch (e) { avisar((e as Error).message, true); }
  }
  async function salvar() {
    setErro(null);
    try {
      const corpo: any = { ...f, raioCoberturaKm: Number(f.raioCoberturaKm) };
      for (const k of ['fotoUrl', 'capaUrl']) if (!corpo[k]) delete corpo[k];
      await patch(`/prestadores/${pid}`, corpo);
      await recarregar();
      avisar('Perfil atualizado');
    } catch (e) { setErro((e as Error).message); }
  }
  async function usarLocal() {
    const pos = await posicaoAtual();
    if (!pos) return avisar('Não consegui sua localização.', true);
    await patch(`/prestadores/${pid}`, { baseLat: pos.lat, baseLng: pos.lng });
    avisar('Base comercial atualizada para o local atual');
  }
  const horario = (dia: string) => f.horarios[dia]?.[0] as [string, string] | undefined;

  return (
    <div className="tela sem-abas">
      <Cabecalho titulo="Perfil do negócio" />
      {somenteLeitura && <div className="info-msg">Só o dono ou um gestor pode editar o perfil.</div>}
      <fieldset disabled={somenteLeitura} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="linha">
          <button type="button" className="cat" style={{ width: 88, minHeight: 88, padding: 0, overflow: 'hidden' }} onClick={() => foto.current?.click()}>
            {f.fotoUrl ? <img src={f.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <><Camera />Foto</>}
          </button>
          <button type="button" className="cat cresce" style={{ minHeight: 88, padding: 0, overflow: 'hidden' }} onClick={() => capa.current?.click()}>
            {f.capaUrl ? <img src={f.capaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <><Camera />Imagem de capa</>}
          </button>
        </div>
        <input ref={foto} type="file" accept="image/*" hidden onChange={(e) => subir('fotoUrl', e.target.files?.[0])} />
        <input ref={capa} type="file" accept="image/*" hidden onChange={(e) => subir('capaUrl', e.target.files?.[0])} />
        <div className="campo"><label>Nome comercial</label><input className="entrada" value={f.nomeComercial} onChange={(e) => setF({ ...f, nomeComercial: e.target.value })} /></div>
        <div className="campo"><label>Apresentação</label><textarea className="entrada" value={f.apresentacao} onChange={(e) => setF({ ...f, apresentacao: e.target.value })} /></div>
        <div className="campo"><label>Endereço comercial</label><input className="entrada" value={f.enderecoComercial} onChange={(e) => setF({ ...f, enderecoComercial: e.target.value })} /></div>
        <button type="button" className="btn secundario peq" onClick={usarLocal}><Crosshair size={16} /> Usar local atual como base no mapa</button>
        <div className="campo"><label>Raio de atendimento: {f.raioCoberturaKm} km</label><input type="range" min={2} max={100} value={f.raioCoberturaKm} onChange={(e) => setF({ ...f, raioCoberturaKm: Number(e.target.value) })} style={{ accentColor: '#c6ff00' }} /></div>
        <div className="micro">Modalidade</div>
        {MODALIDADES.map(([v, r]) => <button type="button" key={v} className={`opcao${f.modalidade === v ? ' ativo' : ''}`} onClick={() => setF({ ...f, modalidade: v })}><span className="marca">{f.modalidade === v && <Check size={14} />}</span>{r}</button>)}
        <div className="micro">Veículos atendidos</div>
        <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
          {VEICULOS.map(([v, r]) => {
            const on = f.veiculosAtendidos.includes(v);
            return <button type="button" key={v} className={`chip${on ? ' ativo' : ''}`} onClick={() => setF({ ...f, veiculosAtendidos: on ? f.veiculosAtendidos.filter((x: string) => x !== v) : [...f.veiculosAtendidos, v] })}>{r}</button>;
          })}
        </div>
        <span className="mini">Nenhum marcado = atende todos.</span>
        <div className="micro">Serviços</div>
        <SeletorCategorias valor={f.categorias} aoMudar={(categorias) => setF({ ...f, categorias })} />
        <div className="micro">Horário de funcionamento</div>
        <div className="card coluna" style={{ gap: 8 }}>
          {DIAS.map(([d, r]) => {
            const h = horario(d);
            return (
              <div key={d} className="entre">
                <label className="linha" style={{ gap: 8, minWidth: 110 }}><input type="checkbox" checked={!!h} onChange={(e) => setF({ ...f, horarios: { ...f.horarios, [d]: e.target.checked ? [['08:00', '18:00']] : [] } })} style={{ accentColor: '#c6ff00' }} />{r}</label>
                {h ? <div className="linha" style={{ gap: 6 }}>
                  <input type="time" className="entrada" style={{ padding: '6px 8px', width: 96 }} value={h[0]} onChange={(e) => setF({ ...f, horarios: { ...f.horarios, [d]: [[e.target.value, h[1]]] } })} />
                  <input type="time" className="entrada" style={{ padding: '6px 8px', width: 96 }} value={h[1]} onChange={(e) => setF({ ...f, horarios: { ...f.horarios, [d]: [[h[0], e.target.value]] } })} />
                </div> : <span className="mini">Fechado</span>}
              </div>
            );
          })}
        </div>
        <label className="card entre"><span><strong>Atendimento de plantão</strong><div className="mini">Aparece com selo de plantão no perfil</div></span>
          <button type="button" className={`alavanca${f.plantao ? ' on' : ''}`} onClick={() => setF({ ...f, plantao: !f.plantao })} aria-pressed={f.plantao} /></label>
        <div className="campo"><label>Informações sobre deslocamento</label><input className="entrada" value={f.infoDeslocamento} onChange={(e) => setF({ ...f, infoDeslocamento: e.target.value })} placeholder="Ex.: taxa a partir de R$ 30 fora do perímetro urbano" /></div>
      </fieldset>
      <Erro texto={erro} />
      {!somenteLeitura && <div className="rodape-fixo"><button className="btn primario cresce" onClick={salvar}>Salvar</button></div>}
    </div>
  );
}

const TIPOS_DOC = ['CNPJ', 'CPF', 'CNH', 'Alvará de funcionamento', 'Comprovante de endereço', 'Certificado técnico'];

export function Documentos() {
  const { vinculo, avisar } = useSessao();
  const pid = vinculo?.prestador.id;
  const { dados, recarregar } = useDados<{ id: string; tipo: string; estado: string; observacao: string | null; criadoEm: string }[]>(pid ? `/prestadores/${pid}/documentos` : null, [pid]);
  const [tipo, setTipo] = useState(TIPOS_DOC[0]!);
  const entrada = useRef<HTMLInputElement>(null);

  async function enviar(arq?: File) {
    if (!arq) return;
    try {
      const r = await enviarArquivo(arq, arq.name);
      await post(`/prestadores/${pid}/documentos`, { tipo, arquivoUrl: r.url });
      avisar('Documento enviado para análise');
      await recarregar();
    } catch (e) { avisar((e as Error).message, true); }
  }
  void get;

  return (
    <div className="tela sem-abas">
      <Cabecalho titulo="Verificação" />
      <p className="sub" style={{ margin: 0 }}>Envie documentos para receber o selo de verificado. O selo vem só da análise — nunca de plano pago.</p>
      {vinculo?.prestador.verificado && <div className="card linha destaque"><Check color="var(--verde)" /><strong>Seu perfil é verificado</strong></div>}
      <div className="campo"><label>Tipo de documento</label><select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_DOC.map((t) => <option key={t}>{t}</option>)}</select></div>
      <button className="btn primario" onClick={() => entrada.current?.click()}><Upload size={18} /> Enviar foto ou PDF</button>
      <input ref={entrada} type="file" accept="image/*,application/pdf" hidden onChange={(e) => enviar(e.target.files?.[0])} />
      <div className="lista">
        {dados?.map((d) => (
          <div key={d.id} className="card linha">
            <FileText size={20} />
            <div className="cresce"><strong>{d.tipo}</strong><div className="mini">Enviado {tempoRelativo(d.criadoEm)}{d.observacao ? ` · ${d.observacao}` : ''}</div></div>
            <span className={`selo ${d.estado === 'APROVADO' ? 'ok' : d.estado === 'REPROVADO' ? 'erro' : 'alerta'}`}>{d.estado === 'ENVIADO' ? 'Em análise' : d.estado === 'APROVADO' ? 'Aprovado' : 'Reprovado'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
