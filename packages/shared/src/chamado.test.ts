import { describe, expect, it } from 'vitest';
import { eventosDisponiveis, rastreamentoAtivo, transicionar, type EstadoChamado, type EventoChamado, type Ator } from './chamado.js';
import { aproximar, distanciaKm, frescorPosicao } from './geo.js';

function percorrer(passos: [EventoChamado, Ator][], inicio: EstadoChamado = 'BUSCANDO_PROFISSIONAL') {
  let estado = inicio;
  for (const [evento, ator] of passos) {
    const r = transicionar(estado, evento, { ator });
    if (!r.ok) throw new Error(`${evento} falhou em ${estado}: ${r.motivo}`);
    estado = r.para;
  }
  return estado;
}

describe('máquina de estados do chamado', () => {
  it('percorre o caminho feliz até a conclusão', () => {
    const final = percorrer([
      ['CONVITE_ENVIADO', 'SISTEMA'],
      ['ACEITAR', 'PRESTADOR'],
      ['CONFIRMAR', 'MOTORISTA'],
      ['SAIR_A_CAMINHO', 'PRESTADOR'],
      ['CHEGAR', 'PRESTADOR'],
      ['INICIAR_SERVICO', 'PRESTADOR'],
      ['SOLICITAR_CONCLUSAO', 'PRESTADOR'],
      ['CONFIRMAR_CONCLUSAO', 'MOTORISTA'],
    ]);
    expect(final).toBe('CONCLUIDO');
  });

  it('não permite aceitar um chamado que já foi aceito', () => {
    const r = transicionar('ACEITO_COMBINANDO', 'ACEITAR', { ator: 'PRESTADOR' });
    expect(r).toMatchObject({ ok: false, codigo: 'TRANSICAO_INVALIDA' });
  });

  it('só o motorista confirma o atendimento e a conclusão', () => {
    expect(transicionar('ACEITO_COMBINANDO', 'CONFIRMAR', { ator: 'PRESTADOR' }).ok).toBe(false);
    expect(transicionar('CONCLUSAO_SOLICITADA', 'CONFIRMAR_CONCLUSAO', { ator: 'PRESTADOR' }).ok).toBe(false);
  });

  it('exige aceitar a taxa de deslocamento antes de confirmar', () => {
    const r = transicionar('ACEITO_COMBINANDO', 'CONFIRMAR', { ator: 'MOTORISTA', taxaDeslocamentoPendente: true });
    expect(r).toMatchObject({ ok: false, codigo: 'TAXA_NAO_ACEITA' });
  });

  it('prestador não cancela antes de estar vinculado', () => {
    expect(transicionar('AGUARDANDO_RESPOSTA', 'CANCELAR', { ator: 'PRESTADOR' }).ok).toBe(false);
    expect(transicionar('A_CAMINHO', 'CANCELAR', { ator: 'PRESTADOR' }).ok).toBe(true);
  });

  it('estados finais não aceitam novos eventos', () => {
    for (const e of ['CONCLUIDO', 'CANCELADO'] as const) {
      expect(eventosDisponiveis(e, { ator: 'MOTORISTA' })).toEqual([]);
      expect(eventosDisponiveis(e, { ator: 'SISTEMA' })).toEqual([]);
    }
  });

  it('conclusão sem resposta é encerrada por prazo; contestação volta ao atendimento', () => {
    expect(transicionar('CONCLUSAO_SOLICITADA', 'CONCLUIR_POR_PRAZO', { ator: 'SISTEMA' })).toMatchObject({ ok: true, para: 'CONCLUIDO' });
    expect(transicionar('CONCLUSAO_SOLICITADA', 'CONTESTAR_CONCLUSAO', { ator: 'MOTORISTA' })).toMatchObject({ ok: true, para: 'EM_ATENDIMENTO' });
  });

  it('sem aceite, o motorista pode reabrir a busca', () => {
    const final = percorrer([
      ['CONVITE_ENVIADO', 'SISTEMA'],
      ['BUSCA_ESGOTADA', 'SISTEMA'],
      ['REABRIR_BUSCA', 'MOTORISTA'],
    ]);
    expect(final).toBe('BUSCANDO_PROFISSIONAL');
  });

  it('rastreamento só existe após a confirmação e termina nos estados finais', () => {
    expect(rastreamentoAtivo('ACEITO_COMBINANDO')).toBe(false);
    expect(rastreamentoAtivo('CONFIRMADO')).toBe(true);
    expect(rastreamentoAtivo('CONCLUIDO')).toBe(false);
    expect(rastreamentoAtivo('CANCELADO')).toBe(false);
  });

  it('botões do motorista em atendimento confirmado', () => {
    expect(eventosDisponiveis('CONFIRMADO', { ator: 'MOTORISTA' })).toEqual(['CANCELAR']);
    expect(eventosDisponiveis('CONFIRMADO', { ator: 'PRESTADOR' })).toEqual(['SAIR_A_CAMINHO', 'CANCELAR']);
  });
});

describe('geografia', () => {
  it('calcula distância aproximada entre Sorriso e Sinop (~80 km)', () => {
    const d = distanciaKm({ lat: -12.5425, lng: -55.7211 }, { lat: -11.8604, lng: -55.5091 });
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(85);
  });

  it('aproxima a posição pública', () => {
    expect(aproximar({ lat: -12.54251, lng: -55.72113 })).toEqual({ lat: -12.54, lng: -55.72 });
  });

  it('classifica o frescor da posição', () => {
    const agora = new Date('2026-11-06T12:00:00Z');
    expect(frescorPosicao(new Date('2026-11-06T11:59:50Z'), agora)).toBe('ATUAL');
    expect(frescorPosicao(new Date('2026-11-06T11:59:00Z'), agora)).toBe('DESATUALIZADA');
    expect(frescorPosicao(new Date('2026-11-06T11:50:00Z'), agora)).toBe('PERDIDA');
  });
});
