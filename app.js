// app.js - Główny Kontroler Aplikacji (Entry Point)
import { Store } from './store.js';
import { Api } from './api.js';
import { MapEngine } from './maps.js';
import { PdfGenerator } from './pdf.js';
import { UI } from './ui.js';

// --- STAN TYMCZASOWY UI ---
let currentControlId = null;
let currentIdentificationId = null;
let currentIdentificationData = {};
let currentBulkPointCoords = null;
let currentBulkMapScreenshot = null;
let photos = [];
let unionSignaturePad, partiesSignaturePad, jointNoteSignaturePad;


// --- INICJALIZACJA PODPISÓW ---
function setupSignaturePad(id) {
    const canvas = document.getElementById(id);
    if (!canvas) {
        return null;
    }
    if (typeof SignaturePad === 'undefined') {
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
}

function resizeSpecificCanvas(pad, base64Data) {
    if (!pad || !pad.canvas) {
        return;
    }
    const canvas = pad.canvas;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    if (base64Data) {
        pad.fromDataURL(base64Data);
    }
}


// --- GŁÓWNY MECHANIZM "BEZPIECZNEGO AUTO-ZAPISU / CZYSZCZENIA" ---
async function sendAndPromptCleanup(emailPromise, cleanupCallback) {
    try {
        const isProcessStarted = await emailPromise;
        if (isProcessStarted) {
            // Opóźnienie 1.5 sekundy, aby dać systemowi czas na wywołanie klienta poczty
            setTimeout(() => {
                const userConfirmed = confirm("System otworzył lub przygotował klienta poczty do wysyłki.\n\nCzy e-mail został pomyślnie wysłany?\n\nJeśli klikniesz OK, ta kontrola/identyfikacja zostanie trwale USUNIĘTA z pamięci telefonu, aby zwolnić miejsce.");
                
                if (userConfirmed) {
                    cleanupCallback();
                }
            }, 1500);
        }
    } catch (error) {
        UI.showMessage(`Błąd podczas wysyłki: ${error.message}`, 'error');
    }
}


// --- LOGIKA KONTROLI ---
function openControlModal(id = null) {
    currentControlId = id;
    const controlForm = document.getElementById('control-form');
    if (controlForm) {
        controlForm.reset();
    }
    
    document.getElementById('delete-control-btn').classList.add('hidden');
    document.getElementById('generate-protocol-btn').classList.add('hidden');
    document.getElementById('modal-title').textContent = 'Dodaj nową kontrolę';
    
    UI.renderParticipantsCheckboxes();
    
    const dateInput = document.getElementById('control-date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
    
    if (id !== null) {
        const control = Store.controls.find(c => c.id === id);
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
            
            UI.renderParticipantsCheckboxes(control.participants || []);
            document.getElementById('delete-control-btn').classList.remove('hidden');
            document.getElementById('generate-protocol-btn').classList.remove('hidden');
        }
    }
    
    UI.openModal(document.getElementById('control-modal'));
}

function saveControl() {
    const isNew = !currentControlId;
    const docId = currentControlId || Store.generateUniqueId();
    
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
        protocol: null
    };

    if (isNew) {
        Store.controls.push(controlData);
    } else {
        const index = Store.controls.findIndex(c => c.id === docId);
        if (index !== -1) {
            controlData.protocol = Store.controls[index].protocol || null;
            Store.controls[index] = controlData;
        }
    }
    
    Store.saveControls();
    UI.applyFilters(openControlModal);
    UI.showMessage(`Kontrola ${isNew ? 'dodana' : 'zaktualizowana'}!`, 'success');
    UI.closeModal(document.getElementById('control-modal'));
}

function deleteControl() {
    if (!currentControlId || !confirm('Czy na pewno chcesz usunąć tę kontrolę? Tej operacji nie można cofnąć.')) {
        return;
    }
    
    Store.controls = Store.controls.filter(c => c.id !== currentControlId);
    Store.saveControls();
    UI.applyFilters(openControlModal);
    
    UI.showMessage('Kontrola usunięta.', 'info');
    UI.closeModal(document.getElementById('control-modal'));
}


