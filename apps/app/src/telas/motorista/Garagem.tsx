import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Plus, Star } from 'lucide-react';
import { post } from '../../api';
import { useSessao } from '../../sessao';
import { useDados } from '../../ganchos';
import { Cabecalho, Carregando, Erro, Vazio } from '../../componentes';
import type { Veiculo } from '../../tipos';

export function Garagem() {
  const nav = useNavigate();
  const { dados, recarregar } = useDados<Veiculo[]>('/me/veiculos');
  async function principal(id: string) { await post(`/me/veiculos/${id}/principal`); await recarregar(); }
  return (
    <div className="tela">
      <Cabecalho titulo="Minha garagem" direita={<button className="icone-btn" onClick={() => nav('/garagem/novo')} aria-label="Adicionar"><Plus size={20} /></button>} />
      {!dados ? <Carregando /> : !dados.length ? (
        <Vazio icone={Car} titulo="Nenhum veículo" texto="Cadastre seu veículo para pedir ajuda mais rápido." acao={<button className="btn primario" onClick={() => nav('/garagem/novo')}>Cadastrar veículo</button>} />
      ) : dados.map((v) => (
        <div key={v.id} className={`card linha${v.principal ? ' destaque' : ''}`}>
          {v.fotoUrl ? <img src={v.fotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} /> : <div className="avatar" style={{ width: 56, height: 56, borderRadius: 12 }}><Car /></div>}
          <div className="cresce">
            <strong>{v.marca} {v.modelo} {v.versao ?? ''}</strong>
            <div className="mini">{v.ano}{v.cor ? ` · ${v.cor}` : ''}{v.combustivel ? ` · ${v.combustivel}` : ''}{v.placa ? ` · ${v.placa}` : ''}</div>
            {v.principal ? <span className="selo vivo" style={{ marginTop: 6 }}><Star size={11} fill="currentColor" />Principal</span>
              : <button className="link" style={{ marginTop: 6 }} onClick={() => principal(v.id)}>Tornar principal</button>}
          </div>
        </div>
      ))}
      <p className="mini">A placa é privada: só aparece para o profissional depois que você confirma o atendimento.</p>
    </div>
  );
}

const TIPOS = [['CARRO', 'Carro'], ['CAMINHONETE', 'Caminhonete'], ['MOTO', 'Moto'], ['CAMINHAO', 'Caminhão'], ['ONIBUS', 'Ônibus'], ['MAQUINA_AGRICOLA', 'Máquina agrícola']] as const;

export function NovoVeiculo() {
  const nav = useNavigate();
  const { avisar } = useSessao();
  const [d, setD] = useState({ tipo: 'CARRO', marca: '', modelo: '', ano: '', versao: '', combustivel: 'Flex', cor: '', placa: '', observacoes: '' });
  const [erro, setErro] = useState<string | null>(null);
  const c = (k: keyof typeof d) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const limpo = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== ''));
      await post('/me/veiculos', { ...limpo, ano: Number(d.ano) });
      avisar('Veículo cadastrado');
      nav(-1);
    } catch (x) { setErro((x as Error).message); }
  }

  return (
    <form className="tela sem-abas" onSubmit={salvar}>
      <Cabecalho titulo="Novo veículo" />
      <div className="campo"><label>Tipo</label><select className="entrada" {...c('tipo')}>{TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
      <div className="dupla">
        <div className="campo"><label>Marca</label><input className="entrada" {...c('marca')} required /></div>
        <div className="campo"><label>Modelo</label><input className="entrada" {...c('modelo')} required /></div>
      </div>
      <div className="dupla">
        <div className="campo"><label>Ano</label><input className="entrada" inputMode="numeric" {...c('ano')} required pattern="\d{4}" /></div>
        <div className="campo"><label>Versão</label><input className="entrada" {...c('versao')} /></div>
      </div>
      <div className="dupla">
        <div className="campo"><label>Combustível</label><select className="entrada" {...c('combustivel')}>{['Flex', 'Gasolina', 'Etanol', 'Diesel', 'GNV', 'Elétrico', 'Híbrido'].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="campo"><label>Cor</label><input className="entrada" {...c('cor')} /></div>
      </div>
      <div className="campo"><label>Placa (opcional, privada)</label><input className="entrada" {...c('placa')} maxLength={8} style={{ textTransform: 'uppercase' }} /></div>
      <div className="campo"><label>Observações para o atendimento</label><textarea className="entrada" {...c('observacoes')} placeholder="Ex.: estepe no assoalho, alarme sensível" /></div>
      <Erro texto={erro} />
      <div className="rodape-fixo"><button className="btn primario cresce">Salvar</button></div>
    </form>
  );
}
