from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import json
import os
import uuid
from datetime import datetime
import glob
app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['JSON_AS_ASCII'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'pIt%V-@#s9!zX7$L')

DATA_DIR = 'data'
APPROVED_FILE = os.path.join(DATA_DIR, 'approved_pins.json')
PENDING_FILE = os.path.join(DATA_DIR, 'pending_pins.json')

def load_json(filepath):
    if not os.path.exists(filepath): return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            return json.loads(content) if content else []
    except json.JSONDecodeError:
        return []

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

import re
def next_occurrence(event_date_str, regularity, event_time_str=None):
    if not event_date_str or not regularity or regularity == 'once':
        return event_date_str
    try:
        from datetime import date, datetime, timedelta
        import calendar
        event_date = date.fromisoformat(event_date_str)
        now = datetime.now()
        today = now.date()

        # Wenn das Event heute stattfindet: Uhrzeit prüfen
        if event_date == today and event_time_str:
            try:
                h, mi = map(int, event_time_str.split(':'))
                if now.hour < h or (now.hour == h and now.minute < mi):
                    return event_date_str  # noch nicht vorbei
            except Exception:
                pass

        if event_date > today:
            return event_date_str

        n_days, n_months, n_years = None, None, None

        if   regularity == 'daily':    n_days   = 1
        elif regularity == 'weekly':   n_days   = 7
        elif regularity == 'biweekly': n_days   = 14
        elif regularity == 'monthly':  n_months = 1
        else:
            match = re.match(r'^(\d+)(days?|weeks?|months?|years?)$', regularity)
            if not match: return event_date_str
            num  = int(match.group(1))
            unit = match.group(2)
            if   unit.startswith('day'):   n_days   = num
            elif unit.startswith('week'):  n_days   = num * 7
            elif unit.startswith('month'): n_months = num
            elif unit.startswith('year'):  n_years  = num

        def add_interval(d):
            if n_days:
                return d + timedelta(days=n_days)
            elif n_months:
                month = d.month + n_months
                year  = d.year + (month - 1) // 12
                month = ((month - 1) % 12) + 1
                return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))
            elif n_years:
                try:    return date(d.year + n_years, d.month, d.day)
                except: return date(d.year + n_years, d.month, 28)

        current = event_date

        # Wenn heute und Uhrzeit bereits vorbei: einmal vorwärts erzwingen
        today_passed = (event_date == today)

        while current < today or today_passed:
            current = add_interval(current)
            today_passed = False  # nur einmal erzwingen

        return current.isoformat()
    except Exception:
        return event_date_str

def clean_expired_events():
    pass

# --- öffentliche Route(n) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/hilfe')
def hilfe():
    return render_template('hilfe.html')

@app.route('/datenschutz')
def datenschutz():
    return render_template('datenschutz.html')

@app.route('/api/pins')
def get_pins():
    today = datetime.now().strftime('%Y-%m-%d')
    pins = load_json(APPROVED_FILE)
    public_data = []
    for p in pins:
        if p.get('lat') is None or p.get('lng') is None:
            continue
        if p.get('category') == 'event':
            reg = p.get('regularity', 'once')
            if reg == 'once' and p.get('date') and p['date'] < today:
                continue
            p = p.copy()
            p['date'] = next_occurrence(p.get('date'), reg, p.get('time'))
        p_copy = p.copy()      # ← jetzt außerhalb des if-Blocks
        p_copy.pop('email', None)
        public_data.append(p_copy)
    return jsonify(public_data)

@app.route('/api/suggest', methods=['POST'])
def suggest_pin():
    data = request.json
    data['id'] = str(uuid.uuid4())
    data['status'] = 'pending'
    if not data.get('address'): data['address'] = "Keine Adresse angegeben"

    # Verifikation prüfen
    if data.get('category') == 'person':
        links = data.get('links', [])
        is_verified = any(
            re.match(r'https://forum\.communitymusicnetzwerk\.de/user/', l.get('url', ''))
            for l in links
        )
        if is_verified:
            data['verified'] = True
            data['pinIcon'] = 1
            tags = data.get('tags', [])
            if 'Verifiziertes Mitglied' not in tags:
                tags.append('Verifiziertes Mitglied')
            data['tags'] = tags
        else:
            data['verified'] = False
    else:
        data['verified'] = False

    pending = load_json(PENDING_FILE)
    pending.append(data)
    save_json(PENDING_FILE, pending)
    return jsonify({"success": True, "message": "Vorschlag eingereicht!"})

