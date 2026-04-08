// inte13.js
// Główny silnik logiczny panelu Kontrolera (Mapy Offline, GUGiK, OCR, PWA)
// Wersja v2.3 - Odporna na awarie ładowania plików zewnętrznych (Defensive Programming)

// =========================================================================================
// 1. AUTORYZACJA ZERO TRUST I KOMUNIKACJA Z SERWEREM
// =========================================================================================
const authToken = localStorage.getItem('ecoToken');
const userName = localStorage.getItem('user');

if(!userName || !authToken) {
    window.location.assign('login.html');
}

const isOfflineMode = (authToken === 'offline_mode');

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('ecoToken');
    window.location.assign('login.html');
}

async function secureFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        alert("Sesja wygasła. Ze względów bezpieczeństwa zaloguj się ponownie.");
        logout();
        throw new Error("Brak autoryzacji");
    }
    return res;
}

async function base64ToBlob(base64) {
    const res = await fetch(base64);
    return await res.blob();
}

// =========================================================================================
// 2. DANE STAŁE, DYNAMICZNE SŁOWNIKI I SYNCHRONIZACJA (Bezpieczne ładowanie)
// =========================================================================================
const safeData = typeof APP_DATA !== 'undefined' ? APP_DATA : {};
const ulice = safeData.ulice || [];
const miejscowosciByGmina = safeData.miejscowosciByGmina || {};
const zipCodesByCity = safeData.zipCodesByCity || {};
let availableParticipants = safeData.availableParticipants || [];
const defaultOfflineInspectors = safeData.availableParticipants || [];
const noteDatabase = safeData.noteDatabase || [];

async function loadApiPoints() {
    if (isOfflineMode) return; 
    try {
        const res = await secureFetch('/api/points');
        const API_POINTS = await res.json();
        
        const streetSet = new Set(ulice);
        API_POINTS.forEach(p => {
            if(p.adres) {
                const parts = p.adres.split(',');
                if(parts.length > 1) streetSet.add(parts[0].replace(/[0-9a-zA-Z\/]+$/, '').trim());
            }
        });
        
        ulice.length = 0;
        streetSet.forEach(s => { if(s.length > 2) ulice.push(s); });
        renderDatalists();
    } catch(e) {
        console.warn("Zignorowano: Nie udało się pobrać dynamicznej bazy adresowej.");
    }
}

async function fetchInspectors() {
    if (isOfflineMode) {
        console.log("Tryb Offline (GitHub): Ładuję słownik z cache lub wartości domyślne.");
        availableParticipants = JSON.parse(localStorage.getItem('eco_inspectors_cache')) || defaultOfflineInspectors;
        return;
    }

    try {
        const res = await secureFetch('/api/settings/inspectors');
        const data = await res.json();
        const names = data.map(i => i.nazwa);
        localStorage.setItem('eco_inspectors_cache', JSON.stringify(names));
        availableParticipants = names;
    } catch(e) {
        console.warn("Błąd pobierania słownika: Ładowanie z pamięci telefonu.");
        availableParticipants = JSON.parse(localStorage.getItem('eco_inspectors_cache')) || defaultOfflineInspectors;
    }
}

// =========================================================================================
// 3. IMPLEMENTACJA WARSTWY MAP OFFLINE (Zabezpieczenie przed brakiem Leafleta)
// =========================================================================================
let offlineSatelliteLayer, parcelsBoundariesLayer, parcelsNumbersLayer;
const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const parcelsUrl = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';

if (typeof L !== 'undefined') {
    L.TileLayer.LocalCache = L.TileLayer.extend({
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            tile.onload = function () { done(null, tile); };
            tile.onerror = function () { done('Błąd ładowania kafelka', tile); };

            const tileUrl = this.getTileUrl(coords);
            const tileKey = `tile-${this.options.layerId}-${coords.z}-${coords.x}-${coords.y}`;

            if (typeof localforage !== 'undefined') {
                localforage.getItem(tileKey).then(dataUrl => {
                    tile.src = dataUrl || tileUrl;
                }).catch(err => {
                    console.warn('Błąd odczytu z localforage:', err);
                    tile.src = tileUrl;
                });
            } else {
                tile.src = tileUrl;
            }
            return tile;
        }
    });

    L.tileLayer.localCache = function (url, options) { return new L.TileLayer.LocalCache(url, options); };

    L.TileLayer.WMS.LocalCache = L.TileLayer.WMS.extend({
        createTile: function (coords, done) {
            const tile = document.createElement('img');
            tile.onload = function () { done(null, tile); };
            tile.onerror = function () { done('Błąd ładowania kafelka WMS', tile); };

            const tileUrl = this.getTileUrl(coords);
            const tileKey = `tile-${this.options.layerId}-${coords.z}-${coords.x}-${coords.y}`;

            if (typeof localforage !== 'undefined') {
                localforage.getItem(tileKey).then(dataUrl => {
                    tile.src = dataUrl || tileUrl;
                }).catch(err => {
                    console.warn('Błąd odczytu WMS z localforage:', err);
                    tile.src = tileUrl;
                });
            } else {
                tile.src = tileUrl;
            }
            return tile;
        }
    });

    L.tileLayer.wms.localCache = function (url, options) { return new L.TileLayer.WMS.LocalCache(url, options); };

    offlineSatelliteLayer = L.tileLayer.localCache(satelliteUrl, {
        attribution: 'Tiles &copy; Esri', crossOrigin: true, layerId: 'satellite', maxZoom: 20, maxNativeZoom: 18
    });

    parcelsBoundariesLayer = L.tileLayer.wms.localCache(parcelsUrl, {
        layers: 'dzialki', format: 'image/png', transparent: true, attribution: 'GUGiK', layerId: 'parcels-boundaries'
    });

    parcelsNumbersLayer = L.tileLayer.wms.localCache(parcelsUrl, {
        layers: 'numery_dzialek', format: 'image/png', transparent: true, attribution: 'GUGiK', layerId: 'parcels-numbers', minZoom: 17 
    });
} else {
    console.warn("Błąd: Biblioteka Leaflet nie została załadowana. Mapy terenowe będą niedostępne.");
}


// =========================================================================================
// 4. ZMIENNE GLOBALNE I DOM
// =========================================================================================
let controls = []; 
let identifications = [];
let bulkIdentifications = [];
let currentControlId = null;
let currentIdentificationId = null;
let photos = []; 
let currentProtocol;
let unionSignaturePad, partiesSignaturePad, jointNoteSignaturePad;
let identificationMap, bulkIdentificationMap, bulkIdentificationMarkersLayer, bulkAccuracyCircle, bulkMyLocationMarker;

let isAddingBulkPoint = false;
let currentBulkPointCoords = null;
let currentBulkMapScreenshot = null;

let selectionMap, drawControl, selectedLayer;


// =========================================================================================
// 5. NARZĘDZIA POMOCNICZE (UTILITIES)
// =========================================================================================
function showMessage(message, type = 'info') {
    const box = document.getElementById('message-box');
    if(!box) return;
    box.textContent = message;
    box.className = `fixed bottom-8 right-8 p-4 rounded-lg text-white shadow-lg z-50 transition-opacity duration-300 opacity-100 block ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`;
    setTimeout(() => {
        box.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => box.classList.add('hidden'), 300);
    }, 3000);
}

function getFullAddress(control) { return `${control.street} ${control.houseNumber}, ${control.city} ${control.zip}`; }
function formatType(type) { return type === 'planowa' ? 'Planowa' : 'Interwencyjna'; }
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL') + ' ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit'});
}
function getTimestampForFilename() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

function saveLocalControls() { localStorage.setItem('localControls', JSON.stringify(controls)); }
function saveLocalIdentifications() { localStorage.setItem('localIdentifications', JSON.stringify(identifications)); }
function saveLocalBulkIdentifications() { localStorage.setItem('localBulkIdentifications', JSON.stringify(bulkIdentifications)); }
function getSavedMapsMetadata() { return JSON.parse(localStorage.getItem('offlineMapsMetadata')) || []; }
function saveMapsMetadata(metadata) { localStorage.setItem('offlineMapsMetadata', JSON.stringify(metadata)); }


// =========================================================================================
// 6. SYNCHRONIZACJA Z URZĘDEM GMINY (MOSTY TRANSMISYJNE)
// =========================================================================================
async function sendProtocolToCentral(controlId) {
    if (isOfflineMode) return; 

    const control = controls.find(c => c.id === controlId);
    if (!control || !control.protocol) return;

    const btn = document.getElementById(`send-btn-${controlId}`);
    if(btn) { btn.disabled = true; btn.innerText = "Wysyłanie..."; }

    const fd = new FormData();
    fd.append('adres', getFullAddress(control));
    fd.append('wlasciciel', control.protocol.parties || 'Podmiot kontrolowany');
    fd.append('typ', 'PROTOKOL_KONTROLI');
    fd.append('kategoria', control.type.toUpperCase());
    fd.append('uwagi', control.protocol.findings || 'Brak uwag w protokole.');

    if (control.protocol.photos && control.protocol.photos.length > 0) {
        for (let i = 0; i < control.protocol.photos.length; i++) {
            try {
                const blob = await base64ToBlob(control.protocol.photos[i].url);
                fd.append('zdjecia', blob, `photo_${controlId}_${i}.jpg`);
            } catch(e) { console.warn("Błąd konwersji zdjęcia:", e); }
        }
    }

    try {
        const res = await secureFetch('/api/inspector/zglos', { method: 'POST', body: fd });
        const data = await res.json();
        if(data.success) {
            control.sentToCentral = true;
            saveLocalControls();
            renderControls();
            showMessage("Pomyślnie wysłano protokół do Urzędu Gminy!", "success");
        } else {
            showMessage("Odmowa serwera: " + data.error, "error");
            if(btn) { btn.disabled = false; btn.innerText = "☁️ Wyślij do Urzędu"; }
        }
    } catch (e) {
        showMessage("Błąd sieci podczas wysyłania: " + e.message, "error");
        if(btn) { btn.disabled = false; btn.innerText = "☁️ Wyślij do Urzędu"; }
    }
}

