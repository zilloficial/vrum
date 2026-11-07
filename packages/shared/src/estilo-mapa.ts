/**
 * Tema escuro do VRUM para mapas vetoriais do OpenFreeMap.
 *
 * O OpenFreeMap documenta os estilos liberty, bright e positron (todos claros).
 * Em vez de depender de um estilo escuro não documentado, o app baixa o estilo
 * oficial "positron" e recolore cada camada com as cores do VRUM. Fontes,
 * ícones e a fonte de dados continuam sendo os do estilo oficial.
 */
import { cores } from './tema.js';

export const ESTILO_BASE_OPENFREEMAP = 'https://tiles.openfreemap.org/styles/positron';

export const CORES_MAPA = {
  fundo: cores.fundo,
  urbano: '#14161a',
  verde: '#131b16',
  gelo: '#171a20',
  agua: '#0f1b25',
  aguaLinha: '#16283a',
  predio: '#1b1d23',
  pista: '#23262e',
  ruaMenor: '#262a32',
  ruaPrincipal: '#323743',
  rodovia: '#404654',
  contorno: '#16181c',
  ferrovia: '#2a2d35',
  limite: '#3b3e48',
  rotulo: '#8a909c',
  rotuloForte: '#dfe3ea',
  rotuloAgua: '#4d6a84',
} as const;

type Valor = unknown;
interface Camada {
  id: string;
  type: string;
  'source-layer'?: string;
  paint?: Record<string, Valor>;
  layout?: Record<string, Valor>;
  [k: string]: Valor;
}
export interface EstiloMapa { version: number; layers: Camada[]; [k: string]: Valor }

function corDaRua(chave: string) {
  if (/casing/.test(chave)) return CORES_MAPA.contorno;
  if (/motorway|trunk/.test(chave)) return CORES_MAPA.rodovia;
  if (/major|primary|secondary|tertiary/.test(chave)) return CORES_MAPA.ruaPrincipal;
  return CORES_MAPA.ruaMenor;
}

function corDoPreenchimento(chave: string) {
  if (/water|ocean|lake|river/.test(chave)) return CORES_MAPA.agua;
  if (/ice|glacier/.test(chave)) return CORES_MAPA.gelo;
  if (/park|wood|forest|grass|scrub|farm|landcover|garden|cemetery|pitch/.test(chave)) return CORES_MAPA.verde;
  if (/building/.test(chave)) return CORES_MAPA.predio;
  if (/aeroway|runway|taxiway/.test(chave)) return CORES_MAPA.pista;
  return CORES_MAPA.urbano;
}

function corDaLinha(chave: string) {
  if (/water/.test(chave)) return CORES_MAPA.aguaLinha;
  if (/boundary|admin/.test(chave)) return CORES_MAPA.limite;
  if (/rail|transit/.test(chave)) return CORES_MAPA.ferrovia;
  if (/aeroway|runway|taxiway/.test(chave)) return CORES_MAPA.pista;
  if (/highway|road|street|bridge|tunnel|path|motorway|trunk|primary|secondary|minor|service|track/.test(chave)) return corDaRua(chave);
  return CORES_MAPA.ruaMenor;
}

function corDoRotulo(chave: string) {
  if (/water|marine|ocean|lake|river|waterway/.test(chave)) return CORES_MAPA.rotuloAgua;
  if (/city|town|capital|country|state/.test(chave)) return CORES_MAPA.rotuloForte;
  return CORES_MAPA.rotulo;
}

/** Devolve uma cópia do estilo com as cores do VRUM. Não altera o original. */
export function escurecerEstilo<T extends EstiloMapa>(estilo: T): T {
  const copia = JSON.parse(JSON.stringify(estilo)) as T;
  for (const c of copia.layers) {
    const chave = `${c.id} ${c['source-layer'] ?? ''}`.toLowerCase();
    const paint = (c.paint ??= {});
    switch (c.type) {
      case 'background':
        paint['background-color'] = CORES_MAPA.fundo;
        break;
      case 'fill':
        paint['fill-color'] = corDoPreenchimento(chave);
        delete paint['fill-outline-color'];
        delete paint['fill-pattern'];
        break;
      case 'fill-extrusion':
        paint['fill-extrusion-color'] = CORES_MAPA.predio;
        break;
      case 'line':
        paint['line-color'] = corDaLinha(chave);
        break;
      case 'symbol':
        paint['text-color'] = corDoRotulo(chave);
        paint['text-halo-color'] = CORES_MAPA.fundo;
        paint['text-halo-width'] = 1.2;
        if (c.layout?.['icon-image'] !== undefined) paint['icon-opacity'] = 0.55;
        break;
      case 'circle':
        paint['circle-color'] = CORES_MAPA.ruaPrincipal;
        break;
    }
  }
  return copia;
}
