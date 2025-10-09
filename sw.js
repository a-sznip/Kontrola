// Zwiększamy wersje, aby przeglądarka wiedziała, że ma zainstalować nowy Service Worker
const STATIC_CACHE_NAME = 'kontrole-static-v20';
const DYNAMIC_CACHE_NAME = 'kontrole-dynamic-v9';

// Statyczne zasoby aplikacji, które zawsze mają być dostępne offline
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json'
];

// Lista domen, które Service Worker ma ignorować.
// Są to dostawcy map i API, którymi zarządza sama aplikacja.
const URLS_TO_IGNORE = [
    'https://server.arcgisonline.com',
    'https://integracja.gugik.gov.pl',
    'https://maps.googleapis.com'
];

// Instalacja Service Workera
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(cache => {
      console.log('[SW] Zapisywanie podstawowych zasobów aplikacji w pamięci podręcznej.');
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => {
        console.error('[SW] Błąd podczas zapisywania zasobów:', err);
    })
  );
});

// Aktywacja Service Workera i czyszczenie starych pamięci podręcznych
self.addEventListener('activate', event => {
  const cacheWhitelist = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Usuwanie starej pamięci podręcznej:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Przechwytywanie zapytań sieciowych
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Sprawdzamy, czy zapytanie dotyczy domeny, którą mamy ignorować
  const shouldIgnore = URLS_TO_IGNORE.some(url => requestUrl.origin === url);

  if (shouldIgnore) {
    // Jeśli tak - nie robimy nic i pozwalamy przeglądarce po prostu pobrać dane z sieci.
    // Zapobiega to zapisywaniu kafli map w pamięci podręcznej Service Workera.
    event.respondWith(fetch(event.request));
    return;
  }

  // Dla wszystkich innych zapytań (zasoby naszej aplikacji) stosujemy strategię "cache-first"
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Jeśli zasób jest w pamięci podręcznej, zwracamy go
        if (cachedResponse) {
          return cachedResponse;
        }
        // Jeśli nie, pobieramy go z sieci, zapisujemy w pamięci dynamicznej i zwracamy
        return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
          return fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
  );
});