async function sendIdentificationToCentral(id) {
    if (isOfflineMode) return;

    const item = identifications.find(i => i.id === id);
    if (!item) return;

    const btn = document.getElementById(`send-ident-btn-${id}`);
    if(btn) { btn.disabled = true; btn.innerText = "Wysyłanie..."; }

    const fd = new FormData();
    fd.append('adres', item.fullAddress || item.plotNumber || `Współrzędne GPS: ${item.latitude}, ${item.longitude}`);
    fd.append('wlasciciel', 'Weryfikacja terenowa (Działka)');
    fd.append('typ', 'NOTATKA_SLUZBOWA');
    fd.append('kategoria', 'IDENTYFIKACJA_TERENOWA');
    
    let notatki = `Działka: ${item.plotNumber || 'Brak danych z GUGiK'}\nGPS: ${item.latitude}, ${item.longitude}\n\nUwagi Inspektora:\n${item.notes || 'Brak uwag.'}`;
    fd.append('uwagi', notatki);

    try {
        if (item.photo) {
            const blob1 = await base64ToBlob(item.photo);
            fd.append('zdjecia', blob1, `foto_teren_${id}.jpg`);
        }
        if (item.mapScreenshot) {
            const blob2 = await base64ToBlob(item.mapScreenshot);
            fd.append('zdjecia', blob2, `mapa_zrzut_${id}.jpg`);
        }

        const res = await secureFetch('/api/inspector/zglos', { method: 'POST', body: fd });
        const data = await res.json();
        
        if(data.success) {
            item.sentToCentral = true;
            saveLocalIdentifications();
            renderIdentifications();
            showMessage("Identyfikacja wysłana do systemu centralnego!", "success");
        } else {
            showMessage("Odmowa serwera: " + data.error, "error");
            if(btn) { btn.disabled = false; btn.innerText = "☁️ Wyślij do Urzędu"; }
        }
    } catch (e) {
        showMessage("Błąd sieci: " + e.message, "error");
        if(btn) { btn.disabled = false; btn.innerText = "☁️ Wyślij do Urzędu"; }
    }
}


// =========================================================================================
// 7. RENDEROWANIE INTERFEJSU
// =========================================================================================
function renderDatalists() {
    const streetDatalist = document.getElementById('street-suggestions');
    if(streetDatalist) streetDatalist.innerHTML = ulice.map(u => `<option value="${u}">`).join('');
    const cityDatalist = document.getElementById('city-suggestions');
    if(cityDatalist) cityDatalist.innerHTML = Object.values(miejscowosciByGmina).flat().map(m => `<option value="${m}">`).join('');
}

function renderParticipantsCheckboxes(selectedParticipants = []) {
    const container = document.getElementById('participants-container');
    if(!container) return;
    container.innerHTML = '';
    availableParticipants.forEach(p => {
        const isChecked = selectedParticipants.includes(p);
        const id = p.replace(/\s+/g, '-').toLowerCase();
        const div = document.createElement('div');
        div.className = 'flex items-center space-x-2';
        div.innerHTML = `
            <input type="checkbox" id="${id}" name="participant" value="${p}" ${isChecked ? 'checked' : ''} class="participant-checkbox">
            <label for="${id}" class="text-sm text-gray-700">${p}</label>
        `;
        container.appendChild(div);
    });
}

function renderControls(data = controls) {
    const list = document.getElementById('controls-list');
    if(!list) return;
    list.innerHTML = '';
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 p-8 border border-gray-200 rounded-lg">Brak zapisanych kontroli w pamięci lokalnej.</p>';
        return;
    }
    data.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    data.forEach(control => {
        const hasProtocol = control.protocol && control.protocol.findings;
        const item = document.createElement('div');
        item.className = 'bg-gray-50 p-4 border border-gray-200 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0';
        
        let actionsHtml = `<button data-id="${control.id}" class="edit-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors duration-300 text-sm w-full sm:w-auto">Edytuj / Protokół</button>`;

        if (hasProtocol && !control.sentToCentral) {
            if (!isOfflineMode) {
                actionsHtml += `<button id="send-btn-${control.id}" onclick="sendProtocolToCentral('${control.id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors duration-300 text-sm w-full sm:w-auto mt-2 sm:mt-0 sm:ml-2">☁️ Wyślij do Urzędu</button>`;
            }
        } else if (control.sentToCentral) {
            actionsHtml += `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300 mt-2 sm:mt-0 sm:ml-2">Wysłano do centrali ✓</span>`;
        }

        item.innerHTML = `
            <div>
                <p class="text-lg font-semibold text-gray-800">${getFullAddress(control)}</p>
                <p class="text-sm text-gray-600">${formatType(control.type)} | Data: ${formatDate(control.date)}</p>
                <p class="text-xs ${hasProtocol ? 'text-green-600' : 'text-red-500'} font-medium mt-1 uppercase tracking-wide">Protokół: ${hasProtocol ? 'Zapisany' : 'Brak'}</p>
            </div>
            <div class="flex flex-col sm:flex-row w-full sm:w-auto">
                ${actionsHtml}
            </div>
        `;
        list.appendChild(item);
    });
    
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { openControlModal(e.target.dataset.id); });
    });
}

function renderIdentifications(data = identifications) {
    const list = document.getElementById('identifications-list');
    if(!list) return;
    list.innerHTML = '';
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 p-8 border border-gray-200 rounded-lg">Brak zapisanych identyfikacji w pamięci lokalnej.</p>';
        return;
    }
    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 border border-gray-200 rounded-lg shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 cursor-pointer hover:bg-gray-100';
        div.dataset.id = item.id;
        
        let actionsHtml = ``;
        if (!item.sentToCentral) {
            if (!isOfflineMode) {
                actionsHtml = `<button id="send-ident-btn-${item.id}" onclick="event.stopPropagation(); sendIdentificationToCentral('${item.id}')" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors duration-300 text-sm w-full sm:w-auto">☁️ Wyślij do Urzędu</button>`;
            }
        } else {
            actionsHtml = `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">Wysłano do centrali ✓</span>`;
        }

        div.innerHTML = `
            <div class="flex items-center space-x-4">
                <img src="${item.photo}" class="w-20 h-20 object-cover rounded-md bg-gray-200">
                <div>
                    <p class="font-semibold text-gray-800">Identyfikacja z dnia:</p>
                    <p class="text-sm text-gray-600">${formatDate(item.timestamp)}</p>
                    ${item.plotNumber ? `<p class="text-sm text-teal-700 font-medium mt-1">Działka: ${item.plotNumber}</p>` : ''}
                    <p class="text-xs text-gray-500 mt-1">${(item.notes || '').substring(0, 50)}...</p>
                </div>
            </div>
            <div class="mt-2 sm:mt-0 w-full sm:w-auto" onclick="event.stopPropagation();">
                ${actionsHtml}
            </div>
        `;
        
        div.addEventListener('click', () => openIdentificationModal(item.id));
        list.appendChild(div);
    });
}
        
function createNoteButton(noteText) {
    const button = document.createElement('button');
    button.type = 'button'; 
    button.textContent = noteText;
    button.className = 'text-xs bg-white text-gray-800 border border-gray-300 py-1 px-2 rounded-lg hover:bg-gray-100 transition-colors duration-150 text-left shadow-sm';
    button.onclick = () => {
        const findings = document.getElementById('protocol-findings');
        const separator = findings.value.trim().endsWith('\n') || findings.value.length === 0 ? '' : '\n';
        findings.value += separator + noteText + '\n';
    };
    return button;
}

function renderNoteCategories(activeFilter = '') {
    const container = document.getElementById('note-categories');
    if(!container) return;
    container.innerHTML = `<button type="button" data-filter="" class="note-category-btn ${activeFilter === '' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} font-semibold py-1 px-3 rounded-full text-xs transition-colors">Wszystkie</button>`;
    const categories = [...new Set(noteDatabase.map(item => item.category))];
    categories.forEach(category => {
        const button = document.createElement('button');
        button.type = 'button'; 
        button.textContent = category;
        button.dataset.filter = category;
        button.className = 'note-category-btn text-xs font-semibold py-1 px-3 rounded-full transition-colors ' +
                            (category === activeFilter ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300');
        container.appendChild(button);
    });
    document.querySelectorAll('.note-category-btn').forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.dataset.filter;
            renderNoteCategories(filter);
            renderNoteList(filter);
        });
    });
}

function renderNoteList(filter = '') {
    const listContainer = document.getElementById('note-list');
    if(!listContainer) return;
    listContainer.innerHTML = '';
    noteDatabase.forEach(categoryGroup => {
        if (filter === '' || categoryGroup.category === filter) {
            categoryGroup.notes.forEach(noteText => {
                listContainer.appendChild(createNoteButton(noteText));
            });
        }
    });
}
        
// =========================================================================================
// 8. LOGIKA MODALI (KONTROLE I PROTOKOŁY)
// =========================================================================================
function openModal(modal) {
    if(!modal) return;
    modal.classList.remove('invisible', 'opacity-0');
    modal.classList.add('open', 'opacity-100');
}

