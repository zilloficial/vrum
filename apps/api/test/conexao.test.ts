import { describe, expect, it } from 'vitest';
import { opcoesConexao } from '../src/db/cliente.js';

describe('opções de conexão com o banco', () => {
  it('local: sem SSL e pool padrão', () => {
    const o = opcoesConexao('postgresql://vrum:vrum@localhost:5432/vrum', {});
    expect(o.ssl).toBeUndefined();
    expect(o.max).toBe(10);
  });

  it('pooler do Supabase: SSL ligado, poucas conexões e sslmode tratado aqui', () => {
    const o = opcoesConexao('postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require', {});
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
    expect(o.max).toBe(5);
    expect(o.connectionString).not.toContain('sslmode');
    expect(o.connectionString).toContain('postgres.abc');
  });

  it('com o certificado do Supabase, verifica o servidor', () => {
    const o = opcoesConexao('postgresql://u:s@db.abc.supabase.co:5432/postgres', { DATABASE_CA: '-----BEGIN CERTIFICATE-----\\nAAA\\n-----END CERTIFICATE-----' });
    expect(o.ssl).toEqual({ ca: '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----', rejectUnauthorized: true });
  });

  it('DATABASE_POOL e sslmode=disable são respeitados', () => {
    const o = opcoesConexao('postgresql://u:s@meubanco.exemplo:5432/x?sslmode=disable', { DATABASE_POOL: '3' });
    expect(o.ssl).toBeUndefined();
    expect(o.max).toBe(3);
  });
});
