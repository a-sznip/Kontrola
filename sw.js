const STATIC_CACHE_NAME = 'kontrole-static-v15'; // Nowa wersja, aby wymusić aktualizację
const DYNAMIC_CACHE_NAME = 'mzmgo-dynamic-v4';

const urlsToCache = [
  './',
  'index.html', 
  'manifest.json',
  'android-chrome-192x192.png',
  'android-chrome-512x512.jpg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap',
  'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png'
];

const MAP_TILE_URL_PATTERN = /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//;

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('Opened static cache');
        const requests = urlsToCache.map(url => new Request(url, { mode: 'no-cors' }));
        return cache.addAll(requests);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // *** KLUCZOWA POPRAWKA DLA LOGOWANIA ***
  // Jeśli żądanie nie jest typu GET, pozwól przeglądarce obsłużyć je normalnie (przez sieć).
  // To jest krytyczne dla działania logowania, które używa metody POST.
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
      caches.match(event.request)
        .then(response => {
          // Jeśli zasób jest w cache, zwróć go.
          if (response) {
            return response;
          }
          // Jeśli nie, pobierz z sieci.
          return fetch(event.request);
        })
    );
  }
});

