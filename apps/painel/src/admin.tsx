/** Painel administrativo (seção 16). Toda ação fica registrada na auditoria. */
import { useState } from 'react';
import { ESTADOS_CHAMADO, ROTULO_ESTADO, type EstadoChamado } from '@vrum/shared';
import { api, data, Estado, get, Modal, post, Tabela, useDados, useSessao, usePedirTexto } from './base';

export function AdminResumo() {
  const { dados } = useDados<any>('/admin/resumo');
  const total = dados?.porEstado.reduce((s: number, x: any) => s + x.n, 0) || 1;
  return (
    <>
      <div className="topo"><div><h1>Visão geral</h1><div className="sub">Operação da plataforma</div></div></div>
      <div className="kpis">
        <div className="kpi"><span className="mini">Usuários</span><strong>{dados?.usuarios ?? '…'}</strong></div>
        <div className="kpi"><span className="mini">Prestadores</span><strong>{dados?.prestadores ?? '…'}</strong></div>
        <div className={`kpi${dados?.chamadosAtivos ? ' atencao' : ''}`}><span className="mini">Chamados ativos</span><strong>{dados?.chamadosAtivos ?? '…'}</strong></div>
        <div className="kpi"><span className="mini">Chamados hoje</span><strong>{dados?.chamadosHoje ?? '…'}</strong></div>
        <div className={`kpi${dados?.documentosPendentes ? ' atencao' : ''}`}><span className="mini">Documentos a analisar</span><strong>{dados?.documentosPendentes ?? '…'}</strong></div>
        <div className={`kpi${dados?.denunciasAbertas ? ' atencao' : ''}`}><span className="mini">Denúncias abertas</span><strong>{dados?.denunciasAbertas ?? '…'}</strong></div>
        <div className={`kpi${dados?.contestacoesAbertas ? ' atencao' : ''}`}><span className="mini">Contestações abertas</span><strong>{dados?.contestacoesAbertas ?? '…'}</strong></div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Chamados por estado</h2>
        {dados?.porEstado.sort((a: any, b: any) => b.n - a.n).map((x: any) => (
          <div key={x.estado} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 50px', gap: 12, alignItems: 'center' }}>
            <Estado e={x.estado} /><div className="barra"><div style={{ width: `${(x.n / total) * 100}%` }} /></div><strong style={{ textAlign: 'right' }}>{x.n}</strong>
          </div>
        ))}
        {dados && !dados.porEstado.length && <span className="mini">Nenhum chamado ainda.</span>}
      </div>
    </>
  );
}

