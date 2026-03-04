// ============================================================
//  KONFIGURATION & KONSTANTEN
// ============================================================

const ALL_TAGS = [
    'Singen', 'Percussion/Trommeln', 'Improvisation', 'Instrumentalmusik',
    'Gesundheit & Wohlbefinden', 'Für Kinder', 'Für Erwachsene',
    'Songwriting', 'Weiterbildung', 'Bewegung/Tanz', 'Vernetzungstreffen', 'Sonstiges'
];

const CAT_FA = {
    person:      'fa-solid fa-user',
    institution: 'fa-solid fa-building',
    event:       'fa-solid fa-calendar-days'
};
const CAT_COLOR = {
    person:      '#16a34a',
    institution: '#2563eb',
    event:       '#dc2626'
};
const CAT_GRADIENT = {
    person:      'linear-gradient(180deg, #0a3320 0%, #111827 55%)',
    institution: 'linear-gradient(180deg, #0c1f4a 0%, #111827 55%)',
    event:       'linear-gradient(180deg, #3b0a0a 0%, #111827 55%)'
};
const REG_LABELS = {
    once: 'Einmalig', weekly: 'Wöchentlich',
    biweekly: 'Alle 2 Wochen', monthly: 'Monatlich'
};

// ============================================================
//  STATE
// ============================================================

let allPins = [];
let filteredPins = [];
let markers = [];
let clusterGroup = null;
let userLocation = null;
let activeFilters = {
    types: new Set(['person', 'institution', 'event']),
    radius: 999999,
    dateFrom: null,
    dateTo: null,
    tags: new Set()
};
let isAddingMode = false;
let tempMarker = null;
let currentView = 'map';
let detailMap = null;
let detailMarker = null;
let listSearchQuery = '';

// ============================================================
//  HILFSFUNKTIONEN
// ============================================================

function formatDate(s) {
    if (!s) return '';
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}

function shortenUrl(url) {
    if (!url) return '';
    const clean = url.replace(/^https?:\/\/(www\.)?/, '');
    return clean.length > 22 ? clean.substring(0, 22) + '…' : clean;
}

// Adresse aus Nominatim-Objekt: "Ort, Straße Hausnr[, PLZ]"
function formatNominatimAddress(data) {
    const a    = data.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || '';
    const road = a.road || a.pedestrian || a.path || '';
    const num  = a.house_number || '';
    const street = road ? road + (num ? ' ' + num : '') : '';
    const parts = [city, street].filter(Boolean);
    if (a.postcode) parts.push(a.postcode);
    return parts.join(', ') || data.display_name || '';
}

// ============================================================
//  KARTE INITIALISIEREN
// ============================================================

const icons = {
    person:      new L.Icon({ iconUrl: '/static/pins/person.png',      iconSize:[38,54], iconAnchor:[19,48], popupAnchor:[0,-48] }),
    institution: new L.Icon({ iconUrl: '/static/pins/institution.png', iconSize:[38,54], iconAnchor:[19,48], popupAnchor:[0,-48] }),
    event:       new L.Icon({ iconUrl: '/static/pins/event.png',       iconSize:[38,54], iconAnchor:[19,48], popupAnchor:[0,-48] }),
    temp:        new L.Icon({ iconUrl: '/static/pins/person.png',      iconSize:[38,54], iconAnchor:[19,48], popupAnchor:[0,-48] })
};

const map = L.map('map', { zoomControl: false }).setView([51.1657, 10.4515], 6);
window._cmap = map;

L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);

// Marker-Cluster initialisieren
clusterGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    animate: true,
    maxClusterRadius: function(zoom) {
        if (zoom >= 16) return 66; // nur noch exakt gleiche Koordinaten clustern → Spiderfy greift
        const metersPerPx = (40075016 * Math.cos(51 * Math.PI / 180)) / (256 * Math.pow(2, zoom));
        const px = Math.round(5000 / metersPerPx);
        return Math.min(Math.max(px, 40), 100);
    },
    iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
            html: `<div style="position:relative;width:38px;height:48px">
                     <img src="/static/pins/cluster.png" style="width:38px;height:48px;position:absolute;top:0;left:0">
                     <span style="position:absolute;top:1px;left:50%;transform:translateX(-50%);color:white;font-weight:800;font-size:20px;font-family:system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.6)">${count}</span>
                   </div>`,
            className: '',
            iconSize:   L.point(38, 48),
            iconAnchor: L.point(19, 48),
            popupAnchor: L.point(0, -48)
        });
    }
});
map.addLayer(clusterGroup);

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        L.circleMarker([userLocation.lat, userLocation.lng], {
            radius: 8, color: 'white', fillColor: '#3b82f6', fillOpacity: 1
        }).addTo(map);
        updateRadiusLabel();
        applyFilters();
    }, () => {
        document.getElementById('gpsStatus').innerText = 'GPS nicht verfügbar. Umkreis deaktiviert.';
        document.getElementById('radiusRange').disabled = true;
    });
}

