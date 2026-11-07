/**
 * Localização do aparelho.
 *  - `posicaoAtual`: leitura única (tela inicial, ponto do chamado). Sem GPS autorizado,
 *    o app usa a localização manual da conta.
 *  - `iniciarRastreamento`: só durante um chamado confirmado. No celular usa o plugin de
 *    segundo plano (continua com a tela bloqueada, se o sistema permitir); na web, watchPosition.
 *    Cada leitura leva o horário real de captura — o servidor recusa posições antigas.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { conectar } from './tempo-real';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export interface Coord { lat: number; lng: number }
export const SORRISO: Coord = { lat: -12.5425, lng: -55.7211 };

export async function posicaoAtual(): Promise<Coord | null> {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null; // permissão negada ou sem sinal: a tela oferece o ajuste manual
  }
}

export type EstadoEnvio = { ativo: boolean; ultimoEnvio?: Date; erro?: string };

export async function iniciarRastreamento(chamadoId: string, aoMudar: (e: EstadoEnvio) => void): Promise<() => void> {
  const socket = conectar();
  let ultimo = 0;
  const enviar = (lat: number, lng: number, precisaoM?: number, rumo?: number | null, velocidadeMs?: number | null, quando = Date.now()) => {
    // Economia: no máximo uma posição a cada 4 s.
    if (quando - ultimo < 4000) return;
    ultimo = quando;
    socket.emit('localizacao:enviar', {
      chamadoId, lat, lng, precisaoM, rumo: rumo ?? undefined, velocidadeMs: velocidadeMs ?? undefined,
      capturadaEm: new Date(quando).toISOString(),
    }, (r) => {
      // Leitura repetida do cache do GPS: o servidor já tem uma mais nova — não é erro para o usuário.
      if (!r.ok && (r.codigo === 'POSICAO_FORA_DE_ORDEM' || r.codigo === 'POSICAO_ANTIGA')) return;
      aoMudar(r.ok ? { ativo: true, ultimoEnvio: new Date(quando) } : { ativo: r.codigo !== 'RASTREAMENTO_INATIVO', erro: r.mensagem });
    });
  };

  // Parado, o GPS não dispara novas leituras: uma leitura fresca a cada 20 s evita
  // que a outra parte veja "localização desatualizada" com a pessoa no mesmo lugar.
  const pulso = window.setInterval(() => {
    Geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
      .then((p) => enviar(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading, p.coords.speed, p.timestamp))
      .catch(() => undefined);
  }, 20_000);

  if (Capacitor.isNativePlatform()) {
    const id = await BackgroundGeolocation.addWatcher({
      backgroundTitle: 'VRUM — atendimento em andamento',
      backgroundMessage: 'Sua localização está sendo compartilhada com o atendimento.',
      requestPermissions: true, stale: false, distanceFilter: 10,
    }, (loc, erro) => {
      if (erro) return aoMudar({ ativo: false, erro: erro.code === 'NOT_AUTHORIZED' ? 'Permita a localização para compartilhar.' : erro.message });
      if (loc) enviar(loc.latitude, loc.longitude, loc.accuracy, loc.bearing, loc.speed, loc.time ?? Date.now());
    });
    return () => { window.clearInterval(pulso); void BackgroundGeolocation.removeWatcher({ id }); };
  }

  if (!('geolocation' in navigator)) {
    window.clearInterval(pulso);
    aoMudar({ ativo: false, erro: 'Este navegador não fornece localização.' });
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) => enviar(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading, p.coords.speed, p.timestamp),
    (e) => aoMudar({ ativo: false, erro: e.code === 1 ? 'Permita a localização para compartilhar.' : 'Sem sinal de GPS.' }),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
  );
  return () => { window.clearInterval(pulso); navigator.geolocation.clearWatch(id); };
}