export function AdminChamados() {
  const { avisar } = useSessao();
  const [estado, setEstado] = useState<EstadoChamado | ''>('');
  const { dados, recarregar } = useDados<any[]>(`/admin/chamados${estado ? `?estado=${estado}` : ''}`);
  const { pedir, elemento } = usePedirTexto();
  const [local, setLocal] = useState<any>(null);
  return (
    <>
      <div className="topo"><div><h1>Chamados</h1><div className="sub">Acompanhamento e suporte</div></div>
        <select className="entrada" value={estado} onChange={(e) => setEstado(e.target.value as EstadoChamado)}>
          <option value="">Todos os estados</option>{ESTADOS_CHAMADO.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
        </select></div>
      <Tabela linhas={dados} colunas={[
        { titulo: 'Abertura', celula: (c) => data(c.criadoEm) },
        { titulo: 'Serviço', celula: (c) => <><strong>{c.categoria}</strong><div className="mini">{c.descricao}</div></> },
        { titulo: 'Motorista', celula: (c) => c.motorista },
        { titulo: 'Prestador', celula: (c) => c.prestador ?? '—' },
        { titulo: 'Estado', celula: (c) => <Estado e={c.estado} /> },
        { titulo: '', celula: (c) => (
          <div className="linha">
            <button className="btn secundario peq" onClick={() => pedir('Acessar localização', 'Justificativa (fica registrada na auditoria)', async (t) => setLocal(await post(`/admin/chamados/${c.id}/localizacao`, { justificativa: t })), 10)}>Localização</button>
            {!['CONCLUIDO', 'CANCELADO', 'SEM_ATENDIMENTO'].includes(c.estado) && (
              <button className="btn perigo peq" onClick={() => pedir('Encerrar chamado', 'Motivo do encerramento pelo suporte', async (t) => { await post(`/admin/chamados/${c.id}/cancelar`, { motivo: t }); avisar('Chamado encerrado'); await recarregar(); })}>Encerrar</button>
            )}
          </div>) },
      ]} />
      {elemento}
      <Modal aberto={!!local} titulo="Localização do atendimento" aoFechar={() => setLocal(null)}>
        {local && <>
          <div className="mini">Ponto de atendimento: {local.pontoAtendimento.lat.toFixed(5)}, {local.pontoAtendimento.lng.toFixed(5)}{local.pontoAtendimento.referencia ? ` — ${local.pontoAtendimento.referencia}` : ''}</div>
          {!local.ativo && <div className="info-msg">O rastreamento não está ativo neste chamado.</div>}
          {local.participantes.map((p: any) => (
            <div key={p.usuarioId} className="card" style={{ background: 'var(--card-2)' }}>
              <strong>{p.papel === 'MOTORISTA' ? 'Motorista' : 'Profissional'}</strong> <span className="selo">{p.frescor}</span>
              <div className="mini">{p.posicao ? `${p.posicao.lat.toFixed(5)}, ${p.posicao.lng.toFixed(5)} · ${data(p.posicao.capturadaEm)}` : 'Sem posição'}</div>
              {p.posicao && <a className="mini" style={{ color: 'var(--verde)' }} href={`https://www.google.com/maps?q=${p.posicao.lat},${p.posicao.lng}`} target="_blank" rel="noreferrer">Abrir no mapa</a>}
            </div>
          ))}
          <button className="btn secundario" onClick={() => setLocal(null)}>Fechar</button>
        </>}
      </Modal>
    </>
  );
}

export function AdminUsuarios() {
  const { avisar } = useSessao();
  const [busca, setBusca] = useState('');
  const { dados, recarregar } = useDados<any[]>(`/admin/usuarios${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`);
  const { pedir, elemento } = usePedirTexto();
  return (
    <>
      <div className="topo"><div><h1>Usuários</h1><div className="sub">Motoristas e profissionais</div></div>
        <input className="entrada" placeholder="Buscar por nome, e-mail ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 280 }} /></div>
      <Tabela linhas={dados} colunas={[
        { titulo: 'Nome', celula: (u) => <>{u.nome} {u.ehAdmin && <span className="selo info">Admin</span>}</> },
        { titulo: 'Contato', celula: (u) => <><div>{u.email}</div><div className="mini">{u.telefone}</div></> },
        { titulo: 'Cadastro', celula: (u) => data(u.criadoEm) },
        { titulo: 'Situação', celula: (u) => (u.suspensoEm ? <span className="selo erro">Suspenso</span> : <span className="selo ok">Ativo</span>) },
        { titulo: '', celula: (u) => u.suspensoEm
          ? <button className="btn secundario peq" onClick={async () => { await post(`/admin/usuarios/${u.id}/suspensao`, { suspender: false }); await recarregar(); }}>Reativar</button>
          : <button className="btn perigo peq" onClick={() => pedir('Suspender conta', 'Motivo', async (t) => { await post(`/admin/usuarios/${u.id}/suspensao`, { suspender: true, motivo: t }); avisar('Conta suspensa'); await recarregar(); })}>Suspender</button> },
      ]} />
      {elemento}
    </>
  );
}

export function AdminPrestadores() {
  const [busca, setBusca] = useState('');
  const { dados, recarregar } = useDados<any[]>(`/admin/prestadores${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`);
  return (
    <>
      <div className="topo"><div><h1>Prestadores</h1><div className="sub">O selo de verificado vem só da análise de documentos</div></div>
        <input className="entrada" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      <Tabela linhas={dados} colunas={[
        { titulo: 'Nome', celula: (p) => <><strong>{p.nomeComercial}</strong><div className="mini">@{p.usuarioNome} · {p.tipo === 'EMPRESA' ? 'Empresa' : 'Autônomo'}</div></> },
        { titulo: 'Cidade', celula: (p) => p.cidade },
        { titulo: 'Nota', celula: (p) => (p.totalAvaliacoes ? `${p.notaMedia?.toFixed(1)} (${p.totalAvaliacoes})` : '—') },
        { titulo: 'Documentos', celula: (p) => (p.documentosPendentes ? <span className="selo alerta">{p.documentosPendentes} a analisar</span> : '—') },
        { titulo: 'Verificação', celula: (p) => (
          <button className={`btn peq ${p.verificadoEm ? 'secundario' : 'primario'}`} onClick={async () => { await post(`/admin/prestadores/${p.id}/verificacao`, { verificado: !p.verificadoEm }); await recarregar(); }}>
            {p.verificadoEm ? 'Remover selo' : 'Conceder selo'}
          </button>) },
      ]} />
    </>
  );
}

export function AdminDocumentos() {
  const { avisar } = useSessao();
  const { dados, recarregar } = useDados<any[]>('/admin/documentos');
  const { pedir, elemento } = usePedirTexto();
  return (
    <>
      <div className="topo"><div><h1>Documentos</h1><div className="sub">Enviados pelos prestadores para verificação</div></div></div>
      <Tabela linhas={dados} vazio="Nenhum documento aguardando análise." colunas={[
        { titulo: 'Enviado', celula: (d) => data(d.doc.criadoEm) },
        { titulo: 'Prestador', celula: (d) => d.prestador },
        { titulo: 'Tipo', celula: (d) => d.doc.tipo },
        { titulo: 'Arquivo', celula: (d) => <a href={d.doc.arquivoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--verde)', fontWeight: 700 }}>Abrir</a> },
        { titulo: '', celula: (d) => (
          <div className="linha">
            <button className="btn primario peq" onClick={async () => { await post(`/admin/documentos/${d.doc.id}/analise`, { aprovar: true }); avisar('Aprovado'); await recarregar(); }}>Aprovar</button>
            <button className="btn perigo peq" onClick={() => pedir('Reprovar documento', 'Motivo (o prestador verá)', async (t) => { await post(`/admin/documentos/${d.doc.id}/analise`, { aprovar: false, observacao: t }); await recarregar(); }, 3)}>Reprovar</button>
          </div>) },
      ]} />
      {elemento}
    </>
  );
}

export function AdminModeracao() {
  const { avisar } = useSessao();
  const [aba, setAba] = useState<'denuncias' | 'contestacoes' | 'avaliacoes'>('denuncias');
  const den = useDados<any[]>(aba === 'denuncias' ? '/admin/denuncias' : null);
  const con = useDados<any[]>(aba === 'contestacoes' ? '/admin/contestacoes' : null);
  const ava = useDados<any[]>(aba === 'avaliacoes' ? '/admin/avaliacoes' : null);
  const { pedir, elemento } = usePedirTexto();
  return (
    <>
      <div className="topo"><div><h1>Moderação e suporte</h1><div className="sub">Denúncias, contestações e avaliações</div></div>
        <div className="abas">{(['denuncias', 'contestacoes', 'avaliacoes'] as const).map((a) => <button key={a} className={aba === a ? 'ativo' : ''} onClick={() => setAba(a)}>{a === 'denuncias' ? 'Denúncias' : a === 'contestacoes' ? 'Contestações' : 'Avaliações'}</button>)}</div></div>
      {aba === 'denuncias' && <Tabela linhas={den.dados} vazio="Nenhuma denúncia aberta." colunas={[
        { titulo: 'Data', celula: (d) => data(d.denuncia.criadaEm) },
        { titulo: 'Autor', celula: (d) => d.autor },
        { titulo: 'Alvo', celula: (d) => <span className="selo">{d.denuncia.alvo}</span> },
        { titulo: 'Motivo', celula: (d) => <>{d.denuncia.motivo}{d.denuncia.detalhes && <div className="mini">{d.denuncia.detalhes}</div>}</> },
        { titulo: '', celula: (d) => (
          <div className="linha">
            <button className="btn perigo peq" onClick={async () => { await post(`/admin/denuncias/${d.denuncia.id}/resolver`, { procedente: true }); avisar('Procedente — conteúdo removido'); await den.recarregar(); }}>Procedente</button>
            <button className="btn secundario peq" onClick={async () => { await post(`/admin/denuncias/${d.denuncia.id}/resolver`, { procedente: false }); await den.recarregar(); }}>Improcedente</button>
          </div>) },
      ]} />}
      {aba === 'contestacoes' && <Tabela linhas={con.dados} vazio="Nenhuma contestação." colunas={[
        { titulo: 'Data', celula: (c) => data(c.contestacao.criadaEm) },
        { titulo: 'Motorista', celula: (c) => c.autor },
        { titulo: 'Motivo', celula: (c) => c.contestacao.motivo },
        { titulo: 'Chamado', celula: (c) => <Estado e={c.estadoChamado} /> },
        { titulo: 'Situação', celula: (c) => (['ABERTA', 'EM_ANALISE'].includes(c.contestacao.estado) ? (
          <div className="linha">
            <button className="btn primario peq" onClick={() => pedir('Contestação procedente', 'Resolução', async (t) => { await post(`/admin/contestacoes/${c.contestacao.id}/resolver`, { procedente: true, resolucao: t }); await con.recarregar(); }, 3)}>Procedente</button>
            <button className="btn secundario peq" onClick={() => pedir('Contestação improcedente', 'Resolução', async (t) => { await post(`/admin/contestacoes/${c.contestacao.id}/resolver`, { procedente: false, resolucao: t }); await con.recarregar(); }, 3)}>Improcedente</button>
          </div>) : <><span className="selo">{c.contestacao.estado}</span><div className="mini">{c.contestacao.resolucao}</div></>) },
      ]} />}
      {aba === 'avaliacoes' && <Tabela linhas={ava.dados} vazio="Nenhuma avaliação." colunas={[
        { titulo: 'Data', celula: (a) => data(a.avaliacao.criadaEm) },
        { titulo: 'Autor', celula: (a) => a.autor },
        { titulo: 'Prestador', celula: (a) => a.prestador ?? <span className="mini">(avaliação do motorista)</span> },
        { titulo: 'Nota', celula: (a) => '★'.repeat(a.avaliacao.nota) },
        { titulo: 'Comentário', celula: (a) => a.avaliacao.comentario ?? '—' },
        { titulo: '', celula: (a) => <button className="btn perigo peq" onClick={async () => { await post(`/admin/avaliacoes/${a.avaliacao.id}/ocultar`, { ocultar: true }); avisar('Avaliação ocultada'); await ava.recarregar(); }}>Ocultar</button> },
      ]} />}
      {elemento}
    </>
  );
}

export function AdminCatalogo() {
  const { avisar } = useSessao();
  const cats = useDados<any[]>('/admin/categorias');
  const cidades = useDados<any[]>('/admin/cidades');
  const planos = useDados<any[]>('/admin/planos');
  const [cat, setCat] = useState<any>(null);
  const [cidade, setCidade] = useState<any>(null);
  const [plano, setPlano] = useState<any>(null);

  async function salvar(rota: string, corpo: any, fechar: () => void, rec: () => Promise<void>) {
    try { await post(rota, corpo); fechar(); avisar('Salvo'); await rec(); } catch (e) { avisar((e as Error).message, true); }
  }

  return (
    <>
      <div className="topo"><div><h1>Catálogo</h1><div className="sub">Categorias de serviço, cidades atendidas e planos</div></div></div>
      <div className="topo"><h2>Categorias</h2><button className="btn primario peq" onClick={() => setCat({ slug: '', nome: '', fluxo: 'IMEDIATO', exemplos: [], ativa: true, ordem: (cats.dados?.length ?? 0) })}>Nova categoria</button></div>
      <Tabela linhas={cats.dados} colunas={[
        { titulo: 'Ordem', celula: (c) => c.ordem, largura: 70 },
        { titulo: 'Nome', celula: (c) => <><strong>{c.nome}</strong><div className="mini">{c.exemplos.join(', ')}</div></> },
        { titulo: 'Fluxo', celula: (c) => ({ IMEDIATO: 'Imediato', AGENDADO: 'Agendado', TRIAGEM: 'Triagem' } as Record<string, string>)[c.fluxo] },
        { titulo: 'Situação', celula: (c) => (c.ativa ? <span className="selo ok">Ativa</span> : <span className="selo">Inativa</span>) },
        { titulo: '', celula: (c) => <button className="btn secundario peq" onClick={() => setCat({ ...c })}>Editar</button> },
      ]} />
      <div className="duas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="topo"><h2>Cidades</h2><button className="btn primario peq" onClick={() => setCidade({ nome: '', uf: 'MT', lat: -12.5, lng: -55.7, ativa: false })}>Nova cidade</button></div>
          <Tabela linhas={cidades.dados} colunas={[
            { titulo: 'Cidade', celula: (c) => `${c.nome} – ${c.uf}` },
            { titulo: 'Situação', celula: (c) => (c.ativa ? <span className="selo ok">Atendida</span> : <span className="selo">Em breve</span>) },
            { titulo: '', celula: (c) => <button className="btn secundario peq" onClick={() => setCidade({ ...c })}>Editar</button> },
          ]} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="topo"><h2>Planos</h2><button className="btn primario peq" onClick={() => setPlano({ nome: '', precoCentavos: 0, beneficios: [], ativo: true })}>Novo plano</button></div>
          <Tabela linhas={planos.dados} vazio="Nenhum plano criado. Valores serão definidos antes do lançamento." colunas={[
            { titulo: 'Plano', celula: (p) => <><strong>{p.nome}</strong><div className="mini">{(p.beneficios as string[]).join(' · ')}</div></> },
            { titulo: 'Preço/mês', celula: (p) => (p.precoCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
            { titulo: '', celula: (p) => <button className="btn secundario peq" onClick={() => setPlano({ ...p })}>Editar</button> },
          ]} />
        </div>
      </div>

      <Modal aberto={!!cat} titulo={cat?.id ? 'Editar categoria' : 'Nova categoria'} aoFechar={() => setCat(null)}>
        {cat && <>
          <div className="campo"><label>Nome</label><input className="entrada" value={cat.nome} onChange={(e) => setCat({ ...cat, nome: e.target.value, slug: cat.id ? cat.slug : e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></div>
          <div className="campo"><label>Fluxo</label><select className="entrada" value={cat.fluxo} onChange={(e) => setCat({ ...cat, fluxo: e.target.value })}><option value="IMEDIATO">Imediato</option><option value="AGENDADO">Agendado</option><option value="TRIAGEM">Triagem (não sei o problema)</option></select></div>
          <div className="campo"><label>Exemplos (separados por vírgula)</label><input className="entrada" value={cat.exemplos.join(', ')} onChange={(e) => setCat({ ...cat, exemplos: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} /></div>
          <div className="form">
            <div className="campo"><label>Ordem</label><input className="entrada" type="number" value={cat.ordem} onChange={(e) => setCat({ ...cat, ordem: Number(e.target.value) })} /></div>
            <label className="linha"><input type="checkbox" checked={cat.ativa} onChange={(e) => setCat({ ...cat, ativa: e.target.checked })} /> Ativa</label>
            <label className="linha"><input type="checkbox" checked={!!cat.exigeDadosGuincho} onChange={(e) => setCat({ ...cat, exigeDadosGuincho: e.target.checked })} /> Pede dados de guincho</label>
          </div>
          <button className="btn primario" disabled={!cat.nome || !cat.slug} onClick={() => salvar('/admin/categorias', { id: cat.id, slug: cat.slug, nome: cat.nome, fluxo: cat.fluxo, exemplos: cat.exemplos, ordem: cat.ordem, ativa: cat.ativa, exigeDadosGuincho: !!cat.exigeDadosGuincho }, () => setCat(null), cats.recarregar)}>Salvar</button>
        </>}
      </Modal>
      <Modal aberto={!!cidade} titulo={cidade?.id ? 'Editar cidade' : 'Nova cidade'} aoFechar={() => setCidade(null)}>
        {cidade && <>
          <div className="form">
            <div className="campo" style={{ gridColumn: 'span 2' }}><label>Nome</label><input className="entrada" value={cidade.nome} onChange={(e) => setCidade({ ...cidade, nome: e.target.value })} /></div>
            <div className="campo"><label>UF</label><input className="entrada" maxLength={2} value={cidade.uf} onChange={(e) => setCidade({ ...cidade, uf: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="form">
            <div className="campo"><label>Latitude do centro</label><input className="entrada" type="number" step="any" value={cidade.lat} onChange={(e) => setCidade({ ...cidade, lat: Number(e.target.value) })} /></div>
            <div className="campo"><label>Longitude do centro</label><input className="entrada" type="number" step="any" value={cidade.lng} onChange={(e) => setCidade({ ...cidade, lng: Number(e.target.value) })} /></div>
          </div>
          <label className="linha"><input type="checkbox" checked={cidade.ativa} onChange={(e) => setCidade({ ...cidade, ativa: e.target.checked })} /> Cidade atendida (aparece no cadastro)</label>
          <button className="btn primario" disabled={!cidade.nome || cidade.uf.length !== 2} onClick={() => salvar('/admin/cidades', { id: cidade.id, nome: cidade.nome, uf: cidade.uf, lat: cidade.lat, lng: cidade.lng, ativa: cidade.ativa }, () => setCidade(null), cidades.recarregar)}>Salvar</button>
        </>}
      </Modal>
      <Modal aberto={!!plano} titulo={plano?.id ? 'Editar plano' : 'Novo plano'} aoFechar={() => setPlano(null)}>
        {plano && <>
          <div className="campo"><label>Nome</label><input className="entrada" value={plano.nome} onChange={(e) => setPlano({ ...plano, nome: e.target.value })} /></div>
          <div className="campo"><label>Preço mensal (R$)</label><input className="entrada" type="number" step="0.01" value={plano.precoCentavos / 100} onChange={(e) => setPlano({ ...plano, precoCentavos: Math.round(Number(e.target.value) * 100) })} /></div>
          <div className="campo"><label>Benefícios (um por linha)</label><textarea className="entrada" rows={4} value={plano.beneficios.join('\n')} onChange={(e) => setPlano({ ...plano, beneficios: e.target.value.split('\n') })} /></div>
          <div className="info-msg">Planos não geram avaliação positiva nem selo de verificação.</div>
          <button className="btn primario" disabled={!plano.nome} onClick={() => salvar('/admin/planos', { id: plano.id, nome: plano.nome, precoCentavos: plano.precoCentavos, beneficios: plano.beneficios.map((b: string) => b.trim()).filter(Boolean), ativo: plano.ativo }, () => setPlano(null), planos.recarregar)}>Salvar</button>
        </>}
      </Modal>
    </>
  );
}

const ROTULOS_REGRAS: Record<string, [string, string]> = {
  prazoConviteSeg: ['Prazo de resposta do convite', 'segundos'],
  prestadoresPorEtapa: ['Prestadores convidados por etapa', 'prestadores'],
  autoConcluirMin: ['Conclusão automática sem resposta do motorista', 'minutos'],
  abandonoHoras: ['Encerrar chamado abandonado após', 'horas'],
  validadeDisponibilidadeHoras: ['Validade do “disponível”', 'horas'],
  posicaoMaxIdadeSeg: ['Idade máxima de uma posição enviada', 'segundos'],
};

export function AdminRegras() {
  const { avisar } = useSessao();
  const { dados, recarregar } = useDados<Record<string, any>>('/admin/regras');
  const [edicao, setEdicao] = useState<Record<string, any> | null>(null);
  const r = edicao ?? dados;
  async function salvar() {
    try {
      await api('PUT', '/admin/regras', { ...edicao, raiosBuscaKm: String(edicao!.raiosBuscaKm).split(',').map(Number).filter((n) => n > 0) });
      setEdicao(null); avisar('Regras atualizadas — valem imediatamente'); await recarregar();
    } catch (e) { avisar((e as Error).message, true); }
  }
  return (
    <>
      <div className="topo"><div><h1>Prazos e regras</h1><div className="sub">Valem imediatamente para novos chamados</div></div>
        {edicao ? <div className="linha"><button className="btn secundario" onClick={() => setEdicao(null)}>Descartar</button><button className="btn primario" onClick={salvar}>Salvar</button></div>
          : <button className="btn primario" disabled={!dados} onClick={() => setEdicao({ ...dados, raiosBuscaKm: dados!.raiosBuscaKm.join(', ') })}>Editar</button>}</div>
      {r && (
        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {Object.entries(ROTULOS_REGRAS).map(([k, [rotulo, unidade]]) => (
            <div key={k} className="campo"><label>{rotulo}</label>
              <div className="linha"><input className="entrada" type="number" disabled={!edicao} value={r[k]} onChange={(e) => setEdicao({ ...edicao, [k]: Number(e.target.value) })} style={{ width: 120 }} /><span className="mini">{unidade}</span></div></div>
          ))}
          <div className="campo"><label>Raios das etapas de busca</label>
            <div className="linha"><input className="entrada" disabled={!edicao} value={edicao ? edicao.raiosBuscaKm : r.raiosBuscaKm.join(', ')} onChange={(e) => setEdicao({ ...edicao, raiosBuscaKm: e.target.value })} /><span className="mini">km</span></div></div>
        </div>
      )}
    </>
  );
}

export function AdminAuditoria() {
  const { dados } = useDados<any[]>('/admin/auditoria');
  return (
    <>
      <div className="topo"><div><h1>Auditoria</h1><div className="sub">Registro de todas as ações administrativas</div></div></div>
      <Tabela linhas={dados} vazio="Nenhuma ação registrada." colunas={[
        { titulo: 'Quando', celula: (r) => data(r.registro.criadoEm) },
        { titulo: 'Administrador', celula: (r) => r.admin },
        { titulo: 'Ação', celula: (r) => <span className="selo">{r.registro.acao}</span> },
        { titulo: 'Alvo', celula: (r) => <span className="mini">{r.registro.alvo} · {r.registro.alvoId.slice(0, 8)}</span> },
        { titulo: 'Detalhes', celula: (r) => <span className="mini">{r.registro.dados ? JSON.stringify(r.registro.dados) : ''}</span> },
      ]} />
    </>
  );
}

export { get };
