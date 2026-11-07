import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSessao } from './sessao';
import { Abas, Carregando } from './componentes';
import { Entrar, Cadastro } from './telas/Entrada';
import { Inicio } from './telas/motorista/Inicio';
import { MapaPrestadores } from './telas/motorista/MapaPrestadores';
import { Solicitar } from './telas/motorista/Solicitar';
import { Historico } from './telas/motorista/Historico';
import { TelaChamado } from './telas/Chamado';
import { Mensagens, Conversa } from './telas/Mensagens';
import { Perfil, Notificacoes, Salvos } from './telas/Perfil';
import { Garagem, NovoVeiculo } from './telas/motorista/Garagem';
import { PerfilPrestador } from './telas/PerfilPrestador';
import { Painel } from './telas/prestador/Painel';
import { ChamadosPrestador } from './telas/prestador/ChamadosPrestador';
import { Vitrine, Publicar } from './telas/prestador/Vitrine';
import { EditarPerfil, TornarProfissional, Documentos } from './telas/prestador/Configuracoes';

/** Telas que ocupam a tela toda (sem as abas). */
const SEM_ABAS = [/^\/chamados\/[^/]+/, /^\/conversas\//, /^\/solicitar/, /^\/garagem\/novo/, /^\/perfis\//, /^\/p\/publicar/, /^\/p\/perfil/, /^\/p\/documentos/, /^\/tornar-profissional/];

export function App() {
  const { carregando, eu, area } = useSessao();
  const local = useLocation();

  if (carregando) return <div className="app"><div className="tela" style={{ justifyContent: 'center' }}><Carregando /></div></div>;

  if (!eu) {
    return (
      <div className="app">
        <Routes>
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/perfis/:ref" element={<PerfilPrestador />} />
          <Route path="*" element={<Entrar />} />
        </Routes>
      </div>
    );
  }

  const mostrarAbas = !SEM_ABAS.some((r) => r.test(local.pathname));
  return (
    <div className="app">
      <Routes>
        {/* Motorista */}
        <Route path="/" element={area === 'prestador' ? <Navigate to="/p" replace /> : <Inicio />} />
        <Route path="/mapa" element={<MapaPrestadores />} />
        <Route path="/solicitar" element={<Solicitar />} />
        <Route path="/chamados" element={<Historico />} />
        <Route path="/garagem" element={<Garagem />} />
        <Route path="/garagem/novo" element={<NovoVeiculo />} />
        {/* Comuns */}
        <Route path="/chamados/:id" element={<TelaChamado />} />
        <Route path="/mensagens" element={<Mensagens />} />
        <Route path="/conversas/:id" element={<Conversa />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/notificacoes" element={<Notificacoes />} />
        <Route path="/salvos" element={<Salvos />} />
        <Route path="/perfis/:ref" element={<PerfilPrestador />} />
        <Route path="/tornar-profissional" element={<TornarProfissional />} />
        {/* Prestador */}
        <Route path="/p" element={<Painel />} />
        <Route path="/p/chamados" element={<ChamadosPrestador />} />
        <Route path="/p/publicacoes" element={<Vitrine />} />
        <Route path="/p/publicar" element={<Publicar />} />
        <Route path="/p/perfil" element={<EditarPerfil />} />
        <Route path="/p/documentos" element={<Documentos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {mostrarAbas && <Abas />}
    </div>
  );
}
