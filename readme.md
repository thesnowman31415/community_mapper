# Atlas - Beta 1.0

Dies ist das GitHub-Repository für das Atlas-Tool vom Community Music Netzwerk Deutschland. Mit diesem Tool ist es möglich, Personen, Institutionen und Ereginisse rund um Community Music zu finden oder für andere sichtbar zu machen. 


Hier eine vollständige Übersicht über den Funktionsumfang:


## 1. KARTENANSICHT (Leaflet / OpenStreetMap)
 
### Karte & Rendering
- Leaflet-Karte mit OpenStreetMap-Kartenkacheln, initial zentriert auf Deutschland (51.16°N / 10.45°E, Zoom 6)
- Kategorieabhängige Pin-Farben: Veranstaltung (rot), Institution (blau), Person (grün)
- Alle Karten-Pins werden als kombinierte PNG-Silhouette + SVG-Icon gerendert, um für jeden Pin ein eigenes Icon darstellen zu können, ohne zu viel Rechenleistung zu verbrauchen. 
- Pin-Eintrittsanimation mit Bounce-Effekt und zufälligem Delay für jeden Pin beim Laden
- Cluster-Pins mit Zähleranzeige
- Cluster-Radius dynamisch nach Zoom und Geografie (5 km Luftlinie als Basis, Min. 40 px / Max. 100 px)
- Spiderfy bei MaxZoom (Zoom >= 16): Überlappende Pins werden aufgefächert, sodass man sie auch alle einzeln anklicken kann. 

### Popups auf der Karte
- Klick auf Pin öffnet kleines Popup: Kategorie-Icon, Titel, Datum/Uhrzeit (bei Events), Kurzbeschreibung (max. 90 Zeichen mit automatischer Ellipse)
- Popup enthält „Details"-Button und „x"-Schließ-Button
- Kategorieabhängige Popup-Hintergrundgradienten (Person: dunkelgrün, Institution: dunkelblau, Veranstaltung: dunkelrot)


### Legende
- Faltbare Legende oben links auf der Karte mit moderner Glasmorphism-Optik
- Zeigt Icon-Beispiele für alle drei Kategorien und Cluster-Pin

### Standortermittlung
- Automatischer GPS-Request beim Seitenaufruf
- Eigener Standort wird auf der Karte markiert
- Bei GPS-Fehler oder fehlender Freigabe: Umkreis-Slider deaktiviert, Fehlermeldung, Liste-Sortierung automatisch auf „Kategorie" umgestellt

---

## 2. SUCHE (Adress-/Geocoding)
 
- Suchleiste per Button togglebar ein-/ausklappbar
- Im Kartenmodus: Nominatim (OSM) Geocoding mit `countrycodes=de`-Einschränkung (damit natürlich nur in Deutschland gesucht wird)
- Debounced: Anfrage nach 300 ms Pause, erst ab 3 Zeichen, um Rechenleistung zu sparen und die User-Experience zu optimieren
- Ergebnisliste als Dropdown unterhalb des Feldes
- „Straße Nr, PLZ Ort"-Format
- Klick auf Ergebnis: Karte springt auf Position (Zoom 16); bei aktivem Hinzufüge-Modus wird sofort ein Pin gesetzt und Adresse ins Formular übernommen
---
 
## 3. LISTENANSICHT
 
### Layout & Anzeige
- Umschaltbar zwischen Karten- und Listenansicht per modernem Pill-Switcher in der Navbar
- Responsive Raster für unterschiedliche Bildschirmgrößen: 1 Spalte (mobil) -> 2 Spalten (sm) -> 3 Spalten (xl) -> 4 Spalten (2xl)
- Kartendesign: kategorieabhängiger Verlaufshintergrund, abgerundete Ecken
- Karten zeigen Icon, Titel, Datum/Zeit (bei Events), Entfernung (wenn GPS verfügbar), Beschreibung (2-zeilig abgeschnitten), bis zu 3 Tags + „+N"-Overflow-Anzeige, Adresse, Details-Button