// ============================================================
//  TAGS
// ============================================================

function buildTagCheckboxes() {
    const form = document.getElementById('tagCheckboxContainer');
    if (form) ALL_TAGS.forEach(tag => {
        const l = document.createElement('label');
        l.className = 'flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200';
        l.innerHTML = `<input type="checkbox" class="pin-tag accent-blue-500" value="${tag}"> ${tag}`;
        form.appendChild(l);
    });
    const filter = document.getElementById('tagFilterPanel');
    if (filter) ALL_TAGS.forEach(tag => {
        const l = document.createElement('label');
        l.className = 'flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300';
        l.innerHTML = `<input type="checkbox" class="filter-tag accent-blue-500" value="${tag}" onchange="onTagFilterChange()"> ${tag}`;
        filter.appendChild(l);
    });
}

function toggleTagFilter() {
    const panel = document.getElementById('tagFilterPanel');
    const arrow = document.getElementById('tagFilterArrow');
    arrow.style.transform = panel.classList.toggle('hidden') ? '' : 'rotate(180deg)';
}

function onTagFilterChange() {
    activeFilters.tags = new Set([...document.querySelectorAll('.filter-tag:checked')].map(el => el.value));
    const n  = activeFilters.tags.size;
    const el = document.getElementById('tagFilterCount');
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
    applyFilters();
}

// ============================================================
//  VIEW SWITCH
// ============================================================

function switchView(mode) {
    currentView = mode;
    document.getElementById('mapView').classList.toggle('hidden', mode !== 'map');
    document.getElementById('listView').classList.toggle('hidden', mode !== 'list');
    const on  = 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300';
    const off = 'text-gray-600 dark:text-gray-400 hover:text-gray-900';
    const bm  = document.getElementById('btnMap');
    const bl  = document.getElementById('btnList');
    const inp = document.getElementById('addrInput');

    if (mode === 'map') {
        bm.className = 'px-5 py-2 rounded-full transition-all duration-200 ' + on;
        bl.className = 'px-5 py-2 rounded-full transition-all duration-200 ' + off;
        document.getElementById('sortOptionsPanel').classList.add('hidden');
        inp.placeholder = 'Adresse suchen...';
        inp.value = '';
        document.getElementById('addrResults').classList.add('hidden');
    } else {
        bl.className = 'px-5 py-2 rounded-full transition-all duration-200 ' + on;
        bm.className = 'px-5 py-2 rounded-full transition-all duration-200 ' + off;
        document.getElementById('sortOptionsPanel').classList.remove('hidden');
        inp.placeholder = 'Suchen nach Titel, Beschreibung, Schlagwort…';
        inp.value = listSearchQuery;
        document.getElementById('addrResults').classList.add('hidden');
        renderList();
    }
}

function toggleSearch() {
    document.getElementById('searchBar').classList.toggle('hidden');
    document.getElementById('filterPanel').classList.add('hidden');
    if (!document.getElementById('searchBar').classList.contains('hidden'))
        document.getElementById('addrInput').focus();
}

function toggleFilters() {
    if (document.getElementById('filterBtn').disabled) return;
    document.getElementById('filterPanel').classList.toggle('hidden');
    document.getElementById('searchBar').classList.add('hidden');
}

// ============================================================
//  TEXTSUCHE (Listenansicht)
// ============================================================

