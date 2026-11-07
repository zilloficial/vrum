export interface Coordenada {
  lat: number;
  lng: number;
}

const RAIO_TERRA_KM = 6371;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em linha reta (haversine). Não substitui o serviço de rotas. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(h));
}

export function coordenadaValida(c: Partial<Coordenada>): c is Coordenada {
  return (
    typeof c.lat === 'number' && typeof c.lng === 'number' &&
    Number.isFinite(c.lat) && Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180
  );
}

/**
 * Posição aproximada para o mapa público: arredonda para uma grade
 * (~1,1 km com 2 casas) para não expor a localização exata de um
 * profissional móvel fora de um atendimento (seção 13).
 */
export function aproximar(c: Coordenada, casas = 2): Coordenada {
  const f = 10 ** casas;
  return { lat: Math.round(c.lat * f) / f, lng: Math.round(c.lng * f) / f };
}

export type FrescorPosicao = 'ATUAL' | 'DESATUALIZADA' | 'PERDIDA';

/**
 * O app nunca deve apresentar uma posição antiga como atual (seção 10).
 * Limites padrão: até 30 s é atual; até 2 min, desatualizada; depois, perdida.
 */
export function frescorPosicao(
  capturadaEm: Date,
  agora: Date = new Date(),
  limites = { atualSeg: 30, perdidaSeg: 120 },
): FrescorPosicao {
  const idade = (agora.getTime() - capturadaEm.getTime()) / 1000;
  if (idade <= limites.atualSeg) return 'ATUAL';
  if (idade <= limites.perdidaSeg) return 'DESATUALIZADA';
  return 'PERDIDA';
}
