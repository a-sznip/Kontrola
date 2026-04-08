// pdf.js - Generator Dokumentów (PDF, HTML2Canvas) i Most E-mailowy
import { Store } from './store.js';
import { Api } from './api.js';

export const PdfGenerator = {
    
    // --- POMOCNICZE FUNKCJE FORMATUJĄCE ---
    getTimestampForFilename() {
        const d = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL') + ' ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit'});
    },

    getFullAddress(control) { 
        return `${control.street} ${control.houseNumber}, ${control.city} ${control.zip}`; 
    },

    formatType(type) { 
        return type === 'planowa' ? 'Planowa' : 'Interwencyjna'; 
    },


    // --- GENERATORY HTML (SZABLONY) ---
    generateProtocolHTML(control, protocol) {
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
                    <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Adres Obiektu:</td><td>${this.getFullAddress(control)}</td></tr>
                    ${control.plotNumber ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Numer Działki:</td><td>${control.plotNumber}</td></tr>` : ''}
                    ${control.geodeticDistrict ? `<tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Obręb Ewidencyjny:</td><td>${control.geodeticDistrict}</td></tr>` : ''}
                    <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Data Kontroli:</td><td>${this.formatDate(control.date)}</td></tr>
                    <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Typ Kontroli:</td><td>${this.formatType(control.type)}</td></tr>
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
    },

    generateJointNoteHTML(date, city, subject, controlsArray, signature) {
        const today = new Date().toLocaleDateString('pl-PL');
        const uniqueParticipants = new Set();
        
        controlsArray.forEach(c => {
            if (c.protocol && c.protocol.unionReps) {
                c.protocol.unionReps.split('\n').map(r => r.trim()).filter(r => r).forEach(r => uniqueParticipants.add(r));
            }
        });
        
        const participantsText = Array.from(uniqueParticipants).sort().join('<br>');
        const signatureHtml = signature ? `<img src="${signature}" style="width: 200px; height: 100px; border: 1px solid #000; display: block; margin-top: 10px;">` : '';
        
        let protocolsHtml = '';
        controlsArray.forEach((control, index) => {
            const findings = control.protocol && control.protocol.findings 
                ? control.protocol.findings.replace(/\n/g, '<br>') 
                : 'Brak ustaleń.';
            protocolsHtml += `
                <div style="margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px dashed #ccc;">
                    <p style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">${index + 1}. ${this.getFullAddress(control)}</p>
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
                <p><strong>Dotyczy:</strong> Kontroli w terenie przeprowadzonych w dniu ${this.formatDate(date)}.</p>
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
    },

    generateIdentificationHTML(item) {
        const mapImageHtml = item.mapScreenshot 
            ? `<img src="${item.mapScreenshot}" style="width: 100%; border: 1px solid #ccc;">` 
            : '<p>Brak zrzutu mapy.</p>';
            
        return `
            <div class="pdf-container" style="font-family: 'Inter', sans-serif;">
                <h1 style="text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px;">RAPORT Z IDENTYFIKACJI TERENOWEJ</h1>
                <table style="width: 100%;">
                    <tr><td style="width: 30%; font-weight: bold; background-color: #f0f0f0;">Data i Godzina:</td><td>${this.formatDate(item.timestamp)}</td></tr>
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
    },

    generateBulkReportHTML(points) {
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
    },


    // --- GŁÓWNY SILNIK TWORZĄCY I WYSYŁAJĄCY PLIK W TLE ---
    async renderAndSendPdf(htmlContent, finalFileName, apiSendFunction) {
        if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') { 
            throw new Error('Zewnętrzne biblioteki PDF nie zostały załadowane.'); 
        }

        const templateContainer = document.getElementById('pdf-render-template');
        templateContainer.innerHTML = htmlContent;
        const contentToConvert = templateContainer.querySelector('.pdf-container');
        
        try {
            // Renderowanie HTML do obrazu (Canvas)
            const canvas = await html2canvas(contentToConvert, { 
                scale: 2, 
                useCORS: true, 
                letterRendering: true 
            });
            
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            
            const imgWidth = 210; 
            const pageHeight = 295;
            const imgHeight = canvas.height * imgWidth / canvas.width;
            
            let heightLeft = imgHeight; 
            let position = 0;
            
            // Stronicowanie (jeśli treść przekracza jedną stronę A4)
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage(); 
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            // Generowanie "wirtualnego pliku" w pamięci RAM (Blob)
            const pdfBlob = pdf.output('blob');
            
            // Przekazanie wirtualnego pliku do nowego Mostu E-mailowego (api.js)
            const isProcessStarted = await apiSendFunction(pdfBlob, finalFileName);
            
            return isProcessStarted;
            
        } catch (error) {
            throw error;
        } finally {
            // Natychmiastowe czyszczenie pamięci szablonu
            templateContainer.innerHTML = '';
        }
    },


    // --- FUNKCJE DELEGOWANE DLA INTERFEJSU UŻYTKOWNIKA ---
    
    async processProtocol(controlId) {
        const control = Store.controls.find(c => c.id === controlId);
        if (!control || !control.protocol) { 
            throw new Error('Brak zapisanego protokołu do wygenerowania!'); 
        }
        
        const htmlContent = this.generateProtocolHTML(control, control.protocol);
        const sanitizedAddress = `${control.city}_${control.street}_${control.houseNumber}`.replace(/[\s/\\?%*:|"<>]/g, '-');
        const finalFileName = `Protokol_${this.getTimestampForFilename()}_${sanitizedAddress}.pdf`;

        // Delegacja do mechanizmu email (PDF + JSON z Fazy 2)
        return await this.renderAndSendPdf(htmlContent, finalFileName, (blob, filename) => {
            return Api.sendProtocolEmail(control, blob, filename);
        });
    },

    async processJointNote(dateFilter, city, subjectText, filteredControls, signatureBase64) {
        const htmlContent = this.generateJointNoteHTML(dateFilter, city, subjectText, filteredControls, signatureBase64);
        const finalFileName = `Notatka_Sluzbowa_${this.getTimestampForFilename()}.pdf`;

        // Delegacja do mechanizmu email
        return await this.renderAndSendPdf(htmlContent, finalFileName, (blob, filename) => {
            return Api.sendJointNoteEmail(dateFilter, city, subjectText, blob, filename);
        });
    },

    async processIdentification(ident) {
        const htmlContent = this.generateIdentificationHTML(ident);
        const sanitizedPlot = (ident.plotNumber || 'bez_nr').replace(/[\s/\\?%*:|"<>]/g, '-');
        const finalFileName = `Identyfikacja_${this.getTimestampForFilename()}_${sanitizedPlot}.pdf`;

        // Delegacja do mechanizmu email (PDF + JSON z Fazy 2)
        return await this.renderAndSendPdf(htmlContent, finalFileName, (blob, filename) => {
            return Api.sendIdentificationEmail(ident, blob, filename);
        });
    },

    async processBulkReport() {
        const points = Store.bulkIdentifications;
        if (points.length === 0) { 
            throw new Error('Brak punktów.'); 
        }

        const htmlContent = this.generateBulkReportHTML(points);
        const finalFileName = `Raport_Zbiorczy_${this.getTimestampForFilename()}.pdf`;

        // Delegacja do mechanizmu email
        return await this.renderAndSendPdf(htmlContent, finalFileName, (blob, filename) => {
            return Api.sendBulkReportEmail(blob, filename, points.length);
        });
    }
};