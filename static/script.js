// config und constants

let ALL_TAGS = []

async function init_tags() {
    const response = await fetch('/api/getTags');
    ALL_TAGS = await response.json();
    buildTagCheckboxes(ALL_TAGS);
}

init_tags();

const CAT_FA = {
    person:      'fa-solid fa-user',
    institution: 'fa-solid fa-building',
    event:       'fa-solid fa-calendar-days'
};
const CAT_COLOR = {
    person:      '#4ca626',
    institution: '#2d40ab',
    event:       '#c71c0a'
};

const DETAIL_COLOR = {
    person:      '#2e6816',
    institution: '#1e2a74',
    event:       '#7c1307'
};

const CAT_GRADIENT = {
    person:      'linear-gradient(135deg, #0a3320 0%, #111827 60%)',
    institution: 'linear-gradient(135deg, #0c1f4a 0%, #111827 60%)',
    event:       'linear-gradient(135deg, #3b0a0a 0%, #111827 60%)'
};
const REG_LABELS = {
    once:      'Einmalig',
    single:    'Einmalig',
    daily:     'Täglich',
    weekly:    'Wöchentlich',
    biweekly:  'Alle 2 Wochen',
    monthly:   'Monatlich'
};

function showToast(msg, success = true) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-24 left-1/2 z-[9999] px-5 py-3 rounded-full shadow-xl text-sm font-semibold text-white flex items-center gap-2 transition-all duration-300 opacity-0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
    t.style.background = success ? '#16a34a' : '#dc2626';
    t.innerHTML = `<i class="fa-solid ${success ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${msg}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
    if (pill && btn) {
        const container = pill.parentElement;
        const offset = btn.getBoundingClientRect().left - container.getBoundingClientRect().left;
        pill.style.width     = btn.offsetWidth + 'px';
        pill.style.transform = `translateX(${offset}px)`;
        }
    });
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

let currentSortMode = 'proximity';

function setSortMode(mode) {
    currentSortMode = mode;
    const pill = document.getElementById('sortPill');
    const activeBtn = document.getElementById('sortBtn-' + mode);

    document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.remove('text-gray-600', 'dark:text-gray-300');
    b.classList.add('text-gray-500', 'dark:text-gray-400');
    });

    if (activeBtn && pill) {
        activeBtn.classList.remove('text-gray-500', 'dark:text-gray-400');
        activeBtn.classList.add('text-gray-600', 'dark:text-gray-300');

        pill.style.width = activeBtn.offsetWidth + 'px';
        pill.style.transform = `translateX(${activeBtn.offsetLeft - 8}px)`;
    }
    renderList();
}

// state

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

// Hilfsfunktionen

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

function formatRegularity(reg) {
    if (!reg) return '';
    if (REG_LABELS[reg]) return REG_LABELS[reg];
    const m = reg.match(/^(\d+)(days?|weeks?|months?|years?)$/);
    if (m) {
        const n = m[1];
        const unitMap = {
            day: 'Tag', days: 'Tage',
            week: 'Woche', weeks: 'Wochen',
            month: 'Monat', months: 'Monate',
            year: 'Jahr', years: 'Jahre'
        };
        return `Alle ${n} ${unitMap[m[2]] || m[2]}`;
    }
    return reg;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function formatDateWithWeekday(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const pad = n => String(n).padStart(2,'0');
    const dateFormatted = `${pad(d)}.${pad(m)}.${y}`;
    if (dt.getTime() === today.getTime())    return `Heute, ${dateFormatted}`;
    if (dt.getTime() === tomorrow.getTime()) return `Morgen, ${dateFormatted}`;
    return `${WEEKDAYS[dt.getDay()]}, ${dateFormatted}`;
}

function nextNOccurrences(dateStr, regularity, n = 5, eventTime = null) {
    if (!dateStr) return [];
    const [y, m, d] = dateStr.split('-').map(Number);
    let current = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0,0,0,0);
    const results = [];

    // Intervall bestimmen
    let nDays = null, nMonths = null, nYears = null;
    if      (regularity === 'daily')    nDays   = 1;
    else if (regularity === 'weekly')   nDays   = 7;
    else if (regularity === 'biweekly') nDays   = 14;
    else if (regularity === 'monthly')  nMonths = 1;
    else if (regularity && regularity !== 'once') {
        const mt = regularity.match(/^(\d+)(days?|weeks?|months?|years?)$/);
        if (mt) {
            const num = parseInt(mt[1]);
            const unit = mt[2];
            if      (unit.startsWith('day'))   nDays   = num;
            else if (unit.startsWith('week'))  nDays   = num * 7;
            else if (unit.startsWith('month')) nMonths = num;
            else if (unit.startsWith('year'))  nYears  = num;
        }
    }

    if (!nDays && !nMonths && !nYears) return [];  // einmalig → keine Folgedaten

    const advance = (dt) => {
        if (nDays) {
            return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + nDays);
        } else if (nMonths) {
            const nm = dt.getMonth() + nMonths;
            const ny = dt.getFullYear() + Math.floor(nm / 12);
            const finalMonth = nm % 12;
            const maxDay = new Date(ny, finalMonth + 1, 0).getDate();
            return new Date(ny, finalMonth, Math.min(dt.getDate(), maxDay));
        } else {
            try { return new Date(dt.getFullYear() + nYears, dt.getMonth(), dt.getDate()); }
            catch { return new Date(dt.getFullYear() + nYears, dt.getMonth(), 28); }
        }
    };

    // Zum ersten zukünftigen Termin vorspulen ---->
    const nowTime = new Date();
        while (current < today || (
            current.getTime() === today.getTime() &&
            eventTime && (() => {
                try {
                    const [h, m] = eventTime.split(':').map(Number);
                    return nowTime.getHours() > h || (nowTime.getHours() === h && nowTime.getMinutes() >= m);
                } catch { return false; }
            })()
        )) { current = advance(current); }

    // n Termine sammeln
    for (let i = 0; i < n; i++) {
        const ds = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
        results.push(ds);
        current = advance(current);
    }
    return results;
}

// Adresse aus Nominatim-Objekt: "Ort, Straße Hausnr[, PLZ]"
function formatNominatimAddress(data) {
    const a = data.address || {};
    const city     = a.city || a.town || a.village || a.municipality || a.county || '';
    const road     = a.road || a.pedestrian || a.path || '';
    const num      = a.house_number || '';
    const postcode = a.postcode || '';
    const street   = road ? road + (num ? ' ' + num : '') : '';
    const cityPart = [postcode, city].filter(Boolean).join(' ');
    const parts    = [street, cityPart].filter(Boolean);
    return parts.join(', ') || data.display_name || '';
}

function createPinIcon(category, iconIndex) {
    const pinUrl = `/static/pins/${category}/pin.png`;
    const svgUrl = (iconIndex !== null && iconIndex !== undefined && iconIndex !== '')
        ? `/static/pins/${category}/${iconIndex}.svg`
        : null;
    const iconHtml = svgUrl
        ? `<img src="${svgUrl}" style="position:absolute;width:22px;height:22px;top:7px;left:22%;filter:brightness(0) invert(1);pointer-events:none" onerror="this.src='/static/pins/${category}/0.svg'">`
        : '';
    return L.divIcon({
        html: `<div style="position:relative;width:38px;height:54px">
                   <img src="${pinUrl}" style="width:38px;height:54px;position:absolute;top:0;left:0">
                   ${iconHtml}
               </div>`,
        className: '',
        iconSize:    L.point(38, 54),
        iconAnchor:  L.point(19, 54),
        popupAnchor: L.point(0, -54)
    });
}

const icons = {
    person:      createPinIcon('person',      null),
    institution: createPinIcon('institution', null),
    event:       createPinIcon('event',       null),
    temp:        createPinIcon('cluster',      null)
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
        if (zoom >= 16) return 66; // spiderfy
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
const mapResizeObserver = new ResizeObserver(() => {
    if (currentView === 'map') map.invalidateSize({ pan: false });
});
mapResizeObserver.observe(document.getElementById('map'));

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

// Schlagwortlogik


function buildTagCheckboxes(tags) {
    const form = document.getElementById('tagCheckboxContainer');
    if (form) tags.forEach(tag => {
        const l = document.createElement('label');
        l.className = 'flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200';
        l.innerHTML = `<input style="border-radius: 50%;" type="checkbox" class="pin-tag accent-blue-500" value="${tag}"> ${tag}`;
        form.appendChild(l);
    });
    const filter = document.getElementById('tagFilterPanel');
    if (filter) tags.forEach(tag => {
        const l = document.createElement('label');
        l.className = 'flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300';
        l.innerHTML = `<input style="border-radius: 50%;" type="checkbox" class="filter-tag accent-blue-500" value="${tag}" onchange="onTagFilterChange()"> ${tag}`;
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

// Viewswitcher Karte und liste


function switchView(mode) {
    currentView = mode;
    const mapView  = document.getElementById('mapView');
    const listView = document.getElementById('listView');
    const sortBar  = document.getElementById('sortBar');
    const pill     = document.getElementById('viewPill');
    const btnMap   = document.getElementById('btnMap');
    const btnList  = document.getElementById('btnList');

    if (mode === 'map') {

        listView.classList.add('hidden');
        mapView.classList.remove('hidden');
        sortBar.classList.add('hidden');

        const activeViewBtn = mode === 'map'
            ? document.getElementById('btnMap')
            : document.getElementById('btnList');
        pill.style.width = activeViewBtn.offsetWidth + 'px';
        pill.style.transform = `translateX(${activeViewBtn.offsetLeft - 4}px)`;
        btnMap.classList.add('text-gray-100');
        btnMap.classList.remove('text-gray-400');
        btnList.classList.add('text-gray-400');
        btnList.classList.remove('text-gray-100');

        document.getElementById('addrInput').placeholder = 'Adresse suchen...';
        document.getElementById('addrInput').value = '';
        document.getElementById('addrResults').classList.add('hidden');


        setTimeout(() => map.invalidateSize({ pan: false }), 50);
        setTimeout(() => map.invalidateSize({ pan: false }), 200);
        setTimeout(() => map.invalidateSize({ pan: false }), 500);

    } else {
        mapView.classList.add('hidden');
        listView.classList.remove('hidden');
        sortBar.classList.remove('hidden');

        const activeViewBtn = mode === 'map'
            ? document.getElementById('btnMap')
            : document.getElementById('btnList');
        pill.style.width = activeViewBtn.offsetWidth + 'px';
        pill.style.transform = `translateX(${activeViewBtn.offsetLeft - 4}px)`;
        btnList.classList.add('text-gray-100');
        btnList.classList.remove('text-gray-400');
        btnMap.classList.add('text-gray-400');
        btnMap.classList.remove('text-gray-100');

        document.getElementById('addrInput').placeholder = 'Suchen nach Titel, Beschreibung, Schlagwort…';
        document.getElementById('addrInput').value = listSearchQuery;
        document.getElementById('addrResults').classList.add('hidden');
        renderList();
        setTimeout(() => setSortMode(currentSortMode), 50);
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

// Textsuche


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

// Filterlogik


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

// Markerlogik

function updateMapMarkers() {
    clusterGroup.clearLayers();
    markers = [];
    filteredPins.forEach(p => {
    const markerIcon = createPinIcon(p.category, p.pinIcon ?? null);
        const m = L.marker([p.lat, p.lng], { icon: markerIcon });
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
<div style="position:relative;width:200px">
  <div style="display:flex;align-items:flex-start;gap:8px;padding-right:28px;margin-bottom:6px">
    <i class="${fa}" style="color:${color};font-size:15px;margin-top:2px;flex-shrink:0"></i>
    <div style="flex:1;min-width:0">
      <div style="hyphens:auto;color:white;font-weight:700;font-size:14px;line-height:1.3;word-break:break-word">${p.title}</div>
      ${eventLine}
    </div>
  </div>
  <hr style="margin-top: 10px; margin-bottom: 6px; border-color: rgba(255, 255, 255, 0.2);">
  ${short ? `<p style="color:#ffffff;font-size:12px;line-height:1.5;margin:0 0 8px">${short}</p>` : ''}
  <button onclick="openDetails('${p.id}')"
    style="width:100%;background:${color};color:white;border:none;padding:7px 0;border-radius:25px;font-size:14px;cursor:pointer;font-weight:600">
    Details
  </button>
  <button onclick="window._cmap.closePopup()"
    style="position:absolute;top:-4px;right:-4px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:rgba(255,255,255,0.8);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">&times;</button>
</div>`;

        m.bindPopup(html, { width: 180, closeButton: false, className: `popup-${p.category}` });
        markers.push(m);
        clusterGroup.addLayer(m);
    });
}

