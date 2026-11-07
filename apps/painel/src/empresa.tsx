/** Painel da empresa (seção 12): visão geral, chamados, equipe e avaliações. */
import { useState } from 'react';
import { ESTADOS_ATIVOS } from '@vrum/shared';
import { api, data, Estado, iniciais, post, Tabela, useDados, useSessao, usePedirTexto } from './base';

interface Membro {
  id: string; funcao: 'DONO' | 'GESTOR' | 'PROFISSIONAL'; atende: boolean; ativo: boolean; disponivel: boolean; disponivelAte: string | null;
  chamadoAtualId: string | null; usuario: { id: string; nome: string; telefone: string };
}
interface ItemChamado {
  id: string; estado: any; criadoEm: string; descricao: string | null; categoria: { nome: string };
  veiculo: { marca: string; modelo: string; ano: number }; responsavelId: string | null; responsavel: string | null;
}
const FUNCAO = { DONO: 'Dono', GESTOR: 'Gestor', PROFISSIONAL: 'Profissional' };
const livre = (m: Membro) => m.ativo && m.atende && !m.chamadoAtualId;
const disponivelAgora = (m: Membro) => m.disponivel && !!m.disponivelAte && new Date(m.disponivelAte) > new Date();

function Designar({ chamado, equipe, aoMudar }: { chamado: ItemChamado; equipe: Membro[]; aoMudar: () => void }) {
  const { avisar } = useSessao();
  if (!['ACEITO_COMBINANDO', 'CONFIRMADO'].includes(chamado.estado)) return <span className="mini">{chamado.responsavel ?? '—'}</span>;
  const opcoes = equipe.filter((m) => m.id === chamado.responsavelId || livre(m));
  return (
    <select className="entrada" value={chamado.responsavelId ?? ''} onChange={async (e) => {
      try { await post(`/chamados/${chamado.id}/responsavel`, { membroId: e.target.value }); avisar('Responsável atualizado'); aoMudar(); }
      catch (x) { avisar((x as Error).message, true); }
    }}>
      {opcoes.map((m) => <option key={m.id} value={m.id}>{m.usuario.nome}{m.id === chamado.responsavelId ? ' (atual)' : ''}</option>)}
    </select>
  );
}

export function EmpresaVisao() {
  const { empresa } = useSessao();
  const pid = empresa?.prestador.id;
  const { dados: chamados, recarregar } = useDados<ItemChamado[]>(pid ? `/prestadores/${pid}/chamados` : null);
  const { dados: equipe, recarregar: recEquipe } = useDados<Membro[]>(pid ? `/prestadores/${pid}/equipe` : null);
  const { dados: perfil } = useDados<{ notaMedia: number | null; totalAvaliacoes: number; seguidores: number }>(pid ? `/perfis/${pid}` : null);
  if (!empresa) return null;
  const ativos = (chamados ?? []).filter((c) => ESTADOS_ATIVOS.includes(c.estado));
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const doMes = (chamados ?? []).filter((c) => new Date(c.criadoEm) >= inicioMes);
  const concluidosMes = doMes.filter((c) => c.estado === 'CONCLUIDO').length;
  const atendem = (equipe ?? []).filter((m) => m.ativo && m.atende);

  return (
    <>
      <div className="topo"><div><h1>{empresa.prestador.nomeComercial}</h1><div className="sub">@{empresa.prestador.usuarioNome} · visão geral</div></div>
        <button className="btn secundario" onClick={() => { void recarregar(); void recEquipe(); }}>Atualizar</button></div>
      <div className="kpis">
        <div className={`kpi${ativos.length ? ' atencao' : ''}`}><span className="mini">Em andamento</span><strong>{ativos.length}</strong></div>
        <div className="kpi"><span className="mini">Concluídos no mês</span><strong>{concluidosMes}</strong></div>
        <div className="kpi"><span className="mini">Taxa de conclusão no mês</span><strong>{doMes.length ? Math.round((concluidosMes / doMes.length) * 100) : 0}%</strong></div>
        <div className="kpi"><span className="mini">Nota média</span><strong>{perfil?.notaMedia?.toFixed(1) ?? '—'}</strong><span className="mini">{perfil?.totalAvaliacoes ?? 0} avaliações</span></div>
        <div className="kpi"><span className="mini">Equipe disponível</span><strong>{atendem.filter((m) => disponivelAgora(m) && !m.chamadoAtualId).length}/{atendem.length}</strong></div>
      </div>
      <h2>Atendimentos em andamento</h2>
      <Tabela linhas={chamados ? ativos : null} vazio="Nenhum atendimento em andamento." colunas={[
        { titulo: 'Abertura', celula: (c) => data(c.criadoEm) },
        { titulo: 'Serviço', celula: (c) => <><strong>{c.categoria.nome}</strong><div className="mini">{c.descricao}</div></> },
        { titulo: 'Veículo', celula: (c) => `${c.veiculo.marca} ${c.veiculo.modelo} ${c.veiculo.ano}` },
        { titulo: 'Estado', celula: (c) => <Estado e={c.estado} /> },
        { titulo: 'Responsável', celula: (c) => <Designar chamado={c} equipe={equipe ?? []} aoMudar={() => { void recarregar(); void recEquipe(); }} /> },
      ]} />
      <h2>Ocupação da equipe</h2>
      <Tabela linhas={equipe ? atendem : null} vazio="Ninguém da equipe realiza atendimentos." colunas={[
        { titulo: 'Profissional', celula: (m) => <div className="linha"><div className="avatar">{iniciais(m.usuario.nome)}</div>{m.usuario.nome}</div> },
        { titulo: 'Situação', celula: (m) => m.chamadoAtualId ? <span className="selo alerta">Em atendimento</span> : disponivelAgora(m) ? <span className="selo vivo"><span className="pt" />Disponível</span> : <span className="selo">Indisponível</span> },
        { titulo: 'Disponível até', celula: (m) => (disponivelAgora(m) ? data(m.disponivelAte) : '—') },
      ]} />
    </>
  );
}

