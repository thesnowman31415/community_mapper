from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import json
import os
import uuid
from datetime import datetime

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

def clean_expired_events():
    pins = load_json(APPROVED_FILE)
    today = datetime.now().strftime('%Y-%m-%d')
    valid_pins = []
    for p in pins:
        if p.get('category') != 'event': valid_pins.append(p)
        elif p.get('regularity', 'once') != 'once': valid_pins.append(p)
        elif p.get('date') and p['date'] >= today: valid_pins.append(p)
            
    if len(pins) != len(valid_pins):
        save_json(APPROVED_FILE, valid_pins)

# --- öffentliche Route(n) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/pins')
def get_pins():
    clean_expired_events()
    pins = load_json(APPROVED_FILE)
    public_data = []
    for p in pins:
        if p.get('lat') is None or p.get('lng') is None: continue
        p_copy = p.copy()
        if 'email' in p_copy: del p_copy['email'] 
        public_data.append(p_copy)
    return jsonify(public_data)

@app.route('/api/suggest', methods=['POST'])
def suggest_pin():
    data = request.json
    data['id'] = str(uuid.uuid4())
    data['status'] = 'pending'
    if not data.get('address'): data['address'] = "Keine Adresse angegeben"

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
            p['title'] = data.get('title')
            p['description'] = data.get('description')
            p['email'] = data.get('email')
            p['address'] = data.get('address')
            p['category'] = data.get('category')
            # Event Felder nur updaten wenn vorhanden
            if data.get('date'): p['date'] = data.get('date')
            if data.get('time'): p['time'] = data.get('time')
            break
            
    save_json(APPROVED_FILE, approved)
    return redirect('/admin')



if __name__ == '__main__':
    # Failsafe, dass Datenordner auch existiert. Ggf. durch Bucket ersetzen, wegen Performance und Persistenz
    os.makedirs(DATA_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5000)), debug=True)
