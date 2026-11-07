/**
 * Mapa (Leaflet). O provedor de mapas ainda será definido (seção 13); por padrão usa
 * os blocos escuros da CARTO sobre OpenStreetMap. Troque por VITE_MAPA_TILES.
 */
import { useEffect, type ReactNode } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILES = (import.meta.env.VITE_MAPA_TILES as string | undefined) ?? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

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
  centro, pinos, altura = 220, linha, enquadrar = true, cheio, children, aoMover,
}: {
  centro: { lat: number; lng: number }; pinos: Pino[]; altura?: number | string; linha?: [number, number][];
  enquadrar?: boolean; cheio?: boolean; children?: ReactNode; aoMover?: (c: { lat: number; lng: number }) => void;
}) {
  return (
    <div className={`mapa${cheio ? ' cheio' : ''}`} style={{ height: altura }}>
      <MapContainer center={[centro.lat, centro.lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl>
        <TileLayer url={TILES} attribution={ATRIBUICAO} />
        {pinos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icone(p)} eventHandlers={p.aoClicar ? { click: p.aoClicar } : undefined} />
        ))}
        {linha && linha.length > 1 && <Polyline positions={linha} pathOptions={{ color: '#c6ff00', weight: 4, dashArray: '2 10', lineCap: 'round' }} />}
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