### Sektionen & Sortierung
- **Sortierung nach Nähe:** Einträge in Distanzgruppen: ≤5 km / 5–20 km / 20–50 km / 50–100 km / 100–500 km / >500 km; jede Sektion mit Anzahl-Badge
- Jede Sektion ist auf/zuklappbar
- **Sortierung nach Datum:** Nur Events; Sektionen: Heute / Morgen / Kommende 7 Tage / Dieser Monat / Nächster Monat / Dieses Jahr / Nächstes Jahr oder später
- Jede Sektion ist auf/zuklappbar
- **Sortierung nach Kategorie:** Drei Gruppen: Veranstaltungen / Institutionen / Personen
- Jede Sektion ist auf/zuklappbar
- Sortier-Pill-Indicator animiert sich beim Wechsel der Sortier-Schaltfläche
- Fallback: Wenn GPS noch lädt und Sortierung auf „Nähe" steht, wird Ladeanimation + Hinweistext angezeigt mit Button „Jetzt nach Kategorie anzeigen"
### Suche in der Listenansicht
- Kontextabhängige Suche: Im Listenmodus sucht das Suchfeld nach Freitext (nicht nach Adressen wie bei Karte)
- Eine Funktion berechnet Relevanz: Treffer in Titel, Beschreibung, Tags, Adresse; Titel-Treffer gewichtet höher
- Komma-separierte Mehrfachsuche: `"Drum, München"` filtert nach Einträgen die beides enthalten
- Ergebnisanzahl wird angezeigt: „N Ergebnis(se)"
- Bei keinen Treffern: Meldung „Keine Treffer für ‚…'"
- Beim Suchen wird die Filteransicht automatisch ausgeblendet, kann aber bei Bedarf wieder aufgeklappt werden
---
 
## 4. FILTER-SYSTEM
 
- Wenn mindestens ein Filter aktiv ist, erscheint ein blauer Punkt am Filtericon

### Kategorie-Filter
- Drei Toggle-Buttons: Veranstaltung (rot), Institution (blau), Person (grün)

### Umkreis-Filter
- Range-Slider
- Label zeigt aktuellen Wert in km oder „Alle" bei max. Wert
- Nur aktiv wenn GPS verfügbar; sonst deaktiviert mit Hinweistext
- Beim Filtern wird für jeden Pin die Haversine-Distanz berechnet
- Handle-Icon ändertg sich basierend auf Distanz und wechselt zwischen Fußstapfen, Fahrrad, Bahn und Häkchen

### Datums-Filter (Events)
- Von/Bis-Datumsfelder, filtern ausschließlich Veranstaltungen

### Schlagwort-Filter
- Aufklappbares Panel mit Checkboxes für alle in der Datenbank vorhandenen Tags
- Aktive Tags-Anzahl wird als Badge im Schaltflächen-Header angezeigt
- Pin wird angezeigt wenn er MINDESTENS einen der aktiven Tags hat
### Reset
- „Filter zurücksetzen"-Button setzt alle Kategorien, Radius, Datum und Tags gleichzeitig zurück
---
 

 
## 5. PIN HINZUFÜGEN (Vorschlagen)
 
