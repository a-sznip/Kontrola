const CACHE_NAME = 'kontrole-v10';
const urlsToCache = [
  './',
  'index.html', 
  'manifest.json', 
  './sw.js', 
  
  // Pliki ikon
  'android-chrome-192x192.png',
  'android-chrome-512x512.jpg',
  
  // Zewnętrzne biblioteki
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache); 
      })
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone(); 

            caches.open(CACHE_NAME)
              .then(cache => {
                if (event.request.method === 'GET') 
                {
                  cache.put(event.request, responseToCache);
                }
              });
            return response;
          }
        )
        .catch(error => {
          console.error('Fetch error (offline scenario):', error);
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});