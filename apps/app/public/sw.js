/* VRUM — service worker das notificações (Web Push). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let aviso = { titulo: 'VRUM', corpo: 'Você tem uma novidade.', url: '/' };
  try { aviso = { ...aviso, ...evento.data.json() }; } catch { /* aviso padrão */ }
  evento.waitUntil(self.registration.showNotification(aviso.titulo, {
    body: aviso.corpo,
    tag: aviso.tag,
    renotify: Boolean(aviso.tag),
    icon: '/icone-app.png',
    badge: '/icone.png',
    data: { url: aviso.url },
    vibrate: [200, 100, 200],
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href;
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) {
        await j.focus();
        return j.navigate(destino);
      }
    }
    return self.clients.openWindow(destino);
  })());
});