@app.route('/api/contact', methods=['POST'])
def contact_owner():
    data = request.json
    pins = load_json(APPROVED_FILE)
    target = next((p for p in pins if p['id'] == data.get('pin_id')), None)
    if target and target.get('email'):
        print(f"MAIL an {target['email']}: {data.get('message')}")
        return jsonify({"success": True, "message": "Nachricht versendet."})
    return jsonify({"success": False, "message": "Fehler."}), 404





@app.route('/api/contact_info/<pin_id>')
def contact_info(pin_id):
    pins = load_json(APPROVED_FILE)
    target = next((p for p in pins if p['id'] == pin_id), None)
    if target and target.get('email'):
        return jsonify({"email": target['email']})
    return jsonify({"error": "Nicht gefunden"}), 404


# --- Admin Routen ---

ADMIN_CREDENTIALS = {"admin": "admin123"} ## Testaccount, ggf. Accountmanagementsystem

@app.route('/admin')
def admin_dashboard():
    if 'user' not in session: return render_template('admin.html', logged_in=False)
    
    pending = load_json(PENDING_FILE)
    approved = load_json(APPROVED_FILE)
    
    # Sortierlogik
    approved_sorted = sorted(approved, key=lambda x: x['category'])
    
    return render_template('admin.html', logged_in=True, pending=pending, approved=approved_sorted)


# Management von Admin-Aktivitäten (Login, Genehmigen, Ablehnen, Löschen, Aktualisieren)
@app.route('/admin/login', methods=['POST'])
def login():
    if ADMIN_CREDENTIALS.get(request.form.get('username')) == request.form.get('password'):
        session['user'] = request.form.get('username')
    return redirect('/admin')

@app.route('/admin/approve/<pin_id>')
def approve(pin_id):
    if 'user' not in session: return redirect('/admin')
    pending = load_json(PENDING_FILE)
    approved = load_json(APPROVED_FILE)
    target = next((p for p in pending if p['id'] == pin_id), None)
    if target:
        target['status'] = 'approved'
        approved.append(target)
        save_json(APPROVED_FILE, approved)
        save_json(PENDING_FILE, [p for p in pending if p['id'] != pin_id])
    return redirect('/admin')

@app.route('/admin/reject/<pin_id>')
def reject(pin_id):
    if 'user' not in session: return redirect('/admin')
    pending = load_json(PENDING_FILE)
    save_json(PENDING_FILE, [p for p in pending if p['id'] != pin_id])
    return redirect('/admin')

@app.route('/admin/delete_approved/<pin_id>')
def delete_approved(pin_id):
    if 'user' not in session: return redirect('/admin')
    approved = load_json(APPROVED_FILE)
    save_json(APPROVED_FILE, [p for p in approved if p['id'] != pin_id])
    return redirect('/admin')

@app.route('/admin/update', methods=['POST'])
def update_pin():
    if 'user' not in session: return redirect('/admin')
    data = request.form
    approved = load_json(APPROVED_FILE)
    

    for p in approved:
        if p['id'] == data.get('id'):
            p['title']       = data.get('title')
            p['description'] = data.get('description')
            p['email']       = data.get('email')
            p['address']     = data.get('address')
            p['category']    = data.get('category')
            if data.get('date'): p['date'] = data.get('date')
            if data.get('time'): p['time'] = data.get('time')
            # Tags (kommasepariert aus Textfeld im Admin-Formular)
            tags_raw = data.get('tags', '')
            if tags_raw is not None:
                p['tags'] = [t.strip() for t in tags_raw.split(',') if t.strip()]
            break
            
    save_json(APPROVED_FILE, approved)
    return redirect('/admin')

## Hilfsroute, um verfügbare Pin-Icons dynamisch zu laden

@app.route('/api/pin_icons/<category>')
def pin_icons(category):
    if category not in ('event', 'institution', 'person'):
        return jsonify([])
    folder = os.path.join(app.static_folder, 'pins', category)
    files = sorted(
        glob.glob(os.path.join(folder, '*.svg')),
        key=lambda f: int(os.path.splitext(os.path.basename(f))[0])
    )
    urls = [f'/static/pins/{category}/{os.path.basename(f)}' for f in files]
    return jsonify(urls)


if __name__ == '__main__':
    # Failsafe, dass Datenordner auch existiert. Ggf. durch Bucket ersetzen, wegen Performance und Persistenz
    os.makedirs(DATA_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5050)), debug=True)