### Platzierungsmodus
- Floating-Action-Button rechts unten in Form eines runden, grünen Plus
- Umschalten: Button wird rot mit x-Icon, Banner erscheint mit Animation, Cursor wechselt auf `crosshair`, Filter-Button deaktiviert, Suchleiste öffnet sich automatisch - alles um User-Experience so angenehm wie möglich zu gestalten und Screen-Clutter zu reduzieren
### Pin-Platzierung
- Klick auf Karte: temporärer grauer Pin wird gesetzt, Koordinaten in versteckten Felder gespeichert
- Gleichzeitig: Reverse-Geocoding via Nominatim für die geklickte Koordinate, Adresse wird automatisch ins Formular eingetragen und angezeigt, ist aber nicht bearbeitbar, da die Pin-Position inhärent an die Kopordinaten gekoppelt ist.
- Fallback bei Reverse-Geocoding-Fehler oder fehlender Adresse: Koordinaten in Dezimalgrad
- Alternativ: Adresse in Suchleiste suchen, Klick auf Ergebnis platziert Pin an gecodeter Adresse und überträgt sie ins Formular
### Formular-Modal
- Außenklick oder x schließt das Modal
- Kategorie-Wahl: animierter, moderner Pill-Switcher (Veranstaltung - Institution - Person)
- Formular-Hintergrundfarbe ändert sich kategorieabhängig
- Submit-Button-Farbe ändert sich kategorieabhängig
### Formularfelder
- **Adresse:** Readonly, befüllt durch Karteklick/Suche (Pflichtfeld, automatisch)
- **Kategorie:** Pill-Switcher zwischen den drei bekannten Kategorien (Pflichtfeld, automatisch aber frei wählbar)
- **Icon-Picker:** Nur bei Event + Institution sichtbar; lädt Icons via `/api/pin_icons/{kategorie}`; Preview-Thumbnail + ausklappbares 6-spaltige Grid; Klick wählt Icon, tray schließt (Pflichtfeld, automatisch aber frei wählbar)
- **Titel:** Text, max. 80 Zeichen, Placeholder ändert sich kategorieabhängig (Pflichtfeld)
- **Event-Felder (nur bei Veranstaltung sichtbar):** Datum, Uhrzeit, Wiederholung (Dropdown für Einmalig, Täglich, Wöchentlich, Zweiwöchentlich, Monatlich, Andere)
- **Benutzerdefinierte Wiederholung:** Erscheint bei „Andere": Zahleneingabe + Einheitenauswahl (Tage / Wochen / Monate / Jahre), z.B. „3 Monate"
- **Beschreibung:** Textarea, max. 800 Zeichen, Auto-Resize, Placeholder kategorieabhängig (optionales Feld)
- **Links:** 2 Link-Paare (Bezeichnung + URL); automatisches `https://`-Präfix wenn fehlt; URL-Validierung mit Regex-Pattern, Toast-Fehlermeldung bei ungültiger URL (optionales Feld)
- **Schlagwörter:** Checkboxes, dynamisch aus API geladen (optionales Feld)
- **Selbstverortung:** Textarea, max. 150 Zeichen, Zeichenzähler „N/150" (Pflichtfeld)
- **Kontakt-E-Mail:** E-Mail-Eingabe, privat (nur bei Kontaktaufnahme angezeigt, direkt in User-Mailprogramm geöffnet), mit erklärendem Hinweistext (Pflichtfeld)
- **Datenschutz-Checkbox:** Pflichtfeld, Link zu /datenschutz, öffnet in neuem Tab (Pflichtfeld)
- Modal-Schließen setzt Wiederholungsfeld zurück, nicht aber die anderen Felder, falls das Formular aus Versehen geschlossen oder der Pin neuplatziert werden musste
### Validierung & Submission
- HTML5-Pflichtfelder, sodass ein Absenden nur bei Ausfüllen möglich ist (`required`)
- JS URL-Validierung vor Submit
- Antwort-Toast: grün bei Erfolg, rot bei Fehler
- Modal schließt sich nach erfolgreichem Submit, Platzierungsmodus deaktiviert sich
### Verifikationsmechanismus
- Wenn Kategorie „Person" + Link zu einer Communitymusicnetzwerk-Profilseite, wird dieser User mit einem Badge verifiziert und angezeigt
- Verifizierungs-Badge zusätzlich im Detail-Modal sichtbar (grüner Schriftzug „Verifiziertes Mitglied")
---
 
## 6. DETAIL-MODAL
 
- Öffnet sich über Karten-Pin-Popup oder Listen-Detail-Button
- Außenklick oder x schließt das Modal
- Kategorieabhängiger Verlaufshintergrund
- **Header:** Icon, Titel, Verifizierungs-Badge (nur für verifizierte Personen)
- **Tags:** Als runde Chips dargestellt
- **Beschreibung:** Volltext
- **Event-Block:** Datum mit Wochentag (heute/morgen-Labels falls Bedingung erfüllt), Uhrzeit, Wiederholungsangabe
- **Nächste Termine:** Bei wiederkehrenden Events: Liste der nächsten 5 Termine (erster Termin fett/rot hervorgehoben)
- **Links:** Als Button-Chips, URL abgekürzt auf 22 Zeichen
- **Adresse:** Klickbar -> kopiert in Zwischenablage, Toast-Bestätigung
- **Entfernung:** Wird eingeblendet wenn GPS verfügbar; Haversine-Berechnung in km mit 1 Dezimalstelle
- **Mini-Karte:** Eigene Leaflet-Instanz, Pin wird auf Zoom 15 gesetzt, keine anderen Pins sichtbar
- **Kontakt-Button:** Lädt E-Mail-Adresse von `/api/contact_info/{id}`; Bei Klick: Spinner-Anzeige, nach Erfolg öffnet `mailto:`-Link mit vorbefülltem Betreff (`cmn Atlas | {Titel}`); Button nach 5 s wieder freigegeben um Spam zu verhindern, Rate-Limiting mit Flask um großflächigen Datenklau zu vermeiden
---
 
## 7. TOAST-NACHRICHTEN
 
- Dynamisch erzeugtes Pillenelement mittig unten fixiert
- Grün (Erfolg) mit ✓-Icon, rot (Fehler) mit x-Icon
- Einblend-Animation, automatisches Ausblenden nach 3 Sekunden
- Kann jede Form von Nutzerinformationsnachricht zeigen, aktuell für Fehlermeldungen und erfolgreiches Abschicken oder Kopieren genutzt
---
 
## 8. EVENT-DATUMS-LOGIK (Backend + Frontend)
 
### next_occurrence (Python, Backend)
- Berechnet das nächste Auftreten eines wiederkehrenden Events ab heute
- Unterstützte Wiederholungsintervalle: `daily`, `weekly`, `biweekly`, `monthly`, sowie beliebiges `N{days/weeks/months/years}`-Format
- Kontextsensible Monatslängen-Behandlung (z.B. 31. -> letzter Tag des Zielmonats, um monatliche Intervalle korrekt zu berechnen und bei Schaltjahren nicht durcheinanderzukommen)
- Berücksichtigt Uhrzeit: Heutiger Termin gilt als vergangen wenn Uhrzeit überschritten
- Einmalige Events (`once`) werden unverändert zurückgegeben und nicht mehr angezeigt, sollten sie in der Vergangenheit liegen. Sie bleiben in der Datenbank erhalten.
### nextNOccurrences (JavaScript, Frontend)
- Berechnet die nächsten N (Standard: 5) Auftreten ab heute für die Detailansicht
- Gleiche Intervall-Logik wie Backend
### formatDateWithWeekday (Frontend)
- Datumsformatierung mit „Heute, DD.MM.YYYY" / „Morgen, DD.MM.YYYY" / „Mo, DD.MM.YYYY"-Labels
---
 
## 9. BACKEND / API (Flask, Python)
 
### Öffentliche Routes
- `GET /` -> `index.html`
- `GET /hilfe` -> `hilfe.html`
- `GET /datenschutz` -> `datenschutz.html`
- `GET /api/pins` -> Alle freigegebenen Pins mit Tags und Links (SQLite JOIN, expired events gefiltert); next_occurrence wird server-seitig für Events berechnet
- `POST /api/suggest` -> Neuen Pin-Vorschlag anlegen (Rate-Limit: 20/min); Personen-Verifikation wird dabei geprüft und bei erfüllten Bedinungen erteilt
- `GET /api/getTags` -> Alle vorhandenen, einzigartigen Schlagwörter
- `GET /api/contact_info/{pin_id}` -> E-Mail-Adresse eines Pins (Rate-Limit: 5/min)
- `GET /api/pin_icons/{category}` -> Liste der verfügbaren SVG-Icon-URLs je Kategorie (aus Filesystem)

### Admin Routes (Session-geschützt)
- `GET /admin` -> Dashboard (Login-Form oder Verwaltungsansicht je nach Session)
- `POST /admin/login` -> Login mit Argon2-Passwort-Verifikation
- `POST /logout` -> Session löschen
- `POST /admin/register` -> Neuen Admin anlegen (nur für eingeloggte Admins)
- `GET /admin/export_csv` -> CSV-Export aller Pins
- `POST /admin/delete_user` -> Admin-Account löschen
- `POST /admin/approve/{pin_id}` -> Pin freigeben (schreibt approvedBy + approvedAt)
- `POST /admin/reject/{pin_id}` -> Ausstehenden Vorschlag ablehnen/löschen
- `POST /admin/delete_approved/{pin_id}` -> Freigegebenen Pin löschen
- `POST /admin/update` -> Pin-Daten bearbeiten
### Jinja2-Template-Filter
- `format_datetime`: Datum/Uhrzeit in deutsches Format (z.B. „12. März 2025 um 14:30 Uhr")
---
 
## 10. DATENBANK (SQLite, database.py)
 
### Schema
- **pins:** title, approved (0/1), category, date, time, regularity, description, selfDescription, address, lng, lat, email, pinIcon, proposalTime, approvedBy, approvedAt, id (UUID PK), verified
- **tags:** value (PK)
- **links:** id (UUID PK), title, url
- **admins:** username (PK), password (Argon2-Hash)
- **pinHasTag:** pinId, tagName (Komposit-PK, FK)
- **pinHasLink:** pinId, linkId (Komposit-PK, FK)
### Datenbankfunktionen
- `create_table()`: Erstellt alle Tabellen bei Initialisierung mit Log-Hineis
- `get_pins(today)`: SQL mit subqueries für JSON-aggregierte Tags und Links, filtert überfällige einmalige Events
- `suggest_pin(p)`: Fügt neuen Vorschlag ein, verknüpft Links (dedupliziert per URL+Titel) und Tags
- `load_admin_pins(approved)`: Lädt pending (sortiert nach proposalTime ASC) oder approved (sortiert nach approvedAt DESC) Pins
- `get_contact_info(pin_id)`: Gibt E-Mail-Adresse zurück
- `get_tags()`: Alle distinct Tags
- `get_all_pins_for_export()`: Alle Pins unabhängig von approved-Status
- `approve(pinID, approved_by)`: Setzt approved=1, schreibt approvedBy + ISO-Zeitstempel
- `delete(pinID)`: Löscht Pin 
- `update(pin)`: Aktualisiert Metadaten, löscht und re-inseriert Links und Tags
- `get_password_hash(user_name)`: Passwort-Hash für Login
- `register(user_name, password)`: Neuen Admin anlegen
- `get_admins()`: Liste aller Admin-Benutzernamen
- `delete_admin(user_name)`: Admin löschen
---
 
## 11. SICHERHEIT
 
- **Argon2-Passwort-Hashing:** `argon2-cffi` (`PasswordHasher`), aktueller Standard
- **Session-Sicherheit:** `SESSION_COOKIE_SECURE=True`, `SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE='Lax'`
- **SECRET_KEY:** Muss als Umgebungsvariable gesetzt sein, fehlt gibt RuntimeError beim Start (kein Fallback) :(
- **ProxyFix:** `x_for=1` für korrekte IP-Erkennung hinter Reverse-Proxy, für rate-Limitng relevant
- **Rate Limiting (flask-limiter):** Global 200/Tag + 50/Stunde; `/api/suggest` zusätzlich 20/min; `/api/contact_info` 5/min; Speicher: in-memory
- **XSS-Schutz:** `escapeHTML()` in JavaScript sichert alle user-generierten Werte vor dem Einsetzen in Popup-HTML
- **Admin-Routen-Schutz:** Alle Admin-POST/GET-Routes prüfen `'user' in session` -> Redirect bei fehlender Session
- **SQL-Injection-Schutz:** Alle Datenbankabfragen nutzen parametrisierte Queries (`?`-Platzhalter)
- **Datenschutz:** Kein User-Tracking, keine dauerhaften Cookies, Standortdaten nur client-seitig, E-Mail nicht direkt angezeigt sondern per API-Request nachgeladen, inklusive Rate-Limit
---
 
## 12. ADMIN-DASHBOARD
 
### Login
- Formular mit Nutzername und Passwort
- Fehlermeldung bei falschen Logindaten
### Ausstehende Pin-Vorschläge
- Tabellarische Ansicht: Titel, Kategorie (farbiges Badge), Adresse, „Prüfen"-Button
- Anzahl-Badge im Tabellen-Header
- Leerer Zustand: „Alles erledigt"-Meldung mit Checkmark
### Prüf-Modal (Vorschläge)
- Öffnet sich bei Klick auf „Prüfen"
- Header mit kategorieabhängiger Hintergrundfarbe, Icon, Titel, Kategorielabel
- Zeigt alle Felder des Vorschlags: Tags, Beschreibung, Selbstverortung, Event-Daten, Links, E-Mail
- Mini-Leaflet-Karte mit Pin-Position (lazy init)
- Genehmigen-Button (POST `/admin/approve/{id}`), Ablehnen-Button (POST `/admin/reject/{id}`)
- Außenklick und x schließt Modal
### Freigegebene Datenbank
- Kategorie-Tabs: Veranstaltungen - Institutionen - Personen (mit jeweiliger Anzahl in Klammern)
- Suchfeld: Echtzeit-Textsuche über Titel, Beschreibung, Schlagwörter, Adresse; Ergebniszähler
- Karten zeigen: Titel, Adresse, Datum/Uhrzeit (bei Events), Freigabedatum, Tag-Anzahl, Beschreibungsvorschau (3-zeilig), Edit- + Löschen-Button
- Klick öffnet Detail-Ansicht
### Detail-Modal (Datenbank)
- Vollständige Pin-Daten; Leaflet-Mini-Karte
- Nicht editierbar (read-only, Bearbeitung über Edit-Modal)
### Edit-Modal
- Vorausgefüllt mit aktuellen Pin-Daten
- Felder: Titel, Kategorie (Select), Adresse, Beschreibung, E-Mail, Datum/Zeit/Wiederholung (bei Events), Schlagwörter (Checkboxes, dynamisch aus API), Links
- Benutzerdefinierte Wiederholung: analog zum öffentlichen Formular
- `setEditRegularity()` parst bestehende Custom-Wiederholungen und befüllt die richtigen Felder
- Submit: POST `/admin/update`
### Admin-Verwaltung
- Modal: Liste aller Admin-Accounts mit Löschen-Button (Bestätigungsdialog)
- Formular: Neuen Admin hinzufügen (username + password)
- Passwörter werden in der Liste nicht angezeigt, sodass bei Vergessen ein neuer Account angelegt werden muss
### CSV-Export
- Alle Pins (approved sowie pending) mit allen Feldern
- Delimiter `;`, Encoding UTF-8
- Tags und Links als semicolon-separierte Strings in je einer Zelle
- Download-Header gesetzt
### Logout
- POST `/logout` via `fetch()` (kein Seiten-Submit), danach `location.reload()`
---
 
## 13. RESPONSIVENESS & LAYOUT
 
### Navbar (Hauptseite)
- Feste Höhe `100px`, sticky top, z-index 30, sodass immer ganz vorne
- Logo: Desktop -> `logo_white.png`, Mobil -> `icon.png`
- Pill-Switcher (Karte/Liste) absolut zentriert in der Navbar
- Buttons rechts: Suche, Filter, Hilfe; 
- auf Mobil: Button-Labels ausgeblendet, nur Icons
- `user-scalable=no` im Viewport-Meta (verhindert Pinch-Zoom auf iOS/Android)
### Breakpoints
- `max-width: 768px` (mobil): Labels auf Buttons hidden, Logo_corner hidden, Hilfe-Button in Navbar hidden (eigener FAB-Link), Filterpanel-Grid auf 1 Spalte
- `min-width: 769px` (Desktop): Desktop-Logo, Hilfe-Button sichtbar
- `max-width: 767px`: `.desktop-word` hidden (ersetzt durch `.mobile-word`) -> „Klicke" vs. „Tippe"
### Modals
- Add-Modal: Auf Mobil als Bottom-Sheet (rounded-t-2xl, items-end), auf Desktop zentriert (items-center)
- Detail-Modal: Immer zentriert, `max-height: 90vh` mit internem Scroll
### Hilfe- und Datenschutz-Seiten
- Sticky Navbar mit zentriertem Logo (absolute positioning)
- Responsive Bild-Wechsel per `<picture>`-Element (mobile/desktop-Screenshots)
- `text-align: justify`, `hyphens: auto` für Fließtext
### Add-Modus-Banner
- Pulsierende Meldung, responsiver Text (`desktop-word`/`mobile-word`)
---
 
## 14. DESIGN & VISUELLE DETAILS
 
- Durchgängig Dark Mode, weil es einfach viiiiiel besser aussieht
- Tailwind CSS + Custom CSS (`style.css`)
- Schriftart: Roboto (Google Fonts CDN)
- Farbsystem: rot (#dc2626) = Events, blau (#2563eb) = Institutionen, grün (#16a34a) = Personen
- Karten und Panels: `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.1)`, `border-radius: 1rem`
- Alle Buttons und Inputs: `border-radius: 20px` (pillenförmig)
- Pin-Icons: SVG überlagert auf PNG-Silhouette, `filter: brightness(0) invert(1)` für weiße Darstellung
- Tag-Chips: Kleine Pill-Labels mit transparentem Hintergrund
- Hover-Interaktionen: Lift-Effekt auf Pin-Karten, Farb-Transition auf Links, Scale auf FAB
- Range-Slider: Custom-Styling mit webkit/moz-Pseudo-Elementen, blauer Thumb mit Hover-Scale
- Active-Dot auf Filter-Button: 8×8 px blauer Kreis (absolute positioned)
- Kategorie-Gradients in Detail-Modal und Formular konsistent
- `clamp()`-Werte für fluid typography (Titelskalierung in Pin-Karten, Logo-Größen, basierend auf Bildschrimbreite)
---
 
## 15. HILFE-SEITE (/hilfe)
 
- Sticky Navigation mit Zurück-Link und zentriertem Logo
- Inhaltsverzeichnis mit Anchor-Links zu Sektionen
- Schritt-für-Schritt-Anleitung zum Hinzufügen eines Eintrags (nummerierte Cards)
- Erklärung der Suche, Filter, Kategorien
- Kontaktaufnahme-Erklärung
- FAQ-Bereich
- Verlinkung zur Datenschutzerklärung
- Responsive Screenshot-Anzeige per `<picture>` (Pfade: `/static/help_screenshots/mobile/N.png` und `/static/help_screenshots/desktop/N.png`)
---
 
## 16. DATENSCHUTZ-SEITE (/datenschutz)
 
- Abschnitte: Verantwortliche Stelle, Erhobene Daten, Umgang mit Daten, Standortdaten, Cookies, Externe Dienste, Rechte, Änderungen
- Vollständige DSGVO-Angaben (Art. 15–21)
- Impressum integriert mit Kontakt-E-Mail (mailto-Link) und Webseiten-Link
- Hinweis auf externe Dienste (OSM/Leaflet, Tailwind CDN, Font Awesome CDN)
- Stand-Angabe: Mai 2026
---
 
## 17. INFRASTRUKTUR & KONFIGURATION
 
- Flask mit Jinja2-Templates (`template_folder='templates'`)
- Static-Files unter `/static/`
- Daten: SQLite unter `data/database.db`
- Port: Env-Variable `PORT`, Fallback 5050
- `SECRET_KEY` als Pflicht-Umgebungsvariable
- Threaded: `False` (single-threaded, kein Concurrency)
- Debug: `False` in Production!
- Webmanifest für PWA-Unterstützung (Favicon in mehreren Größen, Apple-Touch-Icon)
- Externe CDN-Abhängigkeiten: Tailwind, Font Awesome, Leaflet, Leaflet.markercluster, Nominatim API


## Flexible Anpassungen
- Weitere Icons können einfach im jeweiligen Ordner als svg hochgeladen werden und werden automatisch systemweit erkannt und integriert. Pin-Icons liegen unter `static/pins/[Kategorieordner]`
- Schlagwörter können ebenfalls einfach dynamisch ergänzt werden, allerdings nur über einen Eintrag in die Datenbank. Von der aus werden die Schlagwörter systemweit populated.