// --- LOGIKA PROTOKOŁÓW ---
function openProtocolModal(controlId) {
    const control = Store.controls.find(c => c.id === controlId);
    if (!control) {
        return;
    }
    
    currentControlId = controlId;
    const protocolForm = document.getElementById('protocol-form');
    if (protocolForm) {
        protocolForm.reset();
    }
    
    const currentProtocol = control.protocol || {};
    photos = currentProtocol.photos || [];
    
    document.getElementById('protocol-date').value = currentProtocol.date || control.date || '';
    document.getElementById('protocol-case').value = currentProtocol.case || `Kontrola w sprawie gospodarowania odpadami komunalnymi na nieruchomości ${UI.getFullAddress(control)}.`;
    document.getElementById('protocol-union-reps').value = (currentProtocol.unionReps || (control.participants || []).join('\n')).trim();
    document.getElementById('protocol-admin-reps').value = currentProtocol.adminReps || '';
    document.getElementById('protocol-parties').value = currentProtocol.parties || '';
    document.getElementById('protocol-witnesses').value = currentProtocol.witnesses || '';
    document.getElementById('protocol-findings').value = currentProtocol.findings || '';
    
    if (unionSignaturePad) {
        unionSignaturePad.clear();
    }
    if (partiesSignaturePad) {
        partiesSignaturePad.clear();
    }
    
    setTimeout(() => {
        resizeSpecificCanvas(unionSignaturePad, currentProtocol.unionSignature);
        resizeSpecificCanvas(partiesSignaturePad, currentProtocol.partiesSignature);
    }, 300); 
    
    UI.renderPhotos(photos, (id) => {
        photos = photos.filter(p => p.id !== id);
        UI.renderPhotos(photos);
    });
    
    UI.renderNoteCategories();
    UI.renderNoteList();
    UI.openModal(document.getElementById('protocol-modal'));
}

function saveProtocol() {
    const controlIndex = Store.controls.findIndex(c => c.id === currentControlId);
    if (controlIndex === -1) {
        return;
    }

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

    Store.controls[controlIndex].protocol = protocolData;
    Store.saveControls();
    
    UI.applyFilters(openControlModal);
    UI.showMessage('Protokół został zapisany w pamięci urządzenia!', 'success');
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Zapisz protokół';
}

function deleteProtocol() {
    if (!currentControlId || !confirm('Czy na pewno chcesz usunąć ten protokół?')) {
        return;
    }
    
    const controlIndex = Store.controls.findIndex(c => c.id === currentControlId);
    if (controlIndex !== -1) {
        Store.controls[controlIndex].protocol = null;
        Store.saveControls();
        UI.applyFilters(openControlModal);
        
        UI.showMessage('Protokół został usunięty z tej kontroli.', 'info');
        UI.closeModal(document.getElementById('protocol-modal'));
    }
}

function handlePhotoSelection(event) {
    Array.from(event.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            photos.push({ 
                id: Date.now().toString() + Math.random(), 
                url: e.target.result 
            });
            UI.renderPhotos(photos, (id) => {
                photos = photos.filter(p => p.id !== id);
                UI.renderPhotos(photos);
            });
        };
        reader.readAsDataURL(file);
    });
    event.target.value = ''; 
}

function triggerProtocolEmail() {
    const btn = document.getElementById('finalize-protocol-btn');
    btn.disabled = true;
    btn.textContent = 'Generowanie PDF...';
    
    const emailProcess = PdfGenerator.processProtocol(currentControlId);
    
    sendAndPromptCleanup(emailProcess, () => {
        // Callback czyszczący po zatwierdzeniu przez użytkownika
        Store.controls = Store.controls.filter(c => c.id !== currentControlId);
        Store.saveControls();
        UI.applyFilters(openControlModal);
        UI.closeModal(document.getElementById('protocol-modal'));
        UI.closeModal(document.getElementById('control-modal'));
        UI.showMessage('Dane kontroli zostały usunięte z urządzenia.', 'success');
    }).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Generuj i wyślij e-mail';
    });
}


// --- LOGIKA NOTATKI ZBIORCZEJ ---
function openJointNoteModal() {
    const form = document.getElementById('joint-note-form');
    if (form) {
        form.reset();
    }
    
    document.getElementById('joint-note-protocols-summary').classList.add('hidden');
    document.getElementById('protocols-count').textContent = '';
    document.getElementById('joint-note-participants-container').innerHTML = '';
    document.getElementById('finalize-joint-note-btn').disabled = true;
    
    if (jointNoteSignaturePad) {
        jointNoteSignaturePad.clear();
    }
    
    setTimeout(() => {
        resizeSpecificCanvas(jointNoteSignaturePad, null);
    }, 300);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('joint-note-date-filter').value = today;
    
    UI.openModal(document.getElementById('joint-note-modal'));
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
        UI.showMessage('Wybierz datę, aby przefiltrować protokoły.', 'info');
        return;
    }
    
    const filteredControls = Store.controls.filter(c => c.date === dateFilter && c.protocol);
    
    if (filteredControls.length === 0) {
        protocolsCountP.textContent = `Nie znaleziono zapisanych protokołów z dnia ${UI.formatDate(dateFilter)}.`;
        summaryBox.classList.remove('hidden');
        UI.showMessage('Brak protokołów do połączenia.', 'error');
        return;
    }
    
    const uniqueParticipants = new Set();
    filteredControls.forEach(c => {
        if (c.protocol && c.protocol.unionReps) {
            c.protocol.unionReps.split('\n').map(r => r.trim()).filter(r => r).forEach(r => uniqueParticipants.add(r));
        }
    });
    
    const participantsList = Array.from(uniqueParticipants).sort();
    protocolsCountP.textContent = `Znaleziono ${filteredControls.length} protokołów z dnia ${UI.formatDate(dateFilter)} gotowych do połączenia:`;
    summaryBox.classList.remove('hidden');
    
    participantsList.forEach(p => {
        const div = document.createElement('div');
        div.className = 'text-sm text-gray-700 p-2 bg-white border border-gray-300 rounded';
        div.textContent = p;
        participantsContainer.appendChild(div);
    });
    
    finalizeBtn.disabled = false;
}

