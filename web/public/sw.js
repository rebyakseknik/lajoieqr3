/**
 * La Joie servis calisani.
 *
 * Tek isi var: sunucudan gelen "siparisiniz hazir" bildirimini
 * gostermek ve dokununca takip sayfasini acmak.
 */

self.addEventListener('push', (olay) => {
  let veri = {};
  try {
    veri = olay.data ? olay.data.json() : {};
  } catch {
    veri = {};
  }

  const baslik = veri.baslik || 'La Joie';
  const secenekler = {
    body: veri.metin || 'Siparişinizle ilgili bir güncelleme var.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: veri.etiket || 'lajoie-siparis',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { yol: veri.yol || '/' },
  };

  olay.waitUntil(self.registration.showNotification(baslik, secenekler));
});

self.addEventListener('notificationclick', (olay) => {
  olay.notification.close();
  const yol = olay.notification.data?.yol || '/';

  olay.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      // Zaten acik bir sekme varsa onu one al.
      for (const istemci of liste) {
        if (istemci.url.includes(yol) && 'focus' in istemci) return istemci.focus();
      }
      return self.clients.openWindow(yol);
    })
  );
});