function closeModal(modal) {
    if(!modal) return;
    modal.classList.remove('open', 'opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('invisible'), 300);
}
        
function openControlModal(id = null) {
    currentControlId = id;
    const controlForm = document.getElementById('control-form');
    if(controlForm) controlForm.reset();
    document.getElementById('delete-control-btn').classList.add('hidden');
    document.getElementById('generate-protocol-btn').classList.add('hidden');
    document.getElementById('modal-title').textContent = 'Dodaj nową kontrolę';
    renderParticipantsCheckboxes();
    const dateInput = document.getElementById('control-date');
    if (dateInput) dateInput.valueAsDate = new Date();
    if (id !== null) {
        const control = controls.find(c => c.id === id);
        if (control) {
            document.getElementById('modal-title').textContent = 'Edytuj kontrolę';
            document.getElementById('control-street').value = control.street || '';
            document.getElementById('control-house-number').value = control.houseNumber || '';
            document.getElementById('control-city').value = control.city || '';
            document.getElementById('control-zip').value = control.zip || '';
            document.getElementById('control-type').value = control.type || '';
            document.getElementById('control-date').value = control.date || '';
            document.getElementById('control-plot-number').value = control.plotNumber || '';
            document.getElementById('control-geodetic-district').value = control.geodeticDistrict || '';
            renderParticipantsCheckboxes(control.participants || []);
            document.getElementById('delete-control-btn').classList.remove('hidden');
            document.getElementById('generate-protocol-btn').classList.remove('hidden');
        }
    }
    openModal(document.getElementById('control-modal'));
}

function openProtocolModal(controlId) {
    const control = controls.find(c => c.id === controlId);
    if (!control) return;
    currentControlId = controlId;
    const protocolForm = document.getElementById('protocol-form');
    if(protocolForm) protocolForm.reset();
    currentProtocol = control.protocol || {};
    photos = currentProtocol.photos || [];
    document.getElementById('protocol-date').value = currentProtocol.date || control.date || '';
    document.getElementById('protocol-case').value = currentProtocol.case || `Kontrola w sprawie gospodarowania odpadami komunalnymi na nieruchomości ${getFullAddress(control)}.`;
    document.getElementById('protocol-union-reps').value = (currentProtocol.unionReps || (control.participants || []).join('\n')).trim();
    document.getElementById('protocol-admin-reps').value = currentProtocol.adminReps || '';
    document.getElementById('protocol-parties').value = currentProtocol.parties || '';
    document.getElementById('protocol-witnesses').value = currentProtocol.witnesses || '';
    document.getElementById('protocol-findings').value = currentProtocol.findings || '';
    
    const resizeCanvas = (pad, base64Data) => {
        if(!pad || !pad.canvas) return;
        const canvas = pad.canvas;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        if (base64Data) pad.fromDataURL(base64Data);
    };
    if(unionSignaturePad) unionSignaturePad.clear();
    if(partiesSignaturePad) partiesSignaturePad.clear();
    setTimeout(() => {
        resizeCanvas(unionSignaturePad, currentProtocol.unionSignature);
        resizeCanvas(partiesSignaturePad, currentProtocol.partiesSignature);
    }, 300); 
    renderPhotos();
    renderNoteCategories();
    renderNoteList();
    openModal(document.getElementById('protocol-modal'));
}

function openJointNoteModal() {
    const form = document.getElementById('joint-note-form');
    if(form) form.reset();
    document.getElementById('joint-note-protocols-summary').classList.add('hidden');
    document.getElementById('protocols-count').textContent = '';
    document.getElementById('joint-note-participants-container').innerHTML = '';
    document.getElementById('finalize-joint-note-btn').disabled = true;
    
    const resizeCanvas = (pad, base64Data) => {
        if(!pad || !pad.canvas) return;
        const canvas = pad.canvas;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        if (base64Data) pad.fromDataURL(base64Data);
    };
    if(jointNoteSignaturePad) jointNoteSignaturePad.clear();
     setTimeout(() => {
        resizeCanvas(jointNoteSignaturePad, null);
    }, 300);
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('joint-note-date-filter').value = today;
    openModal(document.getElementById('joint-note-modal'));
}

async function saveControl() {
    const isNew = !currentControlId;
    const docId = currentControlId || generateUniqueId();
    
    const controlData = {
        id: docId,
        street: document.getElementById('control-street').value.trim(),
        houseNumber: document.getElementById('control-house-number').value.trim(),
        city: document.getElementById('control-city').value.trim(),
        zip: document.getElementById('control-zip').value.trim(),
        type: document.getElementById('control-type').value,
        date: document.getElementById('control-date').value,
        plotNumber: document.getElementById('control-plot-number').value.trim(),
        geodeticDistrict: document.getElementById('control-geodetic-district').value.trim(),
        participants: Array.from(document.querySelectorAll('#participants-container input:checked')).map(cb => cb.value),
        protocol: null,
        sentToCentral: false
    };

    if (isNew) {
        controls.push(controlData);
    } else {
        const index = controls.findIndex(c => c.id === docId);
        if (index !== -1) {
            controlData.protocol = controls[index].protocol || null;
            controlData.sentToCentral = controls[index].sentToCentral || false;
            controls[index] = controlData;
        }
    }
    saveLocalControls();
    applyFilters();
    showMessage(`Kontrola ${isNew ? 'dodana' : 'zaktualizowana'}!`, 'success');
    closeModal(document.getElementById('control-modal'));
}

async function deleteControl() {
    if (!currentControlId || !confirm('Czy na pewno chcesz usunąć tę kontrolę? Tej operacji nie można cofnąć.')) return;
    controls = controls.filter(c => c.id !== currentControlId);
    saveLocalControls();
    applyFilters();
    showMessage('Kontrola usunięta.', 'info');
    closeModal(document.getElementById('control-modal'));
}

async function saveProtocol() {
    const controlIndex = controls.findIndex(c => c.id === currentControlId);
    if (controlIndex === -1) return;

    const saveBtn = document.getElementById('save-protocol-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Zapisuję...';

    const protocolData = {
        date: document.getElementById('protocol-date').value,
        case: document.getElementById('protocol-case').value.trim(),
        unionReps: document.getElementById('protocol-union-reps').value.trim(),
        adminReps: document.getElementById('protocol-admin-reps').value.trim(),
        parties: document.getElementById('protocol-parties').value.trim(),
        witnesses: document.getElementById('protocol-witnesses').value.trim(),
        findings: document.getElementById('protocol-findings').value.trim(),
        photos: photos,
        unionSignature: (unionSignaturePad && !unionSignaturePad.isEmpty()) ? unionSignaturePad.toDataURL('image/png') : null,
        partiesSignature: (partiesSignaturePad && !partiesSignaturePad.isEmpty()) ? partiesSignaturePad.toDataURL('image/png') : null,
    };

    controls[controlIndex].protocol = protocolData;
    controls[controlIndex].sentToCentral = false; 
    saveLocalControls();
    applyFilters();
    showMessage('Protokół został zapisany w pamięci urządzenia!', 'success');
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Zapisz protokół';
}

async function deleteProtocol() {
    if (!currentControlId || !confirm('Czy na pewno chcesz usunąć ten protokół?')) return;
    const controlIndex = controls.findIndex(c => c.id === currentControlId);
    if(controlIndex !== -1) {
        controls[controlIndex].protocol = null;
        controls[controlIndex].sentToCentral = false;
        saveLocalControls();
        applyFilters();
        showMessage('Protokół został usunięty z tej kontroli.', 'info');
        closeModal(document.getElementById('protocol-modal'));
    }
}

function handlePhotoSelection(event) {
    Array.from(event.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            photos.push({ id: Date.now().toString() + Math.random(), url: e.target.result });
            renderPhotos();
        };
        reader.readAsDataURL(file);
    });
    event.target.value = ''; 
}

function renderPhotos() {
    const container = document.getElementById('photos-preview-container');
    if(!container) return;
    container.innerHTML = '';
    photos.forEach(photo => {
        const div = document.createElement('div');
        div.className = 'relative w-24 h-24';
        div.innerHTML = `
            <img src="${photo.url}" class="w-full h-full object-cover rounded shadow-md cursor-pointer">
            <button type="button" class="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center p-0 leading-none -mt-1 -mr-1" onclick="deletePhoto('${photo.id}')">&times;</button>
        `;
        container.appendChild(div);
    });
}

function deletePhoto(id) {
    photos = photos.filter(p => p.id !== id);
    renderPhotos();
}

// =========================================================================================
// 9. LOGIKA IDENTYFIKACJI TERENOWEJ (MAPY, GUGiK, GEOLOKALIZACJA)
// =========================================================================================
let currentIdentificationData = {};

function initIdentificationMap() {
    if (identificationMap || typeof L === 'undefined') return;

    identificationMap = L.map('identification-map', {
        layers: [offlineSatelliteLayer, parcelsBoundariesLayer, parcelsNumbersLayer].filter(Boolean)
    }).setView([54.03, 21.75], 13);
    
    const overlays = {};
    if(offlineSatelliteLayer) overlays["Satelita"] = offlineSatelliteLayer;
    if(parcelsBoundariesLayer) overlays["Granice działek"] = parcelsBoundariesLayer;
    if(parcelsNumbersLayer) overlays["Numery działek"] = parcelsNumbersLayer;

    L.control.layers(overlays, {}).addTo(identificationMap);

    identificationMap.locate({
        setView: true, maxZoom: 17, watch: false, timeout: 10000, maximumAge: 5000, enableHighAccuracy: true
    });

    identificationMap.on('locationfound', function(e) {
        if (window.accuracyCircle) { window.accuracyCircle.remove(); }
        window.accuracyCircle = L.circle(e.latlng, {
            radius: e.accuracy / 2, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.3
        }).addTo(identificationMap);
    });
    
    identificationMap.on('locationerror', function(e) {
        showMessage('Wystąpił błąd geolokalizacji. Ustaw mapę ręcznie.', 'error');
    });
}

function openIdentificationModal(id = null) {
    currentIdentificationId = id;
    const form = document.getElementById('identification-form');
    const mapStep = document.getElementById('identification-map-step');
    const previewStep = document.getElementById('identification-preview-step');
    const saveBtn = document.getElementById('save-identification-btn');
    const deleteBtn = document.getElementById('delete-identification-btn');
    const generatePdfBtn = document.getElementById('generate-identification-pdf-btn');
    
    if(form) form.reset();
    currentIdentificationData = {};
    document.getElementById('address-status').innerHTML = '';

    generatePdfBtn.classList.add('hidden');
    deleteBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    if (id) {
        const item = identifications.find(i => i.id === id);
        if (!item) return;

        Object.assign(currentIdentificationData, item);

        mapStep.classList.add('hidden');
        previewStep.classList.remove('hidden');

        document.getElementById('identification-modal-title').textContent = 'Podgląd Identyfikacji';
        document.getElementById('identification-photo-preview').src = item.photo;
        document.getElementById('gps-coords').textContent = `${item.latitude}, ${item.longitude}`;
        
        document.getElementById('open-map-link').href = `https://www.openstreetmap.org/#map=18/${item.latitude}/${item.longitude}`;
        document.getElementById('geoportal-link').href = `https://mapy.geoportal.gov.pl/?identify=true&center=${item.longitude},${item.latitude}&zoom=18`;
        
        document.getElementById('identification-notes').value = item.notes || '';
        document.getElementById('identification-plot-number').value = item.plotNumber || '';
        if(item.fullAddress) {
            document.getElementById('address-status').innerHTML = `Zapisany adres: <strong>${item.fullAddress}</strong>`;
        }

        saveBtn.classList.remove('hidden');
        saveBtn.textContent = 'Zaktualizuj';
        deleteBtn.classList.remove('hidden');
        generatePdfBtn.classList.remove('hidden');
    } else {
        mapStep.classList.remove('hidden');
        previewStep.classList.add('hidden');
        document.getElementById('identification-modal-title').textContent = 'Nowa Identyfikacja Terenowa';
        
        setTimeout(() => {
            initIdentificationMap();
            if(identificationMap) identificationMap.invalidateSize();
        }, 100);
    }
    openModal(document.getElementById('identification-modal'));
}

async function handleIdentificationCapture() {
    if(typeof html2canvas === 'undefined') {
        showMessage("Biblioteka zrzutów ekranu nie została załadowana.", "error");
        return;
    }

    const captureBtn = document.getElementById('capture-btn');
    captureBtn.disabled = true;
    captureBtn.textContent = 'Przetwarzam mapę...';

    if(identificationMap) {
        const center = identificationMap.getCenter();
        currentIdentificationData.latitude = center.lat.toFixed(6);
        currentIdentificationData.longitude = center.lng.toFixed(6);
    } else {
        currentIdentificationData.latitude = "0.00";
        currentIdentificationData.longitude = "0.00";
    }

    try {
        const mapElement = document.getElementById('map-capture-area');
        const canvas = await html2canvas(mapElement, { useCORS: true });
        currentIdentificationData.mapScreenshot = canvas.toDataURL('image/jpeg', 0.8);

        captureBtn.textContent = 'Otwieranie aparatu...';
        document.getElementById('identification-photo-input').click();

    } catch (error) {
        console.error("Błąd podczas tworzenia zrzutu mapy:", error);
        showMessage("Błąd zrzutu mapy. Spróbuj ponownie.", "error");
        captureBtn.disabled = false;
        captureBtn.textContent = 'Zatwierdź lokalizację i zrób zdjęcie';
    }
}

