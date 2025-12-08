// state management
        let allPins = [];
        let filteredPins = [];
        let markers = []; 
        let userLocation = null;
        let activeFilters = {
            types: new Set(['person', 'institution', 'event']),
            radius: 1001,
            dateFrom: null,
            dateTo: null
        };
        let isAddingMode = false;
        let tempMarker = null;
        let currentView = 'map';

        // icons
        const icons = {
            event: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
            person: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
            institution: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
            temp: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] })
        };

        const map = L.map('map', {zoomControl: false}).setView([51.1657, 10.4515], 6);
        L.control.zoom({position: 'bottomleft'}).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);

        // benutzerstandort
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                L.circleMarker([userLocation.lat, userLocation.lng], {radius: 8, color: 'white', fillColor: '#3b82f6', fillOpacity: 1}).addTo(map);
                updateRadiusLabel(); // umkreis slider update
                applyFilters(); 
            }, (err) => {
                console.log("Kein GPS");
                document.getElementById('gpsStatus').innerText = "GPS nicht verfügbar. Umkreis deaktiviert. :()";
                document.getElementById('radiusRange').disabled = true;
            });
        }

        // wechslersteuerungselement karte liste
        function switchView(mode) {
            currentView = mode;
            document.getElementById('mapView').classList.toggle('hidden', mode !== 'map');
            document.getElementById('listView').classList.toggle('hidden', mode !== 'list');
            
            const btnMap = document.getElementById('btnMap');
            const btnList = document.getElementById('btnList');
            const activeClass = "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300";
            const inactiveClass = "text-gray-600 dark:text-gray-400 hover:text-gray-900";
            
            if(mode === 'map') {
                btnMap.className = "px-4 py-1.5 rounded-full transition-all duration-200 " + activeClass;
                btnList.className = "px-4 py-1.5 rounded-full transition-all duration-200 " + inactiveClass;
                document.getElementById('sortOptionsPanel').classList.add('hidden');
            } else {
                btnList.className = "px-4 py-1.5 rounded-full transition-all duration-200 " + activeClass;
                btnMap.className = "px-4 py-1.5 rounded-full transition-all duration-200 " + inactiveClass;
                document.getElementById('sortOptionsPanel').classList.remove('hidden');
                renderList();
            }
        }

        function toggleSearch() {
            document.getElementById('searchBar').classList.toggle('hidden');
            document.getElementById('filterPanel').classList.add('hidden');
            if(!document.getElementById('searchBar').classList.contains('hidden')) {
                document.getElementById('addrInput').focus();
            }
        }
        function toggleFilters() {
            const filterBtn = document.getElementById('filterBtn');
            if (filterBtn.disabled) return; // wenn disabled, nicht öffnen
            
            document.getElementById('filterPanel').classList.toggle('hidden');
            document.getElementById('searchBar').classList.add('hidden');
        }

        // filterlogik
        function toggleFilterType(type) {
            const btn = {
                'person': document.getElementById('filPerson'),
                'institution': document.getElementById('filInst'),
                'event': document.getElementById('filEvent')
            }[type];
            
            if(activeFilters.types.has(type)) {
                activeFilters.types.delete(type);
                btn.classList.remove('bg-' + (type==='event'?'red':type==='person'?'green':'blue') + '-500', 'text-white');
                btn.classList.add('bg-transparent', 'text-gray-500', 'border-gray-300');
            } else {
                activeFilters.types.add(type);
                btn.classList.remove('bg-transparent', 'text-gray-500', 'border-gray-300');
                btn.classList.add('bg-' + (type==='event'?'red':type==='person'?'green':'blue') + '-500', 'text-white');
            }
            applyFilters();
        }

        function updateRadiusLabel() {
            const range = document.getElementById('radiusRange');
            const val = range.value;
            const label = document.getElementById('radiusVal');
            const max = range.max;
            
            if(val == max) label.innerText = "Alle";
            else label.innerText = val + " km";
            
            const min = range.min ? range.min : 0;
            const percentage = ((val - min) * 100) / (max - min);
            range.style.background = `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #4b5563 ${percentage}%, #4b5563 100%)`;

            activeFilters.radius = (val == max) ? 1200 : parseInt(val);
            if(userLocation) document.getElementById('gpsStatus').innerText = "GPS aktiv.";
        }

        function applyFilters() {
            activeFilters.dateFrom = document.getElementById('dateFrom').value;
            activeFilters.dateTo = document.getElementById('dateTo').value;
            
            filteredPins = allPins.filter(p => {
                if (!activeFilters.types.has(p.category)) return false;
                if (activeFilters.radius <= 10000 && userLocation) { // 10000 = alle
                    const dist = getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng);
                    p.distance = dist;
                    if (dist > activeFilters.radius) return false;
                }
                if (p.category === 'event') {
                    if (activeFilters.dateFrom && p.date && p.date < activeFilters.dateFrom) return false;
                    if (activeFilters.dateTo && p.date && p.date > activeFilters.dateTo) return false;
                }
                return true;
            });

            updateMapMarkers();
            if(currentView === 'list') renderList();
            
            const isDefault = activeFilters.types.size === 3 && activeFilters.radius > 10000 && !activeFilters.dateFrom;
            document.getElementById('activeFilterDot').classList.toggle('hidden', isDefault);
        }

        // karte marker aktualisieren
        function updateMapMarkers() {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            filteredPins.forEach(p => {
                const m = L.marker([p.lat, p.lng], {icon: icons[p.category] || icons.temp}).addTo(map);
                let html = `<div class="text-center min-w-[150px]"><h3 style="color: white;" class="font-bold text-base dark:text-gray-900">${p.title}</h3><span class="text-[10px] uppercase tracking-wider text-gray-500">${p.category}</span>`;
                if (p.category === 'event') {
                     let timeStr = p.date || "";
                     if(p.time) timeStr += ` ${p.time}`;
                     html += `<p class="text-sm font-bold text-red-600 mt-1">${timeStr}</p>`;
                }
                html += `<button onclick="openContact('${p.id}')" class="mt-2 w-full bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700">Kontakt</button></div>`;
                m.bindPopup(html);
                markers.push(m);
            });
        }

        // hinzufügen logik
        function toggleAddMode() {
            isAddingMode = !isAddingMode;
            const fab = document.getElementById('fabAdd');
            const banner = document.getElementById('addModeBanner');
            const mapContainer = document.getElementById('map');
            const searchBar = document.getElementById('searchBar');
            const filterBtn = document.getElementById('filterBtn');
            const filterPanel = document.getElementById('filterPanel');

            if (isAddingMode) {
                switchView('map');
                fab.classList.replace('bg-blue-600', 'bg-red-500');
                fab.innerHTML = '<i class="fa-solid fa-times text-2xl"></i>';
                banner.classList.remove('hidden');
                mapContainer.classList.add('cursor-crosshair');
                
                // filter sperren
                filterPanel.classList.add('hidden'); 
                filterBtn.disabled = true; 
                
                // zeige suchleiste automatisch
                searchBar.classList.remove('hidden');
                document.getElementById('addrInput').focus();

            } else {
                fab.classList.replace('bg-red-500', 'bg-blue-600');
                fab.innerHTML = '<i class="fa-solid fa-plus text-2xl"></i>';
                banner.classList.add('hidden');
                mapContainer.classList.remove('cursor-crosshair');
                
                // filter entsperren
                filterBtn.disabled = false;

                searchBar.classList.add('hidden'); 
                if(tempMarker) map.removeLayer(tempMarker);
            }
        }
        
        // karte klicken zum pin setzen
        map.on('click', async function(e) {
            if (!isAddingMode) return;
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            if(tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker([lat, lng], {icon: icons.temp}).addTo(map);
            document.getElementById('lat').value = lat;
            document.getElementById('lng').value = lng;
            
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                const data = await res.json();
                document.getElementById('addressDisplay').value = data.display_name || "Adresse gewählt";
            } catch(e) { document.getElementById('addressDisplay').value = lat.toFixed(4) + ", " + lng.toFixed(4); }
            document.getElementById('addModal').classList.remove('hidden');
        });

        function setFormCat(cat) {
            document.getElementById('cat').value = cat;
            updateFormFields();
            
            // alles resetten
            ['Person','Inst','Event'].forEach(c => {
                const btn = document.getElementById('btnCat'+c);
                btn.className = "cat-btn flex-1 px-4 py-2 text-sm font-medium border dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900";

                if(c==='Person') btn.classList.add('rounded-l-lg', 'border-r-0');
                if(c==='Inst') btn.classList.add('border-l-0', 'border-r-0');
                if(c==='Event') btn.classList.add('rounded-r-lg', 'border-l-0');
            });

            // aktiven button stylen
            const activeBtn = document.getElementById('btnCat' + (cat==='person'?'Person':cat==='institution'?'Inst':'Event'));
            activeBtn.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white');
            
            if(cat === 'person') activeBtn.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600', 'border-green-600');
            if(cat === 'institution') activeBtn.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600', 'border-blue-600');
            if(cat === 'event') activeBtn.classList.add('bg-red-500', 'text-white', 'hover:bg-red-600', 'border-red-600');
        }

        // liste rendern, default gruppiert nach typ
        function getDistance(lat1, lon1, lat2, lon2) {
            if(!lat1 || !lat2) return 0;
            const R = 6371; 
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        function renderList() {
            const container = document.getElementById('listContainer');
            container.innerHTML = "";
            const mode = document.getElementById('sortMode').value;
            let listData = [...filteredPins];

            if (mode === 'proximity' && userLocation) {
                listData.forEach(p => p.distance = getDistance(userLocation.lat, userLocation.lng, p.lat, p.lng));
                listData.sort((a,b) => a.distance - b.distance);
                renderSimpleGrid(container, listData, true);
            } else if (mode === 'date_asc') {
                listData.sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999'));
                renderSimpleGrid(container, listData);
            } else {
                const groups = { 'event': [], 'person': [], 'institution': [] };
                listData.forEach(p => { if(groups[p.category]) groups[p.category].push(p); });
                renderSection(container, "📅 Veranstaltungen", groups.event, "border-red-500");
                renderSection(container, "👤 Personen", groups.person, "border-green-500");
                renderSection(container, "🏢 Institutionen", groups.institution, "border-blue-500");
            }
        }

        function renderSimpleGrid(container, items, showDist=false) {
             if(items.length===0) { container.innerHTML = "<p class='text-center text-gray-500 mt-10'>Keine Einträge gefunden.</p>"; return; }
             const grid = document.createElement('div');
             grid.className = "grid grid-cols-1 md:grid-cols-2 gap-4";
             items.forEach(p => grid.appendChild(createPinCard(p, showDist)));
             container.appendChild(grid);
        }

        function renderSection(container, title, items, colorClass) {
            if(items.length === 0) return;
            const sec = document.createElement('div');
            sec.innerHTML = `<h3 class="font-bold text-gray-500 uppercase text-xs mb-3 pl-2 border-l-4 ${colorClass}">${title}</h3>`;
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-1 md:grid-cols-2 gap-4 mb-6";
            items.forEach(p => grid.appendChild(createPinCard(p)));
            sec.appendChild(grid);
            container.appendChild(sec);
        }

        function createPinCard(p, showDist=false) {
            const div = document.createElement('div');
            div.className = "bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col";
            let meta = "";
            if(p.category === 'event') meta = `<div class="text-red-500 font-bold text-sm mb-1"><i class="fa-regular fa-calendar mr-1"></i>${p.date||'?'} ${p.time||''}</div>`;
            if(showDist && p.distance) meta += `<div class="text-xs text-blue-500 mb-1"><i class="fa-solid fa-location-arrow mr-1"></i>${p.distance.toFixed(1)} km</div>`;
            div.innerHTML = `<div class="flex justify-between items-start"><h4 class="font-bold text-lg dark:text-white leading-tight">${p.title}</h4><span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-300 uppercase">${p.category}</span></div>${meta}<p class="text-gray-600 dark:text-gray-400 text-sm mt-2 line-clamp-2 flex-grow">${p.description}</p><div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center"><span class="text-xs text-gray-400 truncate max-w-[60%]">${p.address || ''}</span><button onclick="openContact('${p.id}')" class="text-blue-600 text-sm font-bold hover:underline">Kontakt</button></div>`;
            return div;
        }

        function updateFormFields() { document.getElementById('eventFields').classList.toggle('hidden', document.getElementById('cat').value !== 'event'); }
        function checkCustomReg() { document.getElementById('regCustom').classList.toggle('hidden', document.getElementById('regularity').value !== 'custom'); }
        function closeModal(id) { document.getElementById(id).classList.add('hidden'); if(id==='addModal'){ toggleAddMode(); } }
        
        function submitPin() {
            const reg = document.getElementById('regularity').value;
            const data = {
                category: document.getElementById('cat').value,
                title: document.getElementById('title').value,
                description: document.getElementById('desc').value,
                email: document.getElementById('email').value,
                lat: parseFloat(document.getElementById('lat').value),
                lng: parseFloat(document.getElementById('lng').value),
                address: document.getElementById('addressDisplay').value,
                date: document.getElementById('date').value || null,
                time: document.getElementById('time').value || null,
                regularity: document.getElementById('cat').value === 'event' ? (reg === 'custom' ? document.getElementById('regCustom').value : reg) : null
            };
            // sende an server
            fetch('/api/suggest', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})
            .then(r => r.json()).then(res => {
                alert(res.message);
                document.getElementById('addModal').classList.add('hidden');
                toggleAddMode();
            });
        }

        fetch('/api/pins').then(r => r.json()).then(pins => {
            allPins = pins;
            filteredPins = pins; 
            updateMapMarkers();
        });

        let searchTimeout = null;
        document.getElementById('addrInput').addEventListener('input', function(e) {
             clearTimeout(searchTimeout);
            const query = e.target.value;
            const resultsDiv = document.getElementById('addrResults');
            if (query.length < 3) { resultsDiv.classList.add('hidden'); return; }
            searchTimeout = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=de&q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => {
                        resultsDiv.innerHTML = '';
                        if (data.length > 0) {
                            resultsDiv.classList.remove('hidden');
                            data.forEach(item => {
                                const div = document.createElement('div');
                                div.className = "px-3 py-2 hover:bg-blue-100 dark:hover:bg-gray-600 cursor-pointer text-sm border-b dark:border-gray-600 last:border-0 text-gray-800 dark:text-gray-200";
                                div.textContent = item.display_name;
                                div.onclick = () => selectAddress(item);
                                resultsDiv.appendChild(div);
                            });
                        } else { resultsDiv.classList.add('hidden'); }
                    });
            }, 300);
        });
        
        // adresse auswählen
        function selectAddress(item) {
             const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            map.setView([lat, lng], 16);
            document.getElementById('addrResults').classList.add('hidden');
            if(isAddingMode) {
                 document.getElementById('addressDisplay').value = item.display_name;
                 if(tempMarker) map.removeLayer(tempMarker);
                 tempMarker = L.marker([lat, lng], {icon: icons.temp}).addTo(map);
                 document.getElementById('lat').value = lat;
                 document.getElementById('lng').value = lng;
                 document.getElementById('addModal').classList.remove('hidden');
            }
        }

        window.openContact = function(id) { document.getElementById('contactPinId').value = id; document.getElementById('contactModal').classList.remove('hidden'); }
        window.sendContact = function() {
            const data = {
                pin_id: document.getElementById('contactPinId').value,
                sender_mail: document.getElementById('contactSender').value,
                message: document.getElementById('contactMsg').value
            };
            fetch('/api/contact', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})
            .then(r=>r.json()).then(d=>{ alert(d.message); document.getElementById('contactModal').classList.add('hidden'); });
        }
        setFormCat('person');
        
        updateRadiusLabel();