function scorePin(pin, terms) {
    const titleLower = (pin.title || '').toLowerCase();
    const descLower  = (pin.description || '').toLowerCase();
    const tagsLower  = (pin.tags || []).map(t => t.toLowerCase());
    let score = 0;
    for (const term of terms) {
        if (!term) continue;
        const t = term.toLowerCase().trim();
        if (titleLower === t)        score += 12;
        else if (titleLower.includes(t)) score += 6;
        for (const tag of tagsLower) {
            if (tag === t)           score += 5;
            else if (tag.includes(t)) score += 3;
        }
        if (descLower.includes(t))   score += 2;
    }
    return score;
}

function performListSearch(query) {
    listSearchQuery = query;
    renderList();
}

// ============================================================
//  FILTER
// ============================================================

function toggleFilterType(type) {
    const colorMap = { person: 'green', institution: 'blue', event: 'red' };
    const idMap    = { person: 'filPerson', institution: 'filInst', event: 'filEvent' };
    const btn = document.getElementById(idMap[type]);
    const col = colorMap[type];
    if (activeFilters.types.has(type)) {
        activeFilters.types.delete(type);
        btn.classList.remove(`bg-${col}-500`, 'text-white');
        btn.classList.add('bg-transparent', 'text-gray-500', 'border-gray-300');
    } else {
        activeFilters.types.add(type);
        btn.classList.remove('bg-transparent', 'text-gray-500', 'border-gray-300');
        btn.classList.add(`bg-${col}-500`, 'text-white');
    }
    applyFilters();
}

function updateRadiusLabel() {
    const range = document.getElementById('radiusRange');
    const val   = range.value;
    document.getElementById('radiusVal').innerText = (val == range.max) ? 'Alle' : val + ' km';
    const pct = ((val - range.min) * 100) / (range.max - range.min);
    range.style.background = `linear-gradient(to right,#3b82f6 0%,#3b82f6 ${pct}%,#4b5563 ${pct}%,#4b5563 100%)`;
    activeFilters.radius = (val == range.max) ? 999999 : parseInt(val);
    if (userLocation) document.getElementById('gpsStatus').innerText = 'GPS aktiv.';
}

function applyFilters() {
    activeFilters.dateFrom = document.getElementById('dateFrom').value;
    activeFilters.dateTo   = document.getElementById('dateTo').value;
    filteredPins = allPins.filter(p => {
        if (!activeFilters.types.has(p.category)) return false;
        if (activeFilters.radius < 999999 && userLocation) {
            p.distance = getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng);
            if (p.distance > activeFilters.radius) return false;
        }
        if (p.category === 'event') {
            if (activeFilters.dateFrom && p.date && p.date < activeFilters.dateFrom) return false;
            if (activeFilters.dateTo   && p.date && p.date > activeFilters.dateTo)   return false;
        }
        if (activeFilters.tags.size > 0) {
            const pinTags = new Set(p.tags || []);
            if (![...activeFilters.tags].some(t => pinTags.has(t))) return false;
        }
        return true;
    });
    updateMapMarkers();
    if (currentView === 'list') renderList();
    const def = activeFilters.types.size === 3 && activeFilters.radius >= 999999
        && !activeFilters.dateFrom && activeFilters.tags.size === 0;
    document.getElementById('activeFilterDot').classList.toggle('hidden', def);
}

// ============================================================
//  KARTEN-MARKER
// ============================================================

