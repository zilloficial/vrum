import { useCallback, useEffect, useState } from 'react';
import { ESTADOS_ATIVOS } from '@vrum/shared';
import { get } from './api';
import { posicaoAtual, SORRISO, type Coord } from './localizacao';
import { useSessao } from './sessao';
import type { ItemChamado } from './tipos';

/** Carrega dados de uma rota e permite recarregar. */
export function useDados<T>(rota: string | null, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(async () => {
    if (!rota) return;
    try { setDados(await get<T>(rota)); setErro(null); } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota, ...deps]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, carregando, recarregar, setDados };
}

/** Onde o motorista está: GPS, ou localização manual da conta, ou o centro da cidade. */
export function useCentro() {
  const { eu } = useSessao();
  const manual = eu?.localManualLat != null ? { lat: eu.localManualLat, lng: eu.localManualLng! } : null;
  const [centro, setCentro] = useState<Coord>(manual ?? SORRISO);
  const [origem, setOrigem] = useState<'gps' | 'manual' | 'cidade'>(manual ? 'manual' : 'cidade');
  useEffect(() => {
    posicaoAtual().then((p) => { if (p) { setCentro(p); setOrigem('gps'); } });
  }, []);
  return { centro, origem };
}

/** Chamado em andamento do motorista (atalho da tela inicial). */
export function useChamadoAtivo() {
  const { dados, recarregar } = useDados<ItemChamado[]>('/me/chamados');
  return { ativo: dados?.find((c) => ESTADOS_ATIVOS.includes(c.estado)) ?? null, recarregar };
}
