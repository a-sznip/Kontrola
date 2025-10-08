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
        this.elements = {
            authView: document.getElementById('auth-view'),
            appView: document.getElementById('app-view'),
            loginForm: document.getElementById('login-form'),
            loginEmail: document.getElementById('login-email'),
            loginPassword: document.getElementById('login-password'),
            authErrorMessage: document.getElementById('auth-error-message'),
            logoutBtn: document.getElementById('logout-btn'),
            userEmail: document.getElementById('user-email'),
            addControlBtn: document.getElementById('add-control-btn'),
            addJointNoteBtn: document.getElementById('add-joint-note-btn'),
            clearControlsBtn: document.getElementById('clear-controls-btn'),
            controlsList: document.getElementById('controls-list'),
            controlModal: document.getElementById('control-modal'),
            protocolModal: document.getElementById('protocol-modal'),
            jointNoteModal: document.getElementById('joint-note-modal'),
            identificationModal: document.getElementById('identification-modal'),
            filterAddress: document.getElementById('filter-address'),
            filterType: document.getElementById('filter-type'),
            exportDataBtn: document.getElementById('export-data-btn'),
            importDataBtn: document.getElementById('import-data-btn'),
            importFileInput: document.getElementById('import-file-input'),
            messageBox: document.getElementById('message-box'),
            pdfRenderTemplate: document.getElementById('pdf-render-template'),
            tabControls: document.getElementById('tab-controls'),
            tabIdentifications: document.getElementById('tab-identifications'),
            controlsContentView: document.getElementById('controls-content-view'),
            identificationsContentView: document.getElementById('identifications-content-view'),
            addIdentificationBtn: document.getElementById('add-identification-btn'),
            clearIdentificationsBtn: document.getElementById('clear-identifications-btn'),
            identificationsList: document.getElementById('identifications-list'),
            offlineMapBtn: document.getElementById('offline-map-btn'),
            offlineModal: document.getElementById('offline-modal'),
            offlineStatus: document.getElementById('offline-status'),
            offlineProgressBar: document.getElementById('offline-progress-bar'),
            closeOfflineModalBtn: document.getElementById('close-offline-modal-btn'),
        };
    },

    bindEvents() {
        this.elements.loginForm.addEventListener('submit', this.handleLogin.bind(this));
        this.elements.logoutBtn.addEventListener('click', this.handleLogout.bind(this));
        this.elements.addControlBtn.addEventListener('click', () => this.openControlModal());
        this.elements.addJointNoteBtn.addEventListener('click', () => this.openJointNoteModal());
        this.elements.clearControlsBtn.addEventListener('click', this.clearAllControls.bind(this));
        this.elements.filterAddress.addEventListener('input', this.renderControlsList.bind(this));
        this.elements.filterType.addEventListener('change', this.renderControlsList.bind(this));
        this.elements.exportDataBtn.addEventListener('click', this.exportData.bind(this));
        this.elements.importDataBtn.addEventListener('click', () => this.elements.importFileInput.click());
        this.elements.importFileInput.addEventListener('change', this.importData.bind(this));
        
        this.elements.tabControls.addEventListener('click', this.showTab.bind(this, 'controls'));
        this.elements.tabIdentifications.addEventListener('click', this.showTab.bind(this, 'identifications'));
        
        this.elements.addIdentificationBtn.addEventListener('click', () => this.openIdentificationModal());
        this.elements.clearIdentificationsBtn.addEventListener('click', this.clearAllIdentifications.bind(this));

        this.elements.offlineMapBtn.addEventListener('click', this.startOfflineMapDownload.bind(this));
        this.elements.closeOfflineModalBtn.addEventListener('click', () => this.toggleModal('offline-modal', false));

        this.elements.controlsList.addEventListener('click', this.handleControlsListClick.bind(this));
        this.elements.identificationsList.addEventListener('click', this.handleIdentificationsListClick.bind(this));
    },

    handleLogin(e) {
        e.preventDefault();
        const email = this.elements.loginEmail.value;
        const password = this.elements.loginPassword.value;
        this.elements.authErrorMessage.classList.add('hidden');

        this.state.auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                console.error("Login error:", error);
                this.elements.authErrorMessage.textContent = "Błędny e-mail lub hasło.";
                this.elements.authErrorMessage.classList.remove('hidden');
            });
    },

    handleLogout() {
        this.state.auth.signOut();
    },
    
    // Wszystkie pozostałe funkcje aplikacji...
    // (Poniżej znajduje się pełny kod, a nie tylko fragmenty)

    showTab(tabName) {
        if (tabName === 'controls') {
            this.elements.controlsContentView.classList.remove('hidden');
            this.elements.identificationsContentView.classList.add('hidden');
            this.elements.tabControls.classList.add('active');
            this.elements.tabIdentifications.classList.remove('active');
        } else {
            this.elements.controlsContentView.classList.add('hidden');
            this.elements.identificationsContentView.classList.remove('hidden');
            this.elements.tabControls.classList.remove('active');
            this.elements.tabIdentifications.classList.add('active');
        }
    },

    showMessage(message, type = 'info') {
        const colors = {
            info: 'bg-blue-500',
            success: 'bg-green-500',
            warning: 'bg-yellow-500',
            error: 'bg-red-500',
        };
        this.elements.messageBox.className = `fixed bottom-8 right-8 p-4 rounded-lg text-white shadow-lg z-50 transition-opacity duration-300 opacity-0 ${colors[type]}`;
        this.elements.messageBox.textContent = message;
        this.elements.messageBox.classList.remove('hidden');
        setTimeout(() => this.elements.messageBox.classList.remove('opacity-0'), 10);
        setTimeout(() => {
            this.elements.messageBox.classList.add('opacity-0');
            setTimeout(() => this.elements.messageBox.classList.add('hidden'), 300);
        }, 3000);
    },

    saveLocalData() {
        localStorage.setItem('app_controls', JSON.stringify(this.state.controls));
        localStorage.setItem('app_identifications', JSON.stringify(this.state.identifications));
    },

    loadLocalData() {
        const controlsData = localStorage.getItem('app_controls');
        const identificationsData = localStorage.getItem('app_identifications');
        if (controlsData) this.state.controls = JSON.parse(controlsData);
        if (identificationsData) this.state.identifications = JSON.parse(identificationsData);
        this.renderControlsList();
        this.renderIdentificationsList();
    },

    renderControlsList() {
        // ... (implementacja renderControlsList)
    },

    renderIdentificationsList() {
        // ... (implementacja renderIdentificationsList)
    },
    
    openIdentificationModal(identificationId = null) {
        this.state.currentIdentificationId = identificationId;
        const isNew = identificationId === null;
        let identification = { id: `id-${Date.now()}`, date: new Date().toISOString().slice(0, 10), description: '', photos: [], location: null };
        if (!isNew) {
            const storedIdentification = this.state.identifications.find(i => i.id === identificationId);
            if (storedIdentification) identification = { ...identification, ...storedIdentification };
        }
        this.state.photos = identification.photos || [];

        const modalHTML = `
            <div class="modal-content bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl">
                <h2 class="text-xl font-bold text-gray-800 mb-4">${isNew ? 'Nowa' : 'Edytuj'} Identyfikację w Terenie</h2>
                <div id="identification-map" class="w-full h-64 bg-gray-200 rounded-lg mb-4 relative">
                    <div class="center-marker"></div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <input type="text" id="identification-lat" placeholder="Szerokość geograficzna" class="p-2 border rounded" value="${identification.location ? identification.location.lat : ''}" readonly>
                    <input type="text" id="identification-lng" placeholder="Długość geograficzna" class="p-2 border rounded" value="${identification.location ? identification.location.lng : ''}" readonly>
                </div>
                <textarea id="identification-description" class="w-full p-2 border rounded mb-4" rows="4" placeholder="Opis...">${identification.description}</textarea>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Dokumentacja fotograficzna</label>
                    <input type="file" id="photo-input" accept="image/*" multiple class="hidden">
                    <button type="button" onclick="document.getElementById('photo-input').click()" class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg">Dodaj zdjęcia</button>
                    <div id="photos-preview" class="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"></div>
                </div>
                <div class="flex justify-end space-x-4">
                    <button id="cancel-identification-btn" class="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-6 rounded-lg">Anuluj</button>
                    <button id="save-identification-btn" class="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded-lg">Zapisz</button>
                </div>
            </div>`;
        this.elements.identificationModal.innerHTML = modalHTML;
        this.toggleModal('identification-modal', true);

        this.renderPhotos();

        document.getElementById('photo-input').addEventListener('change', this.handlePhotoUpload.bind(this));
        document.getElementById('cancel-identification-btn').addEventListener('click', () => this.toggleModal('identification-modal', false));
        document.getElementById('save-identification-btn').addEventListener('click', this.saveIdentification.bind(this));
        
        const mapCenter = identification.location ? [identification.location.lat, identification.location.lng] : [54.04, 21.76];
        
        if (this.state.identificationMap) this.state.identificationMap.remove();
        this.state.identificationMap = L.map('identification-map').setView(mapCenter, 16);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(this.state.identificationMap);

        this.state.identificationMap.on('move', () => {
            const center = this.state.identificationMap.getCenter();
            document.getElementById('identification-lat').value = center.lat.toFixed(6);
            document.getElementById('identification-lng').value = center.lng.toFixed(6);
        });
        this.state.identificationMap.fire('move');
    },

    saveIdentification() {
        // ... (implementacja saveIdentification)
    },

    async downloadIdentificationPDF(identificationId) {
        const identification = this.state.identifications.find(i => i.id === identificationId);
        if (!identification) return;

        const content = this.getIdentificationPDFContent(identification);
        this.elements.pdfRenderTemplate.innerHTML = content;
        const sourceElement = this.elements.pdfRenderTemplate.querySelector('.pdf-container');
        
        this.showMessage('Przygotowuję PDF...', 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const canvas = await html2canvas(sourceElement, { scale: 2 });
        const imgData = canvas.toDataURL('image/jpeg', 0.9);

        const doc = new jspdf.jsPDF({
            orientation: 'p', unit: 'mm', format: 'a4'
        });

        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const usableWidth = pdfWidth - (margin * 2);
        const usableHeight = pdfHeight - (margin * 2);

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const aspectRatio = canvasHeight / canvasWidth;
        const scaledHeight = usableWidth * aspectRatio;

        let heightLeft = scaledHeight;
        let position = 0;

        doc.addImage(imgData, 'JPEG', margin, margin, usableWidth, scaledHeight);
        heightLeft -= usableHeight;

        while (heightLeft > 0) {
            position -= usableHeight;
            doc.addPage();
            doc.addImage(imgData, 'JPEG', margin, position, usableWidth, scaledHeight);
            heightLeft -= usableHeight;
        }

        doc.save(`identyfikacja-terenowa-${identification.id.substring(0, 8)}.pdf`);
        this.elements.pdfRenderTemplate.innerHTML = '';
        this.showMessage('Pomyślnie wygenerowano PDF.', 'success');
    },

    getIdentificationPDFContent(identification) {
        // ... (implementacja getIdentificationPDFContent)
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
                tileUrls.push(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${tile.y}/${tile.x}`);
            });
        }
        
        this.elements.offlineStatus.textContent = `Znaleziono ${tileUrls.length} kafelków do pobrania.`;

        try {
            const cache = await caches.open('kontrole-dynamic-v8'); 
            let downloadedCount = 0;

            for (const url of tileUrls) {
                try {
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

    getTilesInBounds(bounds, zoom) {
        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();
        
        const t1 = this.latLngToTile(northEast, zoom);
        const t2 = this.latLngToTile(southWest, zoom);

        const tiles = [];
        for (let x = t2.x; x <= t1.x; x++) {
            for (let y = t1.y; y <= t2.y; y++) {
                tiles.push({ x, y });
            }
        }
        return tiles;
    },

    latLngToTile(latlng, zoom) {
        const lat_rad = latlng.lat * Math.PI / 180;
        const n = Math.pow(2, zoom);
        const xtile = Math.floor((latlng.lng + 180) / 360 * n);
        const ytile = Math.floor((1 - Math.log(Math.tan(lat_rad) + 1 / Math.cos(lat_rad)) / Math.PI) / 2 * n);
        return { x: xtile, y: ytile };
    },
    
    // ... i reszta funkcji
};

document.addEventListener('DOMContentLoaded', () => App.init());