function triggerJointNoteEmail() {
    const dateFilter = document.getElementById('joint-note-date-filter').value;
    const city = document.getElementById('joint-note-city').value.trim();
    const subject = document.getElementById('joint-note-subject').value.trim();
    const signatureBase64 = (jointNoteSignaturePad && !jointNoteSignaturePad.isEmpty()) ? jointNoteSignaturePad.toDataURL('image/png') : null;
    
    if (!dateFilter || !city) { 
        UI.showMessage('Uzupełnij wymagane pola notatki.', 'error'); 
        return; 
    }
    
    const filteredControls = Store.controls.filter(c => c.date === dateFilter && c.protocol);
    if (filteredControls.length === 0) { 
        UI.showMessage('Brak protokołów.', 'error'); 
        return; 
    }

    const btn = document.getElementById('finalize-joint-note-btn');
    btn.disabled = true;
    btn.textContent = 'Generowanie PDF...';
    
    const emailProcess = PdfGenerator.processJointNote(dateFilter, city, subject, filteredControls, signatureBase64);
    
    sendAndPromptCleanup(emailProcess, () => {
        // Czyszczenie hurtowe
        const idsToRemove = filteredControls.map(c => c.id);
        Store.controls = Store.controls.filter(c => !idsToRemove.includes(c.id));
        Store.saveControls();
        UI.applyFilters(openControlModal);
        UI.closeModal(document.getElementById('joint-note-modal'));
        UI.showMessage('Powiązane kontrole zostały usunięte z urządzenia.', 'success');
    }).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Generuj i wyślij e-mail (PDF)';
    });
}


// --- LOGIKA IDENTYFIKACJI ---
function openIdentificationModal(id = null) {
    currentIdentificationId = id;
    const form = document.getElementById('identification-form');
    const mapStep = document.getElementById('identification-map-step');
    const previewStep = document.getElementById('identification-preview-step');
    const saveBtn = document.getElementById('save-identification-btn');
    const deleteBtn = document.getElementById('delete-identification-btn');
    const generatePdfBtn = document.getElementById('generate-identification-pdf-btn');
    
    if (form) {
        form.reset();
    }
    
    currentIdentificationData = {};
    document.getElementById('address-status').innerHTML = '';

    generatePdfBtn.classList.add('hidden');
    deleteBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    if (id) {
        const item = Store.identifications.find(i => i.id === id);
        if (!item) {
            return;
        }

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
        if (item.fullAddress) {
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
            MapEngine.initIdentificationMap(() => {
                UI.showMessage('Wystąpił błąd geolokalizacji. Ustaw mapę ręcznie.', 'error');
            });
            if (MapEngine.identificationMap) {
                MapEngine.identificationMap.invalidateSize();
            }
        }, 100);
    }
    
    UI.openModal(document.getElementById('identification-modal'));
}

async function handleIdentificationCapture() {
    if (typeof html2canvas === 'undefined') {
        UI.showMessage("Biblioteka zrzutów ekranu nie została załadowana.", "error");
        return;
    }

    const captureBtn = document.getElementById('capture-btn');
    captureBtn.disabled = true;
    captureBtn.textContent = 'Przetwarzam mapę...';

    if (MapEngine.identificationMap) {
        const center = MapEngine.identificationMap.getCenter();
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
        UI.showMessage("Błąd zrzutu mapy. Spróbuj ponownie.", "error");
        captureBtn.disabled = false;
        captureBtn.textContent = 'Zatwierdź lokalizację i zrób zdjęcie';
    }
}

