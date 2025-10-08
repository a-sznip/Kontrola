const App = {
    config: {
        firebase: {
            apiKey: "AIzaSyDFCV_dXKnqOn8yYbCSWSayOijB90MABv4",
            authDomain: "kontrole-mzmgo.firebaseapp.com",
            projectId: "kontrole-mzmgo",
            storageBucket: "kontrole-mzmgo.firebasestorage.app",
            messagingSenderId: "735699938419",
            appId: "1:735699938419:web:a93e8015aa54a5ad910e06"
        },
        offlineMap: { minZoom: 13, maxZoom: 17 }
    },
    data: APP_DATA,
    state: {
        firebaseApp: null, auth: null, controls: [], identifications: [],
        currentControlId: null, identificationMap: null
    },
    elements: {},

    init() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker zarejestrowany:', reg))
                .catch(err => console.error('Błąd rejestracji Service Worker:', err));
        }
        try {
            this.state.firebaseApp = firebase.initializeApp(this.config.firebase);
            this.state.auth = firebase.auth();
        } catch (error) {
            console.error("Błąd inicjalizacji Firebase:", error);
            document.body.innerHTML = '<h1>Błąd krytyczny aplikacji</h1>';
            return;
        }
        this.cacheDOMElements();
        this.bindEvents();
        this.state.auth.onAuthStateChanged(user => {
            if (user) {
                this.elements.authView.style.display = 'none';
                this.elements.appView.style.display = 'block';
                this.elements.userEmail.textContent = user.email;
                this.loadLocalData();
            } else {
                this.elements.authView.style.display = 'flex';
                this.elements.appView.style.display = 'none';
            }
        });
    },
    
    cacheDOMElements() {
        const ids = [
            'authView', 'appView', 'loginForm', 'loginEmail', 'loginPassword',
            'authErrorMessage', 'logoutBtn', 'userEmail', 'addControlBtn',
            'clearControlsBtn', 'controlsList', 'controlModal',
            'protocolModal', 'identificationModal', 'filterAddress',
            'filterType', 'exportDataBtn', 'importDataBtn', 'importFileInput',
            'messageBox', 'pdfRenderTemplate', 'tabControls', 'tabIdentifications',
            'controlsContentView', 'identificationsContentView',
            'identificationsList', 'offlineMapBtn', 'offlineModal'
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
        this.elements.filterAddress.addEventListener('input', this.renderControlsList.bind(this));
        this.elements.filterType.addEventListener('change', this.renderControlsList.bind(this));
        this.elements.exportDataBtn.addEventListener('click', this.exportData.bind(this));
        this.elements.importDataBtn.addEventListener('click', () => this.elements.importFileInput.click());
        this.elements.importFileInput.addEventListener('change', this.importData.bind(this));
        this.elements.tabControls.addEventListener('click', () => this.showTab('controls'));
        this.elements.tabIdentifications.addEventListener('click', () => this.showTab('identifications'));
        this.elements.controlsList.addEventListener('click', this.handleControlsListClick.bind(this));
    },

    handleLogin(e) {
        e.preventDefault();
        const email = this.elements.loginEmail.value;
        const password = this.elements.loginPassword.value;
        this.state.auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                this.elements.authErrorMessage.textContent = "Błędny e-mail lub hasło.";
            });
    },

    handleLogout() { this.state.auth.signOut(); },

    showTab(tabName) {
        const isControls = tabName === 'controls';
        this.elements.controlsContentView.style.display = isControls ? 'block' : 'none';
        this.elements.identificationsContentView.style.display = isControls ? 'none' : 'block';
        this.elements.tabControls.classList.toggle('active', isControls);
        this.elements.tabIdentifications.classList.toggle('active', !isControls);
    },
    
    loadLocalData() {
        const controlsData = localStorage.getItem('app_controls');
        this.state.controls = controlsData ? JSON.parse(controlsData) : [];
        this.renderControlsList();
    },

    saveLocalData() {
        localStorage.setItem('app_controls', JSON.stringify(this.state.controls));
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
                el.innerHTML = `<div><p class="font-bold text-lg">${c.street} ${c.number}</p><p class="text-sm text-gray-600">${c.city}</p></div><div class="flex space-x-2"><button data-action="edit" data-id="${c.id}" class="bg-yellow-500 text-white p-2 rounded-lg text-sm">Edytuj</button><button data-action="delete" data-id="${c.id}" class="bg-red-500 text-white p-2 rounded-lg text-sm">Usuń</button></div>`;
                this.elements.controlsList.appendChild(el);
            });
    },

    handleControlsListClick(event) {
        const btn = event.target.closest('button');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit') this.openControlModal(id);
        if (action === 'delete') this.deleteControl(id);
    },

    openControlModal(controlId = null) {
        this.state.currentControlId = controlId;
        const isNew = !controlId;
        const control = isNew ? { id: `ctrl-${Date.now()}`, type: 'planowa', city: '', street: '', number: '' } : this.state.controls.find(c => c.id === controlId);
        
        this.elements.controlModal.innerHTML = `<div class="modal-content bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg"><h2 class="text-xl font-bold mb-4">${isNew ? 'Nowa' : 'Edytuj'} Kontrolę</h2><div class="space-y-4"><div><label>Typ</label><select id="control-type" class="mt-1 block w-full p-2 border rounded-md"><option value="planowa" ${control.type === 'planowa' ? 'selected' : ''}>Planowa</option><option value="interwencyjna" ${control.type === 'interwencyjna' ? 'selected' : ''}>Interwencyjna</option></select></div><div><label>Miejscowość</label><input type="text" id="control-city" value="${control.city}" class="mt-1 block w-full p-2 border rounded-md"></div><div><label>Ulica</label><input type="text" id="control-street" value="${control.street}" class="mt-1 block w-full p-2 border rounded-md"></div><div><label>Numer</label><input type="text" id="control-number" value="${control.number}" class="mt-1 block w-full p-2 border rounded-md"></div></div><div class="flex justify-end space-x-4 mt-6"><button id="cancel-control-btn" class="bg-gray-500 text-white py-2 px-6 rounded-lg">Anuluj</button><button id="save-control-btn" class="bg-blue-600 text-white py-2 px-6 rounded-lg">Zapisz</button></div></div>`;
        this.toggleModal('controlModal', true);
        document.getElementById('cancel-control-btn').addEventListener('click', () => this.toggleModal('controlModal', false));
        document.getElementById('save-control-btn').addEventListener('click', this.saveControl.bind(this));
    },
    
    saveControl() {
        const isNew = !this.state.currentControlId;
        const controlData = {
            id: isNew ? `ctrl-${Date.now()}` : this.state.currentControlId,
            type: document.getElementById('control-type').value,
            city: document.getElementById('control-city').value,
            street: document.getElementById('control-street').value,
            number: document.getElementById('control-number').value
        };
        if (isNew) this.state.controls.push(controlData);
        else {
            const index = this.state.controls.findIndex(c => c.id === this.state.currentControlId);
            if (index > -1) this.state.controls[index] = controlData;
        }
        this.saveLocalData();
        this.renderControlsList();
        this.toggleModal('controlModal', false);
    },

    deleteControl(controlId) {
        if (confirm('Na pewno usunąć?')) {
            this.state.controls = this.state.controls.filter(c => c.id !== controlId);
            this.saveLocalData();
            this.renderControlsList();
        }
    },
    
    exportData() {
        const dataStr = JSON.stringify({ controls: this.state.controls });
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
                if (data.controls) {
                    this.state.controls = data.controls;
                    this.saveLocalData();
                    this.renderControlsList();
                }
            } catch (err) { console.error("Błąd importu", err); }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());