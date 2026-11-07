import { StrictMode, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import {
  BarChart3, Building2, ClipboardList, FileCheck2, Gavel, History, LayoutDashboard, LogOut, Settings2, Star, Store, Tags, Users,
} from 'lucide-react';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './estilos.css';
import { ProvedorSessao, useSessao } from './base';
import { EmpresaAvaliacoes, EmpresaChamados, EmpresaEquipe, EmpresaVisao } from './empresa';
import {
  AdminAuditoria, AdminCatalogo, AdminChamados, AdminDocumentos, AdminModeracao, AdminPrestadores, AdminRegras, AdminResumo, AdminUsuarios,
} from './admin';

function Entrar() {
  const { entrar } = useSessao();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try { await entrar(login, senha); } catch (x) { setErro((x as Error).message); }
  }
  return (
    <div className="entrada-login">
      <form onSubmit={enviar}>
        <img src="/logo.png" alt="vrum" />
        <h1>Painel</h1>
        <p className="sub" style={{ margin: 0 }}>Para empresas parceiras e administração do VRUM.</p>
        <div className="campo"><label>E-mail ou telefone</label><input className="entrada" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" /></div>
        <div className="campo"><label>Senha</label><input className="entrada" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" /></div>
        {erro && <div className="erro-msg">{erro}</div>}
        <button className="btn primario" style={{ justifyContent: 'center', padding: 12 }}>Entrar</button>
      </form>
    </div>
  );
}

function Painel() {
  const { eu, empresa, carregando, sair, escolherEmpresa } = useSessao();
  if (carregando) return null;
  if (!eu) return <Entrar />;
  const empresas = eu.vinculos.filter((v) => v.funcao !== 'PROFISSIONAL');
  if (!eu.ehAdmin && !empresas.length) {
    return (
      <div className="entrada-login"><div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <img src="/logo.png" alt="vrum" style={{ width: 120 }} />
        <h1>Sem acesso ao painel</h1>
        <p className="sub">O painel é para donos e gestores de empresas parceiras e para a administração. Use o app VRUM para pedir atendimento ou atender chamados.</p>
        <button className="btn secundario" onClick={sair}>Sair</button>
      </div></div>
    );
  }
  const link = (para: string, Icone: typeof Users, nome: string, fim?: boolean) => <NavLink to={para} end={fim}><Icone size={18} />{nome}</NavLink>;
  const inicio = empresas.length ? '/empresa' : '/admin';
  return (
    <div className="casca">
      <aside className="lateral">
        <img src="/logo.png" alt="vrum" />
        {empresa && <>
          <div className="grupo">Empresa</div>
          {link('/empresa', LayoutDashboard, 'Visão geral', true)}
          {link('/empresa/chamados', ClipboardList, 'Chamados')}
          {link('/empresa/equipe', Users, 'Equipe')}
          {link('/empresa/avaliacoes', Star, 'Avaliações')}
        </>}
        {eu.ehAdmin && <>
          <div className="grupo">Administração</div>
          {link('/admin', BarChart3, 'Visão geral', true)}
          {link('/admin/chamados', ClipboardList, 'Chamados')}
          {link('/admin/usuarios', Users, 'Usuários')}
          {link('/admin/prestadores', Store, 'Prestadores')}
          {link('/admin/documentos', FileCheck2, 'Documentos')}
          {link('/admin/moderacao', Gavel, 'Moderação')}
          {link('/admin/catalogo', Tags, 'Catálogo')}
          {link('/admin/regras', Settings2, 'Prazos e regras')}
          {link('/admin/auditoria', History, 'Auditoria')}
        </>}
        <div className="rodape">
          {empresas.length > 1 && (
            <select value={empresa?.prestador.id} onChange={(e) => escolherEmpresa(e.target.value)} aria-label="Empresa">
              {empresas.map((v) => <option key={v.prestador.id} value={v.prestador.id}>{v.prestador.nomeComercial}</option>)}
            </select>
          )}
          <div className="linha mini" style={{ padding: '0 10px' }}><Building2 size={14} />{eu.nome}</div>
          <a href="#" onClick={(e) => { e.preventDefault(); sair(); }}><LogOut size={18} />Sair</a>
        </div>
      </aside>
      <main className="conteudo">
        <Routes>
          {empresa && <>
            <Route path="/empresa" element={<EmpresaVisao />} />
            <Route path="/empresa/chamados" element={<EmpresaChamados />} />
            <Route path="/empresa/equipe" element={<EmpresaEquipe />} />
            <Route path="/empresa/avaliacoes" element={<EmpresaAvaliacoes />} />
          </>}
          {eu.ehAdmin && <>
            <Route path="/admin" element={<AdminResumo />} />
            <Route path="/admin/chamados" element={<AdminChamados />} />
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/admin/prestadores" element={<AdminPrestadores />} />
            <Route path="/admin/documentos" element={<AdminDocumentos />} />
            <Route path="/admin/moderacao" element={<AdminModeracao />} />
            <Route path="/admin/catalogo" element={<AdminCatalogo />} />
            <Route path="/admin/regras" element={<AdminRegras />} />
            <Route path="/admin/auditoria" element={<AdminAuditoria />} />
          </>}
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorSessao><Painel /></ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
);