function handleIdentificationPhoto(event) {
    const file = event.target.files[0];
    const captureBtn = document.getElementById('capture-btn');
    captureBtn.disabled = false;
    captureBtn.textContent = 'Zatwierdź lokalizację i zrób zdjęcie';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const MAX_WIDTH = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height = height * (MAX_WIDTH / width); width = MAX_WIDTH; }
            } else {
                if (height > MAX_WIDTH) { width = width * (MAX_WIDTH / height); height = MAX_WIDTH; }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8); 
            currentIdentificationData.photo = resizedDataUrl;
            displayIdentificationPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function displayIdentificationPreview() {
    document.getElementById('identification-map-step').classList.add('hidden');
    document.getElementById('identification-preview-step').classList.remove('hidden');
    document.getElementById('save-identification-btn').classList.remove('hidden');
    document.getElementById('save-identification-btn').textContent = 'Zapisz do Pamięci';
    
    const lat = currentIdentificationData.latitude;
    const lon = currentIdentificationData.longitude;

    document.getElementById('identification-photo-preview').src = currentIdentificationData.photo || '';
    document.getElementById('gps-coords').textContent = `${lat}, ${lon}`;
    document.getElementById('geoportal-link').href = `https://mapy.geoportal.gov.pl/?identify=true&center=${lon},${lat}&zoom=18`;
    document.getElementById('open-map-link').href = `https://www.openstreetmap.org/#map=18/${lat}/${lon}`;
}

function saveIdentification() {
    const notes = document.getElementById('identification-notes').value.trim();
    const plotNumber = document.getElementById('identification-plot-number').value.trim();
    const isNew = !currentIdentificationId;
    
    if (isNew) {
         if (!currentIdentificationData.latitude || !currentIdentificationData.photo) {
            showMessage('Brak danych lokalizacji lub zdjęcia. Spróbuj ponownie.', 'error');
            return;
        }
        const newId = generateUniqueId();
        const newIdentification = {
            id: newId,
            timestamp: new Date().toISOString(),
            latitude: currentIdentificationData.latitude,
            longitude: currentIdentificationData.longitude,
            photo: currentIdentificationData.photo,
            notes: notes,
            plotNumber: plotNumber,
            fullAddress: currentIdentificationData.fullAddress || '',
            mapScreenshot: currentIdentificationData.mapScreenshot || '',
            sentToCentral: false
        };
        identifications.push(newIdentification);

    } else {
        const index = identifications.findIndex(i => i.id === currentIdentificationId);
        if (index !== -1) {
            identifications[index].notes = notes;
            identifications[index].plotNumber = plotNumber;
            identifications[index].fullAddress = currentIdentificationData.fullAddress || identifications[index].fullAddress || '';
            identifications[index].sentToCentral = false; 
            if (currentIdentificationData.mapScreenshot) {
                identifications[index].mapScreenshot = currentIdentificationData.mapScreenshot;
            }
        }
    }
    saveLocalIdentifications();
    renderIdentifications();
    showMessage(`Identyfikacja ${isNew ? 'zapisana' : 'zaktualizowana'}! Pamiętaj aby ją wysłać.`, 'success');
    closeModal(document.getElementById('identification-modal'));
}

function deleteIdentification() {
    if (!currentIdentificationId || !confirm('Czy na pewno chcesz usunąć tę identyfikację?')) return;
    identifications = identifications.filter(i => i.id !== currentIdentificationId);
    saveLocalIdentifications();
    renderIdentifications();
    showMessage('Identyfikacja usunięta.', 'info');
    closeModal(document.getElementById('identification-modal'));
}

async function getParcelDataByXY(lon, lat) {
    if (isOfflineMode) return { error: true, message: 'Tryb Offline: Brak połączenia z GUGiK.' };
    const url = `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=${lon},${lat}&result=teryt,voivodeship,county,commune,town,street,street_type,house_number,geom_wkt,parcel&srid=4326`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const text = await fetch(url, { signal: controller.signal }).then(res => {
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            return res.text();
        });
        clearTimeout(timeoutId);

        const lines = text.trim().split('\n');
        if (lines.length < 2 || lines[1].trim() === '-1') return { error: true, message: 'Nie znaleziono działki w GUGiK.' };

        const headers = lines[0].split(',');
        const values = lines[1].split(',');
        const result = {};
        headers.forEach((header, i) => { result[header.trim()] = values[i] ? values[i].trim() : ''; });
        
        return { error: false, parcelId: result.parcel || '' };
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') return { error: true, message: 'Serwer GUGiK nie odpowiedział w zadanym czasie.' };
        return { error: true, message: 'Błąd połączenia z GUGiK.' };
    }
}