// Detailansicht-Popup

window.openDetails = function(id) {
    map.closePopup();
    const pin = allPins.find(p => p.id === id);
    if (!pin) return;

    const color = CAT_COLOR[pin.category] || '#6b7280';
    const fa    = CAT_FA[pin.category]    || '';

    document.getElementById('detailModalInner').style.background = CAT_GRADIENT[pin.category];

    const iconEl = document.getElementById('detailCatIcon');
    iconEl.innerHTML = '';
    if (pin.pinIcon !== null && pin.pinIcon !== undefined && pin.pinIcon !== '') {
        const svgUrl = `/static/pins/${pin.category}/${pin.pinIcon}.svg`;
        iconEl.innerHTML = `<img src="${svgUrl}"
            style="width:42px;height:42px;object-fit:contain;filter:brightness(0) invert(1)"
            onerror="this.outerHTML='<i class=\'${fa}\' style=\'color:${color};font-size:22px\'></i>'">`;
    } else {
        iconEl.innerHTML = `<i class="${fa}" style="color:${color};font-size:22px"></i>`;
    }
    document.getElementById('detailTitle').textContent = pin.title;
    const verifiedBadge = document.getElementById('detailVerifiedBadge');
        if (pin.verified && pin.category === 'person') {
            verifiedBadge.classList.remove('hidden');
        } else {
            verifiedBadge.classList.add('hidden');
        }

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
            `<i class="fa-regular fa-calendar" style="margin-right:6px"></i>${formatDateWithWeekday(pin.date) || '–'}`;
        document.getElementById('detailTimeLine').innerHTML = pin.time
            ? `<i class="fa-regular fa-clock" style="margin-right:6px"></i>${pin.time} Uhr` : '';
        const reg = formatRegularity(pin.regularity);
        document.getElementById('detailRegLine').innerHTML = reg
            ? `<i class="fa-solid fa-rotate" style="margin-right:6px"></i>${reg}` : '';
    } else {
        evBlock.classList.add('hidden');
    }

    document.getElementById('detailDesc').textContent = pin.description || '';

    const upcomingEl = document.getElementById('detailUpcoming');
        if (pin.category === 'event' && pin.regularity && pin.regularity !== 'once') {
                const dates = nextNOccurrences(pin.date, pin.regularity, 5, pin.time);            if (dates.length) {
                upcomingEl.classList.remove('hidden');
                upcomingEl.innerHTML = `
                    <p class="text-xs font-bold text-gray-400 uppercase mb-2">
                        <i class="fa-solid fa-calendar-days mr-1"></i>Kommende Termine
                    </p>
                    <div class="space-y-1">
                        ${dates.map((ds, i) => `
                            <div class="flex items-center gap-2 text-xs ${i === 0 ? 'text-white font-bold' : 'text-gray-400'}">
                                <i class="fa-solid fa-circle text-[5px] shrink-0 ${i === 0 ? 'text-red-400' : 'text-gray-600'}"></i>
                                ${formatDateWithWeekday(ds)}
                            </div>`).join('')}
                    </div>`;
            } else {
                upcomingEl.classList.add('hidden');
            }
        } else {
            upcomingEl.classList.add('hidden');
        }

    const linksEl = document.getElementById('detailLinks');
    linksEl.innerHTML = '';
    (pin.links || []).forEach(link => {
        if (!link.url) return;
        const label = link.title ? link.title : shortenUrl(link.url);
        const a = document.createElement('a');
        a.href   = link.url;
        a.target = '_blank';
        a.rel    = 'noopener noreferrer';
        a.classList = "pill";
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
        contactBtn.innerHTML = `<img src="/static/utility/loading_spinner.svg" alt="" style="filter: invert(1)" class="w-5 h-5 mx-auto">`;

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
        detailMarker = L.marker([pin.lat, pin.lng], { icon: createPinIcon(pin.category, pin.pinIcon ?? null) }).addTo(detailMap);
    }, 200);
};

