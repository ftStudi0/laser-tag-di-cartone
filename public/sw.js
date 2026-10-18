// Offline: prima la rete (così ci sono sempre gli aggiornamenti), se manca si usa la copia salvata.
// ponytail: niente precache dei file con hash, entrano in cache al primo caricamento online
const CACHE = 'laser-tag-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])))
})

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
        }
        return r
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('/'))),
  )
})
