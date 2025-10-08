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

    // --- DODANA BRAKUJĄCA FUNKCJA ---
    handleControlsListClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit') this.openControlModal(id);
        if (action === 'delete') this.deleteControl(id);
        if (action === 'protocol') this.openProtocolModal(id); // Ta funkcja też wymaga implementacji
    },
    
    // --- DODANA BRAKUJĄCA FUNKCJA ---
    handleIdentificationsListClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit') this.openIdentificationModal(id);
        if (action === 'delete') this.deleteIdentification(id);
        if (action === 'pdf') this.downloadIdentificationPDF(id);
    },

    // --- Reszta funkcji (wiele z nich jest teraz kompletnych) ---
    handleLogin(e) {
        e.preventDefault();
        const email = this.elements.loginEmail.value;
        const password = this.elements.loginPassword.value;
        this.elements.authErrorMessage.classList.add('hidden');
        this.state.auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                this.elements.authErrorMessage.textContent = "Błędny e-mail lub hasło.";
                this.elements.authErrorMessage.classList.remove('hidden');
            });
    },

    handleLogout() {
        this.state.auth.signOut();
    },

    showTab(tabName) {
        const isControls = tabName === 'controls';
        this.elements.controlsContentView.classList.toggle('hidden', !isControls);
        this.elements.identificationsContentView.classList.toggle('hidden', isControls);
        this.elements.tabControls.classList.toggle('active', isControls);
        this.elements.tabIdentifications.classList.toggle('active', !isControls);
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
    
    openControlModal(controlId = null) {
        // Implementacja tej funkcji już istnieje z poprzedniej odpowiedzi...
    },

    openJointNoteModal() {
        // Implementacja tej funkcji już istnieje z poprzedniej odpowiedzi...
    },
    
    // ... i wszystkie pozostałe funkcje, które już zaimplementowaliśmy ...
};

document.addEventListener('DOMContentLoaded', () => App.init());