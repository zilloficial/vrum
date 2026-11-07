/**
 * Mapa (Leaflet + MapLibre) com os mapas vetoriais gratuitos do OpenFreeMap — sem chave e sem limite de uso.
 *
 * Estilo (VITE_MAPA_ESTILO):
 *  - "vrum-escuro" (padrão): o estilo oficial "positron" recolorido com as cores do VRUM;
 *  - "liberty", "bright" ou "positron": estilos oficiais do OpenFreeMap, como são;
 *  - ou a URL de um estilo próprio (ex.: editado no Maputnik).
 * Se o OpenFreeMap não responder, o mapa usa blocos escuros da CARTO como reserva.
 * O OpenFreeMap não calcula rotas: a rota e a previsão de chegada vêm da API (OpenRouteService).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ESTILO_BASE_OPENFREEMAP, escurecerEstilo, type EstiloMapa } from '@vrum/shared';

const ESTILO = ((import.meta.env.VITE_MAPA_ESTILO as string | undefined) || 'vrum-escuro').trim();
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ATRIBUICAO_OFM = `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ${OSM}`;
const CARTO = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  atribuicao: `${OSM} &copy; <a href="https://carto.com/">CARTO</a>`,
};

/** O estilo é baixado e preparado uma vez por sessão e reaproveitado por todos os mapas. */
let estiloPronto: Promise<EstiloMapa | string> | null = null;
function carregarEstilo() {
  estiloPronto ??= (async () => {
    if (/^https?:\/\//.test(ESTILO)) return ESTILO;
    if (ESTILO !== 'vrum-escuro') return `https://tiles.openfreemap.org/styles/${ESTILO}`;
    const r = await fetch(ESTILO_BASE_OPENFREEMAP);
    if (!r.ok) throw new Error(`OpenFreeMap respondeu ${r.status}`);
    return escurecerEstilo(await r.json() as EstiloMapa);
  })();
  estiloPronto.catch(() => { estiloPronto = null; }); // tenta de novo no próximo mapa
  return estiloPronto;
}

export type Pino = {
  id: string; lat: number; lng: number;
  tipo: 'verde' | 'branco' | 'cinza' | 'motorista';
  rotulo?: string; velho?: boolean; aoClicar?: () => void;
};

function icone(p: Pino) {
  if (p.tipo === 'motorista') return L.divIcon({ className: '', html: '<div class="ponto-motorista"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const html = `<div class="pino ${p.tipo}${p.velho ? ' velho' : ''}" style="font-weight:900;font-size:13px">${p.rotulo ?? ''}</div>`;
  return L.divIcon({ className: '', html, iconSize: [38, 38], iconAnchor: [19, 19] });
}

function Enquadrar({ pontos, uma }: { pontos: [number, number][]; uma?: boolean }) {
  const mapa = useMap();
  const chave = pontos.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) mapa.setView(pontos[0]!, uma ? 15 : mapa.getZoom(), { animate: true });
    // Folga maior no topo: filtros e selos ficam sobre o mapa.
    else mapa.fitBounds(L.latLngBounds(pontos), { paddingTopLeft: [40, 130], paddingBottomRight: [40, 40], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return null;
}

export function Mapa({
  centro, pinos, altura = 220, linha, linhaTracejada = true, enquadrar = true, cheio, children, aoMover,
}: {
  centro: { lat: number; lng: number }; pinos: Pino[]; altura?: number | string; linha?: [number, number][]; linhaTracejada?: boolean;
  enquadrar?: boolean; cheio?: boolean; children?: ReactNode; aoMover?: (c: { lat: number; lng: number }) => void;
}) {
  return (
    <div className={`mapa${cheio ? ' cheio' : ''}`} style={{ height: altura }}>
      <MapContainer center={[centro.lat, centro.lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl>
        <Camada />
        {pinos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icone(p)} eventHandlers={p.aoClicar ? { click: p.aoClicar } : undefined} />
        ))}
        {linha && linha.length > 1 && <Polyline positions={linha} pathOptions={{ color: '#c6ff00', weight: linhaTracejada ? 4 : 5, opacity: 0.9, dashArray: linhaTracejada ? '2 10' : undefined, lineCap: 'round', lineJoin: 'round' }} />}
        {enquadrar && <Enquadrar pontos={pinos.map((p) => [p.lat, p.lng])} uma={pinos.length === 1} />}
        {aoMover && <OuvirMovimento aoMover={aoMover} />}
        {children}
      </MapContainer>
    </div>
  );
}

function OuvirMovimento({ aoMover }: { aoMover: (c: { lat: number; lng: number }) => void }) {
  const mapa = useMap();
  useEffect(() => {
    const f = () => { const c = mapa.getCenter(); aoMover({ lat: c.lat, lng: c.lng }); };
    mapa.on('moveend', f);
    return () => { mapa.off('moveend', f); };
  }, [mapa, aoMover]);
  return null;
}

function Camada() {
  const mapa = useMap();
  const [reserva, setReserva] = useState(false);

  useEffect(() => {
    let camada: L.Layer | null = null;
    let cancelado = false;
    (async () => {
      try {
        const [estilo, { maplibreGL }] = await Promise.all([
          carregarEstilo(),
          import('@maplibre/maplibre-gl-leaflet'),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        if (cancelado) return;
        camada = maplibreGL({ style: estilo as never } as never).addTo(mapa);
        // Crédito obrigatório pela licença dos dados (OpenStreetMap) e do serviço.
        mapa.attributionControl?.addAttribution(ATRIBUICAO_OFM);
      } catch (e) {
        console.warn('Mapa vetorial indisponível, usando a reserva:', (e as Error).message);
        if (!cancelado) setReserva(true);
      }
    })();
    return () => {
      cancelado = true;
      if (camada) { mapa.removeLayer(camada); mapa.attributionControl?.removeAttribution(ATRIBUICAO_OFM); }
    };
  }, [mapa]);

  return reserva ? <TileLayer url={CARTO.url} attribution={CARTO.atribuicao} /> : null;
}
