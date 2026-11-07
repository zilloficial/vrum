import { describe, expect, it } from 'vitest';
import { CORES_MAPA, escurecerEstilo, type EstiloMapa } from './estilo-mapa.js';

// Amostra com a mesma estrutura das camadas do estilo positron (OpenMapTiles).
const amostra: EstiloMapa = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } },
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': 'rgb(194,200,202)', 'fill-outline-color': '#ccc' } },
    { id: 'park', type: 'fill', 'source-layer': 'park', paint: { 'fill-color': '#e6e9e5' } },
    { id: 'building', type: 'fill', 'source-layer': 'building', paint: { 'fill-color': '#eee' } },
    { id: 'highway_motorway_casing', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#e9ac77', 'line-width': 3 } },
    { id: 'highway_motorway_inner', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 14, 6] } },
    { id: 'highway_minor', type: 'line', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
    { id: 'boundary_country', type: 'line', 'source-layer': 'boundary', paint: { 'line-color': '#aaa' } },
    { id: 'place_label_city', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#333' } },
    { id: 'water_name', type: 'symbol', 'source-layer': 'water_name', layout: { 'text-field': '{name}' } },
    { id: 'poi', type: 'symbol', 'source-layer': 'poi', layout: { 'icon-image': 'x', 'text-field': '{name}' } },
  ],
};

describe('tema escuro do mapa (OpenFreeMap)', () => {
  const e = escurecerEstilo(amostra);
  const camada = (id: string) => e.layers.find((l) => l.id === id)!.paint!;

  it('recolore fundo, água, áreas verdes e prédios', () => {
    expect(camada('background')['background-color']).toBe(CORES_MAPA.fundo);
    expect(camada('water')['fill-color']).toBe(CORES_MAPA.agua);
    expect(camada('water')['fill-outline-color']).toBeUndefined();
    expect(camada('park')['fill-color']).toBe(CORES_MAPA.verde);
    expect(camada('building')['fill-color']).toBe(CORES_MAPA.predio);
  });

  it('hierarquia das vias: rodovia mais clara, contorno escuro, ruas menores discretas', () => {
    expect(camada('highway_motorway_inner')['line-color']).toBe(CORES_MAPA.rodovia);
    expect(camada('highway_motorway_casing')['line-color']).toBe(CORES_MAPA.contorno);
    expect(camada('highway_minor')['line-color']).toBe(CORES_MAPA.ruaMenor);
    expect(camada('boundary_country')['line-color']).toBe(CORES_MAPA.limite);
  });

  it('mantém larguras, fontes e a fonte de dados do estilo oficial', () => {
    expect(camada('highway_motorway_inner')['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 5, 1, 14, 6]);
    expect(e.glyphs).toBe(amostra.glyphs);
    expect(e.sources).toEqual(amostra.sources);
  });

  it('rótulos legíveis no escuro, com halo do fundo', () => {
    expect(camada('place_label_city')['text-color']).toBe(CORES_MAPA.rotuloForte);
    expect(camada('water_name')['text-color']).toBe(CORES_MAPA.rotuloAgua);
    expect(camada('poi')['text-halo-color']).toBe(CORES_MAPA.fundo);
    expect(camada('poi')['icon-opacity']).toBe(0.55);
  });

  it('não altera o estilo original', () => {
    expect(amostra.layers[0]!.paint!['background-color']).toBe('rgb(242,243,240)');
  });
});