export function EmpresaChamados() {
  const { empresa } = useSessao();
  const [soAtivos, setSoAtivos] = useState(false);
  const pid = empresa?.prestador.id;
  const { dados, recarregar } = useDados<ItemChamado[]>(pid ? `/prestadores/${pid}/chamados${soAtivos ? '?ativos=true' : ''}` : null);
  const { dados: equipe } = useDados<Membro[]>(pid ? `/prestadores/${pid}/equipe` : null);
  return (
    <>
      <div className="topo"><div><h1>Chamados</h1><div className="sub">Histórico centralizado da empresa</div></div>
        <div className="abas"><button className={!soAtivos ? 'ativo' : ''} onClick={() => setSoAtivos(false)}>Todos</button><button className={soAtivos ? 'ativo' : ''} onClick={() => setSoAtivos(true)}>Em andamento</button></div></div>
      <Tabela linhas={dados} vazio="Nenhum chamado ainda." colunas={[
        { titulo: 'Abertura', celula: (c) => data(c.criadoEm) },
        { titulo: 'Serviço', celula: (c) => <><strong>{c.categoria.nome}</strong><div className="mini">{c.descricao}</div></> },
        { titulo: 'Veículo', celula: (c) => `${c.veiculo.marca} ${c.veiculo.modelo}` },
        { titulo: 'Estado', celula: (c) => <Estado e={c.estado} /> },
        { titulo: 'Responsável', celula: (c) => <Designar chamado={c} equipe={equipe ?? []} aoMudar={recarregar} /> },
      ]} />
    </>
  );
}