document.getElementById('detailModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
});

// Pin hinzufügen

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
        fab.classList.replace('bg-green-600', 'bg-red-500');
        fab.innerHTML = '<i class="fa-solid fa-times text-2xl"></i>';
        banner.classList.remove('hidden');
        mapCont.classList.add('cursor-crosshair');
        fpanel.classList.add('hidden');
        fbtn.disabled = true;
        sb.classList.remove('hidden');
        document.getElementById('addrInput').focus();
    } else {
        fab.classList.replace('bg-red-500', 'bg-green-600');
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
    requestAnimationFrame(() => setFormCat(document.getElementById('cat').value));
});

// Formularlogik

const CAT_FORM_COLOR = {
    person:      '#143525',
    institution: '#131b2e',
    event:       '#291010'
};
const CAT_PILL_COLOR = {
    person:      '#16a34a',
    institution: '#2563eb',
    event:       '#dc2626'
};

function updateCatPill(cat) {
    const pill = document.getElementById('catPill');
    if (!pill) return;
    const btn = document.getElementById(
        cat === 'event' ? 'btnCatEvent' :
        cat === 'institution' ? 'btnCatInst' : 'btnCatPerson'
    );
    if (!btn) return;
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
    pill.style.background = CAT_PILL_COLOR[cat];
}

