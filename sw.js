const CACHE_NAME = 'wayne-protocol-v15';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];
// Recursos externos: se intentan precachear para que funcionen offline desde
// la primera visita, pero si fallan (sin red en el instante de instalar) no
// deben romper la instalación del resto de la app — se cachearán solos en
// cuanto se usen por primera vez con conexión, gracias al fetch handler.
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.all(
        EXTERNAL_ASSETS.map((url) =>
          cache.add(url).catch(() => { /* sin red ahora mismo: no pasa nada */ })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});

/* ============================================================
   RECORDATORIOS EN SEGUNDO PLANO (best-effort, EXPERIMENTAL)
   ------------------------------------------------------------
   La Periodic Background Sync API solo existe en Chrome/Android con la
   PWA instalada y cierto nivel de uso — NUNCA en iOS Safari ni en Firefox.
   Un Service Worker tampoco tiene acceso a localStorage, así que este aviso
   de aquí es genérico (no sabe si ya registraste algo hoy). El mecanismo
   fiable de verdad es el que corre dentro de la propia app cada vez que la
   abres (ver maybeSendReminder en app.js). Esto es solo un extra opcional.
   ============================================================ */

const SW_GENERIC_REMINDERS = [
  { title: 'Alfred', body: '¿Ha registrado ya el protocolo de hoy, señor?' },
  { title: 'Dick Grayson', body: '¡Eh! ¿Comiste bien hoy? Anótalo en el Wayne Protocol.' },
  { title: 'Bruce Wayne', body: 'La disciplina no descansa. Registra tu día.' }
];

function withinReminderWindow(hour){
  return (hour >= 8 && hour < 11) || (hour >= 22 && hour < 24);
}

self.addEventListener('periodicsync', (event) => {
  if(event.tag !== 'wayne-reminder-check') return;
  event.waitUntil((async () => {
    const hour = new Date().getHours();
    if(!withinReminderWindow(hour)) return;
    const pick = SW_GENERIC_REMINDERS[Math.floor(Math.random() * SW_GENERIC_REMINDERS.length)];
    await self.registration.showNotification(pick.title, {
      body: pick.body,
      icon: 'icon.svg',
      badge: 'icon.svg',
      tag: 'wayne-reminder-bg'
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for(const client of clientList){
        if('focus' in client) return client.focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