function updateMapMarkers() {
    clusterGroup.clearLayers();
    markers = [];
    filteredPins.forEach(p => {
        const m     = L.marker([p.lat, p.lng], { icon: icons[p.category] || icons.temp });
        const color = CAT_COLOR[p.category] || '#6b7280';
        const fa    = CAT_FA[p.category]    || '';
        const short = (p.description || '').length > 90
            ? p.description.substring(0, 90) + '…'
            : (p.description || '');

        let eventLine = '';
        if (p.category === 'event' && p.date) {
            eventLine = `<div style="color:#f87171;font-size:11px;margin:3px 0 0">
                <i class="fa-regular fa-calendar" style="margin-right:4px"></i>${formatDate(p.date)}${p.time ? ' &middot; ' + p.time : ''}
            </div>`;
        }

        const html = `
<div style="position:relative;width:220px">
  <div style="display:flex;align-items:flex-start;gap:8px;padding-right:28px;margin-bottom:6px">
    <i class="${fa}" style="color:${color};font-size:15px;margin-top:2px;flex-shrink:0"></i>
    <div style="flex:1;min-width:0">
      <div style="color:white;font-weight:700;font-size:14px;line-height:1.3;word-break:break-word">${p.title}</div>
      ${eventLine}
    </div>
  </div>
  ${short ? `<p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0 0 8px">${short}</p>` : ''}
  <button onclick="openDetails('${p.id}')"
    style="width:100%;background:${color};color:white;border:none;padding:7px 0;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">
    Details
  </button>
  <button onclick="window._cmap.closePopup()"
    style="position:absolute;top:-4px;right:-4px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:rgba(255,255,255,0.8);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">&times;</button>
</div>`;

        m.bindPopup(html, { minWidth: 242, maxWidth: 246, closeButton: false, className: `popup-${p.category}` });
        markers.push(m);
        clusterGroup.addLayer(m);
    });
}

// ============================================================
//  DETAIL MODAL
// ============================================================

window.openDetails = function(id) {
    map.closePopup();
    const pin = allPins.find(p => p.id === id);
    if (!pin) return;

    const color = CAT_COLOR[pin.category] || '#6b7280';
    const fa    = CAT_FA[pin.category]    || '';

    document.getElementById('detailModalInner').style.background = CAT_GRADIENT[pin.category];

    const iconEl = document.getElementById('detailCatIcon');
    iconEl.className      = fa;
    iconEl.style.color    = color;
    iconEl.style.fontSize = '22px';
    document.getElementById('detailTitle').textContent = pin.title;

    const tagsEl = document.getElementById('detailTags');
    tagsEl.innerHTML = '';
    (pin.tags || []).forEach(tag => {
        const s = document.createElement('span');
        s.className   = 'tag-chip';
        s.textContent = tag;
        tagsEl.appendChild(s);
    });

    const evBlock = document.getElementById('detailEventInfo');
    if (pin.category === 'event') {
        evBlock.classList.remove('hidden');
        document.getElementById('detailDateLine').innerHTML =
            `<i class="fa-regular fa-calendar" style="margin-right:6px"></i>${formatDate(pin.date) || '–'}`;
        document.getElementById('detailTimeLine').innerHTML = pin.time
            ? `<i class="fa-regular fa-clock" style="margin-right:6px"></i>${pin.time} Uhr` : '';
        const reg = REG_LABELS[pin.regularity] || pin.regularity || '';
        document.getElementById('detailRegLine').innerHTML = reg
            ? `<i class="fa-solid fa-rotate" style="margin-right:6px"></i>${reg}` : '';
    } else {
        evBlock.classList.add('hidden');
    }

    document.getElementById('detailDesc').textContent = pin.description || '';

    const linksEl = document.getElementById('detailLinks');
    linksEl.innerHTML = '';
    (pin.links || []).forEach(link => {
        if (!link.url) return;
        const label = link.title ? link.title : shortenUrl(link.url);
        const a = document.createElement('a');
        a.href   = link.url;
        a.target = '_blank';
        a.rel    = 'noopener noreferrer';
        a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;color:white;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);text-decoration:none;margin-right:6px;margin-top:6px';
        a.innerHTML = `<i class="fa-solid fa-globe"></i> ${label}`;
        linksEl.appendChild(a);
    });

    document.getElementById('detailAddr').textContent = pin.address || 'Keine Adresse angegeben';

    if (userLocation && pin.lat && pin.lng) {
        const dist = getDistance(userLocation.lat, userLocation.lng, pin.lat, pin.lng);
        document.getElementById('detailDistRow').classList.remove('hidden');
        document.getElementById('detailDistVal').textContent = dist.toFixed(1) + ' km entfernt';
    } else {
        document.getElementById('detailDistRow').classList.add('hidden');
    }

    // Kontakt: Spinner 5 Sek. hard-coded
    const contactBtn = document.getElementById('detailContactBtn');
    contactBtn.onclick = async () => {
        const origHTML = contactBtn.innerHTML;
        contactBtn.disabled = true;
        contactBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>`;

        try {
            const res  = await fetch(`/api/contact_info/${pin.id}`);
            const data = await res.json();
            if (data.email) {
                const subj = encodeURIComponent(`Community-Mapper | ${pin.title}`);
                window.location.href = `mailto:${data.email}?subject=${subj}`;
            } else {
                alert('Keine Kontaktadresse hinterlegt.');
            }
        } catch {
            alert('Kontaktinformation konnte nicht geladen werden.');
        }

        setTimeout(() => {
            contactBtn.disabled = false;
            contactBtn.innerHTML = origHTML;
        }, 5000);
    };

    document.getElementById('detailModal').classList.remove('hidden');

    if (!detailMap) {
        detailMap = L.map('detailMap');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(detailMap);
    }
    setTimeout(() => {
        detailMap.invalidateSize();
        detailMap.setView([pin.lat, pin.lng], 15);
        if (detailMarker) detailMap.removeLayer(detailMarker);
        detailMarker = L.marker([pin.lat, pin.lng], { icon: icons[pin.category] || icons.temp }).addTo(detailMap);
    }, 200);
};

document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
});

