const App = {
    config: {
        firebase: {
            apiKey: "AIzaSyDFCV_dXKnqOn8yYbCSWSayOijB90MABv4",
            authDomain: "kontrole-mzmgo.firebaseapp.com",
            projectId: "kontrole-mzmgo",
            storageBucket: "kontrole-mzmgo.firebasestorage.app",
            messagingSenderId: "735699938419",
            appId: "1:735699938419:web:a93e8015aa54a5ad910e06",
            measurementId: "G-5XGG2FWWJX"
        },
        googleMaps: {
            apiKey: "AIzaSyClGtmK6IlFBX1dAsf9tJ8m9NJKHthD_rE"
        },
        photo: {
            maxWidth: 1024,
            jpegQuality: 0.8
        },
        offlineMap: {
            minZoom: 13,
            maxZoom: 17,
        }
    },
    data: APP_DATA,
    state: {
        firebaseApp: null,
        auth: null,
        controls: [],
        identifications: [],
        currentControlId: null,
        currentIdentificationId: null,
        photos: [],
        currentProtocol: null,
        unionSignaturePad: null,
        partiesSignaturePad: null,
        jointNoteSignaturePad: null,
        identificationMap: null,
        currentIdentificationData: {}
    },
    elements: {},

    init() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('Service Worker zarejestrowany:', registration))
                .catch(error => console.log('Błąd rejestracji Service Worker:', error));
        }
        
        try {
            this.state.firebaseApp = firebase.initializeApp(this.config.firebase);
            this.state.auth = firebase.auth();
        } catch (error) {
            console.error("Firebase initialization error:", error);
            const authView = document.getElementById('auth-view');
            if (authView) {
                authView.innerHTML = '<div class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm text-center"><h2 class="text-xl font-bold text-red-600 mb-4">Błąd Krytyczny</h2><p class="text-gray-700">Nie udało się zainicjować połączenia z Firebase. Sprawdź połączenie internetowe i konfigurację. Aplikacja nie może działać bez tego połączenia.</p></div>';
            }
            return;
        }

        this.cacheDOMElements();
        this.bindEvents();

        this.state.auth.onAuthStateChanged(user => {
            if (user) {
                this.elements.authView.classList.add('hidden');
                this.elements.appView.classList.remove('hidden');
                this.elements.userEmail.textContent = user.email;
                this.loadLocalData();
            } else {
                this.elements.authView.classList.remove('hidden');
                this.elements.appView.classList.add('hidden');
            }
        });
    },
    
    cacheDOMElements() {
        // ... (ta funkcja pozostaje bez zmian)
    },

    bindEvents() {
        // ... (ta funkcja pozostaje bez zmian)
    },

    openIdentificationModal(identificationId = null) {
        // ... (fragment kodu bez zmian)
        
        // --- ZMIANA 1 ---
        // Zmieniono dostawcę mapy na ArcGIS World Imagery, aby pasował do sw.js
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(this.state.identificationMap);
        // --- KONIEC ZMIANY 1 ---
        
        // ... (reszta funkcji bez zmian)
    },

    async startOfflineMapDownload() {
        if (!this.state.identificationMap) {
            this.showMessage('Mapa nie jest jeszcze załadowana. Otwórz najpierw identyfikację w terenie.', 'warning');
            return;
        }

        const bounds = this.state.identificationMap.getBounds();
        const minZoom = this.config.offlineMap.minZoom;
        const maxZoom = this.config.offlineMap.maxZoom;
        
        this.toggleModal('offline-modal', true);
        this.elements.closeOfflineModalBtn.classList.add('hidden');
        this.elements.offlineStatus.textContent = 'Obliczanie listy kafelków do pobrania...';
        this.elements.offlineProgressBar.style.width = '0%';
        this.elements.offlineProgressBar.textContent = '0%';

        const tileUrls = [];
        for (let z = minZoom; z <= maxZoom; z++) {
            const tiles = this.getTilesInBounds(bounds, z);
            tiles.forEach(tile => {
                // --- ZMIANA 2 ---
                // Zaktualizowano URL, aby pobierać kafelki ArcGIS, zgodnie z konfiguracją sw.js
                tileUrls.push(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${tile.y}/${tile.x}`);
                // --- KONIEC ZMIANY 2 ---
            });
        }
        
        this.elements.offlineStatus.textContent = `Znaleziono ${tileUrls.length} kafelków do pobrania.`;

        try {
            // Nazwa cache musi być taka sama jak w sw.js dla zasobów dynamicznych
            const cache = await caches.open('kontrole-dynamic-v8'); 
            let downloadedCount = 0;

            for (const url of tileUrls) {
                try {
                    // Sprawdzamy, czy kafelek już jest w cache, aby uniknąć ponownego pobierania
                    const cachedResponse = await cache.match(url);
                    if (!cachedResponse) {
                        const response = await fetch(url);
                        if (response.ok) {
                            await cache.put(url, response);
                        }
                    }
                } catch (error) {
                    console.warn(`Nie udało się pobrać kafelka: ${url}`, error);
                }
                
                downloadedCount++;
                const progress = Math.round((downloadedCount / tileUrls.length) * 100);
                this.elements.offlineProgressBar.style.width = `${progress}%`;
                this.elements.offlineProgressBar.textContent = `${progress}%`;
                this.elements.offlineStatus.textContent = `Pobieranie... ${downloadedCount} / ${tileUrls.length}`;
            }
            
            this.elements.offlineStatus.textContent = `Pobieranie zakończone! Sprawdzono/zapisano ${tileUrls.length} kafelków.`;
            this.showMessage('Mapa została zapisana do użytku offline.', 'success');

        } catch (error) {
            this.elements.offlineStatus.textContent = 'Wystąpił błąd podczas pobierania.';
            this.showMessage('Błąd zapisu mapy offline.', 'error');
            console.error(error);
        } finally {
            this.elements.closeOfflineModalBtn.classList.remove('hidden');
        }
    },
    
    // ... i cała reszta Twoich funkcji (getTilesInBounds, downloadIdentificationPDF, saveControl etc.)
    // Wklej tutaj wszystkie pozostałe metody z obiektu App bez żadnych zmian.
};

document.addEventListener('DOMContentLoaded', () => App.init());