function handleIdentificationPhoto(event) {
    const file = event.target.files[0];
    const captureBtn = document.getElementById('capture-btn');
    
    captureBtn.disabled = false;
    captureBtn.textContent = 'Zatwierdź lokalizację i zrób zdjęcie';
    
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const MAX_WIDTH = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { 
                    height = height * (MAX_WIDTH / width); 
                    width = MAX_WIDTH; 
                }
            } else {
                if (height > MAX_WIDTH) { 
                    width = width * (MAX_WIDTH / height); 
                    height = MAX_WIDTH; 
                }
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

async function fetchAndDisplayAddressData() {
    const statusP = document.getElementById('address-status');
    const plotInput = document.getElementById('identification-plot-number');
    const fetchBtn = document.getElementById('fetch-address-btn');
    
    if (!currentIdentificationData.latitude || !currentIdentificationData.longitude) {
        statusP.textContent = 'Brak zapisanych współrzędnych.';
        return;
    }

    statusP.textContent = 'Pobieram dane (GUGiK & Google)...';
    statusP.style.color = '#6b7280';
    fetchBtn.disabled = true;

    try {
        const [gugikResult, googleResult] = await Promise.all([
            MapEngine.getParcelDataByXY(currentIdentificationData.longitude, currentIdentificationData.latitude),
            MapEngine.getAddressFromGoogle(currentIdentificationData.latitude, currentIdentificationData.longitude)
        ]);

        let finalAddress = '';
        let finalPlotNumber = '';
        let statusHtml = '';

        if (!googleResult.error && googleResult.address) {
            finalAddress = googleResult.address;
        } else {
            statusHtml += `❌ Błąd adresu (Google): ${googleResult.message}<br>`;
        }

        if (!gugikResult.error && gugikResult.parcelId) {
            finalPlotNumber = gugikResult.parcelId;
            plotInput.value = finalPlotNumber;
        }

        currentIdentificationData.fullAddress = finalAddress; 

        if (finalAddress) {
            statusHtml = `✅ Adres (Google): <strong>${finalAddress}</strong>`;
            if (finalPlotNumber) {
                statusHtml += `<br>✅ Działka (GUGiK): <strong>${finalPlotNumber}</strong>`;
            }
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

function saveIdentification() {
    const notes = document.getElementById('identification-notes').value.trim();
    const plotNumber = document.getElementById('identification-plot-number').value.trim();
    const isNew = !currentIdentificationId;
    
    if (isNew) {
         if (!currentIdentificationData.latitude || !currentIdentificationData.photo) {
            UI.showMessage('Brak danych lokalizacji lub zdjęcia. Spróbuj ponownie.', 'error');
            return;
        }
        
        const newId = Store.generateUniqueId();
        const newIdentification = {
            id: newId,
            timestamp: new Date().toISOString(),
            latitude: currentIdentificationData.latitude,
            longitude: currentIdentificationData.longitude,
            photo: currentIdentificationData.photo,
            notes: notes,
            plotNumber: plotNumber,
            fullAddress: currentIdentificationData.fullAddress || '',
            mapScreenshot: currentIdentificationData.mapScreenshot || ''
        };
        
        Store.identifications.push(newIdentification);

    } else {
        const index = Store.identifications.findIndex(i => i.id === currentIdentificationId);
        if (index !== -1) {
            Store.identifications[index].notes = notes;
            Store.identifications[index].plotNumber = plotNumber;
            Store.identifications[index].fullAddress = currentIdentificationData.fullAddress || Store.identifications[index].fullAddress || '';
            
            if (currentIdentificationData.mapScreenshot) {
                Store.identifications[index].mapScreenshot = currentIdentificationData.mapScreenshot;
            }
        }
    }
    
    Store.saveIdentifications();
    UI.renderIdentifications(Store.identifications, openIdentificationModal);
    UI.showMessage(`Identyfikacja ${isNew ? 'zapisana' : 'zaktualizowana'}!`, 'success');
    UI.closeModal(document.getElementById('identification-modal'));
}

function deleteIdentification() {
    if (!currentIdentificationId || !confirm('Czy na pewno chcesz usunąć tę identyfikację?')) {
        return;
    }
    
    Store.identifications = Store.identifications.filter(i => i.id !== currentIdentificationId);
    Store.saveIdentifications();
    UI.renderIdentifications(Store.identifications, openIdentificationModal);
    
    UI.showMessage('Identyfikacja usunięta.', 'info');
    UI.closeModal(document.getElementById('identification-modal'));
}

function triggerIdentificationEmail() {
    let item = Store.identifications.find(i => i.id === currentIdentificationId);
    if (!item) {
        return;
    }

    // Aktualizacja w locie przed wysyłką
    item.notes = document.getElementById('identification-notes').value;
    item.plotNumber = document.getElementById('identification-plot-number').value;
    if (currentIdentificationData.fullAddress) {
        item.fullAddress = currentIdentificationData.fullAddress;
    }
    if (currentIdentificationData.mapScreenshot) {
        item.mapScreenshot = currentIdentificationData.mapScreenshot;
    }

    const btn = document.getElementById('generate-identification-pdf-btn');
    btn.disabled = true;
    btn.textContent = 'Generowanie PDF...';

    const emailProcess = PdfGenerator.processIdentification(item);
    
    sendAndPromptCleanup(emailProcess, () => {
        Store.identifications = Store.identifications.filter(i => i.id !== currentIdentificationId);
        Store.saveIdentifications();
        UI.renderIdentifications(Store.identifications, openIdentificationModal);
        UI.closeModal(document.getElementById('identification-modal'));
        UI.showMessage('Dane usunięte pomyślnie.', 'success');
    }).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Wyślij Raport e-mail';
    });
}


// --- LOGIKA IDENTYFIKACJI ZBIORCZEJ (MAPA) ---
function updateBulkPointsCounter() {
    const counter = document.getElementById('bulk-points-counter');
    if (counter) {
        counter.textContent = Store.bulkIdentifications.length;
    }
}

async function handleBulkMapClick(latlng) {
    if (typeof html2canvas === 'undefined') {
        UI.showMessage('Moduł zrzutów ekranu niedostępny.', 'error');
        return;
    }
    
    currentBulkPointCoords = latlng;
    currentBulkMapScreenshot = null;
    UI.showMessage('Tworzę zrzut ekranu mapy...', 'info');

    const tempMarker = L.marker(latlng).addTo(MapEngine.bulkIdentificationMap);

    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const mapContainer = document.getElementById('bulk-identification-map-container');
        const canvas = await html2canvas(mapContainer, { useCORS: true, logging: false });
        currentBulkMapScreenshot = canvas.toDataURL('image/jpeg', 0.85);

        document.getElementById('bulk-point-plot-number').value = '';
        document.getElementById('bulk-plot-status').textContent = '';
        document.getElementById('bulk-point-screenshot-preview').src = currentBulkMapScreenshot;
        
        UI.openModal(document.getElementById('bulk-point-modal'));
    } catch (error) {
        console.error("Błąd tworzenia zrzutu ekranu:", error);
        UI.showMessage('Nie udało się utworzyć zrzutu ekranu mapy.', 'error');
    } finally {
        if (tempMarker && MapEngine.bulkIdentificationMap) {
            MapEngine.bulkIdentificationMap.removeLayer(tempMarker);
        }
    }
}

async function fetchBulkPlotData() {
    if (!currentBulkPointCoords) {
        return;
    }
    
    const statusP = document.getElementById('bulk-plot-status');
    const plotInput = document.getElementById('bulk-point-plot-number');
    const fetchBtn = document.getElementById('fetch-bulk-plot-btn');
    
    statusP.textContent = 'Pobieram numer działki...';
    fetchBtn.disabled = true;

    const result = await MapEngine.getParcelDataByXY(currentBulkPointCoords.lng, currentBulkPointCoords.lat);
    
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
        UI.showMessage('Brak zrzutu ekranu. Spróbuj dodać punkt ponownie.', 'error');
        return;
    }

    const newPoint = {
        id: Store.generateUniqueId(),
        lat: currentBulkPointCoords.lat,
        lng: currentBulkPointCoords.lng,
        plotNumber: document.getElementById('bulk-point-plot-number').value.trim(),
        mapScreenshot: currentBulkMapScreenshot
    };

    Store.bulkIdentifications.push(newPoint);
    Store.saveBulkIdentifications();
    
    MapEngine.addBulkPointToMap(newPoint);
    updateBulkPointsCounter();
    
    UI.closeModal(document.getElementById('bulk-point-modal'));
}

