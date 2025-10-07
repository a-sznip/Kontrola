const STATIC_CACHE_NAME = 'kontrole-static-v18'; // Zwiększona wersja, by wymusić aktualizację
const DYNAMIC_CACHE_NAME = 'kontrole-dynamic-v7';

// --- POCZĄTEK ZMIANY ---
// Zaktualizowana, minimalna lista zasobów. Koncentrujemy się tylko na lokalnym "szkielecie" aplikacji.
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'android-chrome-192x192.png',
  'android-chrome-512x512.jpg'
];
// --- KONIEC ZMIANY ---

const MAP_TILE_URL_PATTERN = /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//;

// --- POCZĄTEK ZMIANY ---
// Zaktualizowany, prosty i niezawodny blok 'install'
self.addEventListener('install', event => {
  self.skipWaiting(); // Natychmiast aktywuj nowego Service Workera
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(cache => {
      console.log('[SW] Precaching App Shell');
      // Używamy prostej i niezawodnej metody addAll.
      // Jeśli którykolwiek plik się nie pobierze, cała instalacja zostanie ponowiona.
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => {
        console.error('[SW] Błąd podczas precachingu App Shell:', err);
    })
  );
});
// --- KONIEC ZMIANY ---


// Blok 'activate' pozostawiony bez zmian - jest poprawny
self.addEventListener('activate', event => {
  const cacheWhitelist = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});


// Blok 'fetch' pozostawiony bez zmian - jest poprawny i obsłuży resztę zasobów
self.addEventListener('fetch', event => {
  // Ignoruj żądania, które nie są typu GET. To jest kluczowe dla logowania (POST).
  if (event.request.method !== 'GET') {
    return;
  }

  // Strategia "Cache first, then network" dla kafelków mapy
  if (MAP_TILE_URL_PATTERN.test(event.request.url)) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
  } 
  // Strategia "Cache first, then network" dla wszystkich pozostałych zasobów GET
  else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).catch(() => {
            // W razie braku sieci, spróbuj znaleźć cokolwiek w cache dynamicznym
            return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                return cache.match(event.request);
            });
        });
      })
    );
  }
});