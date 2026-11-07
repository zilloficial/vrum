/**
 * Notificações no navegador (Web Push). No app nativo (Capacitor) não se aplica.
 * No iPhone, o Safari só entrega push quando o VRUM está instalado na tela inicial.
 */
import { Capacitor } from '@capacitor/core';
import { get, post } from './api';

export type EstadoPush = 'indisponivel' | 'pendente' | 'ativado' | 'bloqueado';

export function suportaPush() {
  return !Capacitor.isNativePlatform()
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function estadoPush(): EstadoPush {
  if (!suportaPush()) return 'indisponivel';
  if (Notification.permission === 'denied') return 'bloqueado';
  return Notification.permission === 'granted' ? 'ativado' : 'pendente';
}

function chaveParaBytes(base64: string) {
  const preenchido = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(preenchido);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

async function inscrever() {
  const { chave } = await get<{ chave: string | null }>('/push/chave-publica');
  if (!chave) throw new Error('O servidor ainda não oferece notificações.');
  const registro = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription()
    ?? await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
  await post('/me/dispositivos', { plataforma: 'WEB', token: inscricao.endpoint, inscricaoWeb: inscricao.toJSON() });
}

/** Pede a permissão (precisa vir de um toque do usuário) e registra este navegador. */
export async function ativarPush(): Promise<EstadoPush> {
  if (!suportaPush()) return 'indisponivel';
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'pendente';
  await inscrever();
  return 'ativado';
}

/** Ao entrar: se a permissão já foi dada, renova a inscrição em silêncio (ex.: depois de trocar de conta). */
export async function sincronizarPush() {
  if (estadoPush() === 'ativado') await inscrever().catch(() => undefined);
}
