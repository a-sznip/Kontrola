// maps.js - Silnik Kartograficzny i Geodezyjny (Leaflet, GUGiK, Offline Cache)
import { Store } from './store.js';

export const MapEngine = {
    identificationMap: null,
    bulkIdentificationMap: null,
    selectionMap: null,
    
    offlineSatelliteLayer: null,
    parcelsBoundariesLayer: null,
    parcelsNumbersLayer: null,
    
    bulkMarkersLayer: null,
    bulkAccuracyCircle: null,
    bulkMyLocationMarker: null,
    
    drawControl: null,
    selectedLayer: null,
    isAddingBulkPoint: false,

    // Inicjalizacja głównych warstw i nadpisanie mechanizmów cache Leafleta
    initLayers() {
        if (typeof L === 'undefined') {
            console.warn("Błąd: Biblioteka Leaflet nie została załadowana.");
            return;
        }

        // Rozszerzenie Leaflet dla standardowych map kafelkowych (Cache)
        L.TileLayer.LocalCache = L.TileLayer.extend({
            createTile: function (coords, done) {
                const tile = document.createElement('img');
                
                tile.onload = function () {
                    done(null, tile); 
                };
                
                tile.onerror = function () {
                    done('Błąd ładowania kafelka', tile);
                };

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

        L.tileLayer.localCache = function (url, options) {
            return new L.TileLayer.LocalCache(url, options);
        };

        // Rozszerzenie Leaflet dla map WMS (GUGiK) (Cache)
        L.TileLayer.WMS.LocalCache = L.TileLayer.WMS.extend({
            createTile: function (coords, done) {
                const tile = document.createElement('img');
                
                tile.onload = function () {
                    done(null, tile);
                };
                
                tile.onerror = function () {
                    done('Błąd ładowania kafelka WMS', tile);
                };

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

        L.tileLayer.wms.localCache = function (url, options) {
            return new L.TileLayer.WMS.LocalCache(url, options);
        };

        const satelliteUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        const parcelsUrl = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';

        this.offlineSatelliteLayer = L.tileLayer.localCache(satelliteUrl, {
            attribution: 'Tiles &copy; Esri',
            crossOrigin: true, 
            layerId: 'satellite',
            maxZoom: 20,
            maxNativeZoom: 18
        });

        this.parcelsBoundariesLayer = L.tileLayer.wms.localCache(parcelsUrl, {
            layers: 'dzialki',
            format: 'image/png',
            transparent: true,
            attribution: 'GUGiK',
            layerId: 'parcels-boundaries'
        });

        this.parcelsNumbersLayer = L.tileLayer.wms.localCache(parcelsUrl, {
            layers: 'numery_dzialek',
            format: 'image/png',
            transparent: true,
            attribution: 'GUGiK',
            layerId: 'parcels-numbers',
            minZoom: 17 
        });
    },

    // MAPA IDENTYFIKACJI POJEDYNCZEJ
    initIdentificationMap(onLocationError) {
        if (this.identificationMap || typeof L === 'undefined') {
            return;
        }

        const layersToInit = [];
        if (this.offlineSatelliteLayer) layersToInit.push(this.offlineSatelliteLayer);
        if (this.parcelsBoundariesLayer) layersToInit.push(this.parcelsBoundariesLayer);
        if (this.parcelsNumbersLayer) layersToInit.push(this.parcelsNumbersLayer);

        this.identificationMap = L.map('identification-map', {
            layers: layersToInit
        }).setView([54.03, 21.75], 13);
        
        const overlays = {};
        if (this.offlineSatelliteLayer) overlays["Satelita"] = this.offlineSatelliteLayer;
        if (this.parcelsBoundariesLayer) overlays["Granice działek"] = this.parcelsBoundariesLayer;
        if (this.parcelsNumbersLayer) overlays["Numery działek"] = this.parcelsNumbersLayer;

        L.control.layers(overlays, {}).addTo(this.identificationMap);

        this.identificationMap.locate({
            setView: true, 
            maxZoom: 17, 
            watch: false, 
            timeout: 10000, 
            maximumAge: 5000, 
            enableHighAccuracy: true
        });

        this.identificationMap.on('locationfound', (e) => {
            if (window.accuracyCircle) { 
                window.accuracyCircle.remove(); 
            }
            window.accuracyCircle = L.circle(e.latlng, {
                radius: e.accuracy / 2, 
                color: '#3b82f6', 
                fillColor: '#60a5fa', 
                fillOpacity: 0.3
            }).addTo(this.identificationMap);
        });
        
        this.identificationMap.on('locationerror', (e) => {
            if (onLocationError) {
                onLocationError();
            }
        });
    },

    // MAPA IDENTYFIKACJI ZBIORCZEJ
    initBulkIdentificationMap(onMapClick, toggleZoomHintCallback) {
        if (this.bulkIdentificationMap || typeof L === 'undefined') {
            return;
        }

        const layersToInit = [];
        if (this.offlineSatelliteLayer) layersToInit.push(this.offlineSatelliteLayer);
        if (this.parcelsBoundariesLayer) layersToInit.push(this.parcelsBoundariesLayer);
        if (this.parcelsNumbersLayer) layersToInit.push(this.parcelsNumbersLayer);

        this.bulkIdentificationMap = L.map('bulk-identification-map', {
            layers: layersToInit
        }).setView([54.03, 21.75], 13);

        const overlays = {};
        if (this.offlineSatelliteLayer) overlays["Satelita"] = this.offlineSatelliteLayer;
        if (this.parcelsBoundariesLayer) overlays["Granice działek"] = this.parcelsBoundariesLayer;
        if (this.parcelsNumbersLayer) overlays["Numery działek"] = this.parcelsNumbersLayer;
        
        L.control.layers(overlays, {}).addTo(this.bulkIdentificationMap);

        this.bulkMarkersLayer = L.featureGroup().addTo(this.bulkIdentificationMap);
        
        this.bulkIdentificationMap.on('click', async (e) => {
            if (this.isAddingBulkPoint && onMapClick) {
                await onMapClick(e.latlng);
            }
        });

        this.bulkIdentificationMap.on('locationfound', (e) => {
            if (this.bulkAccuracyCircle) {
                this.bulkAccuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
            } else {
                this.bulkAccuracyCircle = L.circle(e.latlng, { 
                    radius: e.accuracy, 
                    color: '#3b82f6', 
                    fillColor: '#60a5fa', 
                    fillOpacity: 0.15, 
                    weight: 1, 
                    interactive: false 
                }).addTo(this.bulkIdentificationMap);
            }

            if (!this.bulkMyLocationMarker) {
                this.bulkMyLocationMarker = L.circleMarker(e.latlng, { 
                    radius: 8, 
                    color: '#ffffff', 
                    weight: 2, 
                    fillColor: '#2563eb', 
                    fillOpacity: 1 
                }).addTo(this.bulkIdentificationMap).bindPopup("Twoja lokalizacja");
            } else {
                this.bulkMyLocationMarker.setLatLng(e.latlng);
            }
        });
        
        this.bulkIdentificationMap.locate({ watch: true, setView: false, enableHighAccuracy: true });
        
        if (toggleZoomHintCallback) {
            this.bulkIdentificationMap.on('zoomend zoomstart', () => {
                toggleZoomHintCallback(this.bulkIdentificationMap.getZoom() < 17);
            });
            toggleZoomHintCallback(this.bulkIdentificationMap.getZoom() < 17);
        }
    },

    setAddBulkPointMode(enabled) {
        if (!this.bulkIdentificationMap) {
            return;
        }
        this.isAddingBulkPoint = enabled;
        const mapContainer = this.bulkIdentificationMap._container;
        
        if (enabled) {
            L.DomUtil.addClass(mapContainer, 'leaflet-crosshair');
        } else {
            L.DomUtil.removeClass(mapContainer, 'leaflet-crosshair');
        }
    },

    addBulkPointToMap(point) {
        if (typeof L === 'undefined' || !this.bulkMarkersLayer) {
            return;
        }
        const marker = L.marker([point.lat, point.lng], { pointId: point.id }).addTo(this.bulkMarkersLayer);
        const popupContent = `
            <p><strong>Działka:</strong> ${point.plotNumber || 'Brak'}</p>
            <img src="${point.mapScreenshot}" class="w-32 h-auto my-1">
            <button class="remove-bulk-point-btn bg-red-500 text-white text-xs py-1 px-2 rounded w-full" data-id="${point.id}">Usuń ten punkt</button>
        `;
        marker.bindPopup(popupContent);
    },

    renderBulkPoints() {
        if (this.bulkMarkersLayer) {
            this.bulkMarkersLayer.clearLayers();
            Store.bulkIdentifications.forEach(point => this.addBulkPointToMap(point));
        }
    },

    // GUGiK API
    async getParcelDataByXY(lon, lat) {
        const url = `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=${lon},${lat}&result=teryt,voivodeship,county,commune,town,street,street_type,house_number,geom_wkt,parcel&srid=4326`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            
            if (!response.ok) {
                throw new Error(`HTTP status ${response.status}`);
            }
            
            const text = await response.text();
            clearTimeout(timeoutId);

            const lines = text.trim().split('\n');
            if (lines.length < 2 || lines[1].trim() === '-1') {
                return { error: true, message: 'Nie znaleziono działki w GUGiK.' };
            }

            const headers = lines[0].split(',');
            const values = lines[1].split(',');
            const result = {};
            
            headers.forEach((header, i) => { 
                result[header.trim()] = values[i] ? values[i].trim() : ''; 
            });
            
            return { error: false, parcelId: result.parcel || '' };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                return { error: true, message: 'Serwer GUGiK nie odpowiedział w zadanym czasie.' };
            }
            return { error: true, message: 'Błąd połączenia z GUGiK.' };
        }
    },

    // GOOGLE API
    async getAddressFromGoogle(lat, lon) {
        const apiKey = 'AIzaSyClGtmK6IlFBX1dAsf9tJ8m9NJKHthD_rE'; 
        if (!apiKey) {
            return { error: true, message: 'Brak klucza API.' };
        }
        
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=pl`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await response.json();

            if (data.status === 'OK' && data.results[0]) {
                return { error: false, address: data.results[0].formatted_address };
            } else {
                return { error: true, message: `Google API błąd: ${data.status}` };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            return { error: true, message: 'Błąd połączenia z Google.' };
        }
    },

    // --- POBIERANIE MAP OFFLINE ---
    initOfflineSelectionMap(onAreaSelected) {
        if (typeof L === 'undefined') {
            return;
        }

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
            attribution: 'Esri' 
        });
        
        const parcelsBorders = L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', { 
            layers: 'dzialki', 
            format: 'image/png', 
            transparent: true 
        });
        
        this.selectionMap = L.map('offline-map-selection', { 
            layers: [satelliteLayer, parcelsBorders] 
        }).setView([54.03, 21.75], 13);
        
        L.control.layers({ "Satelita": satelliteLayer }, { "Granice działek": parcelsBorders }).addTo(this.selectionMap);

        const drawnItems = new L.FeatureGroup(); 
        this.selectionMap.addLayer(drawnItems);
        
        this.drawControl = new L.Control.Draw({
            draw: { 
                polygon: false, 
                polyline: false, 
                circle: false, 
                circlemarker: false, 
                marker: false, 
                rectangle: { shapeOptions: { color: '#0ea5e9' } } 
            },
            edit: { 
                featureGroup: drawnItems, 
                remove: false, 
                edit: false 
            }
        });
        this.selectionMap.addControl(this.drawControl);

        this.selectionMap.on(L.Draw.Event.CREATED, (e) => {
            if (this.selectedLayer) {
                drawnItems.removeLayer(this.selectedLayer);
            }
            this.selectedLayer = e.layer; 
            drawnItems.addLayer(this.selectedLayer);
            
            if (onAreaSelected) {
                onAreaSelected(this.selectedLayer.getBounds());
            }
        });
    },

    getTileCoords(lat, lon, zoom) {
        const latRad = lat * Math.PI / 180; 
        const n = Math.pow(2, zoom);
        const xtile = Math.floor(n * ((lon + 180) / 360));
        const ytile = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
        
        return { x: xtile, y: ytile };
    },

    calculateTotalTiles(bounds, minZoom, maxZoom) {
        let totalTiles = 0;
        for (let z = minZoom; z <= maxZoom; z++) {
            const t1 = this.getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
            const t2 = this.getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
            totalTiles += (Math.abs(t1.x - t2.x) + 1) * (Math.abs(t1.y - t2.y) + 1);
        }
        
        // Mnożymy przez 3, bo mamy 3 warstwy (Satelita, Granice, Numery)
        return totalTiles * 3;
    },

    async startOfflineDownload(bounds, areaName, minZoom, maxZoom, progressCallback) {
        const tilesToDownload = [];
        
        for (let z = minZoom; z <= maxZoom; z++) {
            const t1 = this.getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
            const t2 = this.getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
            
            const minX = Math.min(t1.x, t2.x);
            const maxX = Math.max(t1.x, t2.x);
            const minY = Math.min(t1.y, t2.y);
            const maxY = Math.max(t1.y, t2.y);
            
            for (let x = minX; x <= maxX; x++) { 
                for (let y = minY; y <= maxY; y++) { 
                    tilesToDownload.push({ z, x, y }); 
                } 
            }
        }

        const layersToCache = [];
        if (this.offlineSatelliteLayer) layersToCache.push({ layer: this.offlineSatelliteLayer, name: 'satellite' });
        if (this.parcelsBoundariesLayer) layersToCache.push({ layer: this.parcelsBoundariesLayer, name: 'parcels-boundaries' });
        if (this.parcelsNumbersLayer) layersToCache.push({ layer: this.parcelsNumbersLayer, name: 'parcels-numbers' });

        let downloadedCount = 0;
        const totalCount = tilesToDownload.length * layersToCache.length;

        for (const tile of tilesToDownload) {
            for (const layerInfo of layersToCache) {
                const { z, x, y } = tile;
                
                if (layerInfo.layer.options.minZoom && z < layerInfo.layer.options.minZoom) { 
                    downloadedCount++; 
                    continue; 
                }
                
                const tileUrl = layerInfo.layer.getTileUrl({z, x, y});
                const tileKey = `tile-${layerInfo.name}-${z}-${x}-${y}`;

                try {
                    const response = await fetch(tileUrl, { signal: AbortSignal.timeout(10000) });
                    if (!response.ok) {
                        continue;
                    }
                    
                    const blob = await response.blob();
                    const dataUrl = await new Promise((resolve) => {
                        const reader = new FileReader(); 
                        reader.onloadend = () => resolve(reader.result); 
                        reader.readAsDataURL(blob);
                    });
                    
                    if (typeof localforage !== 'undefined') {
                        await localforage.setItem(tileKey, dataUrl);
                    }
                } catch (error) { 
                    // Ciche ignorowanie błędów pojedynczych kafelków
                } finally { 
                    downloadedCount++; 
                    const progress = Math.floor((downloadedCount / totalCount) * 100); 
                    if (progressCallback) progressCallback(progress);
                }
            }
        }
        
        const metadata = Store.getMapsMetadata();
        metadata.push({ 
            id: Store.generateUniqueId(), 
            name: areaName, 
            bounds: bounds.toBBoxString(), 
            minZoom, 
            maxZoom 
        });
        Store.saveMapsMetadata(metadata);
        
        return true;
    },

    async deleteOfflineMap(mapId) {
        const metadata = Store.getMapsMetadata();
        const mapToDelete = metadata.find(m => m.id === mapId);
        
        if (!mapToDelete || typeof L === 'undefined') {
            return false;
        }

        const boundsArray = mapToDelete.bounds.split(',').map(Number);
        const bounds = L.latLngBounds(L.latLng(boundsArray[1], boundsArray[0]), L.latLng(boundsArray[3], boundsArray[2]));
        const tilesToRemove = [];
        const layerNames = ['satellite', 'parcels-boundaries', 'parcels-numbers']; 
        
        for (let z = mapToDelete.minZoom; z <= mapToDelete.maxZoom; z++) {
            const t1 = this.getTileCoords(bounds.getNorthEast().lat, bounds.getNorthEast().lng, z);
            const t2 = this.getTileCoords(bounds.getSouthWest().lat, bounds.getSouthWest().lng, z);
            
            const minX = Math.min(t1.x, t2.x);
            const maxX = Math.max(t1.x, t2.x);
            const minY = Math.min(t1.y, t2.y);
            const maxY = Math.max(t1.y, t2.y);

            for (let x = minX; x <= maxX; x++) {
                for (let y = minY; y <= maxY; y++) { 
                    layerNames.forEach(name => tilesToRemove.push(`tile-${name}-${z}-${x}-${y}`)); 
                }
            }
        }
        
        if (typeof localforage !== 'undefined') {
            for (const key of tilesToRemove) {
                await localforage.removeItem(key);
            }
        }
        
        const newMetadata = metadata.filter(m => m.id !== mapId);
        Store.saveMapsMetadata(newMetadata);
        
        return true;
    }
};