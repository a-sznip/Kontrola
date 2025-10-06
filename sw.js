const STATIC_CACHE = 'kontrole-static-v16';
const DYNAMIC_CACHE = 'kontrole-dynamic-v5';

// Niezbędne zasoby do działania aplikacji offline
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'android-chrome-192x192.png',
  'android-chrome-512x512.jpg'
];

self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Precaching App Shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
          console.log('[SW] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Strategia Cache then Network
self.addEventListener('fetch', event => {
  // Ignoruj żądania, które nie są GET - to kluczowe dla logowania!
  if (event.request.method !== 'GET') {
    return;
  }

  // Dla kafelków mapy i innych zasobów z zewnętrznych domen (jak czcionki, biblioteki js)
  // spróbuj najpierw z sieci, a potem z cache (Network falling back to cache)
  if (event.request.url.includes('https') && !STATIC_ASSETS.includes(event.request.url)) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then(cache => {
        return fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          return cache.match(event.request);
        });
      })
    );
  } 
  // Dla lokalnych zasobów aplikacji - najpierw cache (Cache first)
  else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(networkResponse => {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
  }
});