// ============================================================
//  HINZUFÜGEN MODUS
// ============================================================

function toggleAddMode() {
    isAddingMode = !isAddingMode;
    const fab     = document.getElementById('fabAdd');
    const banner  = document.getElementById('addModeBanner');
    const mapCont = document.getElementById('map');
    const sb      = document.getElementById('searchBar');
    const fbtn    = document.getElementById('filterBtn');
    const fpanel  = document.getElementById('filterPanel');

    if (isAddingMode) {
        switchView('map');
        fab.classList.replace('bg-blue-600', 'bg-red-500');
        fab.innerHTML = '<i class="fa-solid fa-times text-2xl"></i>';
        banner.classList.remove('hidden');
        mapCont.classList.add('cursor-crosshair');
        fpanel.classList.add('hidden');
        fbtn.disabled = true;
        sb.classList.remove('hidden');
        document.getElementById('addrInput').focus();
    } else {
        fab.classList.replace('bg-red-500', 'bg-blue-600');
        fab.innerHTML = '<i class="fa-solid fa-plus text-2xl"></i>';
        banner.classList.add('hidden');
        mapCont.classList.remove('cursor-crosshair');
        fbtn.disabled = false;
        sb.classList.add('hidden');
        if (tempMarker) map.removeLayer(tempMarker);
    }
}

map.on('click', async function(e) {
    if (!isAddingMode) return;
    const { lat, lng } = e.latlng;
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([lat, lng], { icon: icons.temp }).addTo(map);
    document.getElementById('lat').value = lat;
    document.getElementById('lng').value = lng;
    try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        document.getElementById('addressDisplay').value = formatNominatimAddress(data);
    } catch {
        document.getElementById('addressDisplay').value = lat.toFixed(4) + ', ' + lng.toFixed(4);
    }
    document.getElementById('addModal').classList.remove('hidden');
});

// ============================================================
//  FORMULAR
// ============================================================

function setFormCat(cat) {
    document.getElementById('cat').value = cat;
    updateFormFields();
    ['Person', 'Inst', 'Event'].forEach(c => {
        const b = document.getElementById('btnCat' + c);
        b.className = 'cat-btn flex-1 px-4 py-2 text-sm font-medium border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900';
        if (c === 'Person') b.classList.add('rounded-l-lg', 'border-r-0');
        if (c === 'Inst')   b.classList.add('border-l-0', 'border-r-0');
        if (c === 'Event')  b.classList.add('rounded-r-lg', 'border-l-0');
    });
    const k  = cat === 'person' ? 'Person' : cat === 'institution' ? 'Inst' : 'Event';
    const ab = document.getElementById('btnCat' + k);
    ab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white');
    if (cat === 'person')      ab.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600', 'border-green-600');
    if (cat === 'institution') ab.classList.add('bg-blue-500',  'text-white', 'hover:bg-blue-600',  'border-blue-600');
    if (cat === 'event')       ab.classList.add('bg-red-500',   'text-white', 'hover:bg-red-600',   'border-red-600');
}

function updateFormFields() {
    document.getElementById('eventFields').classList.toggle('hidden', document.getElementById('cat').value !== 'event');
}
function checkCustomReg() {
    document.getElementById('regCustom').classList.toggle('hidden', document.getElementById('regularity').value !== 'custom');
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (id === 'addModal' && isAddingMode) toggleAddMode();
}

