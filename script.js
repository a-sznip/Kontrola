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
        photo: { maxWidth: 1024, jpegQuality: 0.8 },
        offlineMap: { minZoom: 13, maxZoom: 17 }
    },
    data: APP_DATA,
    state: {
        firebaseApp: null, auth: null, controls: [], identifications: [],
        currentControlId: null, currentIdentificationId: null, photos: [],
        unionSignaturePad: null, partiesSignaturePad: null, jointNoteSignaturePad: null,
        identificationMap: null
    },
    elements: {},

    init() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker zarejestrowany:', reg))
                .catch(err => console.log('Błąd rejestracji Service Worker:', err));
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
        const ids = [
            'authView', 'appView', 'loginForm', 'loginEmail', 'loginPassword',
            'authErrorMessage', 'logoutBtn', 'userEmail', 'addControlBtn',
            'addJointNoteBtn', 'clearControlsBtn', 'controlsList', 'controlModal',
            'protocolModal', 'jointNoteModal', 'identificationModal', 'filterAddress',
            'filterType', 'exportDataBtn', 'importDataBtn', 'importFileInput',
            'messageBox', 'pdfRenderTemplate', 'tabControls', 'tabIdentifications',
            'controlsContentView', 'identificationsContentView', 'addIdentificationBtn',
            'clearIdentificationsBtn', 'identificationsList', 'offlineMapBtn',
            'offlineModal', 'offlineStatus', 'offlineProgressBar', 'closeOfflineModalBtn'
        ];
        ids.forEach(id => {
            const camelCaseId = id.replace(/-[a-z]/g, g => g.substring(1).toUpperCase());
            this.elements[camelCaseId] = document.getElementById(id);
        });
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
                this.elements.authErrorMessage.textContent = "Błędny e-mail lub hasło.";
                this.elements.authErrorMessage.classList.remove('hidden');
            });
    },

    handleLogout() { this.state.auth.signOut(); },

    showTab(tabName) {
        const isControls = tabName === 'controls';
        this.elements.controlsContentView.classList.toggle('hidden', !isControls);
        this.elements.identificationsContentView.classList.toggle('hidden', isControls);
        this.elements.tabControls.classList.toggle('active', isControls);
        this.elements.tabIdentifications.classList.toggle('active', !isControls);
    },

    toggleModal(modalId, show) {
        const modal = this.elements[modalId.replace(/-/g, '')];
        if (show) {
            modal.classList.remove('invisible', 'opacity-0');
            modal.classList.add('open');
        } else {
            modal.classList.add('invisible', 'opacity-0');
            modal.classList.remove('open');
        }
    },

    saveLocalData() {
        localStorage.setItem('app_controls', JSON.stringify(this.state.controls));
        localStorage.setItem('app_identifications', JSON.stringify(this.state.identifications));
    },

    loadLocalData() {
        const controlsData = localStorage.getItem('app_controls');
        const identsData = localStorage.getItem('app_identifications');
        this.state.controls = controlsData ? JSON.parse(controlsData) : [];
        this.state.identifications = identsData ? JSON.parse(identsData) : [];
        this.renderControlsList();
        this.renderIdentificationsList();
    },
    
    renderControlsList() {
        const filterText = this.elements.filterAddress.value.toLowerCase();
        const filterType = this.elements.filterType.value;
        this.elements.controlsList.innerHTML = '';
        this.state.controls
            .filter(c => ((`${c.street} ${c.number}, ${c.city}`).toLowerCase().includes(filterText)) && (!filterType || c.type === filterType))
            .forEach(c => {
                const el = document.createElement('div');
                el.className = 'bg-gray-100 p-4 rounded-lg flex justify-between items-center shadow-sm';
                el.innerHTML = `<div><p class="font-bold text-lg">${c.street} ${c.number}</p><p class="text-sm text-gray-600">${c.city}, ${c.zipCode}</p><p class="text-xs text-gray-500 mt-1">Typ: ${c.type || 'nieokreślony'}</p></div><div class="flex space-x-2"><button data-action="protocol" data-id="${c.id}" class="bg-green-500 hover:bg-green-600 text-white p-2 rounded-lg text-sm">Protokół</button><button data-action="edit" data-id="${c.id}" class="bg-yellow-500 hover:bg-yellow-600 text-white p-2 rounded-lg text-sm">Edytuj</button><button data-action="delete" data-id="${c.id}" class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg text-sm">Usuń</button></div>`;
                this.elements.controlsList.appendChild(el);
            });
    },
    
    handleControlsListClick(event) {
        const btn = event.target.closest('button');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit') this.openControlModal(id);
        if (action === 'delete') this.deleteControl(id);
        if (action === 'protocol') this.openProtocolModal(id);
    },

    openControlModal(controlId = null) {
        this.state.currentControlId = controlId;
        const isNew = !controlId;
        const control = isNew ? { id: `ctrl-${Date.now()}`, date: new Date().toISOString().slice(0, 10), type: 'planowa', gmina: '', city: '', street: '', number: '', zipCode: '' } : this.state.controls.find(c => c.id === controlId);
        
        this.elements.controlModal.innerHTML = `<div class="modal-content bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg"><h2 class="text-xl font-bold text-gray-800 mb-4">${isNew ? 'Nowa' : 'Edytuj'} Kontrolę</h2><div class="space-y-4"><div><label class="block text-sm font-medium text-gray-700">Typ</label><select id="control-type" class="mt-1 block w-full p-2 border rounded-md"><option value="planowa" ${control.type === 'planowa' ? 'selected' : ''}>Planowa</option><option value="interwencyjna" ${control.type === 'interwencyjna' ? 'selected' : ''}>Interwencyjna</option></select></div><div><label class="block text-sm font-medium text-gray-700">Miejscowość</label><input type="text" id="control-city" value="${control.city}" class="mt-1 block w-full p-2 border rounded-md"></div><div><label class="block text-sm font-medium text-gray-700">Ulica</label><input type="text" id="control-street" value="${control.street}" class="mt-1 block w-full p-2 border rounded-md"></div><div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700">Numer</label><input type="text" id="control-number" value="${control.number}" class="mt-1 block w-full p-2 border rounded-md"></div><div><label class="block text-sm font-medium text-gray-700">Kod pocztowy</label><input type="text" id="control-zipCode" value="${control.zipCode}" class="mt-1 block w-full p-2 border rounded-md"></div></div></div><div class="flex justify-end space-x-4 mt-6"><button id="cancel-control-btn" class="bg-gray-500 text-white py-2 px-6 rounded-lg">Anuluj</button><button id="save-control-btn" class="bg-blue-600 text-white py-2 px-6 rounded-lg">Zapisz</button></div></div>`;
        this.toggleModal('control-modal', true);
        document.getElementById('cancel-control-btn').addEventListener('click', () => this.toggleModal('control-modal', false));
        document.getElementById('save-control-btn').addEventListener('click', this.saveControl.bind(this));
    },
    
    saveControl() {
        const isNew = !this.state.currentControlId;
        const controlData = {
            id: isNew ? `ctrl-${Date.now()}` : this.state.currentControlId,
            date: new Date().toISOString().slice(0, 10),
            type: document.getElementById('control-type').value,
            city: document.getElementById('control-city').value,
            street: document.getElementById('control-street').value,
            number: document.getElementById('control-number').value,
            zipCode: document.getElementById('control-zipCode').value
        };
        if (isNew) this.state.controls.push(controlData);
        else {
            const index = this.state.controls.findIndex(c => c.id === this.state.currentControlId);
            if (index > -1) this.state.controls[index] = controlData;
        }
        this.saveLocalData();
        this.renderControlsList();
        this.toggleModal('control-modal', false);
    },

    deleteControl(controlId) {
        if (confirm('Czy na pewno chcesz usunąć tę kontrolę?')) {
            this.state.controls = this.state.controls.filter(c => c.id !== controlId);
            this.saveLocalData();
            this.renderControlsList();
        }
    },
    
    clearAllControls() {
        if (confirm('JESTEŚ PEWIEN? To usunie WSZYSTKIE kontrole nieodwracalnie!')) {
            this.state.controls = [];
            this.saveLocalData();
            this.renderControlsList();
        }
    },

    openJointNoteModal() {
        this.elements.jointNoteModal.innerHTML = `<div class="modal-content bg-white rounded-xl p-6 w-full max-w-lg"><h2 class="text-xl font-bold mb-4">Notatka Służbowa</h2><p>Ta funkcja jest w budowie.</p><div class="flex justify-end mt-6"><button id="cancel-joint-note-btn" class="bg-gray-500 text-white py-2 px-6 rounded-lg">Zamknij</button></div></div>`;
        this.toggleModal('joint-note-modal', true);
        document.getElementById('cancel-joint-note-btn').addEventListener('click', () => this.toggleModal('joint-note-modal', false));
    },
    
    openProtocolModal(controlId) {
        this.elements.protocolModal.innerHTML = `<div class="modal-content bg-white rounded-xl p-6 w-full max-w-lg"><h2 class="text-xl font-bold mb-4">Protokół</h2><p>Ta funkcja jest w budowie.</p><div class="flex justify-end mt-6"><button id="cancel-protocol-btn" class="bg-gray-500 text-white py-2 px-6 rounded-lg">Zamknij</button></div></div>`;
        this.toggleModal('protocol-modal', true);
        document.getElementById('cancel-protocol-btn').addEventListener('click', () => this.toggleModal('protocol-modal', false));
    },

    // --- IDENTIFICATIONS (stubs for now) ---
    renderIdentificationsList() { /* Needs implementation */ },
    handleIdentificationsListClick(event) { /* Needs implementation */ },
    openIdentificationModal(id = null) { /* Needs implementation */ },
    clearAllIdentifications() { /* Needs implementation */ },
    startOfflineMapDownload() { /* Needs implementation */ },
    
    // --- DATA IMPORT/EXPORT ---
    exportData() {
        const dataStr = JSON.stringify({ controls: this.state.controls, identifications: this.state.identifications });
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.controls || data.identifications) {
                    this.state.controls = data.controls || [];
                    this.state.identifications = data.identifications || [];
                    this.saveLocalData();
                    this.loadLocalData();
                }
            } catch (err) { console.error("Błąd importu", err); }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());