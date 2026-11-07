/**
 * Trajeto e previsão de chegada do profissional até o ponto de atendimento.
 *
 * - Com ORS_API_KEY: usa o OpenRouteService (rota de carro, distância e duração reais).
 * - Sem a chave, ou se o serviço falhar: devolve a distância em linha reta, sem previsão.
 *
 * O resultado fica em cache por chamado e só é recalculado quando o profissional
 * se move bastante ou depois de um tempo — protege a cota do serviço de rotas.
 * A previsão só é calculada a partir de uma posição recente (nunca de uma antiga).
 */
import { and, eq } from 'drizzle-orm';
import { distanciaKm, frescorPosicao, rastreamentoAtivo, type Coordenada } from '@vrum/shared';
import { chamados, membrosPrestador, posicoesAtuais } from '../db/schema.js';
import { naoEncontrado, proibido, type Contexto } from '../nucleo.js';
import { papelNoRastreamento } from './localizacao.js';

export interface Trajeto { distanciaM: number; duracaoS: number; linha: [number, number][] }

export interface ServicoRotas {
  nome: 'openrouteservice' | 'nenhum';
  calcular(origem: Coordenada, destino: Coordenada): Promise<Trajeto | null>;
}

export const semRotas: ServicoRotas = { nome: 'nenhum', calcular: async () => null };

export function openRouteService(chave: string, f: typeof fetch = fetch): ServicoRotas {
  return {
    nome: 'openrouteservice',
    async calcular(origem, destino) {
      try {
        const r = await f('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
          method: 'POST',
          headers: { authorization: chave, 'content-type': 'application/json', accept: 'application/geo+json, application/json' },
          body: JSON.stringify({ coordinates: [[origem.lng, origem.lat], [destino.lng, destino.lat]] }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) { console.warn('OpenRouteService respondeu', r.status); return null; }
        const dados = await r.json() as {
          features?: { properties?: { summary?: { distance?: number; duration?: number } }; geometry?: { coordinates?: [number, number][] } }[];
        };
        const rota = dados.features?.[0];
        const resumo = rota?.properties?.summary;
        if (!rota || resumo?.distance === undefined || resumo.duration === undefined) return null;
        return {
          distanciaM: Math.round(resumo.distance),
          duracaoS: Math.round(resumo.duration),
          // GeoJSON vem como [lng, lat]; o mapa usa [lat, lng].
          linha: (rota.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]),
        };
      } catch (e) {
        console.warn('Falha no OpenRouteService:', (e as Error).message);
        return null;
      }
    },
  };
}

export function servicoRotasDoAmbiente(): ServicoRotas {
  const chave = process.env.ORS_API_KEY;
  return chave ? openRouteService(chave) : semRotas;
}

interface Cache { origem: Coordenada; calculadaEm: number; trajeto: Trajeto | null }
const cache = new Map<string, Cache>();
const RECALCULAR_APOS_M = 300;
const RECALCULAR_APOS_MS = 90_000;

export async function rotaDoChamado(ctx: Contexto, servico: ServicoRotas, usuarioId: string, chamadoId: string) {
  const [ch] = await ctx.db.select().from(chamados).where(eq(chamados.id, chamadoId));
  if (!ch) throw naoEncontrado('Chamado');
  if (!(await papelNoRastreamento(ctx.db, ch, usuarioId))) throw proibido();
  if (!rastreamentoAtivo(ch.estado) || !ch.responsavelId) {
    cache.delete(chamadoId);
    return { disponivel: false as const, motivo: 'RASTREAMENTO_INATIVO' };
  }

  const [membro] = await ctx.db.select({ usuarioId: membrosPrestador.usuarioId }).from(membrosPrestador).where(eq(membrosPrestador.id, ch.responsavelId));
  const [pos] = await ctx.db.select().from(posicoesAtuais)
    .where(and(eq(posicoesAtuais.chamadoId, ch.id), eq(posicoesAtuais.usuarioId, membro!.usuarioId)));
  const agora = ctx.agora();
  if (!pos || frescorPosicao(pos.capturadaEm, agora) === 'PERDIDA') {
    return { disponivel: false as const, motivo: 'SEM_POSICAO_RECENTE' };
  }

  const origem = { lat: pos.lat, lng: pos.lng };
  const destino = { lat: ch.pontoLat, lng: ch.pontoLng };
  const anterior = cache.get(chamadoId);
  const reaproveita = anterior
    && agora.getTime() - anterior.calculadaEm < RECALCULAR_APOS_MS
    && distanciaKm(anterior.origem, origem) * 1000 < RECALCULAR_APOS_M;
  const trajeto = reaproveita ? anterior!.trajeto : await servico.calcular(origem, destino);
  if (!reaproveita) cache.set(chamadoId, { origem, calculadaEm: agora.getTime(), trajeto });

  const linhaReta = Math.round(distanciaKm(origem, destino) * 1000);
  return {
    disponivel: true as const,
    fonte: trajeto ? 'ROTA' as const : 'LINHA_RETA' as const,
    distanciaM: trajeto?.distanciaM ?? linhaReta,
    duracaoS: trajeto?.duracaoS ?? null,
    chegadaEstimada: trajeto ? new Date(pos.capturadaEm.getTime() + trajeto.duracaoS * 1000).toISOString() : null,
    linha: trajeto?.linha ?? [[origem.lat, origem.lng], [destino.lat, destino.lng]],
    posicaoCapturadaEm: pos.capturadaEm.toISOString(),
  };
}
