import argon2
from flask import Flask, render_template, request, jsonify, session, redirect, make_response
import json
import os
import uuid
from datetime import datetime, date
import glob
import database
from argon2 import PasswordHasher

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['JSON_AS_ASCII'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'pIt%V-@#s9!zX7$L')


def format_datetime(value):
    if not value:
        return ''
    months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
    try:
        if 'T' in value:
            dt = datetime.fromisoformat(value)
            return f"{dt.day}. {months[dt.month-1]} {dt.year} um {dt.hour:02d}:{dt.minute:02d} Uhr"
        d = date.fromisoformat(value)
        return f"{d.day}. {months[d.month-1]} {d.year}"
    except Exception:
        return value

app.jinja_env.filters['format_datetime'] = format_datetime

DATA_DIR = 'data'
APPROVED_FILE = os.path.join(DATA_DIR, 'approved_pins.json')
PENDING_FILE = os.path.join(DATA_DIR, 'pending_pins.json')

ph = PasswordHasher()


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

        today_passed = (event_date == today)

        while current < today or today_passed:
            current = add_interval(current)
            today_passed = False  

        return current.isoformat()
    except Exception:
        return event_date_str

def clean_expired_events():
    pass

# --- öffentliche Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/hilfe')
def hilfe():
    return render_template('hilfe.html')

@app.route('/datenschutz')
def datenschutz():
    return render_template('datenschutz.html')


# --- api --- #
@app.route('/api/pins')
def get_pins():
    today = datetime.now().strftime('%Y-%m-%d')
    pins = database.get_pins(today)
    for p in pins:
        if p.get('category') == 'event':
            p['date'] = next_occurrence(p.get('date'), p.get('regularity'), p.get('time'))
    return jsonify(pins)



@app.route('/api/suggest', methods=['POST'])
def suggest_pin():
    data = request.json
    data['id'] = str(uuid.uuid4())
    data['status'] = 'pending'
    if not data.get('address'): data['address'] = "Keine Adresse angegeben"

    # Verifikation prüfen via Link zum cmn-Netzwerk
    if data.get('category') == 'person':
        links = data.get('links', [])
        is_verified = any(
            re.match(r'https://forum\.communitymusicnetzwerk\.de/user/', l.get('url', ''))
            for l in links
        )
        if is_verified:
            data['verified'] = True
            data['pinIcon'] = 1
        else:
            data['verified'] = False
    else:
        data['verified'] = False

    database.suggest_pin(data)
    return jsonify({"success": True, "message": "Vorschlag eingereicht!"})



@app.route('/api/getTags')
def get_tags():
    tags = database.get_tags()
    return tags



@app.route('/api/contact_info/<pin_id>')
def contact_info(pin_id):
    email = database.get_contact_info(pin_id)
    return jsonify({"email": email})



# --- Admin Routes ---

@app.route('/admin')
def admin_dashboard():
    if 'user' not in session: return render_template('admin.html', logged_in=False)
    
    pending = database.load_admin_pins(0)
    approved = database.load_admin_pins(1)
    approved.sort(key=lambda p: p.get('approvedAt') or '', reverse=True)
    approved.sort(key=lambda p: p.get('category') or '')
    admins = database.get_admins()

    toast_message = session.pop('toast_message', None)
    return render_template('admin.html', logged_in=True, pending=pending, approved=approved, admins=admins, toast_message=toast_message)


# Management von Admin-Aktivitäten (Login, Genehmigen, Ablehnen, Löschen, Aktualisieren)
@app.route('/admin/login', methods=['POST'])
def login():
    user_name = request.form.get('username') or ""
    password = request.form.get('password') or ""
    db_hash = database.get_password_hash(user_name)

    if db_hash is None:
        print("not registered")
        return redirect('/admin?login=invalid')
    try:
        if ph.verify(db_hash, password):
            session['user'] = user_name
    except (argon2.exceptions.VerifyMismatchError,  argon2.exceptions.InvalidHashError):
        return redirect('/admin?login=invalid')

    return redirect('/admin')

@app.route("/logout", methods=['POST'])
def logout():
    session.clear()
    return "", 204

@app.route('/admin/register', methods=['POST'])
def register():
    if 'user' not in session: return redirect('/admin') # probably only admins should be able to add new admins?
    user_name = request.form.get('username') or ""
    password = request.form.get('password') or ""
    database.register(user_name, ph.hash(password))
    session['toast_message'] = 'Admin erfolgreich hinzugefügt.'
    return redirect('/admin')

@app.route('/admin/export_csv')
def export_csv():
    if 'user' not in session: return redirect('/admin')
    pins = database.get_all_pins_for_export()

    from io import StringIO
    import csv

    output = StringIO()
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        'id', 'title', 'category', 'address', 'description', 'selfDescription', 'email',
        'lat', 'lng', 'date', 'time', 'regularity', 'approved', 'approvedBy', 'approvedAt',
        'proposalTime', 'verified', 'tags', 'links'
    ])

    for p in pins:
        tags = ';'.join(p.get('tags', []))
        links = ';'.join([f"{l.get('title','').replace(';','')}: {l.get('url','').replace(';','')}" for l in p.get('links', [])])
        writer.writerow([
            p.get('id', ''), p.get('title', ''), p.get('category', ''), p.get('address', ''), p.get('description', ''),
            p.get('selfDescription', ''), p.get('email', ''), p.get('lat', ''), p.get('lng', ''), p.get('date', ''),
            p.get('time', ''), p.get('regularity', ''), p.get('approved', ''), p.get('approvedBy', ''), p.get('approvedAt', ''),
            p.get('proposalTime', ''), p.get('verified', ''), tags, links
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = 'attachment; filename=pins_export.csv'
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    return response

@app.route('/admin/delete_user', methods=['POST'])
def delete_user():
    if 'user' not in session: return redirect('/admin')
    username = request.form.get('username') or ""
    if username:
        database.delete_admin(username)
        session['toast_message'] = 'Admin erfolgreich gelöscht.'
    return redirect('/admin')

@app.route('/admin/approve/<pin_id>')
def approve(pin_id):
    if 'user' not in session: return redirect('/admin')
    database.approve(pin_id, session['user'])
    return redirect('/admin')

@app.route('/admin/reject/<pin_id>')
def reject(pin_id):
    if 'user' not in session: return redirect('/admin')
    database.delete(pin_id)
    return redirect('/admin')

@app.route('/admin/delete_approved/<pin_id>')
def delete_approved(pin_id):
    if 'user' not in session: return redirect('/admin')
    database.delete(pin_id)
    return redirect('/admin')

@app.route('/admin/update', methods=['POST'])
def update_pin():
    if 'user' not in session: return redirect('/admin')
    data = request.form
    print(data)
    database.update(data)
    return redirect('/admin')

## Dynamischer Iconloader

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
    # hier später durch Bucket bzw. Datenbank ersetzen
    os.makedirs(DATA_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", 5050)), debug=True, threaded=False)
