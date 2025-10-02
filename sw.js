const CACHE_NAME = 'kontrole-v10'; // WAŻNA ZMIANA: Podniesienie wersji wymusza aktualizację! [cite: 1]
const urlsToCache = [
  '/',
  'index.html', 
  // ZMIANA: Użycie poprawnej nazwy pliku po zmianie rozszerzenia
  'manifest.json', 
  'sw.js', 
  
  // Pliki ikon (używamy nazw zgodnych z wgranymi plikami: .png i .jpg)
  'android-chrome-192x192.png',
  'android-chrome-512x512.jpg', // Plik .jpg
  
  // Zewnętrzne biblioteki (dla pełnego offline)
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
        // Dodaj wszystkie zasoby do cache'u
        return cache.addAll(urlsToCache); [cite: 3]
      })
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Zwróć buforowaną odpowiedź, jeśli dostępna
        if (response) {
          return response; [cite: 4]
        }

        // Kontynuuj z normalnym zapytaniem sieciowym
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
        
          response => {
            // Sprawdź, czy otrzymaliśmy prawidłową odpowiedź
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response; [cite: 5]
            }

            // Ważne: Sklonuj odpowiedź. Odpowiedź jest strumieniem i można ją użyć tylko raz.
      
            const responseToCache = response.clone(); [cite: 6]

            caches.open(CACHE_NAME)
              .then(cache => {
                // Buforuj tylko, jeśli jest to żądanie GET
                if (event.request.method === 'GET') {
                    
                  cache.put(event.request, responseToCache); [cite: 7]
                }
              });

            return response;
          } [cite: 8]
        )
        .catch(error => {
          console.error('Fetch error (offline scenario):', error);
          // Można tu dodać logikę zwracania strony awaryjnej dla offline, jeśli nie ma zasobu
        });
      }) [cite: 9]
  );
});

self.addEventListener('activate', event => {
  // Usuń stare buforowane dane
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Usuń stare nazwy cache'u
            return caches.delete(cacheName);
          }
    
        }) [cite: 10]
      );
    })
  );
});