window.addEventListener('resize', () => {
    updateCatPill(document.getElementById('cat').value);
});

function setFormCat(cat) {
    document.getElementById('cat').value = cat;
    updateFormFields();

    const allBtns = document.querySelectorAll('.cat-btn');
    allBtns.forEach(b => {
        b.classList.remove('text-white');
        b.classList.add('text-gray-500', 'dark:text-gray-400');
    });
    const btn = document.getElementById(
        cat === 'event' ? 'btnCatEvent' :
        cat === 'institution' ? 'btnCatInst' : 'btnCatPerson'
    );
    btn.classList.remove('text-gray-500', 'dark:text-gray-400');
    btn.classList.add('text-white');

    updateCatPill(cat);
    requestAnimationFrame(() => updateCatPill(cat));

    const formInner = document.getElementById('addFormInner');
    if (formInner) formInner.style.backgroundColor = CAT_FORM_COLOR[cat];

    const submitBtn = document.getElementById('submitButton');
    if (submitBtn) submitBtn.style.background = CAT_PILL_COLOR[cat];

    const pickerBlock = document.getElementById('iconPickerBlock');
    if (cat === 'event' || cat === 'institution') {
        pickerBlock.classList.remove('hidden');
        loadIconPicker(cat);
    } else {
        pickerBlock.classList.add('hidden');
        document.getElementById('pinIcon').value = '';
    }

    document.getElementById('titleLabel').textContent =
        (cat === 'event' || cat === 'institution') ? 'Titel & Icon' : 'Titel';

    const placeholders = {
        person:      'z.B. Maria Mustermann',
        institution: 'z.B. Musikschule Svensheim',
        event:       'z.B. Drum Circle im Park'
    };
    document.getElementById('title').placeholder = placeholders[cat];

    const descPlaceholders = {
        person:      'Wer bist du? Womit beschäftigst du dich? Was sind deine Schwerpunkte?',
        institution: 'Was macht eure Institution? Was hat sie mit Community Music zu tun? Welche Angebote gibt es?',
        event:       'Wie läuft das Event ab? Was erwartet die Teilnehmenden? Muss man etwas mitbringen? Wer ist die Zielgruppe?'
    };
    document.getElementById('desc').placeholder = descPlaceholders[cat];
}