async function getAddressFromGoogle(lat, lon) {
    if (isOfflineMode) return { error: true, message: 'Tryb Offline: Brak połączenia z Google.' };
    const apiKey = 'AIzaSyClGtmK6IlFBX1dAsf9tJ8m9NJKHthD_rE'; 
    if (!apiKey) return { error: true, message: 'Brak klucza API.' };
    
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=pl`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();

        if (data.status === 'OK' && data.results[0]) return { error: false, address: data.results[0].formatted_address };
        return { error: true, message: `Google API błąd: ${data.status}` };
    } catch (error) {
        clearTimeout(timeoutId);
        return { error: true, message: 'Błąd połączenia z Google.' };
    }
}
        
async function fetchAndDisplayAddressData() {
    const statusP = document.getElementById('address-status');
    const plotInput = document.getElementById('identification-plot-number');
    const fetchBtn = document.getElementById('fetch-address-btn');
    
    if (!currentIdentificationData.latitude || !currentIdentificationData.longitude) {
        statusP.textContent = 'Brak zapisanych współrzędnych.';
        return;
    }

    if (isOfflineMode) {
        statusP.textContent = '❌ Zablokowane. Jesteś w Trybie Offline.';
        statusP.style.color = '#ef4444';
        return;
    }

    statusP.textContent = 'Pobieram dane (GUGiK & Google)...';
    statusP.style.color = '#6b7280';
    fetchBtn.disabled = true;

    try {
        const [gugikResult, googleResult] = await Promise.all([
            getParcelDataByXY(currentIdentificationData.longitude, currentIdentificationData.latitude),
            getAddressFromGoogle(currentIdentificationData.latitude, currentIdentificationData.longitude)
        ]);

        let finalAddress = '';
        let finalPlotNumber = '';
        let statusHtml = '';

        if (!googleResult.error && googleResult.address) finalAddress = googleResult.address;
        else statusHtml += `❌ Błąd adresu (Google): ${googleResult.message}<br>`;

        if (!gugikResult.error && gugikResult.parcelId) {
            finalPlotNumber = gugikResult.parcelId;
            plotInput.value = finalPlotNumber;
        }

        currentIdentificationData.fullAddress = finalAddress; 

        if (finalAddress) {
            statusHtml = `✅ Adres (Google): <strong>${finalAddress}</strong>`;
            if (finalPlotNumber) statusHtml += `<br>✅ Działka (GUGiK): <strong>${finalPlotNumber}</strong>`;
            statusP.style.color = '#22c55e';
        } else if (finalPlotNumber) {
            statusHtml += `⚠️ Działka (GUGiK): <strong>${finalPlotNumber}</strong>`;
            statusP.style.color = '#f97316';
        }
        
        if (!finalAddress && !finalPlotNumber) {
            statusHtml = '❌ Nie udało się znaleźć żadnych danych adresowych.';
            statusP.style.color = '#ef4444';
        }

        statusP.innerHTML = statusHtml;
    } catch (error) {
        statusP.textContent = `❌ Wystąpił błąd sieciowy: ${error.message}`;
        statusP.style.color = '#ef4444';
    } finally {
        fetchBtn.disabled = false;
    }
}


// =========================================================================================
// 10. ZBIORCZA IDENTYFIKACJA (BULK REPORT)
// =========================================================================================
function setAddBulkPointMode(enabled) {
    if(!bulkIdentificationMap) return;
    isAddingBulkPoint = enabled;
    const mapContainer = bulkIdentificationMap._container;
    if (enabled) {
        L.DomUtil.addClass(mapContainer, 'leaflet-crosshair');
        showMessage('Tryb dodawania punktu aktywny. Kliknij na mapę.', 'info');
    } else {
        L.DomUtil.removeClass(mapContainer, 'leaflet-crosshair');
    }
}

function initBulkIdentificationMap() {
    if (bulkIdentificationMap || typeof L === 'undefined') return;

    bulkIdentificationMap = L.map('bulk-identification-map', {
        layers: [offlineSatelliteLayer, parcelsBoundariesLayer, parcelsNumbersLayer].filter(Boolean)
    }).setView([54.03, 21.75], 13);

    const overlays = {};
    if(offlineSatelliteLayer) overlays["Satelita"] = offlineSatelliteLayer;
    if(parcelsBoundariesLayer) overlays["Granice działek"] = parcelsBoundariesLayer;
    if(parcelsNumbersLayer) overlays["Numery działek"] = parcelsNumbersLayer;
    
    L.control.layers(overlays, {}).addTo(bulkIdentificationMap);

    bulkIdentificationMarkersLayer = L.featureGroup().addTo(bulkIdentificationMap);
    renderBulkIdentificationPoints();

    bulkIdentificationMap.on('click', async (e) => {
        if (isAddingBulkPoint) {
            setAddBulkPointMode(false); 
            await openBulkPointModal(e.latlng);
        }
    });

    bulkIdentificationMap.on('locationfound', function(e) {
        if (bulkAccuracyCircle) {
            bulkAccuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
        } else {
            bulkAccuracyCircle = L.circle(e.latlng, { radius: e.accuracy, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.15, weight: 1, interactive: false }).addTo(bulkIdentificationMap);
        }

        if (!bulkMyLocationMarker) {
            bulkMyLocationMarker = L.circleMarker(e.latlng, { radius: 8, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(bulkIdentificationMap).bindPopup("Twoja lokalizacja");
        } else {
            bulkMyLocationMarker.setLatLng(e.latlng);
        }
    });
    
    bulkIdentificationMap.locate({ watch: true, setView: false, enableHighAccuracy: true });
    bulkIdentificationMap.on('zoomend zoomstart', toggleBulkMapZoomHint);
    toggleBulkMapZoomHint();
}

async function openBulkPointModal(latlng) {
    if(typeof html2canvas === 'undefined') {
        showMessage('Moduł zrzutów ekranu niedostępny.', 'error');
        return;
    }
    currentBulkPointCoords = latlng;
    currentBulkMapScreenshot = null;
    showMessage('Tworzę zrzut ekranu mapy...', 'info');

    const tempMarker = L.marker(latlng).addTo(bulkIdentificationMap);

    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const mapContainer = document.getElementById('bulk-identification-map-container');
        const canvas = await html2canvas(mapContainer, { useCORS: true, logging: false });
        currentBulkMapScreenshot = canvas.toDataURL('image/jpeg', 0.85);

        document.getElementById('bulk-point-plot-number').value = '';
        document.getElementById('bulk-plot-status').textContent = '';
        document.getElementById('bulk-point-screenshot-preview').src = currentBulkMapScreenshot;
        
        openModal(document.getElementById('bulk-point-modal'));
    } catch (error) {
        console.error("Błąd tworzenia zrzutu ekranu:", error);
        showMessage('Nie udało się utworzyć zrzutu ekranu mapy.', 'error');
    } finally {
        if (tempMarker) bulkIdentificationMap.removeLayer(tempMarker);
    }
}

async function fetchBulkPlotData() {
    if (!currentBulkPointCoords) return;
    const statusP = document.getElementById('bulk-plot-status');
    const plotInput = document.getElementById('bulk-point-plot-number');
    const fetchBtn = document.getElementById('fetch-bulk-plot-btn');
    
    if (isOfflineMode) {
        statusP.textContent = '❌ Zablokowane. Tryb Offline.';
        statusP.style.color = '#ef4444';
        return;
    }

    statusP.textContent = 'Pobieram numer działki...';
    fetchBtn.disabled = true;

    const result = await getParcelDataByXY(currentBulkPointCoords.lng, currentBulkPointCoords.lat);
    
    if (result.error) {
        statusP.textContent = `Błąd: ${result.message}`;
        statusP.style.color = '#ef4444';
    } else {
        plotInput.value = result.parcelId;
        statusP.textContent = 'Pobrano numer działki.';
        statusP.style.color = '#22c55e';
    }
    fetchBtn.disabled = false;
}
        
function saveBulkPoint() {
    if (!currentBulkMapScreenshot) {
        showMessage('Brak zrzutu ekranu. Spróbuj dodać punkt ponownie.', 'error');
        return;
    }

    const newPoint = {
        id: generateUniqueId(),
        lat: currentBulkPointCoords.lat,
        lng: currentBulkPointCoords.lng,
        plotNumber: document.getElementById('bulk-point-plot-number').value.trim(),
        mapScreenshot: currentBulkMapScreenshot
    };

    bulkIdentifications.push(newPoint);
    saveLocalBulkIdentifications();
    addBulkPointToMap(newPoint);
    updateBulkPointsCounter();
    closeModal(document.getElementById('bulk-point-modal'));
}

function toggleBulkMapZoomHint() {
    if (!bulkIdentificationMap) return;
    const hint = document.getElementById('bulk-map-zoom-hint');
    if (bulkIdentificationMap.getZoom() < 17) hint.classList.remove('hidden');
    else hint.classList.add('hidden');
}
        
function addBulkPointToMap(point) {
    if(typeof L === 'undefined' || !bulkIdentificationMarkersLayer) return;
    const marker = L.marker([point.lat, point.lng], { pointId: point.id }).addTo(bulkIdentificationMarkersLayer);
    const popupContent = `
        <p><strong>Działka:</strong> ${point.plotNumber || 'Brak'}</p>
        <img src="${point.mapScreenshot}" class="w-32 h-auto my-1">
        <button class="remove-bulk-point-btn bg-red-500 text-white text-xs py-1 px-2 rounded w-full" data-id="${point.id}">Usuń ten punkt</button>
    `;
    marker.bindPopup(popupContent);
}

function removeBulkPoint(pointId) {
    if (!confirm('Czy na pewno chcesz usunąć ten punkt?')) return;
    bulkIdentifications = bulkIdentifications.filter(p => p.id !== pointId);
    saveLocalBulkIdentifications();

    if(bulkIdentificationMarkersLayer) {
        bulkIdentificationMarkersLayer.eachLayer(marker => {
            if (marker.options.pointId === pointId) bulkIdentificationMarkersLayer.removeLayer(marker);
        });
    }
    updateBulkPointsCounter();
    if(bulkIdentificationMap) bulkIdentificationMap.closePopup();
}

function renderBulkIdentificationPoints() {
    if (bulkIdentificationMarkersLayer) {
        bulkIdentificationMarkersLayer.clearLayers();
        bulkIdentifications.forEach(addBulkPointToMap);
    }
    updateBulkPointsCounter();
}
        
function updateBulkPointsCounter() {
    const counter = document.getElementById('bulk-points-counter');
    if(counter) counter.textContent = bulkIdentifications.length;
}


// =========================================================================================
// 11. GENEROWANIE PDF I ZBIORCZE WYSYŁANIE
// =========================================================================================
function generateProtocolHTML(control, protocol) {
    const unionReps = protocol.unionReps.replace(/\n/g, '<br>');
    const adminReps = protocol.adminReps.replace(/\n/g, '<br>');
    const parties = protocol.parties.replace(/\n/g, '<br>');
    const witnesses = protocol.witnesses.replace(/\n/g, '<br>');
    const findings = protocol.findings.replace(/\n/g, '<br>');
    const signatureUnion = protocol.unionSignature ? `<img src="${protocol.unionSignature}" style="width: 150px; height: 60px; border: 1px solid #000; display: block; margin-top: 10px;">` : '';
    const signatureParties = protocol.partiesSignature ? `<img src="${protocol.partiesSignature}" style="width: 150px; height: 60px; border: 1px solid #000; display: block; margin-top: 10px;">` : '';
    let photosHtml = '';
    if (protocol.photos && protocol.photos.length > 0) {
        photosHtml = '<h3 style="margin-top: 20px;">Dokumentacja Fotograficzna</h3>';
        photosHtml += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
        protocol.photos.forEach((photo, index) => {
            photosHtml += `
                <div style="width: 320px; display: inline-block; margin-bottom: 10px;">
                    <p style="font-size: 11px; font-weight: bold; margin-bottom: 5px;">Zdjęcie ${index + 1}</p>
                    <img src="${photo.url}" style="width: 100%; height: auto; max-height: 250px; object-fit: cover; border: 1px solid #ccc;">
                </div>
            `;
        });
        photosHtml += '</div>';
    }
    return `
        <div class="pdf-container" style="font-family: 'Inter', sans-serif;">
            <h1 style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px;">PROTOKÓŁ OGLĘDZIN</h1>
            <table style="width: 100%;">
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Adres Obiektu:</td><td>${getFullAddress(control)}</td></tr>
                ${control.plotNumber ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Numer Działki:</td><td>${control.plotNumber}</td></tr>` : ''}
                ${control.geodeticDistrict ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Obręb Ewidencyjny:</td><td>${control.geodeticDistrict}</td></tr>` : ''}
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Data Kontroli:</td><td>${formatDate(control.date)}</td></tr>
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Typ Kontroli:</td><td>${formatType(control.type)}</td></tr>
            </table>
            <h3 style="margin-top: 20px;">Sprawa</h3>
            <div style="padding: 10px; border: 1px solid #ccc;">${protocol.case}</div>
            <h3 style="margin-top: 20px;">Obecni przy Oględzinach</h3>
            <table style="width: 100%;">
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Przedstawiciele Związku:</td><td>${unionReps}</td></tr>
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Inni przedstawiciele adm.:</td><td>${adminReps}</td></tr>
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Strony i pełnomocnicy:</td><td>${parties}</td></tr>
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Świadkowie:</td><td>${witnesses}</td></tr>
            </table>
            <h3 style="margin-top: 20px;">Ustalono co następuje</h3>
            <div style="padding: 10px; border: 1px solid #ccc; min-height: 80px;">${findings}</div>
            <div style="margin-top: 30px; display: flex; justify-content: space-between;">
                <div style="width: 45%;">
                    <p style="font-weight: bold; border-top: 1px solid #000; padding-top: 5px;">Podpis przedstawicieli Związku</p>
                    ${signatureUnion}
                </div>
                <div style="width: 45%;">
                    <p style="font-weight: bold; border-top: 1px solid #000; padding-top: 5px;">Podpis stron i osób obecnych</p>
                    ${signatureParties}
                </div>
            </div>
            ${photosHtml}
        </div>
    `;
}

async function generateProtocolPDF() {
    if(typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        showMessage('Zewnętrzne biblioteki PDF nie zostały załadowane.', 'error'); return;
    }
    const control = controls.find(c => c.id === currentControlId);
    if (!control || !control.protocol) { showMessage('Brak zapisanego protokołu do wygenerowania!', 'error'); return; }
    
    document.getElementById('finalize-protocol-btn').disabled = true;
    const pdfRenderTemplate = document.getElementById('pdf-render-template');
    pdfRenderTemplate.innerHTML = generateProtocolHTML(control, control.protocol);
    const contentToConvert = pdfRenderTemplate.querySelector('.pdf-container');
    
    try {
        const canvas = await html2canvas(contentToConvert, { scale: 2, useCORS: true, letterRendering: true });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        const sanitizedAddress = `${control.city}_${control.street}_${control.houseNumber}`.replace(/[\s/\\?%*:|"<>]/g, '-');
        const finalFileName = `Protokol_${getTimestampForFilename()}_${sanitizedAddress}.pdf`;

        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage('PDF wygenerowany pomyślnie!', 'success');
    } catch (error) {
        if (error.name !== 'AbortError') { console.error("Błąd generowania PDF:", error); showMessage(`Błąd generowania PDF.`, 'error'); }
    } finally {
        pdfRenderTemplate.innerHTML = '';
        document.getElementById('finalize-protocol-btn').disabled = false;
    }
}

function filterJointNoteProtocols() {
    const dateFilter = document.getElementById('joint-note-date-filter').value;
    const summaryBox = document.getElementById('joint-note-protocols-summary');
    const protocolsCountP = document.getElementById('protocols-count');
    const participantsContainer = document.getElementById('joint-note-participants-container');
    const finalizeBtn = document.getElementById('finalize-joint-note-btn');
    participantsContainer.innerHTML = '';
    finalizeBtn.disabled = true;
    if (!dateFilter) {
        summaryBox.classList.add('hidden');
        showMessage('Wybierz datę, aby przefiltrować protokoły.', 'info');
        return;
    }
    const filteredControls = controls.filter(c => c.date === dateFilter && c.protocol);
    if (filteredControls.length === 0) {
        protocolsCountP.textContent = `Nie znaleziono zapisanych protokołów z dnia ${formatDate(dateFilter)}.`;
        summaryBox.classList.remove('hidden');
        showMessage('Brak protokołów do połączenia.', 'error');
        return;
    }
    const uniqueParticipants = new Set();
    filteredControls.forEach(c => {
        if (c.protocol && c.protocol.unionReps) {
            c.protocol.unionReps.split('\n').map(r => r.trim()).filter(r => r).forEach(r => uniqueParticipants.add(r));
        }
    });
    const participantsList = Array.from(uniqueParticipants).sort();
    protocolsCountP.textContent = `Znaleziono ${filteredControls.length} protokołów z dnia ${formatDate(dateFilter)} gotowych do połączenia:`;
    summaryBox.classList.remove('hidden');
    participantsList.forEach(p => {
        const div = document.createElement('div');
        div.className = 'text-sm text-gray-700 p-2 bg-white border border-gray-300 rounded';
        div.textContent = p;
        participantsContainer.appendChild(div);
    });
    finalizeBtn.disabled = false;
}
        
function generateJointNoteHTML(date, city, subject, controls, signature) {
    const today = new Date().toLocaleDateString('pl-PL');
    const uniqueParticipants = new Set();
    controls.forEach(c => {
        if (c.protocol && c.protocol.unionReps) {
            c.protocol.unionReps.split('\n').map(r => r.trim()).filter(r => r).forEach(r => uniqueParticipants.add(r));
        }
    });
    const participantsText = Array.from(uniqueParticipants).sort().join('<br>');
    const signatureHtml = signature ? `<img src="${signature}" style="width: 200px; height: 100px; border: 1px solid #000; display: block; margin-top: 10px;">` : '';
    let protocolsHtml = '';
    controls.forEach((control, index) => {
        const findings = control.protocol && control.protocol.findings 
            ? control.protocol.findings.replace(/\n/g, '<br>') 
            : 'Brak ustaleń.';
        protocolsHtml += `
            <div style="margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px dashed #ccc;">
                <p style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">${index + 1}. ${getFullAddress(control)}</p>
                <div style="font-size: 11px; margin-left: 15px; padding: 5px; background-color: #f9f9f9; border-left: 3px solid #eee;">
                    <strong>Ustalono:</strong><br>${findings}
                </div>
            </div>
        `;
    });
    return `
        <div class="pdf-container" style="font-family: 'Inter', sans-serif;">
            <h1 style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px;">NOTATKA SŁUŻBOWA</h1>
            <p><strong>Sporządzono w:</strong> ${city}, dnia ${today}.</p>
            <p><strong>Dotyczy:</strong> Kontroli w terenie przeprowadzonych w dniu ${formatDate(date)}.</p>
            <h3 style="font-size: 14px; margin-top: 15px;">Autorzy notatki (uczestnicy kontroli):</h3>
            <div style="padding: 10px; border: 1px solid #ccc;">${participantsText}</div>
            <h3 style="font-size: 14px; margin-top: 15px;">Uwagi:</h3>
            <div style="padding: 10px; border: 1px solid #ccc;">${subject.replace(/\n/g, '<br>')}</div>
            <h3 style="font-size: 14px; margin-top: 15px;">Sporządzone Protokoły Oględzin:</h3>
            <div style="padding: 10px; border: 1px solid #ccc;">${protocolsHtml}</div>
            <div style="margin-top: 30px;">
                <p style="font-weight: bold; border-top: 1px solid #000; padding-top: 5px;">Podpis autora/autorów</p>
                ${signatureHtml}
            </div>
        </div>
    `;
}
        
async function generateJointNotePDF() {
    if(typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        showMessage('Zewnętrzne biblioteki PDF nie zostały załadowane.', 'error'); return;
    }
    const dateFilter = document.getElementById('joint-note-date-filter').value;
    const city = document.getElementById('joint-note-city').value.trim();
    const subject = document.getElementById('joint-note-subject').value.trim();
    const signatureBase64 = (jointNoteSignaturePad && !jointNoteSignaturePad.isEmpty()) ? jointNoteSignaturePad.toDataURL('image/png') : null;
    
    if (!dateFilter || !city) { showMessage('Uzupełnij wymagane pola notatki.', 'error'); return; }
    
    const filteredControls = controls.filter(c => c.date === dateFilter && c.protocol);
    if (filteredControls.length === 0) { showMessage('Brak protokołów.', 'error'); return; }
    
    const finalizeBtn = document.getElementById('finalize-joint-note-btn');
    finalizeBtn.disabled = true; finalizeBtn.textContent = 'Generowanie...';
    
    const pdfRenderTemplate = document.getElementById('pdf-render-template');
    pdfRenderTemplate.innerHTML = generateJointNoteHTML(dateFilter, city, subject, filteredControls, signatureBase64);
    const contentToConvert = pdfRenderTemplate.querySelector('.pdf-container');
    
    try {
        const canvas = await html2canvas(contentToConvert, { scale: 2, useCORS: true });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight; let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        const finalFileName = `Notatka_Sluzbowa_${getTimestampForFilename()}.pdf`;
        
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = finalFileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage('Notatka PDF wygenerowana!', 'success');

        if (!isOfflineMode) {
            try {
                const fd = new FormData();
                fd.append('adres', `Notatka Zbiorcza - ${city} (${dateFilter})`);
                fd.append('wlasciciel', 'Dotyczy wszystkich skontrolowanych na zestawieniu');
                fd.append('typ', 'NOTATKA_SLUZBOWA');
                fd.append('kategoria', 'KONTROLA_ZBIORCZA');
                const plainFindings = filteredControls.map(c => `- ${getFullAddress(c)}: ${c.protocol.findings.substring(0, 80)}...`).join('\n');
                fd.append('uwagi', `Temat: ${subject}\n\nUstalenia łączne:\n${plainFindings}`);
                await secureFetch('/api/inspector/zglos', { method: 'POST', body: fd });
            } catch (e) { console.warn("Wysłanie do centrali nie powiodło się:", e); }
        }
        closeModal(document.getElementById('joint-note-modal'));
    } catch (error) {
        if (error.name !== 'AbortError') { showMessage(`Błąd generowania PDF Notatki.`, 'error'); }
    } finally {
        pdfRenderTemplate.innerHTML = '';
        finalizeBtn.disabled = false; finalizeBtn.textContent = 'Generuj i pobierz Notatkę (PDF)';
    }
}

async function generateIdentificationHTML(item) {
    const mapImageHtml = item.mapScreenshot ? `<img src="${item.mapScreenshot}" style="width: 100%; border: 1px solid #ccc;">` : '<p>Brak zrzutu mapy.</p>';
    return `
        <div class="pdf-container" style="font-family: 'Inter', sans-serif;">
            <h1 style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px;">RAPORT Z IDENTYFIKACJI TERENOWEJ</h1>
            <table style="width: 100%;">
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Data i Godzina:</td><td>${formatDate(item.timestamp)}</td></tr>
                <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Współrzędne GPS:</td><td>${item.latitude}, ${item.longitude}</td></tr>
                ${item.plotNumber ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Numer Działki:</td><td>${item.plotNumber}</td></tr>` : ''}
                ${item.fullAddress ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Adres Nieruchomości:</td><td>${item.fullAddress}</td></tr>` : ''}
            </table>
            <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px;">
                <div style="width: 48%;"><h3>Dokumentacja Fotograficzna</h3><img src="${item.photo}" style="width: 100%; border: 1px solid #ccc;"></div>
                <div style="width: 48%;"><h3>Lokalizacja na Mapie</h3>${mapImageHtml}</div>
            </div>
            <h3 style="margin-top: 15px;">Notatki</h3>
            <div style="padding: 8px; border: 1px solid #ccc; min-height: 60px;">${(item.notes || 'Brak notatek.').replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

async function generateIdentificationPDF() {
    if(typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') { showMessage('Biblioteki PDF niedostępne.', 'error'); return; }
    let item = identifications.find(i => i.id === currentIdentificationId);
    if (!item) return;

    item.notes = document.getElementById('identification-notes').value;
    item.plotNumber = document.getElementById('identification-plot-number').value;
    if (currentIdentificationData.fullAddress) item.fullAddress = currentIdentificationData.fullAddress;
    if (currentIdentificationData.mapScreenshot) item.mapScreenshot = currentIdentificationData.mapScreenshot;

    const generateBtn = document.getElementById('generate-identification-pdf-btn');
    generateBtn.disabled = true; generateBtn.textContent = 'Generowanie...';

    try {
        const htmlContent = await generateIdentificationHTML(item);
        const pdfRenderTemplate = document.getElementById('pdf-render-template');
        pdfRenderTemplate.innerHTML = htmlContent;
        const contentToConvert = pdfRenderTemplate.querySelector('.pdf-container');
        
        const canvas = await html2canvas(contentToConvert, { scale: 2, useCORS: true, letterRendering: true });
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210; const pageHeight = 295;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        
        if (imgHeight <= pageHeight) pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        else pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, pageHeight);

        const sanitizedPlot = (item.plotNumber || 'bez_nr').replace(/[\s/\\?%*:|"<>]/g, '-');
        const finalFileName = `Identyfikacja_${getTimestampForFilename()}_${sanitizedPlot}.pdf`;
        
        const blob = pdf.output('blob'); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = finalFileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage('PDF wygenerowany pomyślnie!', 'success');
    } catch (error) {
        if (error.name !== 'AbortError') showMessage(`Błąd generowania PDF.`, 'error');
    } finally {
        document.getElementById('pdf-render-template').innerHTML = '';
        generateBtn.disabled = false; generateBtn.textContent = 'Generuj Raport PDF';
    }
}

function generateBulkReportHTML(points) {
    const today = new Date().toLocaleDateString('pl-PL');
    let pointsHtml = '';
    points.forEach((point, index) => {
        const geoportalLink = `https://mapy.geoportal.gov.pl/?identify=true&center=${point.lng},${point.lat}&zoom=18`;
        pointsHtml += `
            <div style="border: 1px solid #ccc; padding: 10px; margin-bottom: 15px; page-break-inside: avoid;">
                <h3 style="font-size: 14px; margin-top: 0;">Punkt ${index + 1}</h3>
                <div style="display: flex; gap: 10px;">
                    <div style="width: 250px;"><img src="${point.mapScreenshot}" style="width: 100%; height: auto; border: 1px solid #eee;"></div>
                    <div style="flex: 1;">
                        <p><strong>Nr działki:</strong> ${point.plotNumber || 'Nie podano'}</p>
                        <p><strong>Współrzędne:</strong> ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</p>
                        <p><strong>Link:</strong> <a href="${geoportalLink}" target="_blank">Otwórz w Geoportalu</a></p>
                    </div>
                </div>
            </div>
        `;
    });
    return `
        <div class="pdf-container" style="font-family: 'Inter', sans-serif;">
            <h1 style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px;">RAPORT ZBIORCZY Z IDENTYFIKACJI</h1>
            <p><strong>Data wygenerowania:</strong> ${today}</p>
            <p><strong>Liczba zidentyfikowanych punktów:</strong> ${points.length}</p>
            <hr style="margin: 20px 0;">
            ${pointsHtml}
        </div>
    `;
}

async function generateBulkReportPDF() {
    if(typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') { showMessage('Biblioteki PDF niedostępne.', 'error'); return; }
    if (bulkIdentifications.length === 0) { showMessage('Brak punktów.', 'info'); return; }

    const generateBtn = document.getElementById('generate-bulk-report-btn');
    generateBtn.disabled = true; generateBtn.textContent = 'Generowanie...';

    try {
        const htmlContent = generateBulkReportHTML(bulkIdentifications);
        const pdfRenderTemplate = document.getElementById('pdf-render-template');
        pdfRenderTemplate.innerHTML = htmlContent;
        const contentToConvert = pdfRenderTemplate.querySelector('.pdf-container');
        const canvas = await html2canvas(contentToConvert, { scale: 2, useCORS: true });
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const imgWidth = 210; const pageHeight = 295;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight; let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        const finalFileName = `Raport_Zbiorczy_${getTimestampForFilename()}.pdf`;
        pdf.save(finalFileName); showMessage('Raport PDF gotowy.', 'success');

        if (!isOfflineMode) {
            try {
                const fd = new FormData();
                fd.append('adres', `Raport Zbiorczy MAPA (${bulkIdentifications.length} pkt)`);
                fd.append('wlasciciel', 'Rozpoznanie i mapowanie wielu podmiotów');
                fd.append('typ', 'NOTATKA_SLUZBOWA');
                fd.append('kategoria', 'IDENTYFIKACJA_ZBIORCZA');
                let notes = "Identyfikacja zbiorcza z mapy:\n";
                bulkIdentifications.forEach((p, i) => { notes += `${i+1}. Działka: ${p.plotNumber || 'Brak danych'} (GPS: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})\n`; });
                fd.append('uwagi', notes);
                if(bulkIdentifications[0] && bulkIdentifications[0].mapScreenshot) {
                     const blob = await base64ToBlob(bulkIdentifications[0].mapScreenshot);
                     fd.append('zdjecia', blob, 'mapa_zbiorcza.jpg');
                }
                await secureFetch('/api/inspector/zglos', { method: 'POST', body: fd });
            } catch(e) { console.warn("Błąd wysyłki raportu", e); }
        }
    } catch (error) { console.error("Błąd generowania:", error); showMessage(`Błąd generowania.`, 'error'); } 
    finally { document.getElementById('pdf-render-template').innerHTML = ''; generateBtn.disabled = false; generateBtn.textContent = 'Generuj Raport Zbiorczy'; }
}

// =========================================================================================
// 12. POBIERANIE MAP OFFLINE (LocalForage)
// =========================================================================================
function openDownloadAreaModal() {
    closeModal(document.getElementById('offline-maps-modal'));
    document.getElementById('offline-area-name').value = '';
    document.getElementById('offline-zoom-slider').value = 16;
    document.getElementById('zoom-level-display').textContent = '16';
    document.getElementById('tile-counter-info').textContent = 'Najpierw zaznacz obszar na mapie.';
    document.getElementById('tile-counter-info').className = 'text-gray-700';
    document.getElementById('download-tiles-btn').disabled = true;

    openModal(document.getElementById('download-map-modal'));
    
    if (!selectionMap) initOfflineSelectionMap();
    else {
        if (selectedLayer) { selectionMap.removeLayer(selectedLayer); selectedLayer = null; }
        setTimeout(() => selectionMap.invalidateSize(), 100);
    }
}

function initOfflineSelectionMap() {
    if(typeof L === 'undefined') { showMessage("Brak modułu mapy.", "error"); return; }
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    const parcelsBorders = L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', { layers: 'dzialki', format: 'image/png', transparent: true });
    
    selectionMap = L.map('offline-map-selection', { layers: [satelliteLayer, parcelsBorders] }).setView([54.03, 21.75], 13);
    L.control.layers({ "Satelita": satelliteLayer }, { "Granice działek": parcelsBorders }).addTo(selectionMap);

    const drawnItems = new L.FeatureGroup(); selectionMap.addLayer(drawnItems);
    drawControl = new L.Control.Draw({
        draw: { polygon: false, polyline: false, circle: false, circlemarker: false, marker: false, rectangle: { shapeOptions: { color: '#0ea5e9' } } },
        edit: { featureGroup: drawnItems, remove: false, edit: false }
    });
    selectionMap.addControl(drawControl);

    selectionMap.on(L.Draw.Event.CREATED, function (e) {
        if (selectedLayer) drawnItems.removeLayer(selectedLayer);
        selectedLayer = e.layer; drawnItems.addLayer(selectedLayer);
        updateTileCount();
    });
}
        
function updateTileCount() {
    if (!selectedLayer) return;
    const bounds = selectedLayer.getBounds();
    const maxZoom = parseInt(document.getElementById('offline-zoom-slider').value);
    const minZoom = 13; let totalTiles = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        const t1 = getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
        const t2 = getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
        totalTiles += (Math.abs(t1.x - t2.x) + 1) * (Math.abs(t1.y - t2.y) + 1);
    }
    totalTiles *= 3; 

    const info = document.getElementById('tile-counter-info');
    const btn = document.getElementById('download-tiles-btn');
    const tileLimit = 150000; 
    info.textContent = `Szacowana liczba kafli: ${totalTiles.toLocaleString('pl-PL')} / ${tileLimit.toLocaleString('pl-PL')}`;
    if (totalTiles > tileLimit) { info.classList.add('limit-exceeded'); info.classList.remove('limit-ok'); btn.disabled = true; } 
    else { info.classList.remove('limit-exceeded'); info.classList.add('limit-ok'); btn.disabled = false; }
}

function getTileCoords(lat, lon, zoom) {
    const latRad = lat * Math.PI / 180; const n = Math.pow(2, zoom);
    const xtile = Math.floor(n * ((lon + 180) / 360));
    const ytile = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
    return { x: xtile, y: ytile };
}
        
async function startOfflineDownload() {
    if (!selectedLayer) { showMessage('Błąd: Brak obszaru.', 'error'); return; }
    const areaName = document.getElementById('offline-area-name').value.trim() || `Mapa offline ${new Date().toLocaleDateString()}`;
    const bounds = selectedLayer.getBounds();
    const maxZoom = parseInt(document.getElementById('offline-zoom-slider').value);
    const minZoom = 13; const downloadBtn = document.getElementById('download-tiles-btn');
    downloadBtn.disabled = true;
    
    const tilesToDownload = [];
    for (let z = minZoom; z <= maxZoom; z++) {
        const t1 = getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
        const t2 = getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
        const minX = Math.min(t1.x, t2.x), maxX = Math.max(t1.x, t2.x);
        const minY = Math.min(t1.y, t2.y), maxY = Math.max(t1.y, t2.y);
        for (let x = minX; x <= maxX; x++) { for (let y = minY; y <= maxY; y++) { tilesToDownload.push({ z, x, y }); } }
    }

    const layersToCache = [];
    if(offlineSatelliteLayer) layersToCache.push({ layer: offlineSatelliteLayer, name: 'satellite' });
    if(parcelsBoundariesLayer) layersToCache.push({ layer: parcelsBoundariesLayer, name: 'parcels-boundaries' });
    if(parcelsNumbersLayer) layersToCache.push({ layer: parcelsNumbersLayer, name: 'parcels-numbers' });

    let downloadedCount = 0;
    const totalCount = tilesToDownload.length * layersToCache.length;
    downloadBtn.textContent = `Pobieranie... (0%)`;

    for (const tile of tilesToDownload) {
        for (const layerInfo of layersToCache) {
            const { z, x, y } = tile;
            if (layerInfo.layer.options.minZoom && z < layerInfo.layer.options.minZoom) { downloadedCount++; continue; }
            const tileUrl = layerInfo.layer.getTileUrl({z, x, y});
            const tileKey = `tile-${layerInfo.name}-${z}-${x}-${y}`;

            try {
                const response = await fetch(tileUrl, { signal: AbortSignal.timeout(10000) });
                if (!response.ok) continue;
                const blob = await response.blob();
                const dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob);
                });
                if(typeof localforage !== 'undefined') await localforage.setItem(tileKey, dataUrl);
            } catch (error) { } 
            finally { downloadedCount++; const progress = Math.floor((downloadedCount / totalCount) * 100); downloadBtn.textContent = `Pobieranie... (${progress}%)`; }
        }
    }
    
    const metadata = getSavedMapsMetadata();
    metadata.push({ id: generateUniqueId(), name: areaName, bounds: bounds.toBBoxString(), minZoom, maxZoom });
    saveMapsMetadata(metadata);
    showMessage(`Obszar zapisany!`, 'success'); downloadBtn.textContent = 'Pobierz'; downloadBtn.disabled = false;
    closeModal(document.getElementById('download-map-modal')); renderSavedMapsList();
}

function renderSavedMapsList() {
    const container = document.getElementById('saved-maps-list');
    const allMetadata = getSavedMapsMetadata();
    if(!container) return;
    container.innerHTML = '';

    if (allMetadata.length === 0) {
         container.innerHTML = '<p class="text-center text-gray-500 p-4 border rounded-lg">Brak zapisanych map.</p>'; return;
    }

    allMetadata.forEach(meta => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-3 bg-gray-50 border rounded-lg';
        div.innerHTML = `
            <div><p class="font-semibold text-gray-800">${meta.name}</p><p class="text-xs text-gray-500">Zoom: ${meta.minZoom}-${meta.maxZoom}</p></div>
            <div>
                <button data-bounds="${meta.bounds}" class="view-map-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-md text-sm mr-2">Zobacz</button>
                <button data-id="${meta.id}" class="delete-map-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-md text-sm">Usuń</button>
            </div>
        `;
        container.appendChild(div);
    });
    
    document.querySelectorAll('.delete-map-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (confirm('Usunąć ten obszar?')) deleteOfflineMap(e.target.dataset.id);
        });
    });

    document.querySelectorAll('.view-map-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(typeof L === 'undefined') return;
            const boundsArray = e.target.dataset.bounds.split(',').map(Number);
            const bounds = L.latLngBounds([boundsArray[1], boundsArray[0]], [boundsArray[3], boundsArray[2]]);
            document.getElementById('tab-identifications').click();
            closeModal(document.getElementById('offline-maps-modal'));
            openIdentificationModal(); 
            setTimeout(() => { if (identificationMap) identificationMap.fitBounds(bounds); }, 500);
        });
    });
}
        
