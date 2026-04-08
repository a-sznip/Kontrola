// Zwiększamy wersje, aby przeglądarka wiedziała, że ma zainstalować nowy Service Worker
const STATIC_CACHE_NAME = 'kontrole-static-v25'; // Wymuszenie odświeżenia
const DYNAMIC_CACHE_NAME = 'kontrole-dynamic-v12';

// Statyczne zasoby aplikacji, które zawsze mają być dostępne offline od pierwszego wejścia!
// Wszystkie ścieżki są ściśle względne (z kropką), aby zachować kompatybilność z GitHub Pages.
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './index.js',
  './data.js',
  './manifest.json',
  './icon-192.png'
];

// Lista domen, które Service Worker ma ignorować (mapy, zewnętrzne API, CDN)
const URLS_TO_IGNORE = [
    'https://server.arcgisonline.com',
    'https://integracja.gugik.gov.pl',
    'https://maps.googleapis.com',
    'https://unpkg.com', 
    'https://cdnjs.cloudflare.com',
    'https://cdn.tailwindcss.com', // Ochrona wątku głównego przed blokadą CSS (Mobilne WebView)
    'https://cdn.jsdelivr.net'     // Ochrona wątku głównego przed blokadą JS
];

// Instalacja Service Workera
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(cache => {
      console.log('[SW] Zapisywanie podstawowych zasobów aplikacji w pamięci podręcznej.');
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => {
        console.error('[SW] Błąd podczas zapisywania zasobów statycznych:', err);
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
  // Ignoruj wszystkie zapytania, które nie są typu GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  const requestUrl = new URL(event.request.url);
  const shouldIgnore = URLS_TO_IGNORE.some(url => requestUrl.origin === url || requestUrl.href.startsWith(url));

  if (shouldIgnore) {
    event.respondWith(
        fetch(event.request).catch(err => {
            console.warn('[SW] Ignorowane żądanie sieciowe nie powiodło się (offline):', requestUrl.href);
            // Zwracamy cichy błąd, aby nie blokować UI w trybie offline
            return new Response('', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse; // Zwróć z pamięci podręcznej, jeśli istnieje
        }
        return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
          return fetch(event.request).then(networkResponse => {
            // Zapisz nowe zapytanie w dynamicznej pamięci podręcznej
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => {
            // Bezpieczny fallback na wypadek braku internetu dla zasobów dynamicznych
            console.warn('[SW] Brak sieci, nie można pobrać zasobu:', requestUrl.href);
          });
        });
      })
  );
});