function updateFormFields() {
    document.getElementById('eventFields').classList.toggle('hidden', document.getElementById('cat').value !== 'event');
    document.getElementById('addressPin').style.color =  CAT_PILL_COLOR[document.getElementById('cat').value]
}
function checkCustomReg() {
    const isCustom = document.getElementById('regularity').value === 'custom';
    document.getElementById('regCustomFields').classList.toggle('hidden', !isCustom);
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    if (id === 'addModal') {
        // Wiederholung zurücksetzen
        const reg = document.getElementById('regularity');
        if (reg) {
            reg.value = 'once';
            document.getElementById('regCustomFields').classList.add('hidden');
        }
        // Selbstverortung Zähler zurücksetzen
        const selfDescCount = document.getElementById('selfDescCount');
        if (selfDescCount) selfDescCount.textContent = '0/150';
        if (isAddingMode) toggleAddMode();
    }
}

function submitPin() {
    console.log("ey")
    let reg = document.getElementById('regularity').value;
        if (reg === 'custom') {
            const n    = parseInt(document.getElementById('regCustomN').value) || 1;
            const unit = document.getElementById('regCustomUnit').value;
            reg = `${n}${unit}`;  // z.B. "3months", "4weeks"
        }
    const tags    = [...document.querySelectorAll('.pin-tag:checked')].map(el => el.value);
    const l1url   = document.getElementById('link1_url').value.trim();
    console.log("l1url")
    const l1title = document.getElementById('link1_title').value.trim();
    console.log("link1_title")
    const l2url   = document.getElementById('link2_url').value.trim();
    console.log("l2url")
    const l2title = document.getElementById('link2_title').value.trim();
    console.log("l2title")
    const normalizeUrl = url => {
        if (!url) return url;
        if (/^https?:\/\//i.test(url)) return url;
        return 'https://' + url;
    };
    const links = [];
    if (l1url) links.push({ title: l1title, url: normalizeUrl(l1url) });
    if (l2url) links.push({ title: l2title, url: normalizeUrl(l2url) });
    console.log("links:" + links)
    const cat = document.getElementById('cat').value;
    const rawIcon = document.getElementById('pinIcon').value;
    const pinIcon = (cat === 'event' || cat === 'institution')
        ? (rawIcon !== '' ? rawIcon : '0')
        : (rawIcon !== '' ? rawIcon : '0');


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
        pinIcon,
        links
    };
        fetch('/api/suggest', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        })
        .then(r => r.json())
        .then(res => {
            showToast(res.message || 'Eintrag vorgeschlagen!', res.success !== false);
            document.getElementById('addModal').classList.add('hidden');
            if (isAddingMode) toggleAddMode();
        });
}

