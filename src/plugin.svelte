<div class="plugin__mobile-header">🥾 Trek Weather Planner</div>

<section class="plugin__content">
    <div class="plugin__title plugin__title--chevron-back" on:click={() => bcast.emit('rqstOpen', 'menu')}>
        🥾 Trek Weather Planner
    </div>

    {#if !routeLoaded}
        <!-- ── Import ── -->
        <div class="tw-panel">
            <p class="tw-hint">Importez un fichier <strong>GPX</strong> ou <strong>KML</strong> pour afficher votre tracé sur la carte.</p>
            <label class="tw-file-label">
                📂 Choisir un fichier GPX / KML
                <input type="file" accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml,text/xml,*/*" on:change={handleFileImport} class="tw-file-input" />
            </label>
            {#if errorMsg}<p class="tw-error">{errorMsg}</p>{/if}
        </div>
    {:else}
        <!-- ── Route info bar ── -->
        <div class="tw-section">
            <div class="tw-route-info">
                <span>📍 {routePoints.length} pts · {routeDistanceKm} km</span>
                <button class="tw-btn tw-btn-sm tw-btn-danger" on:click={resetRoute}>✕ Reset</button>
            </div>
        </div>

        <!-- ── Layer picker ── -->
        <div class="tw-section">
            <div class="tw-section-title">🗂 Couche météo</div>
            <div class="tw-layer-grid">
                {#each OVERLAYS as ov}
                    <button
                        class="tw-layer-btn {currentOverlay === ov.key ? 'tw-layer-btn--active' : ''}"
                        on:click={() => setOverlay(ov.key)}
                        title={ov.label}
                    >{ov.icon} {ov.label}</button>
                {/each}
            </div>
        </div>

        <!-- ── Day segments ── -->
        <div class="tw-section">
            <div class="tw-section-title">📅 Étapes journalières</div>
            <p class="tw-hint-sm">Cliquez sur la carte pour placer une fin de journée. 🌤 = voir météo du tronçon.</p>

            {#each daySegments as seg, i}
                <div class="tw-day-card {activeDayIndex === i ? 'tw-day-card--active' : ''}">
                    <div class="tw-day-header">
                        <span class="tw-day-badge" style="background:{COLORS[i % COLORS.length]}">J{i + 1}</span>
                        <span class="tw-day-dist">{seg.distanceKm} km · +{seg.elevGain}m</span>
                        <div class="tw-day-actions">
                            <button class="tw-btn tw-btn-sm tw-btn-weather" on:click={() => focusDaySegment(i)} title="Météo tronçon">🌤</button>
                            {#if i > 0}
                                <button class="tw-btn tw-btn-sm tw-btn-danger" on:click={() => removeWaypoint(i - 1)} title="Supprimer">✕</button>
                            {/if}
                        </div>
                    </div>
                    {#if seg.date}
                        <div class="tw-day-date-row">
                            <span class="tw-date-label">📆 {formatDate(seg.date)}</span>
                        </div>
                    {/if}
                    <!-- Weather panel shown when this day is active -->
                    {#if activeDayIndex === i}
                        <div class="tw-weather-panel">
                            {#if seg.date}
                                <div class="tw-weather-ts">
                                    <span>🕐 {formatDate(seg.date)}</span>
                                    <button class="tw-btn tw-btn-sm tw-btn-primary" on:click={() => setTimestamp(seg.date)}>→ Timeline</button>
                                </div>
                            {/if}
                            <button class="tw-btn tw-btn-sm tw-btn-weather tw-btn-fetch" on:click={() => fetchWeather(i)} disabled={weatherLoading}>
                                {weatherLoading ? '⏳ Chargement…' : '🌡 Météo au point milieu'}
                            </button>
                            {#if weatherData}
                                <div class="tw-weather-grid">
                                    {#each weatherData as w}
                                        <div class="tw-weather-item">
                                            <span class="tw-weather-icon">{w.icon}</span>
                                            <span class="tw-weather-val">{w.value}</span>
                                            <span class="tw-weather-lbl">{w.label}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                            {#if weatherError}
                                <p class="tw-weather-err">{weatherError}</p>
                            {/if}
                            <button class="tw-btn tw-btn-sm tw-btn-secondary" on:click={clearActiveDay}>← Retour</button>
                        </div>
                    {/if}
                </div>
            {/each}

            <button class="tw-btn tw-btn-primary tw-btn-full" on:click={startPlacingWaypoint} disabled={placingWaypoint}>
                {placingWaypoint ? '📍 Cliquez sur le tracé…' : '+ Ajouter un point d\'étape'}
            </button>
        </div>

        <!-- ── Start date ── -->
        <div class="tw-section">
            <div class="tw-section-title">📆 Date de départ</div>
            <div class="tw-date-selects">
                <select bind:value={startDay} on:change={onStartDateChange} class="tw-select">
                    {#each days as d}<option value={d}>{d}</option>{/each}
                </select>
                <select bind:value={startMonth} on:change={onStartDateChange} class="tw-select">
                    {#each months as m, i}<option value={i+1}>{m}</option>{/each}
                </select>
                <select bind:value={startYear} on:change={onStartDateChange} class="tw-select">
                    {#each years as y}<option value={y}>{y}</option>{/each}
                </select>
            </div>
        </div>

        <!-- ── Legend ── -->
        <div class="tw-legend">
            <span>🟡 Tracé complet</span>
            <span>🔵 Tronçon inactif</span>
            <span>✨ Tronçon actif</span>
        </div>
    {/if}
</section>

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import bcast from '@windy/broadcast';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { getLatLonInterpolator } from '@windy/interpolator';
    import metrics from '@windy/metrics';
    import config from './pluginConfig';

    interface LatLon { lat: number; lon: number }
    interface DaySegment {
        start: LatLon;
        end: LatLon;
        points: LatLon[];
        distanceKm: string;
        elevGain: number;
        date: string;
    }

    // ── Overlay definitions ──────────────────────────────────────────────────
    const OVERLAYS = [
        { key: 'wind',        icon: '💨', label: 'Vent' },
        { key: 'rain',        icon: '🌧', label: 'Pluie' },
        { key: 'temp',        icon: '🌡', label: 'Temp.' },
        { key: 'clouds',      icon: '☁️', label: 'Nuages' },
        { key: 'snowAccu',    icon: '❄️', label: 'Neige' },
        { key: 'thunder',     icon: '⚡', label: 'Orages' },
        { key: 'visibility',  icon: '👁', label: 'Visib.' },
        { key: 'gust',        icon: '🌬', label: 'Rafales' },
    ];

    // ── State ────────────────────────────────────────────────────────────────
    let routeLoaded = false;
    let routePoints: LatLon[] = [];
    let routeElevations: number[] = [];
    let routeDistanceKm = '0';
    let waypoints: LatLon[] = [];
    let daySegments: DaySegment[] = [];
    let activeDayIndex: number | null = null;
    let placingWaypoint = false;
    let startDate = '';
    // Date selects (Android-compatible)
    const now = new Date();
    let startDay = now.getDate();
    let startMonth = now.getMonth() + 1;
    let startYear = now.getFullYear();
    const days = Array.from({length: 31}, (_, i) => i + 1);
    const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const years = Array.from({length: 3}, (_, i) => now.getFullYear() + i);

    function onStartDateChange() {
        const mm = String(startMonth).padStart(2, '0');
        const dd = String(startDay).padStart(2, '0');
        startDate = `${startYear}-${mm}-${dd}`;
        rebuildDates();
    }
    let errorMsg = '';
    let currentOverlay = 'wind';
    // Weather interpolation state
    let weatherData: {icon: string; value: string; label: string}[] | null = null;
    let weatherLoading = false;
    let weatherError = '';

    // ── Leaflet layers ───────────────────────────────────────────────────────
    let fullRouteLayer: L.Polyline | null = null;
    let segmentLayers: L.Polyline[] = [];
    let waypointMarkers: L.Marker[] = [];
    const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

    // ── Weather interpolation ────────────────────────────────────────────────
    async function fetchWeather(dayIdx: number) {
        const seg = daySegments[dayIdx];
        const mid = midPoint(seg);
        weatherData = null;
        weatherError = '';
        weatherLoading = true;

        // Set timestamp to the day at noon if date is set
        if (seg.date) setTimestamp(seg.date);

        try {
            const interpolate = await getLatLonInterpolator();
            if (!interpolate) { weatherError = 'Données non disponibles pour cette couche.'; weatherLoading = false; return; }

            const overlay = store.get('overlay') as string || 'wind';
            const results: {icon: string; value: string; label: string}[] = [];

            // Helper to get value for a specific overlay
            async function getVal(ovKey: string, icon: string, label: string, metricKey: string) {
                try {
                    store.set('overlay', ovKey);
                    await new Promise(r => setTimeout(r, 400));
                    const interp2 = await getLatLonInterpolator();
                    if (!interp2) return;
                    const val = await interp2({ lat: mid.lat, lon: mid.lon });
                    if (Array.isArray(val) && val[0] !== null && !isNaN(val[0])) {
                        const m = (metrics as any)[metricKey];
                        const str = m ? m.convertValue(val[0]) : val[0].toFixed(1);
                        results.push({ icon, label, value: str });
                    }
                } catch(e) {}
            }

            await getVal('wind',   '💨', 'Vent',       'wind');
            await getVal('temp',   '🌡', 'Temp.',      'temp');
            await getVal('rain',   '🌧', 'Pluie',      'rain');
            await getVal('clouds', '☁️', 'Nuages',     'clouds');

            // Restore original overlay
            store.set('overlay', overlay);
            weatherData = results.length ? results : null;
            if (!results.length) weatherError = 'Aucune donnée disponible à ce point.';
        } catch(e) {
            weatherError = 'Erreur lors de la récupération des données.';
        }
        weatherLoading = false;
    }

    // ── Overlay control ──────────────────────────────────────────────────────
    function setOverlay(key: string) {
        currentOverlay = key;
        store.set('overlay', key);
    }

    function syncOverlayFromStore() {
        const ov = store.get('overlay');
        if (ov) currentOverlay = ov as string;
    }

    // ── File import ──────────────────────────────────────────────────────────
    function handleFileImport(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files?.length) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            if (!text) return;
            try {
                if (file.name.toLowerCase().endsWith('.gpx')) parseGPX(text);
                else if (file.name.toLowerCase().endsWith('.kml')) parseKML(text);
                else errorMsg = 'Format non supporté. Utilisez GPX ou KML.';
            } catch (err) {
                errorMsg = 'Erreur lors de la lecture du fichier.';
            }
        };
        reader.readAsText(file);
    }

    function parseGPX(text: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        const trkpts = doc.querySelectorAll('trkpt');
        if (!trkpts.length) { errorMsg = 'Aucun point trouvé dans ce fichier GPX.'; return; }
        const pts: LatLon[] = [];
        const elevs: number[] = [];
        trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat') || '');
            const lon = parseFloat(pt.getAttribute('lon') || '');
            const eleEl = pt.querySelector('ele');
            const ele = eleEl ? parseFloat(eleEl.textContent || '0') : 0;
            if (!isNaN(lat) && !isNaN(lon)) { pts.push({ lat, lon }); elevs.push(ele); }
        });
        loadRoute(pts, elevs);
    }

    function parseKML(text: string) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');

        // Collect all <coordinates> elements (LineString, Polygon, Point, Track...)
        const coordsEls = doc.querySelectorAll('coordinates');
        if (!coordsEls.length) { errorMsg = 'Aucune coordonnée trouvée dans ce fichier KML.'; return; }

        const pts: LatLon[] = [];
        const elevs: number[] = [];

        // Pick the element with the most tuples (= the track, not isolated points)
        let bestRaw = '';
        coordsEls.forEach(el => {
            const raw = el.textContent?.trim() || '';
            if (raw.length > bestRaw.length) bestRaw = raw;
        });

        bestRaw.split(/\s+/).forEach(tuple => {
            const parts = tuple.trim().split(',');
            if (parts.length >= 2) {
                const lon = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                const ele = parts[2] ? parseFloat(parts[2]) : 0;
                if (!isNaN(lat) && !isNaN(lon)) { pts.push({ lat, lon }); elevs.push(ele); }
            }
        });

        if (!pts.length) { errorMsg = 'Aucun point valide trouvé dans ce fichier KML.'; return; }
        loadRoute(pts, elevs);
    }

    function loadRoute(pts: LatLon[], elevs: number[]) {
        routePoints = pts;
        routeElevations = elevs;
        routeDistanceKm = totalDistance(pts).toFixed(1);
        routeLoaded = true;
        waypoints = [];
        activeDayIndex = null;
        errorMsg = '';
        drawFullRoute();
        rebuildSegments();
        fitMapToRoute();
    }

    // ── Map drawing ──────────────────────────────────────────────────────────
    function drawFullRoute() {
        clearMapLayers();
        const latlngs = routePoints.map(p => [p.lat, p.lon] as [number, number]);
        fullRouteLayer = L.polyline(latlngs, { color: '#facc15', weight: 4, opacity: 0.85 }).addTo(map);
    }

    function clearMapLayers() {
        fullRouteLayer?.remove();
        segmentLayers.forEach(l => l.remove());
        waypointMarkers.forEach(m => m.remove());
        segmentLayers = [];
        waypointMarkers = [];
    }

    function redrawSegments() {
        segmentLayers.forEach(l => l.remove());
        waypointMarkers.forEach(m => m.remove());
        segmentLayers = [];
        waypointMarkers = [];

        daySegments.forEach((seg, i) => {
            const isActive = activeDayIndex === i;
            const color = activeDayIndex === null || isActive ? COLORS[i % COLORS.length] : '#475569';
            const weight = isActive ? 6 : 3;
            const opacity = isActive ? 1 : 0.7;
            const latlngs = seg.points.map(p => [p.lat, p.lon] as [number, number]);
            const poly = L.polyline(latlngs, { color, weight, opacity }).addTo(map);
            segmentLayers.push(poly);
        });

        waypoints.forEach((wp, i) => {
            const icon = L.divIcon({
                html: `<div class="tw-marker" style="background:${COLORS[i % COLORS.length]}">${i + 1}</div>`,
                className: '',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });
            const marker = L.marker([wp.lat, wp.lon], { icon })
                .addTo(map)
                .bindTooltip(`Fin Jour ${i + 1} / Début Jour ${i + 2}`);
            waypointMarkers.push(marker);
        });
    }

    // ── Waypoint placement ───────────────────────────────────────────────────
    function startPlacingWaypoint() {
        placingWaypoint = true;
        map.getContainer().style.cursor = 'crosshair';
    }

    function onMapClick(e: L.LeafletMouseEvent) {
        if (!placingWaypoint) return;
        placingWaypoint = false;
        map.getContainer().style.cursor = '';
        const snapped = snapToRoute({ lat: e.latlng.lat, lon: e.latlng.lng });
        waypoints = [...waypoints, snapped];
        waypoints.sort((a, b) => routeIndexOf(a) - routeIndexOf(b));
        rebuildSegments();
        redrawSegments();
        saveState();
    }

    function routeIndexOf(pt: LatLon): number {
        let minDist = Infinity, idx = 0;
        routePoints.forEach((p, i) => {
            const d = haversine(p, pt);
            if (d < minDist) { minDist = d; idx = i; }
        });
        return idx;
    }

    function snapToRoute(clicked: LatLon): LatLon {
        return routePoints[routeIndexOf(clicked)];
    }

    function removeWaypoint(i: number) {
        waypoints = waypoints.filter((_, idx) => idx !== i);
        if (activeDayIndex !== null && activeDayIndex >= waypoints.length + 1) activeDayIndex = null;
        rebuildSegments();
        redrawSegments();
        saveState();
    }

    // ── Segments ─────────────────────────────────────────────────────────────
    function rebuildSegments() {
        if (!routePoints.length) return;
        const allWPs = [routePoints[0], ...waypoints, routePoints[routePoints.length - 1]];
        daySegments = [];
        for (let i = 0; i < allWPs.length - 1; i++) {
            const startIdx = routeIndexOf(allWPs[i]);
            const endIdx = routeIndexOf(allWPs[i + 1]);
            const slice = routePoints.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
            const elevSlice = routeElevations.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
            daySegments.push({
                start: allWPs[i],
                end: allWPs[i + 1],
                points: slice,
                distanceKm: totalDistance(slice).toFixed(1),
                elevGain: computeElevGain(elevSlice),
                date: '',
            });
        }
        rebuildDates();
    }

    // ── Dates ────────────────────────────────────────────────────────────────
    function rebuildDates() {
        if (!startDate) return;
        const base = new Date(startDate);
        daySegments = daySegments.map((seg, i) => {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            return { ...seg, date: d.toISOString().split('T')[0] };
        });
        saveState();
    }

    function updateDates(fromIdx: number) {
        for (let i = fromIdx + 1; i < daySegments.length; i++) {
            const prev = new Date(daySegments[i - 1].date);
            prev.setDate(prev.getDate() + 1);
            daySegments[i].date = prev.toISOString().split('T')[0];
        }
        daySegments = [...daySegments];
        saveState();
    }

    // ── Focus day + météo ────────────────────────────────────────────────────
    function focusDaySegment(i: number) {
        weatherData = null; weatherError = '';
        activeDayIndex = activeDayIndex === i ? null : i;
        redrawSegments();
        if (activeDayIndex === null) { fitMapToRoute(); return; }
        const seg = daySegments[i];
        if (!seg.points.length) return;
        const bounds = L.latLngBounds(seg.points.map(p => [p.lat, p.lon] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40] });
        // Set timeline to the day's date if set
        if (seg.date) setTimestamp(seg.date);
    }

    function openWindyDetail(seg: DaySegment) {
        const mid = midPoint(seg);
        bcast.emit('rqstOpen', 'detail', { lat: mid.lat, lon: mid.lon });
    }

    function setTimestamp(dateStr: string) {
        if (!dateStr) return;
        // Set to noon on the day
        const d = new Date(dateStr + 'T12:00:00Z');
        store.set('timestamp', d.getTime());
    }

    function clearActiveDay() {
        activeDayIndex = null;
        redrawSegments();
        fitMapToRoute();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function midPoint(seg: DaySegment): LatLon {
        return seg.points[Math.floor(seg.points.length / 2)] || seg.start;
    }

    function fitMapToRoute() {
        if (!routePoints.length) return;
        const bounds = L.latLngBounds(routePoints.map(p => [p.lat, p.lon] as [number, number]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    function totalDistance(pts: LatLon[]): number {
        let d = 0;
        for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
        return d;
    }

    function haversine(a: LatLon, b: LatLon): number {
        const R = 6371;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLon = (b.lon - a.lon) * Math.PI / 180;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    function computeElevGain(elevs: number[]): number {
        let gain = 0;
        for (let i = 1; i < elevs.length; i++) { const d = elevs[i] - elevs[i-1]; if (d > 0) gain += d; }
        return Math.round(gain);
    }

    function formatLatLon(pt: LatLon): string {
        return `${pt.lat.toFixed(3)}°, ${pt.lon.toFixed(3)}°`;
    }

    function formatDate(dateStr: string): string {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function resetRoute() {
        clearMapLayers();
        routeLoaded = false;
        routePoints = []; routeElevations = [];
        waypoints = []; daySegments = [];
        activeDayIndex = null; startDate = ''; errorMsg = '';
        clearSavedState();
    }

    // ── Persistence ──────────────────────────────────────────────────────────
    const STORAGE_KEY = 'tw_trek_state';

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ routePoints, routeElevations, waypoints, startDate }));
        } catch(e) {}
    }

    function loadSavedState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (!state.routePoints?.length) return;
            routePoints = state.routePoints;
            routeElevations = state.routeElevations || routePoints.map(() => 0);
            waypoints = state.waypoints || [];
            startDate = state.startDate || '';
            if (startDate) {
                const parts = startDate.split('-');
                startYear = parseInt(parts[0]);
                startMonth = parseInt(parts[1]);
                startDay = parseInt(parts[2]);
            }
            routeDistanceKm = totalDistance(routePoints).toFixed(1);
            routeLoaded = true;
            activeDayIndex = null; errorMsg = '';
            drawFullRoute();
            rebuildSegments();
            fitMapToRoute();
        } catch(e) {}
    }

    function clearSavedState() {
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────
    onMount(() => {
        map.on('click', onMapClick);
        syncOverlayFromStore();
        store.on('overlay', (ov: string) => { currentOverlay = ov; });
        loadSavedState();
    });

    onDestroy(() => {
        if (routeLoaded) saveState();
        clearMapLayers();
        map.off('click', onMapClick);
        map.getContainer().style.cursor = '';
    });
</script>

<style>
    .tw-panel { padding: 1rem; }
    .tw-section { padding: 0.6rem 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .tw-section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 0.45rem; }

    .tw-hint { font-size: 0.82rem; color: #94a3b8; line-height: 1.5; margin-bottom: 0.8rem; }
    .tw-hint-sm { font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; }

    /* File input */
    .tw-file-label { display: block; width: 100%; padding: 0.7rem 1rem; background: #1e293b; border: 2px dashed #3b82f6; border-radius: 8px; color: #93c5fd; font-size: 0.85rem; cursor: pointer; text-align: center; transition: background 0.2s; }
    .tw-file-label:hover { background: #1e3a5f; }
    .tw-file-input { display: none; }
    .tw-error { color: #f87171; font-size: 0.8rem; margin-top: 0.5rem; }

    /* Route info */
    .tw-route-info { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #cbd5e1; }

    /* Layer grid */
    .tw-layer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem; }
    .tw-layer-btn { background: #1e293b; border: 1px solid #334155; border-radius: 5px; color: #94a3b8; font-size: 0.65rem; padding: 0.3rem 0.2rem; cursor: pointer; text-align: center; transition: all 0.15s; white-space: nowrap; overflow: hidden; }
    .tw-layer-btn:hover { background: #273549; color: #e2e8f0; }
    .tw-layer-btn--active { background: #1d4ed8; border-color: #3b82f6; color: white; font-weight: 700; }

    /* Day cards */
    .tw-day-card { background: #1e293b; border-radius: 8px; padding: 0.5rem 0.6rem; margin-bottom: 0.45rem; border: 1px solid rgba(255,255,255,0.06); transition: border-color 0.2s; }
    .tw-day-card--active { border-color: #3b82f6; background: #172033; }
    .tw-day-header { display: flex; align-items: center; gap: 0.4rem; }
    .tw-day-badge { color: white; font-size: 0.7rem; font-weight: 700; border-radius: 4px; padding: 0.15rem 0.4rem; min-width: 24px; text-align: center; }
    .tw-day-dist { font-size: 0.72rem; color: #94a3b8; flex: 1; }
    .tw-day-actions { display: flex; gap: 0.25rem; }
    .tw-day-date-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem; }
    .tw-date-label { font-size: 0.75rem; }

    /* Weather panel inside day card */
    .tw-weather-panel { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 0.4rem; }
    .tw-weather-mid { font-size: 0.72rem; color: #94a3b8; }
    .tw-weather-label { font-weight: 600; color: #cbd5e1; margin-right: 0.3rem; }
    .tw-weather-coords { color: #64748b; }
    .tw-weather-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .tw-weather-ts { display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; color: #94a3b8; background: rgba(59,130,246,0.08); border-radius: 4px; padding: 0.3rem 0.4rem; }

    /* Inputs */
    .tw-date-input { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 4px; padding: 0.22rem 0.4rem; font-size: 0.75rem; flex: 1; }
    .tw-date-full { width: 100%; }

    /* Buttons */
    .tw-btn { border: none; border-radius: 5px; cursor: pointer; font-size: 0.73rem; font-weight: 600; padding: 0.28rem 0.55rem; transition: opacity 0.15s; }
    .tw-btn:hover { opacity: 0.85; }
    .tw-btn:disabled { opacity: 0.4; cursor: default; }
    .tw-btn-sm { padding: 0.2rem 0.4rem; font-size: 0.68rem; }
    .tw-btn-full { width: 100%; padding: 0.55rem; font-size: 0.82rem; margin-top: 0.4rem; }
    .tw-btn-primary { background: #3b82f6; color: white; }
    .tw-btn-secondary { background: #334155; color: #cbd5e1; }
    .tw-btn-danger { background: #ef4444; color: white; }
    .tw-btn-weather { background: #0ea5e9; color: white; }

    /* Legend */
    .tw-legend { display: flex; flex-wrap: wrap; gap: 0.3rem 0.7rem; padding: 0.5rem 0.8rem; font-size: 0.67rem; color: #64748b; }

    /* Weather inline */
    .tw-weather-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.35rem; margin: 0.3rem 0; }
    .tw-weather-item { background: #0f172a; border-radius: 6px; padding: 0.4rem 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
    .tw-weather-icon { font-size: 1.1rem; }
    .tw-weather-val { font-size: 0.9rem; font-weight: 700; color: #e2e8f0; }
    .tw-weather-lbl { font-size: 0.65rem; color: #64748b; margin-left: auto; }
    .tw-weather-err { font-size: 0.75rem; color: #f87171; margin: 0.3rem 0; }
    .tw-btn-fetch { width: 100%; margin-bottom: 0.3rem; }

    .tw-date-selects { display: flex; gap: 0.4rem; }
    .tw-select { flex: 1; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 4px; padding: 0.3rem 0.2rem; font-size: 0.78rem; }

    :global(.tw-marker) { width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; color: white; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
</style>
