// store.js - Centralny Magazyn Danych (Architektura ES6)
// Wersja: PWA Offline-First

// Zabezpieczenie przed brakiem pliku data.js
const safeData = typeof APP_DATA !== 'undefined' ? APP_DATA : {};

export const Store = {
    // Słowniki i dane stałe
    ulice: safeData.ulice || [],
    miejscowosciByGmina: safeData.miejscowosciByGmina || {},
    zipCodesByCity: safeData.zipCodesByCity || {},
    noteDatabase: safeData.noteDatabase || [],
    defaultInspectors: safeData.availableParticipants || [],
    
    // Dane dynamiczne (Zapisane w telefonie)
    controls: JSON.parse(localStorage.getItem('localControls')) || [],
    identifications: JSON.parse(localStorage.getItem('localIdentifications')) || [],
    bulkIdentifications: JSON.parse(localStorage.getItem('localBulkIdentifications')) || [],
    availableParticipants: JSON.parse(localStorage.getItem('eco_inspectors_cache')) || safeData.availableParticipants || [],

    // Autoryzacja
    userName: localStorage.getItem('user'),
    authToken: localStorage.getItem('ecoToken'),

    // Metody zapisu (zastępują stare funkcje saveLocal...)
    saveControls() { 
        localStorage.setItem('localControls', JSON.stringify(this.controls)); 
    },
    saveIdentifications() { 
        localStorage.setItem('localIdentifications', JSON.stringify(this.identifications)); 
    },
    saveBulkIdentifications() { 
        localStorage.setItem('localBulkIdentifications', JSON.stringify(this.bulkIdentifications)); 
    },
    
    // Zarządzanie mapami offline
    getMapsMetadata() { 
        return JSON.parse(localStorage.getItem('offlineMapsMetadata')) || []; 
    },
    saveMapsMetadata(metadata) { 
        localStorage.setItem('offlineMapsMetadata', JSON.stringify(metadata)); 
    },

    // Generatory ID
    generateUniqueId() { 
        return Date.now().toString(36) + Math.random().toString(36).substring(2); 
    }
};