// =Listenanzeige

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
    const mode = currentSortMode;
    if (mode === 'proximity' && userLocation) {
        listData.forEach(p => p.distance = getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng));
        listData.sort((a, b) => a.distance - b.distance);
        renderSimpleGrid(container, listData, true);
    } else if (mode === 'date_asc') {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const in7  = new Date(today); in7.setDate(today.getDate() + 7);
    const in14 = new Date(today); in14.setDate(today.getDate() + 14);

    const toDate = s => s ? new Date(s.split('-').join('-')) : null;

    const soonToday    = listData.filter(p => { const d = toDate(p.date); return d && d <= tomorrow; });
    const soon7        = listData.filter(p => { const d = toDate(p.date); return d && d > tomorrow && d <= in7; });
    const soon14       = listData.filter(p => { const d = toDate(p.date); return d && d > in7 && d <= in14; });
    const later        = listData.filter(p => { const d = toDate(p.date); return !d || d > in14; });

        renderDateSection(container, 'Heute & Morgen',                  'fa-solid fa-sun',           soonToday, 'today');
        renderDateSection(container, 'Kommende 7 Tage',                 'fa-solid fa-calendar-week', soon7,     'week');
        renderDateSection(container, 'Innerhalb der nächsten 2 Wochen', 'fa-solid fa-calendar',      soon14,    'twoweeks');
        renderDateSection(container, 'Später',                          'fa-solid fa-clock',         later,     'later');

    } else {
        const groups = { event:[], person:[], institution:[] };
        listData.forEach(p => { if (groups[p.category]) groups[p.category].push(p); });
        renderSection(container, 'Veranstaltungen', groups.event,       'border-red-500',   'fa-solid fa-calendar-days', '#f87171', 'events');
        renderSection(container, 'Institutionen',   groups.institution, 'border-blue-500',  'fa-solid fa-building',      '#60a5fa', 'institutions');
        renderSection(container, 'Personen',        groups.person,      'border-green-500', 'fa-solid fa-user',          '#4ade80', 'persons');
    }
}