async function deleteOfflineMap(mapId) {
    let metadata = getSavedMapsMetadata();
    const mapToDelete = metadata.find(m => m.id === mapId);
    if (!mapToDelete || typeof L === 'undefined') return;

    const boundsArray = mapToDelete.bounds.split(',').map(Number);
    const bounds = L.latLngBounds(L.latLng(boundsArray[1], boundsArray[0]), L.latLng(boundsArray[3], boundsArray[2]));
    const tilesToRemove = [];
    const layerNames = ['satellite', 'parcels-boundaries', 'parcels-numbers']; 
    
    for (let z = mapToDelete.minZoom; z <= mapToDelete.maxZoom; z++) {
        const t1 = getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
        const t2 = getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
        const minX = Math.min(t1.x, t2.x), maxX = Math.max(t1.x, t2.x);
        const minY = Math.min(t1.y, t2.y), maxY = Math.max(t1.y, t2.y);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) { layerNames.forEach(name => tilesToRemove.push(`tile-${name}-${z}-${x}-${y}`)); }
        }
    }
    
    showMessage('Rozpoczynam usuwanie...', 'info');
    try {
        if(typeof localforage !== 'undefined') {
            for (const key of tilesToRemove) await localforage.removeItem(key);
        }
        saveMapsMetadata(metadata.filter(m => m.id !== mapId));
        renderSavedMapsList(); showMessage('Obszar usunięty.', 'success');
    } catch (err) { showMessage('Błąd usuwania.', 'error'); }
}