function submitPin() {
    const reg     = document.getElementById('regularity').value;
    const tags    = [...document.querySelectorAll('.pin-tag:checked')].map(el => el.value);
    const l1url   = document.getElementById('link1_url').value.trim();
    const l1title = document.getElementById('link1_title').value.trim();
    const l2url   = document.getElementById('link2_url').value.trim();
    const l2title = document.getElementById('link2_title').value.trim();
    const links   = [];
    if (l1url) links.push({ title: l1title, url: l1url });
    if (l2url) links.push({ title: l2title, url: l2url });

    const data = {
        category:    document.getElementById('cat').value,
        title:       document.getElementById('title').value,
        description: document.getElementById('desc').value,
        selfDesc:    document.getElementById('selfDesc').value,
        email:       document.getElementById('email').value,
        lat:         parseFloat(document.getElementById('lat').value),
        lng:         parseFloat(document.getElementById('lng').value),
        address:     document.getElementById('addressDisplay').value,
        date:        document.getElementById('date').value || null,
        time:        document.getElementById('time').value || null,
        regularity:  document.getElementById('cat').value === 'event'
            ? (reg === 'custom' ? document.getElementById('regCustom').value : reg)
            : null,
        tags,
        links
    };
    fetch('/api/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }).then(r => r.json()).then(res => {
        alert(res.message);
        document.getElementById('addModal').classList.add('hidden');
        if (isAddingMode) toggleAddMode();
    });
}

// ============================================================
//  LISTENANSICHT
// ============================================================

function getDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lat2) return 0;
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function renderList() {
    const container = document.getElementById('listContainer');
    container.innerHTML = '';
    let listData = [...filteredPins];

    // Textsuche hat Vorrang
    const rawQuery = listSearchQuery.trim();
    if (rawQuery) {
        const terms = rawQuery.split(',').map(s => s.trim()).filter(Boolean);
        listData = listData
            .map(p => ({ pin: p, score: scorePin(p, terms) }))
            .filter(e => e.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(e => e.pin);

        if (!listData.length) {
            container.innerHTML = `<p class="text-center text-gray-500 mt-10"><i class="fa-solid fa-magnifying-glass mr-2"></i>Keine Treffer für &bdquo;${rawQuery}&ldquo;</p>`;
            return;
        }
        renderSimpleGrid(container, listData, !!userLocation);
        return;
    }

    // Kein Suchtext: nach Sortmode
    const mode = document.getElementById('sortMode').value;
    if (mode === 'proximity' && userLocation) {
        listData.forEach(p => p.distance = getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng));
        listData.sort((a, b) => a.distance - b.distance);
        renderSimpleGrid(container, listData, true);
    } else if (mode === 'date_asc') {
        listData.sort((a, b) => (a.date||'9999').localeCompare(b.date||'9999'));
        renderSimpleGrid(container, listData);
    } else {
        const groups = { event:[], person:[], institution:[] };
        listData.forEach(p => { if (groups[p.category]) groups[p.category].push(p); });
        renderSection(container, 'Veranstaltungen', groups.event,       'border-red-500',   'fa-solid fa-calendar-days', '#f87171');
        renderSection(container, 'Personen',        groups.person,      'border-green-500', 'fa-solid fa-user',          '#4ade80');
        renderSection(container, 'Institutionen',   groups.institution, 'border-blue-500',  'fa-solid fa-building',      '#60a5fa');
    }
}

function renderSimpleGrid(container, items, showDist=false) {
    if (!items.length) { container.innerHTML = "<p class='text-center text-gray-500 mt-10'>Keine Einträge gefunden.</p>"; return; }
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    items.forEach(p => grid.appendChild(createPinCard(p, showDist)));
    container.appendChild(grid);
}

function renderSection(container, title, items, colorClass, faClass, iconColor) {
    if (!items.length) return;
    const sec = document.createElement('div');
    sec.innerHTML = `<h3 class="font-bold text-gray-500 uppercase text-xs mb-3 pl-2 border-l-4 ${colorClass} flex items-center gap-2">
        <i class="${faClass}" style="color:${iconColor}"></i> ${title}
    </h3>`;
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-6';
    items.forEach(p => grid.appendChild(createPinCard(p)));
    sec.appendChild(grid);
    container.appendChild(sec);
}

