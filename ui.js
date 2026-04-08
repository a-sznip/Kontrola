// ui.js - Interfejs Użytkownika i Renderowanie
import { Store } from './store.js';
import { MapEngine } from './maps.js';

export const UI = {

    showMessage(message, type = 'info') {
        const box = document.getElementById('message-box');
        if (!box) {
            return;
        }
        
        box.textContent = message;
        
        const baseClasses = 'fixed bottom-8 right-8 p-4 rounded-lg text-white shadow-lg z-50 transition-opacity duration-300 block';
        const colorClass = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
        
        box.className = `${baseClasses} ${colorClass} opacity-100`;
        
        setTimeout(() => {
            box.classList.replace('opacity-100', 'opacity-0');
            setTimeout(() => {
                box.classList.add('hidden');
            }, 300);
        }, 3000);
    },

    formatDate(dateString) {
        if (!dateString) {
            return '';
        }
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL') + ' ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    },

    getFullAddress(control) {
        return `${control.street} ${control.houseNumber}, ${control.city} ${control.zip}`;
    },

    formatType(type) {
        return type === 'planowa' ? 'Planowa' : 'Interwencyjna';
    },

    renderDatalists() {
        const streetDatalist = document.getElementById('street-suggestions');
        if (streetDatalist) {
            streetDatalist.innerHTML = Store.ulice.map(u => `<option value="${u}">`).join('');
        }
        
        const cityDatalist = document.getElementById('city-suggestions');
        if (cityDatalist) {
            cityDatalist.innerHTML = Object.values(Store.miejscowosciByGmina).flat().map(m => `<option value="${m}">`).join('');
        }
    },

    renderParticipantsCheckboxes(selectedParticipants = []) {
        const container = document.getElementById('participants-container');
        if (!container) {
            return;
        }
        
        container.innerHTML = '';
        
        Store.availableParticipants.forEach(p => {
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
    },

    renderControls(data = Store.controls, editCallback, emailCallback) {
        const list = document.getElementById('controls-list');
        if (!list) {
            return;
        }
        
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

            item.innerHTML = `
                <div>
                    <p class="text-lg font-semibold text-gray-800">${this.getFullAddress(control)}</p>
                    <p class="text-sm text-gray-600">${this.formatType(control.type)} | Data: ${this.formatDate(control.date)}</p>
                    <p class="text-xs ${hasProtocol ? 'text-green-600' : 'text-red-500'} font-medium mt-1 uppercase tracking-wide">Protokół: ${hasProtocol ? 'Zapisany' : 'Brak'}</p>
                </div>
                <div class="flex flex-col sm:flex-row w-full sm:w-auto">
                    ${actionsHtml}
                </div>
            `;
            
            list.appendChild(item);
        });
        
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                if (editCallback) {
                    editCallback(e.target.dataset.id); 
                }
            });
        });
    },

    renderIdentifications(data = Store.identifications, editCallback) {
        const list = document.getElementById('identifications-list');
        if (!list) {
            return;
        }
        
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
            
            div.innerHTML = `
                <div class="flex items-center space-x-4">
                    <img src="${item.photo}" class="w-20 h-20 object-cover rounded-md bg-gray-200">
                    <div>
                        <p class="font-semibold text-gray-800">Identyfikacja z dnia:</p>
                        <p class="text-sm text-gray-600">${this.formatDate(item.timestamp)}</p>
                        ${item.plotNumber ? `<p class="text-sm text-teal-700 font-medium mt-1">Działka: ${item.plotNumber}</p>` : ''}
                        <p class="text-xs text-gray-500 mt-1">${(item.notes || '').substring(0, 50)}...</p>
                    </div>
                </div>
            `;
            
            div.addEventListener('click', () => {
                if (editCallback) {
                    editCallback(item.id);
                }
            });
            
            list.appendChild(div);
        });
    },

    createNoteButton(noteText) {
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
    },

    renderNoteCategories(activeFilter = '') {
        const container = document.getElementById('note-categories');
        if (!container) {
            return;
        }
        
        container.innerHTML = `<button type="button" data-filter="" class="note-category-btn ${activeFilter === '' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} font-semibold py-1 px-3 rounded-full text-xs transition-colors">Wszystkie</button>`;
        
        const categories = [...new Set(Store.noteDatabase.map(item => item.category))];
        
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
            button.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.renderNoteCategories(filter);
                this.renderNoteList(filter);
            });
        });
    },

    renderNoteList(filter = '') {
        const listContainer = document.getElementById('note-list');
        if (!listContainer) {
            return;
        }
        
        listContainer.innerHTML = '';
        
        Store.noteDatabase.forEach(categoryGroup => {
            if (filter === '' || categoryGroup.category === filter) {
                categoryGroup.notes.forEach(noteText => {
                    listContainer.appendChild(this.createNoteButton(noteText));
                });
            }
        });
    },

    renderPhotos(photosArray, deleteCallback) {
        const container = document.getElementById('photos-preview-container');
        if (!container) {
            return;
        }
        
        container.innerHTML = '';
        
        photosArray.forEach(photo => {
            const div = document.createElement('div');
            div.className = 'relative w-24 h-24';
            div.innerHTML = `
                <img src="${photo.url}" class="w-full h-full object-cover rounded shadow-md cursor-pointer">
                <button type="button" data-id="${photo.id}" class="delete-photo-btn absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center p-0 leading-none -mt-1 -mr-1">&times;</button>
            `;
            container.appendChild(div);
        });
        
        document.querySelectorAll('.delete-photo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (deleteCallback) {
                    deleteCallback(e.target.dataset.id);
                }
            });
        });
    },

    applyFilters(editCallback, emailCallback) {
        const filterAddressInput = document.getElementById('filter-address');
        const filterTypeSelect = document.getElementById('filter-type');
        
        if (!filterAddressInput || !filterTypeSelect) {
            return;
        }
        
        const query = filterAddressInput.value.toLowerCase(); 
        const type = filterTypeSelect.value;
        
        let filtered = Store.controls.filter(control => 
            `${control.street} ${control.houseNumber}, ${control.city}`.toLowerCase().includes(query)
        );
        
        if (type) {
            filtered = filtered.filter(control => control.type === type);
        }
        
        this.renderControls(filtered, editCallback, emailCallback);
    },

    openModal(modalElement) {
        if (!modalElement) {
            return;
        }
        modalElement.classList.remove('invisible', 'opacity-0');
        modalElement.classList.add('open', 'opacity-100');
    },

    closeModal(modalElement) {
        if (!modalElement) {
            return;
        }
        modalElement.classList.remove('open', 'opacity-100');
        modalElement.classList.add('opacity-0');
        setTimeout(() => {
            modalElement.classList.add('invisible');
        }, 300);
    },

    switchTab(activeTabElement) {
        const tabControls = document.getElementById('tab-controls');
        const tabIdentifications = document.getElementById('tab-identifications');
        const tabBulkIdentifications = document.getElementById('tab-bulk-identifications');
        
        const allTabs = [tabControls, tabIdentifications, tabBulkIdentifications].filter(Boolean);
        const allContentViews = [
            document.getElementById('controls-content-view'), 
            document.getElementById('identifications-content-view'), 
            document.getElementById('bulk-identification-content-view')
        ].filter(Boolean);

        allTabs.forEach(tab => {
            tab.classList.remove('active', 'text-blue-600', 'border-blue-600', 'bg-blue-50');
            tab.classList.add('border-transparent', 'text-gray-500');
        });
        
        allContentViews.forEach(view => {
            view.classList.add('hidden');
        });

        activeTabElement.classList.remove('border-transparent', 'text-gray-500');
        activeTabElement.classList.add('active', 'text-blue-600', 'border-blue-600', 'bg-blue-50');
        
        if (activeTabElement === tabControls) {
            document.getElementById('controls-content-view').classList.remove('hidden'); 
        } else if (activeTabElement === tabIdentifications) {
            document.getElementById('identifications-content-view').classList.remove('hidden'); 
        } else if (activeTabElement === tabBulkIdentifications) {
            document.getElementById('bulk-identification-content-view').classList.remove('hidden');
        }
    }
};