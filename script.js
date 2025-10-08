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
        unionSignaturePad: null,
        partiesSignaturePad: null,
        jointNoteSignaturePad: null,
        identificationMap: null,
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
            // Handle critical error
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

    // --- AUTH FUNCTIONS ---
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

    // --- UI & TABS ---
    showTab(tabName) {
        if (tabName === 'controls') {
            this.elements.controlsContentView.classList.remove('hidden');
            this.elements.identificationsContentView.classList.add('hidden');
            this.elements.tabControls.classList.add('active');
            this.elements.tabIdentifications.classList.remove('active');
        } else {
            this.elements.controlsContentView.classList.add('hidden');
            this.elements.identificationsContentView.remove('hidden');
            this.elements.tabControls.classList.remove('active');
            this.elements.tabIdentifications.classList.add('active');
        }
    },
    
    toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if (show) {
            modal.classList.remove('invisible', 'opacity-0');
            modal.classList.add('open');
        } else {
            modal.classList.add('invisible', 'opacity-0');
            modal.classList.remove('open');
        }
    },

    showMessage(message, type = 'info') {
        const colors = {
            info: 'bg-blue-500', success: 'bg-green-500',
            warning: 'bg-yellow-500', error: 'bg-red-500',
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

    // --- DATA HANDLING ---
    saveLocalData() {
        localStorage.setItem('app_controls', JSON.stringify(this.state.controls));
        localStorage.setItem('app_identifications', JSON.stringify(this.state.identifications));
    },

    loadLocalData() {
        const controlsData = localStorage.getItem('app_controls');
        const identificationsData = localStorage.getItem('app_identifications');
        this.state.controls = controlsData ? JSON.parse(controlsData) : [];
        this.state.identifications = identificationsData ? JSON.parse(identificationsData) : [];
        this.renderControlsList();
        this.renderIdentificationsList();
    },

    exportData() {
        const data = {
            controls: this.state.controls,
            identifications: this.state.identifications,
            exportDate: new Date().toISOString()
        };
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kontrole-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showMessage('Dane zostały wyeksportowane.', 'success');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.controls && data.identifications) {
                    this.state.controls = data.controls;
                    this.state.identifications = data.identifications;
                    this.saveLocalData();
                    this.renderControlsList();
                    this.renderIdentificationsList();
                    this.showMessage('Dane zostały zaimportowane.', 'success');
                } else {
                    this.showMessage('Nieprawidłowy format pliku.', 'error');
                }
            } catch (error) {
                this.showMessage('Błąd podczas odczytu pliku.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Clear input
    },

    // --- CONTROLS ---
    renderControlsList() {
        const filterText = this.elements.filterAddress.value.toLowerCase();
        const filterType = this.elements.filterType.value;
        this.elements.controlsList.innerHTML = '';
        this.state.controls
            .filter(control => {
                const address = `${control.street} ${control.number}, ${control.city}`.toLowerCase();
                const typeMatch = !filterType || control.type === filterType;
                return address.includes(filterText) && typeMatch;
            })
            .forEach(control => {
                const controlEl = document.createElement('div');
                controlEl.className = 'bg-gray-100 p-4 rounded-lg flex justify-between items-center shadow-sm';
                controlEl.innerHTML = `
                    <div>
                        <p class="font-bold text-lg">${control.street} ${control.number}</p>
                        <p class="text-sm text-gray-600">${control.city}, ${control.zipCode}</p>
                        <p class="text-xs text-gray-500 mt-1">Typ: ${control.type || 'nieokreślony'}</p>
                    </div>
                    <div class="flex space-x-2">
                        <button data-action="protocol" data-id="${control.id}" class="bg-green-500 hover:bg-green-600 text-white p-2 rounded-lg text-sm">Protokół</button>
                        <button data-action="edit" data-id="${control.id}" class="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg text-sm">Edytuj</button>
                        <button data-action="delete" data-id="${control.id}" class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg text-sm">Usuń</button>
                    </div>
                `;
                this.elements.controlsList.appendChild(controlEl);
            });
    },
    
    handleControlsListClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit') this.openControlModal(id);
        if (action === 'delete') this.deleteControl(id);
        if (action === 'protocol') this.openProtocolModal(id);
    },

    openControlModal(controlId = null) {
        // Implementation for opening control modal
    },
    
    deleteControl(controlId) {
        if (confirm('Czy na pewno chcesz usunąć tę kontrolę?')) {
            this.state.controls = this.state.controls.filter(c => c.id !== controlId);
            this.saveLocalData();
            this.renderControlsList();
            this.showMessage('Kontrola usunięta.', 'success');
        }
    },

    clearAllControls() {
        if (confirm('CZY NA PEWNO CHCESZ USUNĄĆ WSZYSTKIE KONTROLE? Tej operacji nie można cofnąć!')) {
            this.state.controls = [];
            this.saveLocalData();
            this.renderControlsList();
            this.showMessage('Wszystkie kontrole zostały usunięte.', 'warning');
        }
    },
    
    // --- IDENTIFICATIONS ---
    renderIdentificationsList() {
        this.elements.identificationsList.innerHTML = '';
        this.state.identifications.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'bg-gray-100 p-4 rounded-lg flex justify-between items-center shadow-sm';
            itemEl.innerHTML = `
                <div>
                    <p class="font-bold text-lg">${item.description.substring(0, 50)}...</p>
                    <p class="text-sm text-gray-600">Data: ${item.date}</p>
                    <p class="text-xs text-gray-500 mt-1">Zdjęć: ${item.photos.length}</p>
                </div>
                <div class="flex space-x-2">
                    <button data-action="pdf" data-id="${item.id}" class="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg text-sm">PDF</button>
                    <button data-action="edit" data-id="${item.id}" class="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg text-sm">Edytuj</button>
                    <button data-action="delete" data-id="${item.id}" class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg text-sm">Usuń</button>
                </div>
            `;
            this.elements.identificationsList.appendChild(itemEl);
        });
    },
    
    handleIdentificationsListClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit') this.openIdentificationModal(id);
        if (action === 'delete') this.deleteIdentification(id);
        if (action === 'pdf') this.downloadIdentificationPDF(id);
    },

    openIdentificationModal(identificationId = null) {
        this.state.currentIdentificationId = identificationId;
        const isNew = identificationId === null;
        let identification = { id: `id-${Date.now()}`, date: new Date().toISOString().slice(0, 10), description: '', photos: [], location: null };
        if (!isNew) {
            const stored = this.state.identifications.find(i => i.id === identificationId);
            if (stored) identification = { ...identification, ...stored };
        }
        this.state.photos = identification.photos || [];

        const modalHTML = `...`; // Full HTML for the modal
        this.elements.identificationModal.innerHTML = modalHTML;
        this.toggleModal('identification-modal', true);

        // Map initialization
        const mapCenter = identification.location ? [identification.location.lat, identification.location.lng] : [54.04, 21.76];
        if (this.state.identificationMap) this.state.identificationMap.remove();
        this.state.identificationMap = L.map('identification-map').setView(mapCenter, 16);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        }).addTo(this.state.identificationMap);

        this.state.identificationMap.on('move', () => {
            const center = this.state.identificationMap.getCenter();
            document.getElementById('identification-lat').value = center.lat.toFixed(6);
            document.getElementById('identification-lng').value = center.lng.toFixed(6);
        });
        this.state.identificationMap.fire('move');
    },

    deleteIdentification(id) {
        if (confirm('Czy na pewno chcesz usunąć tę identyfikację?')) {
            this.state.identifications = this.state.identifications.filter(i => i.id !== id);
            this.saveLocalData();
            this.renderIdentificationsList();
            this.showMessage('Identyfikacja usunięta.', 'success');
        }
    },

    clearAllIdentifications() {
         if (confirm('CZY NA PEWNO CHCESZ USUNĄĆ WSZYSTKIE IDENTYFIKACJE?')) {
            this.state.identifications = [];
            this.saveLocalData();
            this.renderIdentificationsList();
            this.showMessage('Wszystkie identyfikacje zostały usunięte.', 'warning');
        }
    },

    async downloadIdentificationPDF(id) {
        // PDF generation logic here
    },

    // --- OFFLINE MAP ---
    async startOfflineMapDownload() {
        // Offline map download logic here
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
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());