function createPinCard(p, showDist=false) {
    const div   = document.createElement('div');
    const color = CAT_COLOR[p.category] || '#6b7280';
    const fa    = CAT_FA[p.category]    || '';
    div.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden';

    let meta = '';
    if (p.category === 'event')
        meta += `<div class="text-red-500 font-bold text-sm mb-1"><i class="fa-regular fa-calendar mr-1"></i>${formatDate(p.date)||'?'}${p.time?' &middot; '+p.time:''}</div>`;
    if (showDist && p.distance)
        meta += `<div class="text-xs text-blue-500 mb-1"><i class="fa-solid fa-location-arrow mr-1"></i>${p.distance.toFixed(1)} km</div>`;

    const tagsHtml = (p.tags||[]).slice(0,3).map(t =>
        `<span style="font-size:10px;padding:2px 8px;border-radius:9999px;background:#374151;color:#d1d5db;border:1px solid #4b5563">${t}</span>`
    ).join('') + (p.tags&&p.tags.length>3 ? `<span style="font-size:10px;color:#9ca3af;align-self:center">+${p.tags.length-3}</span>` : '');

    div.innerHTML = `
        <div style="height:3px;background:${color}"></div>
        <div class="p-4 flex flex-col flex-grow">
            <div class="flex justify-between items-start mb-1 gap-2">
                <h4 class="font-bold text-base dark:text-white leading-tight flex items-center gap-2">
                    <i class="${fa}" style="color:${color};font-size:13px;flex-shrink:0"></i>${p.title}
                </h4>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-300 uppercase shrink-0">${p.category}</span>
            </div>
            ${meta}
            <p class="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-2 flex-grow">${p.description||''}</p>
            ${tagsHtml ? `<div class="flex flex-wrap gap-1 mt-2">${tagsHtml}</div>` : ''}
            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span class="text-xs text-gray-400 truncate max-w-[60%]">${p.address||''}</span>
                <button onclick="openDetails('${p.id}')" class="text-sm font-bold hover:underline" style="color:${color}">Details</button>
            </div>
        </div>`;
    return div;
}

// ============================================================
//  SUCHEINGABE — dual-mode
// ============================================================

let searchTimeout = null;
document.getElementById('addrInput').addEventListener('input', function(e) {
    clearTimeout(searchTimeout);
    const query = e.target.value;

    if (currentView === 'list') {
        // Listenansicht: Textsuche mit kurzem Debounce
        searchTimeout = setTimeout(() => performListSearch(query), 250);
        return;
    }

    // Kartenansicht: Nominatim-Adresssuche
    const res = document.getElementById('addrResults');
    if (query.length < 3) { res.classList.add('hidden'); return; }
    searchTimeout = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=de&q=${encodeURIComponent(query)}`)
        .then(r => r.json()).then(data => {
            res.innerHTML = '';
            if (data.length) {
                res.classList.remove('hidden');
                data.forEach(item => {
                    const d = document.createElement('div');
                    d.className = 'px-3 py-2 hover:bg-blue-100 dark:hover:bg-gray-600 cursor-pointer text-sm border-b dark:border-gray-600 last:border-0 text-gray-800 dark:text-gray-200';
                    d.textContent = formatNominatimAddress(item);
                    d.onclick = () => selectAddress(item);
                    res.appendChild(d);
                });
            } else res.classList.add('hidden');
        });
    }, 300);
});

function selectAddress(item) {
    const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
    map.setView([lat, lng], 16);
    document.getElementById('addrResults').classList.add('hidden');
    if (isAddingMode) {
        document.getElementById('addressDisplay').value = formatNominatimAddress(item);
        if (tempMarker) map.removeLayer(tempMarker);
        tempMarker = L.marker([lat, lng], { icon: icons.temp }).addTo(map);
        document.getElementById('lat').value = lat;
        document.getElementById('lng').value = lng;
        document.getElementById('addModal').classList.remove('hidden');
    }
}

// ============================================================
//  INIT
// ============================================================

fetch('/api/pins').then(r => r.json()).then(pins => {
    allPins = pins;
    filteredPins = pins;
    updateMapMarkers();
});

buildTagCheckboxes();
setFormCat('person');
updateRadiusLabel();