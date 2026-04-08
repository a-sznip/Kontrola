// api.js - Most Komunikacyjny i E-mail (Wersja z Podwójnym Załącznikiem)
import { Store } from './store.js';

const INSPECTOR_EMAILS = {
    "Sznip": "a.sznip@mzmgo.mazury.pl",
    "default": "a.sznip@mzmgo.mazury.pl" 
};

export const Api = {
    logout() {
        localStorage.removeItem('user');
        localStorage.removeItem('ecoToken');
        window.location.assign('login.html');
    },

    getCurrentUserEmail() {
        const user = Store.userName;
        if (!user) return INSPECTOR_EMAILS["default"];
        const foundKey = Object.keys(INSPECTOR_EMAILS).find(key => user.toLowerCase().includes(key.toLowerCase()));
        return foundKey ? INSPECTOR_EMAILS[foundKey] : INSPECTOR_EMAILS["default"];
    },

    // WYSYŁKA KONTROLI (Podwójny załącznik: PDF + JSON)
    async sendProtocolEmail(control, pdfBlob, pdfFilename) {
        const email = this.getCurrentUserEmail();
        const address = `${control.street} ${control.houseNumber}, ${control.city}`;
        const subject = `Protokół Kontroli: ${address}`;
        const body = `W załączeniu przesyłam wygenerowany protokół kontroli (PDF) oraz wsad danych (JSON) do importu.\n\nAdres: ${address}\nData: ${control.date}\nTyp: ${control.type}`;
        
        // Generowanie pliku JSON w locie z obiektu kontroli
        const jsonContent = JSON.stringify(control, null, 2);
        const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
        const jsonFilename = `dane_${control.id}.json`;

        return await this.shareOrMailto(email, subject, body, [
            { blob: pdfBlob, filename: pdfFilename, type: 'application/pdf' },
            { blob: jsonBlob, filename: jsonFilename, type: 'application/json' }
        ]);
    },

    // WYSYŁKA IDENTYFIKACJI (Podwójny załącznik: PDF + JSON)
    async sendIdentificationEmail(ident, pdfBlob, pdfFilename) {
        const email = this.getCurrentUserEmail();
        const subject = `Identyfikacja Terenowa: ${ident.plotNumber || 'Brak nr działki'}`;
        const dateStr = new Date(ident.timestamp).toLocaleString('pl-PL');
        const body = `W załączeniu raport z identyfikacji terenowej (PDF) oraz wsad danych (JSON).\n\nData: ${dateStr}\nGPS: ${ident.latitude}, ${ident.longitude}`;
        
        // Generowanie pliku JSON
        const jsonContent = JSON.stringify(ident, null, 2);
        const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
        const jsonFilename = `dane_ident_${ident.id}.json`;

        return await this.shareOrMailto(email, subject, body, [
            { blob: pdfBlob, filename: pdfFilename, type: 'application/pdf' },
            { blob: jsonBlob, filename: jsonFilename, type: 'application/json' }
        ]);
    },

    // RDZEŃ WYSYŁKOWY OBSŁUGUJĄCY TABLICĘ PLIKÓW
    async shareOrMailto(email, subject, text, filesData) {
        let isShared = false;

        // Opcja A: Web Share API (Pełny automat na nowoczesnych smartfonach)
        if (navigator.canShare) {
            // Konwersja blobów na obiekty File
            const filesToShare = filesData.map(fd => new File([fd.blob], fd.filename, { type: fd.type }));
            
            if (navigator.canShare({ files: filesToShare })) {
                try {
                    await navigator.share({
                        title: subject,
                        text: text,
                        files: filesToShare
                    });
                    isShared = true;
                } catch (e) {
                    console.warn("Udostępnianie anulowane lub nieudane:", e);
                }
            }
        }

        // Opcja B: Fallback - Wymuszenie pobrania plików i czysty link Mailto
        if (!isShared) {
            alert("Twoja przeglądarka blokuje automatyczne załączniki.\n\nPliki (PDF i JSON) zostały POBRANE na Twoje urządzenie. Zaraz otworzy się aplikacja pocztowa - musisz RĘCZNIE DODAĆ oba pliki jako załączniki.");
            
            // Wymuszenie pobrania każdego pliku
            filesData.forEach(fd => {
                const url = URL.createObjectURL(fd.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fd.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            // Otwarcie gołego maila
            const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
            window.location.assign(mailtoLink);
        }

        // Zwracamy TRUE, jeśli proces wysyłki (otwarcia aplikacji pocztowej) został sfinalizowany, 
        // co da sygnał dla UI (app.js), aby wyświetlić zapytanie o usunięcie danych.
        return true; 
    }
};