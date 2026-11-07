/** Cadastro, entrada e garagem do motorista (seção 4). */
import bcrypt from 'bcryptjs';
import { and, eq, isNull, or } from 'drizzle-orm';
import { usuarios, veiculos } from '../db/schema.js';
import { ErroApp, naoEncontrado, type Contexto } from '../nucleo.js';
import { violouUnico } from './chamados.js';
import { emailsAdmin } from '../db/producao.js';

export interface NovoUsuario {
  nome: string;
  telefone: string;
  email: string;
  senha: string;
  cidadeId?: string;
}

export async function cadastrar(ctx: Contexto, d: NovoUsuario) {
  if (d.senha.length < 8) throw new ErroApp('SENHA_FRACA', 'A senha deve ter pelo menos 8 caracteres.');
  try {
    const [u] = await ctx.db.insert(usuarios).values({
      nome: d.nome.trim(), telefone: d.telefone.replace(/\D/g, ''), email: d.email.trim().toLowerCase(),
      senhaHash: await bcrypt.hash(d.senha, 10), cidadeId: d.cidadeId,
    }).returning({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email });
    return u!;
  } catch (e) {
    if (violouUnico(e)) throw new ErroApp('CONTA_EXISTENTE', 'Já existe uma conta com este telefone ou e-mail.', 409);
    throw e;
  }
}

export async function entrar(ctx: Contexto, login: string, senha: string) {
  const l = login.trim().toLowerCase();
  const [u] = await ctx.db.select().from(usuarios)
    .where(or(eq(usuarios.email, l), eq(usuarios.telefone, l.replace(/\D/g, '') || l)));
  // Mesma mensagem para conta inexistente e senha errada.
  if (!u || !(await bcrypt.compare(senha, u.senhaHash))) throw new ErroApp('CREDENCIAIS_INVALIDAS', 'Login ou senha incorretos.', 401);
  if (u.suspensoEm) throw new ErroApp('CONTA_SUSPENSA', 'Conta suspensa. Fale com o suporte.', 403);
  // Administrador geral definido em ADMIN_EMAILS: promovido ao entrar com a senha da própria conta.
  let ehAdmin = u.ehAdmin;
  if (!ehAdmin && emailsAdmin().includes(u.email.toLowerCase())) {
    await ctx.db.update(usuarios).set({ ehAdmin: true }).where(eq(usuarios.id, u.id));
    ehAdmin = true;
  }
  return { id: u.id, nome: u.nome, ehAdmin };
}

export interface NovoVeiculo {
  tipo?: 'CARRO' | 'MOTO' | 'CAMINHONETE' | 'CAMINHAO' | 'ONIBUS' | 'MAQUINA_AGRICOLA';
  marca: string; modelo: string; ano: number;
  versao?: string; combustivel?: string; cor?: string; placa?: string; fotoUrl?: string; observacoes?: string;
  principal?: boolean;
}

export async function adicionarVeiculo(ctx: Contexto, motoristaId: string, d: NovoVeiculo) {
  return ctx.db.transaction(async (tx) => {
    const atuais = await tx.select({ id: veiculos.id }).from(veiculos)
      .where(and(eq(veiculos.motoristaId, motoristaId), isNull(veiculos.arquivadoEm)));
    const principal = d.principal ?? atuais.length === 0; // o primeiro vira principal
    if (principal) {
      await tx.update(veiculos).set({ principal: false }).where(eq(veiculos.motoristaId, motoristaId));
    }
    const [v] = await tx.insert(veiculos).values({ ...d, motoristaId, principal, placa: d.placa?.toUpperCase() }).returning();
    return v!;
  });
}

export async function definirPrincipal(ctx: Contexto, motoristaId: string, veiculoId: string) {
  await ctx.db.transaction(async (tx) => {
    const [v] = await tx.select().from(veiculos).where(and(eq(veiculos.id, veiculoId), eq(veiculos.motoristaId, motoristaId)));
    if (!v || v.arquivadoEm) throw naoEncontrado('Veículo');
    await tx.update(veiculos).set({ principal: false }).where(eq(veiculos.motoristaId, motoristaId));
    await tx.update(veiculos).set({ principal: true }).where(eq(veiculos.id, veiculoId));
  });
}

export function garagem(ctx: Contexto, motoristaId: string) {
  return ctx.db.select().from(veiculos)
    .where(and(eq(veiculos.motoristaId, motoristaId), isNull(veiculos.arquivadoEm)))
    .orderBy(veiculos.criadoEm);
}
