const STATIC_CACHE_NAME = 'kontrole-static-v11'; // Zmieniona nazwa, aby wymusić aktualizację
const DYNAMIC_CACHE_NAME = 'mzmgo-map-tiles-v1';

// Pliki aplikacji do wstępnego buforowania
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
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'
];

// URL do serwera z kafelkami mapy satelitarnej
const MAP_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('Opened static cache');
        return cache.addAll(urlsToCache.map(url => new Request(url, { mode: 'no-cors' })));
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
    })
  );
});

self.addEventListener('fetch', event => {
  // Specjalna strategia dla kafelków mapy
  if (event.request.url.startsWith(MAP_TILE_URL)) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          // Zwróć z cache, jeśli jest, w przeciwnym razie poczekaj na odpowiedź z sieci
          return response || fetchPromise;
        });
      })
    );
  } 
  // Ogólna strategia dla reszty zapytań
  else {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // Zwróć z cache lub pobierz z sieci
          return response || fetch(event.request);
        })
    );
  }
});

