import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { useSessao } from '../sessao';
import { Erro } from '../componentes';

export function Entrar() {
  const { entrar } = useSessao();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try { await entrar(login, senha); } catch (x) { setErro((x as Error).message); } finally { setEnviando(false); }
  }

  return (
    <form className="tela sem-abas" onSubmit={enviar}>
      <div className="boas-vindas">
        <img className="logo" src="/logo.png" alt="vrum" />
        <div className="coluna" style={{ gap: 6 }}>
          <h1>Ajuda no caminho,<br />em tempo real.</h1>
          <p className="sub" style={{ margin: 0 }}>Encontre profissionais automotivos perto de você e acompanhe a chegada no mapa.</p>
        </div>
        <div className="coluna">
          <div className="campo">
            <label htmlFor="login">E-mail ou telefone</label>
            <input id="login" className="entrada" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input id="senha" className="entrada" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
          </div>
          <Erro texto={erro} />
          <button className="btn primario bloco" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          <Link to="/cadastro" className="btn contorno bloco">Criar conta</Link>
        </div>
      </div>
    </form>
  );
}

export function Cadastro() {
  const { cadastrar } = useSessao();
  const [cidades, setCidades] = useState<{ id: string; nome: string; uf: string }[]>([]);
  const [d, setD] = useState({ nome: '', telefone: '', email: '', senha: '', cidadeId: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    get('/cidades').then((c) => { setCidades(c); if (c[0]) setD((x) => ({ ...x, cidadeId: c[0].id })); }).catch(() => undefined);
  }, []);

  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try { await cadastrar({ ...d, cidadeId: d.cidadeId || undefined }); } catch (x) { setErro((x as Error).message); } finally { setEnviando(false); }
  }

  return (
    <form className="tela sem-abas" onSubmit={enviar}>
      <img src="/logo.png" alt="vrum" style={{ width: 110, marginTop: 8 }} />
      <h1>Criar conta</h1>
      <p className="sub" style={{ margin: 0 }}>Grátis para motoristas. Profissionais ativam a área deles depois, no perfil.</p>
      <div className="campo"><label>Nome</label><input className="entrada" {...campo('nome')} autoComplete="name" required /></div>
      <div className="campo"><label>Telefone (com DDD)</label><input className="entrada" type="tel" inputMode="tel" {...campo('telefone')} placeholder="66 99999-0000" required /></div>
      <div className="campo"><label>E-mail</label><input className="entrada" type="email" {...campo('email')} autoComplete="email" required /></div>
      <div className="campo"><label>Senha</label><input className="entrada" type="password" {...campo('senha')} autoComplete="new-password" minLength={8} required /><span className="mini">Mínimo de 8 caracteres.</span></div>
      <div className="campo">
        <label>Cidade</label>
        <select className="entrada" {...campo('cidadeId')}>
          {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome} – {c.uf}</option>)}
        </select>
      </div>
      <Erro texto={erro} />
      <button className="btn primario bloco" disabled={enviando}>{enviando ? 'Criando…' : 'Criar conta'}</button>
      <Link to="/" className="link" style={{ textAlign: 'center' }}>Já tenho conta</Link>
    </form>
  );
}