function removeBulkPoint(pointId) {
    if (!confirm('Czy na pewno chcesz usunąć ten punkt?')) {
        return;
    }
    
    Store.bulkIdentifications = Store.bulkIdentifications.filter(p => p.id !== pointId);
    Store.saveBulkIdentifications();

    if (MapEngine.bulkMarkersLayer) {
        MapEngine.bulkMarkersLayer.eachLayer(marker => {
            if (marker.options.pointId === pointId) {
                MapEngine.bulkMarkersLayer.removeLayer(marker);
            }
        });
    }
    
    updateBulkPointsCounter();
    
    if (MapEngine.bulkIdentificationMap) {
        MapEngine.bulkIdentificationMap.closePopup();
    }
}

function triggerBulkReportEmail() {
    if (Store.bulkIdentifications.length === 0) { 
        UI.showMessage('Brak punktów.', 'info'); 
        return; 
    }

    const btn = document.getElementById('generate-bulk-report-btn');
    btn.disabled = true;
    btn.textContent = 'Generowanie PDF...';

    const emailProcess = PdfGenerator.processBulkReport();
    
    sendAndPromptCleanup(emailProcess, () => {
        Store.bulkIdentifications = [];
        Store.saveBulkIdentifications();
        MapEngine.renderBulkPoints();
        updateBulkPointsCounter();
        UI.showMessage('Wszystkie punkty zostały usunięte z mapy.', 'success');
    }).finally(() => {
        btn.disabled = false;
        btn.textContent = 'Generuj Raport Zbiorczy';
    });
}


// --- ZARZĄDZANIE DANYMI (EKSPORT/IMPORT JSON) ---
function exportData() {
    const dataStr = JSON.stringify({ 
        controls: Store.controls, 
        identifications: Store.identifications, 
        bulkIdentifications: Store.bulkIdentifications 
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    
    a.href = url; 
    a.download = `Kopia_Zapasowa_${PdfGenerator.getTimestampForFilename()}.eco`;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url);
}

function handleImport(event) {
    const file = event.target.files[0]; 
    if (!file) {
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.controls) {
                throw new Error("Nieprawidłowy plik");
            }
            if (confirm("Nadpisać całkowicie wszystkie obecne dane z tego pliku?")) {
                Store.controls = importedData.controls || []; 
                Store.identifications = importedData.identifications || []; 
                Store.bulkIdentifications = importedData.bulkIdentifications || [];
                
                Store.saveControls(); 
                Store.saveIdentifications(); 
                Store.saveBulkIdentifications();
                
                UI.applyFilters(openControlModal); 
                UI.renderIdentifications(Store.identifications, openIdentificationModal); 
                MapEngine.renderBulkPoints();
                updateBulkPointsCounter();
                
                UI.showMessage("Zaimporowano pomyślnie!", "success");
            }
        } catch (error) { 
            UI.showMessage(`Błąd importu: sprawdź format pliku.`, "error"); 
        } finally { 
            event.target.value = null; 
        }
    };
    reader.readAsText(file);
}