function renderSimpleGrid(container, items, showDist=false) {
    if (!items.length) { container.innerHTML = "<p class='text-center text-gray-500 mt-10'>Keine Einträge gefunden.</p>"; return; }
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 w-full';
    items.forEach((p, i) => {
        const card = createPinCard(p, showDist);
        card.style.animationDelay = `${i * 40}ms`;
        grid.appendChild(card);
    });
    container.appendChild(grid);
}
function renderSection(container, title, items, colorClass, faClass, iconColor, sectionId) {
    if (!items.length) return;
    const sec = document.createElement('div');
    sec.className = 'mb-6';
    const headerId = 'sec-' + sectionId;
    const gridId   = 'grid-' + sectionId;
    sec.innerHTML = `
        <button onclick="toggleSection('${gridId}', '${headerId}')"
            class="w-full text-left font-bold text-gray-500 uppercase text-xs mb-3 pl-2 border-l-4 ${colorClass} flex items-center gap-2 group">
            <i class="${faClass}" style="color:${iconColor}"></i>
            ${title}
            <span class="ml-auto text-gray-400 text-[10px] font-normal">${items.length} Einträge</span>
            <i id="${headerId}-arrow" class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-200 mr-1"></i>
        </button>
        <div id="${gridId}" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 w-full"></div>`;
    const grid = sec.querySelector('#' + gridId);
    items.forEach((p, i) => {
        const card = createPinCard(p);
        card.style.animationDelay = `${i * 40}ms`;
        grid.appendChild(card);
    });
    container.appendChild(sec);
}

function renderDateSection(container, title, icon, items, sectionId) {
    if (!items.length) return;
    const sec = document.createElement('div');
    sec.className = 'mb-6';
    const headerId = 'sec-' + sectionId;
    const gridId   = 'grid-' + sectionId;
    sec.innerHTML = `
        <button onclick="toggleSection('${gridId}', '${headerId}')"
            class="w-full text-left font-bold text-gray-500 uppercase text-xs mb-3 pl-2 border-l-4 border-blue-500 flex items-center gap-2">
            <i class="${icon} text-blue-100"></i>
            ${title}
            <span class="ml-auto text-gray-400 text-[10px] font-normal">${items.length} Einträge</span>
            <i id="${headerId}-arrow" class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-200 mr-1"></i>
        </button>
        <div id="${gridId}" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 w-full"></div>`;
    const grid = sec.querySelector('#' + gridId);
    items.forEach((p, i) => {
        const card = createPinCard(p);
        card.style.animationDelay = `${i * 40}ms`;
        grid.appendChild(card);
    });
    container.appendChild(sec);
}

function toggleSection(gridId, headerId) {
    const grid  = document.getElementById(gridId);
    const arrow = document.getElementById(headerId + '-arrow');
    const isHidden = grid.classList.toggle('hidden');
    arrow.style.transform = isHidden ? 'rotate(-90deg)' : '';
}