function exportData() {
    const dataStr = JSON.stringify({ controls, identifications, bulkIdentifications }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Paczka_${getTimestampForFilename()}.eco`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function handleImport(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.controls) throw new Error("Błąd");
            if (confirm("Nadpisać dane?")) {
                controls = importedData.controls || []; identifications = importedData.identifications || []; bulkIdentifications = importedData.bulkIdentifications || [];
                saveLocalControls(); saveLocalIdentifications(); saveLocalBulkIdentifications();
                applyFilters(); renderIdentifications(); renderBulkIdentificationPoints();
                showMessage("Zaimporowano!", "success");
            }
        } catch (error) { showMessage(`Błąd importu`, "error"); } finally { event.target.value = null; }
    };
    reader.readAsText(file);
}

function applyFilters() {
    const filterAddressInput = document.getElementById('filter-address');
    const filterTypeSelect = document.getElementById('filter-type');
    if(!filterAddressInput || !filterTypeSelect) return;
    const query = filterAddressInput.value.toLowerCase(); const type = filterTypeSelect.value;
    let filtered = controls.filter(control => `${control.street} ${control.houseNumber}, ${control.city}`.toLowerCase().includes(query));
    if (type) filtered = filtered.filter(control => control.type === type);
    renderControls(filtered);
}


// =========================================================================================
// 13. EVENT LISTENERS
// =========================================================================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // Zabezpieczenie przed brakiem tagów w DOM
    const userEmailSpan = document.getElementById('user-email');
    if(userEmailSpan) userEmailSpan.textContent = userName || "Tryb Offline";

    await fetchInspectors();

    controls = JSON.parse(localStorage.getItem('localControls')) || [];
    identifications = JSON.parse(localStorage.getItem('localIdentifications')) || [];
    bulkIdentifications = JSON.parse(localStorage.getItem('localBulkIdentifications')) || [];

    loadApiPoints();
    renderDatalists();
    applyFilters();
    renderIdentifications();
    renderBulkIdentificationPoints();

    const setupSignaturePad = (id) => {
        const canvas = document.getElementById(id);
        if (!canvas) return null;
        if(typeof SignaturePad === 'undefined') {
            console.warn(`Brak biblioteki SignaturePad dla ${id}`);
            return null;
        }
        const pad = new SignaturePad(canvas);
        const resizeCanvas = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext("2d").scale(ratio, ratio);
            pad.clear();
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        return pad;
    };
    
    unionSignaturePad = setupSignaturePad('union-signature-pad');
    partiesSignaturePad = setupSignaturePad('parties-signature-pad');
    jointNoteSignaturePad = setupSignaturePad('joint-note-signature-pad');

    const elmCity = document.getElementById('control-city');
    if(elmCity) elmCity.addEventListener('change', function() {
        const zipInput = document.getElementById('control-zip');
        if (zipCodesByCity[this.value] && zipInput) zipInput.value = zipCodesByCity[this.value];
    });

    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', logout);

    const tabControls = document.getElementById('tab-controls');
    const tabIdentifications = document.getElementById('tab-identifications');
    const tabBulkIdentifications = document.getElementById('tab-bulk-identifications');
    const allTabs = [tabControls, tabIdentifications, tabBulkIdentifications].filter(Boolean);
    const allContentViews = [
        document.getElementById('controls-content-view'), 
        document.getElementById('identifications-content-view'), 
        document.getElementById('bulk-identification-content-view')
    ].filter(Boolean);

    const switchTab = (activeTab) => {
        allTabs.forEach(tab => {
            tab.classList.remove('active', 'text-blue-600', 'border-blue-600', 'bg-blue-50');
            tab.classList.add('border-transparent', 'text-gray-500');
        });
        allContentViews.forEach(view => view.classList.add('hidden'));

        activeTab.classList.remove('border-transparent', 'text-gray-500');
        activeTab.classList.add('active', 'text-blue-600', 'border-blue-600', 'bg-blue-50');
        
        if (activeTab === tabControls) {
            document.getElementById('controls-content-view').classList.remove('hidden'); applyFilters();
        } else if (activeTab === tabIdentifications) {
            document.getElementById('identifications-content-view').classList.remove('hidden'); renderIdentifications();
        } else if (activeTab === tabBulkIdentifications) {
            document.getElementById('bulk-identification-content-view').classList.remove('hidden');
            initBulkIdentificationMap();
            setTimeout(() => { if(bulkIdentificationMap) bulkIdentificationMap.invalidateSize(); }, 100);
        }
    };
    
    if(tabControls) tabControls.addEventListener('click', () => switchTab(tabControls));
    if(tabIdentifications) tabIdentifications.addEventListener('click', () => switchTab(tabIdentifications));
    if(tabBulkIdentifications) tabBulkIdentifications.addEventListener('click', () => switchTab(tabBulkIdentifications));

    const bindClick = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener('click', fn); };
    
    bindClick('export-data-btn', exportData);
    bindClick('import-data-btn', () => document.getElementById('import-file-input').click());
    const fileInput = document.getElementById('import-file-input');
    if(fileInput) fileInput.addEventListener('change', handleImport);

    bindClick('add-control-btn', () => openControlModal());
    bindClick('close-modal-btn', () => closeModal(document.getElementById('control-modal')));
    const ctrlForm = document.getElementById('control-form');
    if(ctrlForm) ctrlForm.addEventListener('submit', (e) => { e.preventDefault(); saveControl(); });
    
    bindClick('delete-control-btn', deleteControl);
    bindClick('generate-protocol-btn', () => openProtocolModal(currentControlId));
    bindClick('close-protocol-modal-btn', () => closeModal(document.getElementById('protocol-modal')));
    bindClick('save-protocol-btn', saveProtocol);
    bindClick('delete-protocol-btn', deleteProtocol);
    bindClick('finalize-protocol-btn', generateProtocolPDF);
    
    const photoInput = document.getElementById('protocol-photos-input');
    if(photoInput) photoInput.addEventListener('change', handlePhotoSelection);
    
    bindClick('clear-union-signature', () => { if(unionSignaturePad) unionSignaturePad.clear(); });
    bindClick('clear-parties-signature', () => { if(partiesSignaturePad) partiesSignaturePad.clear(); });
    
    bindClick('add-joint-note-btn', openJointNoteModal);
    bindClick('close-joint-note-modal-btn', () => closeModal(document.getElementById('joint-note-modal')));
    bindClick('filter-joint-note-btn', filterJointNoteProtocols);
    bindClick('finalize-joint-note-btn', generateJointNotePDF);
    bindClick('clear-joint-note-signature', () => { if(jointNoteSignaturePad) jointNoteSignaturePad.clear(); });

    bindClick('add-identification-btn', () => openIdentificationModal());
    bindClick('close-identification-modal-btn', () => closeModal(document.getElementById('identification-modal')));
    bindClick('capture-btn', handleIdentificationCapture);
    
    const identPhotoInput = document.getElementById('identification-photo-input');
    if(identPhotoInput) identPhotoInput.addEventListener('change', handleIdentificationPhoto);
    
    bindClick('save-identification-btn', saveIdentification);
    bindClick('delete-identification-btn', deleteIdentification);
    bindClick('generate-identification-pdf-btn', generateIdentificationPDF);
    bindClick('fetch-address-btn', fetchAndDisplayAddressData);
    
    bindClick('add-bulk-point-mode-btn', () => setAddBulkPointMode(true));
    bindClick('generate-bulk-report-btn', generateBulkReportPDF);
    bindClick('clear-bulk-points-btn', () => {
         if(confirm('Usunąć WSZYSTKIE zaznaczone punkty?')) {
            bulkIdentifications = []; saveLocalBulkIdentifications(); renderBulkIdentificationPoints(); showMessage('Usunięte.', 'info');
        }
    });
    bindClick('locate-me-bulk-btn', () => {
        if(bulkIdentificationMap && bulkMyLocationMarker) bulkIdentificationMap.setView(bulkMyLocationMarker.getLatLng(), 17);
        else if (bulkIdentificationMap) bulkIdentificationMap.locate({ setView: true, maxZoom: 17 });
    });
    
    document.body.addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-bulk-point-btn')) removeBulkPoint(event.target.dataset.id);
    });
    
    bindClick('fetch-bulk-plot-btn', fetchBulkPlotData);
    bindClick('save-bulk-point-btn', saveBulkPoint);
    bindClick('cancel-bulk-point-btn', () => closeModal(document.getElementById('bulk-point-modal')));

    bindClick('manage-offline-maps-btn', () => { renderSavedMapsList(); openModal(document.getElementById('offline-maps-modal')); });
    bindClick('close-offline-maps-modal-btn', () => closeModal(document.getElementById('offline-maps-modal')));
    bindClick('open-download-modal-btn', openDownloadAreaModal);
    bindClick('close-download-map-modal-btn', () => closeModal(document.getElementById('download-map-modal')));

    const zoomSlider = document.getElementById('offline-zoom-slider');
    const zoomDisplay = document.getElementById('zoom-level-display');
    if(zoomSlider && zoomDisplay) {
        zoomSlider.addEventListener('input', () => { zoomDisplay.textContent = zoomSlider.value; updateTileCount(); });
    }

    bindClick('download-tiles-btn', startOfflineDownload);

    document.querySelectorAll('.back-to-panel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { const modal = e.target.closest('.modal'); if (modal) closeModal(modal); });
    });
    
    const fAddress = document.getElementById('filter-address');
    if(fAddress) fAddress.addEventListener('input', applyFilters);
    const fType = document.getElementById('filter-type');
    if(fType) fType.addEventListener('change', applyFilters);

    bindClick('clear-controls-btn', () => {
        if(confirm('Usunąć WSZYSTKIE kontrole?')) { controls = []; saveLocalControls(); applyFilters(); showMessage('Usunięte.', 'info'); }
    });
    bindClick('clear-identifications-btn', () => {
        if(confirm('Usunąć WSZYSTKIE identyfikacje?')) { identifications = []; saveLocalIdentifications(); renderIdentifications(); showMessage('Usunięte.', 'info'); }
    });
    
    // --- INTELIGENTNY SYSTEM AKTUALIZACJI PWA ---
    let newWorker;
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            const banner = document.getElementById('updateBanner');
                            if(banner) { banner.classList.remove('hidden'); banner.classList.add('block'); }
                        }
                    });
                });
            }).catch(err => console.warn('[PWA] Błąd SW', err));

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) { window.location.reload(); refreshing = true; }
            });
        });
    }

    window.applyUpdate = function() { if (newWorker) newWorker.postMessage('SKIP_WAITING'); }
});