// --- INICJALIZACJA SYSTEMU I BINDING ZDARZEŃ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Inicjalizacja Warstw Mapy
    MapEngine.initLayers();

    // Wyświetlenie zalogowanego użytkownika z Modułu Store
    const userEmailSpan = document.getElementById('user-email');
    if (userEmailSpan) {
        userEmailSpan.textContent = Store.userName || "Tryb Offline";
    }

    // Renderowanie początkowe interfejsu
    UI.renderDatalists();
    UI.applyFilters(openControlModal);
    UI.renderIdentifications(Store.identifications, openIdentificationModal);
    MapEngine.renderBulkPoints();
    updateBulkPointsCounter();

    // Inicjalizacja Pól Podpisu
    unionSignaturePad = setupSignaturePad('union-signature-pad');
    partiesSignaturePad = setupSignaturePad('parties-signature-pad');
    jointNoteSignaturePad = setupSignaturePad('joint-note-signature-pad');

    // Automatyczne Kody Pocztowe
    const elmCity = document.getElementById('control-city');
    if (elmCity) {
        elmCity.addEventListener('change', function() {
            const zipInput = document.getElementById('control-zip');
            if (Store.zipCodesByCity[this.value] && zipInput) {
                zipInput.value = Store.zipCodesByCity[this.value];
            }
        });
    }

    // Funkcja Pomocnicza do Bindowania
    const bindClick = (id, fn) => { 
        const el = document.getElementById(id); 
        if (el) {
            el.addEventListener('click', fn); 
        }
    };

    // Globalne Wylogowanie (przez moduł Api)
    bindClick('logout-btn', () => Api.logout());

    // Zakładki (Tabs)
    const tabControls = document.getElementById('tab-controls');
    const tabIdentifications = document.getElementById('tab-identifications');
    const tabBulkIdentifications = document.getElementById('tab-bulk-identifications');

    if (tabControls) tabControls.addEventListener('click', () => UI.switchTab(tabControls));
    if (tabIdentifications) tabIdentifications.addEventListener('click', () => UI.switchTab(tabIdentifications));
    if (tabBulkIdentifications) {
        tabBulkIdentifications.addEventListener('click', () => {
            UI.switchTab(tabBulkIdentifications);
            MapEngine.initBulkIdentificationMap(handleBulkMapClick, (showHint) => {
                const hint = document.getElementById('bulk-map-zoom-hint');
                if (hint) {
                    showHint ? hint.classList.remove('hidden') : hint.classList.add('hidden');
                }
            });
            setTimeout(() => { 
                if (MapEngine.bulkIdentificationMap) {
                    MapEngine.bulkIdentificationMap.invalidateSize(); 
                }
            }, 100);
        });
    }

    // Główne Przyciski Narzędziowe
    bindClick('export-data-btn', exportData);
    bindClick('import-data-btn', () => document.getElementById('import-file-input').click());
    
    const fileInput = document.getElementById('import-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleImport);
    }

    // Przyciski Formularza Kontroli
    bindClick('add-control-btn', () => openControlModal());
    bindClick('close-modal-btn', () => UI.closeModal(document.getElementById('control-modal')));
    bindClick('delete-control-btn', deleteControl);
    bindClick('generate-protocol-btn', () => openProtocolModal(currentControlId));
    
    const ctrlForm = document.getElementById('control-form');
    if (ctrlForm) {
        ctrlForm.addEventListener('submit', (e) => { 
            e.preventDefault(); 
            saveControl(); 
        });
    }

    // Przyciski Protokołu
    bindClick('close-protocol-modal-btn', () => UI.closeModal(document.getElementById('protocol-modal')));
    bindClick('save-protocol-btn', saveProtocol);
    bindClick('delete-protocol-btn', deleteProtocol);
    bindClick('finalize-protocol-btn', triggerProtocolEmail);
    bindClick('clear-union-signature', () => { if (unionSignaturePad) unionSignaturePad.clear(); });
    bindClick('clear-parties-signature', () => { if (partiesSignaturePad) partiesSignaturePad.clear(); });
    
    const photoInput = document.getElementById('protocol-photos-input');
    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoSelection);
    }

    // Przyciski Notatki Zbiorczej
    bindClick('add-joint-note-btn', openJointNoteModal);
    bindClick('close-joint-note-modal-btn', () => UI.closeModal(document.getElementById('joint-note-modal')));
    bindClick('filter-joint-note-btn', filterJointNoteProtocols);
    bindClick('finalize-joint-note-btn', triggerJointNoteEmail);
    bindClick('clear-joint-note-signature', () => { if (jointNoteSignaturePad) jointNoteSignaturePad.clear(); });

    // Przyciski Identyfikacji Terenowej
    bindClick('add-identification-btn', () => openIdentificationModal());
    bindClick('close-identification-modal-btn', () => UI.closeModal(document.getElementById('identification-modal')));
    bindClick('capture-btn', handleIdentificationCapture);
    bindClick('fetch-address-btn', fetchAndDisplayAddressData);
    bindClick('save-identification-btn', saveIdentification);
    bindClick('delete-identification-btn', deleteIdentification);
    bindClick('generate-identification-pdf-btn', triggerIdentificationEmail);

    const identPhotoInput = document.getElementById('identification-photo-input');
    if (identPhotoInput) {
        identPhotoInput.addEventListener('change', handleIdentificationPhoto);
    }

    // Przyciski Identyfikacji Zbiorczej (Mapy)
    bindClick('add-bulk-point-mode-btn', () => MapEngine.setAddBulkPointMode(true));
    bindClick('generate-bulk-report-btn', triggerBulkReportEmail);
    bindClick('locate-me-bulk-btn', () => {
        if (MapEngine.bulkIdentificationMap && MapEngine.bulkMyLocationMarker) {
            MapEngine.bulkIdentificationMap.setView(MapEngine.bulkMyLocationMarker.getLatLng(), 17);
        } else if (MapEngine.bulkIdentificationMap) {
            MapEngine.bulkIdentificationMap.locate({ setView: true, maxZoom: 17 });
        }
    });
    bindClick('clear-bulk-points-btn', () => {
         if (confirm('Usunąć WSZYSTKIE zaznaczone punkty?')) {
            Store.bulkIdentifications = []; 
            Store.saveBulkIdentifications(); 
            MapEngine.renderBulkPoints(); 
            updateBulkPointsCounter();
            UI.showMessage('Usunięte.', 'info');
        }
    });

    bindClick('fetch-bulk-plot-btn', fetchBulkPlotData);
    bindClick('save-bulk-point-btn', saveBulkPoint);
    bindClick('cancel-bulk-point-btn', () => UI.closeModal(document.getElementById('bulk-point-modal')));

    // Dynamiczne zdarzenia (Delegacja wprost na body dla usuwania punktów na mapie)
    document.body.addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-bulk-point-btn')) {
            removeBulkPoint(event.target.dataset.id);
        }
    });

    // Przyciski Map Offline (LocalForage)
    const renderMapsListToUI = () => {
        const container = document.getElementById('saved-maps-list');
        const allMetadata = Store.getMapsMetadata();
        if (!container) return;
        container.innerHTML = '';

        if (allMetadata.length === 0) {
             container.innerHTML = '<p class="text-center text-gray-500 p-4 border rounded-lg">Brak zapisanych map.</p>'; 
             return;
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
            btn.addEventListener('click', async (e) => {
                if (confirm('Usunąć ten obszar?')) {
                    UI.showMessage('Rozpoczynam usuwanie...', 'info');
                    const success = await MapEngine.deleteOfflineMap(e.target.dataset.id);
                    if (success) {
                        renderMapsListToUI();
                        UI.showMessage('Obszar usunięty.', 'success');
                    } else {
                        UI.showMessage('Błąd usuwania.', 'error');
                    }
                }
            });
        });

        document.querySelectorAll('.view-map-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (typeof L === 'undefined') return;
                const boundsArray = e.target.dataset.bounds.split(',').map(Number);
                const bounds = L.latLngBounds([boundsArray[1], boundsArray[0]], [boundsArray[3], boundsArray[2]]);
                
                document.getElementById('tab-identifications').click();
                UI.closeModal(document.getElementById('offline-maps-modal'));
                openIdentificationModal(); 
                
                setTimeout(() => { 
                    if (MapEngine.identificationMap) {
                        MapEngine.identificationMap.fitBounds(bounds); 
                    }
                }, 500);
            });
        });
    };

    bindClick('manage-offline-maps-btn', () => { 
        renderMapsListToUI(); 
        UI.openModal(document.getElementById('offline-maps-modal')); 
    });
    bindClick('close-offline-maps-modal-btn', () => UI.closeModal(document.getElementById('offline-maps-modal')));
    
    bindClick('open-download-modal-btn', () => {
        UI.closeModal(document.getElementById('offline-maps-modal'));
        document.getElementById('offline-area-name').value = '';
        document.getElementById('offline-zoom-slider').value = 16;
        document.getElementById('zoom-level-display').textContent = '16';
        document.getElementById('tile-counter-info').textContent = 'Najpierw zaznacz obszar na mapie.';
        document.getElementById('tile-counter-info').className = 'text-gray-700';
        document.getElementById('download-tiles-btn').disabled = true;

        UI.openModal(document.getElementById('download-map-modal'));
        
        if (!MapEngine.selectionMap) {
            MapEngine.initOfflineSelectionMap((bounds) => {
                const maxZoom = parseInt(document.getElementById('offline-zoom-slider').value);
                const minZoom = 13;
                const totalTiles = MapEngine.calculateTotalTiles(bounds, minZoom, maxZoom);
                
                const info = document.getElementById('tile-counter-info');
                const btn = document.getElementById('download-tiles-btn');
                const tileLimit = 150000; 
                
                info.textContent = `Szacowana liczba kafli: ${totalTiles.toLocaleString('pl-PL')} / ${tileLimit.toLocaleString('pl-PL')}`;
                
                if (totalTiles > tileLimit) { 
                    info.classList.add('limit-exceeded'); 
                    info.classList.remove('limit-ok'); 
                    btn.disabled = true; 
                } else { 
                    info.classList.remove('limit-exceeded'); 
                    info.classList.add('limit-ok'); 
                    btn.disabled = false; 
                }
            });
        } else {
            if (MapEngine.selectedLayer) { 
                MapEngine.selectionMap.removeLayer(MapEngine.selectedLayer); 
                MapEngine.selectedLayer = null; 
            }
            setTimeout(() => MapEngine.selectionMap.invalidateSize(), 100);
        }
    });

    bindClick('close-download-map-modal-btn', () => UI.closeModal(document.getElementById('download-map-modal')));

    const zoomSlider = document.getElementById('offline-zoom-slider');
    const zoomDisplay = document.getElementById('zoom-level-display');
    if (zoomSlider && zoomDisplay) {
        zoomSlider.addEventListener('input', () => { 
            zoomDisplay.textContent = zoomSlider.value; 
            if (MapEngine.selectedLayer) {
                // Wywołujemy ponownie event zaznaczenia, aby przeliczyć kafelki
                MapEngine.selectionMap.fire(L.Draw.Event.CREATED, { layer: MapEngine.selectedLayer });
            }
        });
    }

    bindClick('download-tiles-btn', async () => {
        if (!MapEngine.selectedLayer) { 
            UI.showMessage('Błąd: Brak obszaru.', 'error'); 
            return; 
        }
        
        const areaName = document.getElementById('offline-area-name').value.trim() || `Mapa offline ${new Date().toLocaleDateString()}`;
        const bounds = MapEngine.selectedLayer.getBounds();
        const maxZoom = parseInt(document.getElementById('offline-zoom-slider').value);
        const minZoom = 13; 
        const downloadBtn = document.getElementById('download-tiles-btn');
        
        downloadBtn.disabled = true;
        
        await MapEngine.startOfflineDownload(bounds, areaName, minZoom, maxZoom, (progress) => {
            downloadBtn.textContent = `Pobieranie... (${progress}%)`;
        });
        
        UI.showMessage(`Obszar zapisany!`, 'success'); 
        downloadBtn.textContent = 'Pobierz'; 
        downloadBtn.disabled = false;
        
        UI.closeModal(document.getElementById('download-map-modal')); 
        renderMapsListToUI();
    });

    // Filtry list
    const fAddress = document.getElementById('filter-address');
    if (fAddress) {
        fAddress.addEventListener('input', () => UI.applyFilters(openControlModal));
    }
    const fType = document.getElementById('filter-type');
    if (fType) {
        fType.addEventListener('change', () => UI.applyFilters(openControlModal));
    }

    // Zamknięcie modali po kliknięciu "Powrót do panelu"
    document.querySelectorAll('.back-to-panel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            const modal = e.target.closest('.modal'); 
            if (modal) {
                UI.closeModal(modal); 
            }
        });
    });

    // Hurtowe czyszczenie
    bindClick('clear-controls-btn', () => {
        if (confirm('Usunąć WSZYSTKIE kontrole z pamięci tego urządzenia?')) { 
            Store.controls = []; 
            Store.saveControls(); 
            UI.applyFilters(openControlModal); 
            UI.showMessage('Usunięte.', 'info'); 
        }
    });
    
    bindClick('clear-identifications-btn', () => {
        if (confirm('Usunąć WSZYSTKIE identyfikacje z pamięci tego urządzenia?')) { 
            Store.identifications = []; 
            Store.saveIdentifications(); 
            UI.renderIdentifications(Store.identifications, openIdentificationModal); 
            UI.showMessage('Usunięte.', 'info'); 
        }
    });
    
    // --- INTELIGENTNY SYSTEM AKTUALIZACJI PWA ---
    let newWorker;
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            const banner = document.getElementById('updateBanner');
                            if (banner) { 
                                banner.classList.remove('hidden'); 
                                banner.classList.add('block'); 
                            }
                        }
                    });
                });
            }).catch(err => console.warn('[PWA] Błąd SW', err));

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) { 
                    window.location.reload(); 
                    refreshing = true; 
                }
            });
        });
    }

    window.applyUpdate = function() { 
        if (newWorker) {
            newWorker.postMessage('SKIP_WAITING'); 
        }
    }
});