function createPinCard(p, showDist=false) {
    const div   = document.createElement('div');
    const color = DETAIL_COLOR[p.category] || '#6b7280';
    const fa    = CAT_FA[p.category]    || '';
    const grad  = CAT_GRADIENT[p.category] || 'linear-gradient(135deg,#1f2937 0%,#111827 100%)';
    div.className = 'pin-card rounded-xl overflow-hidden flex flex-col border border-white/10 cursor-pointer';
    div.style.background = grad;
    div.onclick = (e) => {
        if (!e.target.closest('button')) openDetails(p.id);
    };

    // Icon mit Fallback
    const iconHtml = (p.pinIcon !== null && p.pinIcon !== undefined && p.pinIcon !== '')
        ? `<img class="pinCardIcon" src="/static/pins/${p.category}/${p.pinIcon}.svg"
               style="object-fit:contain;filter:brightness(0) invert(1);flex-shrink:0"
               onerror="this.outerHTML='<i class=\'${fa}\' style=\'color:${color};font-size:13px;flex-shrink:0\'></i>'">`
        : `<i class="${fa}" style="color:${color};font-size:13px;flex-shrink:0"></i>`;

    let meta = '';
    if (p.category === 'event' && p.date)
        meta += `<div class="text-red-300 text-xs mb-1 font-semibold"><i class="fa-regular fa-calendar mr-1"></i>${formatDate(p.date)}${p.time ? ' · ' + p.time : ''}</div>`;
    if (showDist && p.distance)
        meta += `<div class="text-xs text-blue-300 mb-1"><i class="fa-solid fa-location-arrow mr-1"></i>${p.distance.toFixed(1)} km</div>`;

    const tagsHtml = (p.tags || []).slice(0, 3).map(t =>
        `<span style="font-size:10px;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.2)">${t}</span>`
    ).join('') + (p.tags && p.tags.length > 3
        ? `<span style="font-size:10px;color:rgba(255,255,255,0.4)">+${p.tags.length - 3}</span>` : '');

    div.innerHTML = `
        <div class="p-4 flex flex-col flex-grow">
            <div class="flex items-start gap-2 mb-2">
                ${iconHtml}
                <h4 class="leading-tight flex-grow pinCardTitle">${p.title}</h4>
            </div>
            ${meta}
            <p style="margin-top: 10px; margin-bottom: 10px;" class="text-white text-s mt-1 line-clamp-2 flex-grow leading-relaxed">${p.description || ''}</p>
            ${tagsHtml ? `<div class="flex flex-wrap gap-1 mt-2">${tagsHtml}</div>` : ''}
            <div class="mt-3 pt-3 border-t border-white/10 flex justify-between items-center gap-2">
                <span class="text-xs text-white/40 truncate">${p.address || ''}</span>
                <button onclick="openDetails('${p.id}')"
                    style="background:${color};flex-shrink:0"
                    class="text-white text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity">
                    Details
                </button>
            </div>
        </div>`;
    return div;
}

// Such- und Filterlogik für Listenansicht & Kartenansicht

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

function loadIconPicker(cat) {
    const grid    = document.getElementById('iconPickerGrid');
    const preview = document.getElementById('iconPickerPreview');
    const tray    = document.getElementById('iconPickerTray');

    grid.innerHTML = '<span class="text-xs text-gray-400">Lädt…</span>';
    document.getElementById('pinIcon').value = '';
    preview.src = `/static/pins/${cat}/0.svg`;
    preview.style.filter = 'brightness(0) invert(1)';

    fetch(`/api/pin_icons/${cat}`)
    .then(r => r.json())
    .then(urls => {
        grid.innerHTML = '';
        if (!urls.length) {
            grid.innerHTML = '<span class="text-xs text-gray-400">Keine Icons gefunden.</span>';
            return;
        }

        urls.forEach((url) => {
            // Dateiname ohne Extension = die Zahl
            const index = url.split('/').pop().replace('.svg', '');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.borderRadius = '20px';
            btn.className = `icon-pick-btn w-10 h-10 border-2 ${index === '0' ? '!border-blue-500' : 'border-transparent'} bg-gray-700 flex items-center justify-center hover:border-blue-400 transition-all`;            btn.innerHTML = `<img src="${url}" style="width:24px;height:24px;object-fit:contain;filter:brightness(0) invert(1)">`;
            btn.onclick = () => {
                document.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('!border-blue-500'));
                btn.classList.add('!border-blue-500');
                document.getElementById('pinIcon').value = index;  // nur die Zahl speichern
                preview.src = url;
                preview.style.filter = 'brightness(0) invert(1)';
                tray.classList.add('hidden');
            };
            grid.appendChild(btn);
        });
    });
}

document.getElementById('pinForm').addEventListener('click', function(e) {
    if (!e.target.closest('#iconPickerBlock')) {
        const tray = document.getElementById('iconPickerTray');
        if (tray) tray.classList.add('hidden');
    }
});

// Init

fetch('/api/pins').then(r => r.json()).then(pins => {
    allPins = pins;
    filteredPins = pins;
    updateMapMarkers();
});

setFormCat('event');
updateRadiusLabel();