export function EmpresaEquipe() {
  const { empresa, avisar } = useSessao();
  const pid = empresa?.prestador.id;
  const { dados, recarregar } = useDados<Membro[]>(pid ? `/prestadores/${pid}/equipe` : null);
  const [login, setLogin] = useState('');
  const [funcao, setFuncao] = useState<'PROFISSIONAL' | 'GESTOR'>('PROFISSIONAL');

  async function adicionar() {
    try { await post(`/prestadores/${pid}/equipe`, { login, funcao, atende: funcao === 'PROFISSIONAL' }); setLogin(''); avisar('Adicionado à equipe'); await recarregar(); }
    catch (e) { avisar((e as Error).message, true); }
  }
  async function alterar(m: Membro, d: Partial<Pick<Membro, 'funcao' | 'atende' | 'ativo'>>) {
    try { await api('PATCH', `/prestadores/${pid}/equipe/${m.id}`, d); await recarregar(); } catch (e) { avisar((e as Error).message, true); }
  }

  return (
    <>
      <div className="topo"><div><h1>Equipe</h1><div className="sub">Funcionários, permissões e quem realiza atendimentos</div></div></div>
      <div className="card">
        <div className="form">
          <div className="campo" style={{ gridColumn: 'span 2' }}><label>E-mail ou telefone da conta VRUM do funcionário</label><input className="entrada" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="joao@email.com" /></div>
          <div className="campo"><label>Função</label><select className="entrada" value={funcao} onChange={(e) => setFuncao(e.target.value as 'PROFISSIONAL')}><option value="PROFISSIONAL">Profissional (atende)</option><option value="GESTOR">Gestor</option></select></div>
          <button className="btn primario" disabled={login.length < 3} onClick={adicionar}>Adicionar</button>
        </div>
        <p className="mini" style={{ marginBottom: 0 }}>O funcionário precisa ter criado uma conta no app VRUM. Profissionais veem só os próprios atendimentos; gestores veem tudo e podem redistribuir chamados.</p>
      </div>
      <Tabela linhas={dados} colunas={[
        { titulo: 'Pessoa', celula: (m) => <div className="linha"><div className="avatar">{iniciais(m.usuario.nome)}</div><div>{m.usuario.nome}<div className="mini">{m.usuario.telefone}</div></div></div> },
        { titulo: 'Função', celula: (m) => m.funcao === 'DONO' ? 'Dono' : (
          <select className="entrada" value={m.funcao} onChange={(e) => alterar(m, { funcao: e.target.value as 'GESTOR' })}><option value="PROFISSIONAL">Profissional</option><option value="GESTOR">Gestor</option></select>) },
        { titulo: 'Realiza atendimentos', celula: (m) => <input type="checkbox" checked={m.atende} disabled={m.funcao === 'DONO' || !m.ativo} onChange={(e) => alterar(m, { atende: e.target.checked })} style={{ accentColor: '#c6ff00', width: 18, height: 18 }} /> },
        { titulo: 'Situação', celula: (m) => !m.ativo ? <span className="selo erro">Desativado</span> : m.chamadoAtualId ? <span className="selo alerta">Em atendimento</span> : disponivelAgora(m) ? <span className="selo vivo">Disponível</span> : <span className="selo">Indisponível</span> },
        { titulo: '', celula: (m) => m.funcao !== 'DONO' && <button className={`btn peq ${m.ativo ? 'perigo' : 'secundario'}`} onClick={() => alterar(m, { ativo: !m.ativo })}>{m.ativo ? 'Desativar' : 'Reativar'}</button> },
      ]} />
      <p className="mini">{FUNCAO.DONO}: controle total · {FUNCAO.GESTOR}: equipe, chamados e perfil · {FUNCAO.PROFISSIONAL}: recebe e realiza atendimentos.</p>
    </>
  );
}

export function EmpresaAvaliacoes() {
  const { empresa, avisar } = useSessao();
  const pid = empresa?.prestador.id;
  const { dados, recarregar } = useDados<{ notaMedia: number | null; totalAvaliacoes: number; avaliacoes: { id: string; nota: number; comentario: string | null; resposta: string | null; criadaEm: string; autor: string }[] }>(pid ? `/perfis/${pid}` : null);
  const { pedir, elemento } = usePedirTexto();
  return (
    <>
      <div className="topo"><div><h1>Avaliações</h1><div className="sub">Só atendimentos concluídos geram avaliação. Plano pago não altera notas.</div></div>
        <div className="kpi" style={{ minWidth: 160 }}><span className="mini">Nota média</span><strong>{dados?.notaMedia?.toFixed(1) ?? '—'}</strong><span className="mini">{dados?.totalAvaliacoes ?? 0} avaliações</span></div></div>
      <Tabela linhas={dados?.avaliacoes ?? null} vazio="Nenhuma avaliação ainda." colunas={[
        { titulo: 'Data', celula: (a) => data(a.criadaEm) },
        { titulo: 'Cliente', celula: (a) => a.autor },
        { titulo: 'Nota', celula: (a) => <span style={{ color: 'var(--alerta)', whiteSpace: 'nowrap' }}>{'★'.repeat(a.nota)}<span style={{ color: 'var(--borda)' }}>{'★'.repeat(5 - a.nota)}</span></span> },
        { titulo: 'Comentário', celula: (a) => <>{a.comentario ?? <span className="mini">Sem comentário</span>}{a.resposta && <div className="mini" style={{ marginTop: 6 }}>↳ {a.resposta}</div>}</> },
        { titulo: '', celula: (a) => <button className="btn secundario peq" onClick={() => pedir('Responder avaliação', 'Sua resposta (pública)', async (t) => { await post(`/avaliacoes/${a.id}/resposta`, { resposta: t }); avisar('Resposta publicada'); await recarregar(); }, 2)}>{a.resposta ? 'Editar resposta' : 'Responder'}</button> },
      ]} />
      {elemento}
    </>
  );
}
