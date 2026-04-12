import sqlite3
import json
import os
import uuid
from datetime import datetime

def get_db_connection(row_factory = True):
    db = sqlite3.connect("data/database.db")
    if row_factory:
        db.row_factory = sqlite3.Row
    cursor = db.cursor()
    return (db, cursor)

def create_table():
    (db, cursor) = get_db_connection()
    print("Die Datenbank wird intialisiert. Bitte haben Sie einen Moment Geduld... 🦆")
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS links (id NUMBER PRIMARY KEY, title TEXT, url TEXT NOT NULL)"    
    )
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS tags (value TEXT PRIMARY KEY)"
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS pins (
            title TEXT,
            approved NUMBER NOT NULL,
            category TEXT,
            date TEXT,
            time TEXT,
            regularity TEXT,
            description TEXT,
            selfDescription TEXT,
            address TEXT,
            lng NUMBER,
            lat NUMBER,
            email TEXT,
            pinIcon NUMBER,
            proposalTime TEXT,
            approvedBy TEXT,
            approvedAt TEXT,
            id TEXT PRIMARY KEY,
            verified NUMBER
        )
        """
    )

    existing_columns = [row[1] for row in cursor.execute("PRAGMA table_info(pins)").fetchall()]
    if 'approvedBy' not in existing_columns:
        cursor.execute("ALTER TABLE pins ADD COLUMN approvedBy TEXT")
    if 'approvedAt' not in existing_columns:
        cursor.execute("ALTER TABLE pins ADD COLUMN approvedAt TEXT")

    cursor.execute(
        "CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password TEXT NOT NULL)"
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS pinHasTag (pinId NUMBER, tagName TEXT,
            FOREIGN KEY (tagName) REFERENCES tags(value)
            PRIMARY KEY (pinId, tagName)
            )
            """
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS pinHasLink (pinId NUMBER, linkId NUMBER,
            FOREIGN KEY (linkId) REFERENCES links(id)
            PRIMARY KEY (pinId, linkId)
            )
        """
    )
    db.commit()
create_table()



def load_json(filepath):
    if not os.path.exists(filepath): return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            return json.loads(content) if content else []
    except json.JSONDecodeError:
        return []




APPROVED_FILE = "data/approved_pins.json"


def migrate_from_json():

    (db, cursor) = get_db_connection(False)
    pins = load_json(APPROVED_FILE)
    for p in pins:
        # tags
        
        # links
        links = p.get("links")
        for link in links:
            linkID = str(uuid.uuid4())
            linkIDArray = cursor.execute("SELECT id FROM links WHERE url = ? AND title = ?", (link.get("url"), link.get("title"),)).fetchall()
            
            if (len(linkIDArray) > 0 ):
                linkID = linkIDArray[0][0]

            cursor.execute("INSERT OR REPLACE INTO links VALUES(?, ?, ?)", (linkID, link.get("title"), link.get("url"),))
            cursor.execute("""INSERT OR REPLACE INTO pinHasLink VALUES(?, ?)""", (p.get("id"), linkID),)

        # pins
        cursor.execute("""
            INSERT OR REPLACE INTO pins VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
              (p.get("title"), 1, p.get("category"), p.get("date"), p.get("time"), p.get("regularity"), p.get("description"), p.get("selfDescription"), p.get("address"), p.get("lng"), p.get("lat"), p.get("email"), p.get("pinIcon"), p.get("proposalTime"), None, None, p.get("id"), p.get("verified"))
        )

        tags = p.get("tags")
        for tag in tags:
            cursor.execute("INSERT OR REPLACE INTO tags VALUES(?)", (tag,))
            cursor.execute("""INSERT OR REPLACE INTO pinHasTag VALUES(?, ?)""", (p.get("id"), tag))

        db.commit()

#migrate_from_json()

def get_pins(today):
    db, cursor = get_db_connection()
    cursor.execute("""
    SELECT pins.*,
        (
            SELECT json_group_array(tagName) 
            FROM (SELECT DISTINCT tagName FROM pinHasTag WHERE pinId = pins.id)
        ) as tags,
        (
            SELECT json_group_array(
            json_object(
                'id', l.id, 
                'title', l.title, 
                'url', l.url
            )
        ) 
        FROM pinHasLink phl
        JOIN links l ON phl.linkId = l.id
        WHERE phl.pinId = pins.id
    ) as links
    FROM pins
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND approved = 1
    GROUP BY pins.id
    HAVING NOT (
        category = 'event' 
        AND COALESCE(regularity, 'once') = 'once' 
        AND date IS NOT NULL 
        AND date < ?
    );
    """, (today,))
    
    rows = cursor.fetchall()
    db.close()

    results = []
    for row in rows:
        pin = dict(row)
        import json
        pin['tags'] = json.loads(pin['tags']) if pin['tags'] else []
        pin['links'] = json.loads(pin['links']) if pin['links'] else []
        results.append(pin)
        
        
    return results



def suggest_pin(p):
    (db, cursor) = get_db_connection()
    cursor.execute("""
        INSERT OR REPLACE INTO pins VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (p.get("title"), 0, p.get("category"), p.get("date"), p.get("time"), p.get("regularity"), p.get("description"), p.get("selfDescription"), p.get("address"), p.get("lng"), p.get("lat"), p.get("email"), p.get("pinIcon"), p.get("proposalTime"), None, None, p.get("id"), p.get("verified"))
    )
    
    for link in p.get("links"):
        linkid = cursor.execute("SELECT id FROM links WHERE url = ? AND title = ?", (link.get("title"), link.get("url"),)).fetchall()
        new_linkid = ""
        if (len(linkid) == 0):
            new_linkid = str(uuid.uuid4())
            cursor.execute("INSERT OR REPLACE INTO links VALUES(?, ?, ?)", (new_linkid, link.get("title"), link.get("url")))
        else:
            new_linkid = linkid[0].id
        cursor.execute("INSERT OR REPLACE INTO pinHasLink VALUES(?, ?)",(p.get("id"), new_linkid ))

    for tag in p.get("tags"):
        cursor.execute("INSERT OR REPLACE INTO tags VALUES(?)",(tag,))
        cursor.execute("INSERT OR REPLACE INTO pinHasTag VALUES(?, ?)",(p.get("id"), tag))
    db.commit()


def load_admin_pins(approved):
    (db, cursor) = get_db_connection()
    order_by = 'approvedAt DESC' if approved == 1 else 'proposalTime ASC'
    pending_pins = cursor.execute("""
        SELECT pins.*, (
            SELECT json_group_array(tagName) 
            FROM (SELECT DISTINCT tagName FROM pinHasTag WHERE pinId = pins.id)
        ) as tags,
        (
            SELECT json_group_array(
                json_object('title', l.title, 'url', l.url)
            )
            FROM pinHasLink phl
            JOIN links l ON phl.linkId = l.id
            WHERE phl.pinId = pins.id
        ) as links
        FROM pins
        WHERE approved = ?
        ORDER BY """ + order_by + """
    """, (approved,))
    rows =  pending_pins.fetchall()
    db.close()
    results = []
    for row in rows:
        pin = dict(row)
        pin['tags'] = json.loads(pin['tags']) if pin['tags'] else []
        pin['links'] = json.loads(pin['links']) if pin['links'] else []
        results.append(pin)
        
    
    return results


def get_contact_info(pin_id):
    (db, cursor) = get_db_connection()
    result = cursor.execute(
        "SELECT email FROM pins WHERE id = ?", (pin_id,)
    ).fetchone()          # ← ein Row-Objekt oder None
    db.close()
    return result['email'] if result else None
    
def get_tags():
    (db, cursor) = get_db_connection(False)
    sqltags = cursor.execute("""SELECT DISTINCT value FROM tags""").fetchall()
    db.close()
    tags = []
    for tag in sqltags:
        tags.append(tag[0])
    return tags


def get_all_pins_for_export():
    (db, cursor) = get_db_connection()
    cursor.execute("""
    SELECT pins.*,
        (
            SELECT json_group_array(tagName)
            FROM (SELECT DISTINCT tagName FROM pinHasTag WHERE pinId = pins.id)
        ) as tags,
        (
            SELECT json_group_array(
                json_object('title', l.title, 'url', l.url)
            )
            FROM pinHasLink phl
            JOIN links l ON phl.linkId = l.id
            WHERE phl.pinId = pins.id
        ) as links
    FROM pins
    GROUP BY pins.id
    """)
    rows = cursor.fetchall()
    db.close()

    results = []
    for row in rows:
        pin = dict(row)
        pin['tags'] = json.loads(pin['tags']) if pin['tags'] else []
        pin['links'] = json.loads(pin['links']) if pin['links'] else []
        results.append(pin)
    return results

    
def approve(pinID, approved_by=None):
    (db, cursor) = get_db_connection()
    approvedAt = datetime.now().isoformat()
    cursor.execute(
        "UPDATE pins SET approved = 1, approvedBy = ?, approvedAt = ? WHERE id = ?",
        (approved_by, approvedAt, pinID)
    )
    db.commit()

def delete(pinID):
    (db, cursor) = get_db_connection()
    cursor.execute("DELETE FROM pins WHERE id = ?", (pinID, ))
    db.commit()

def update(pin):
    id = pin.get('id')
    title = pin.get('title')
    description = pin.get('description')
    email = pin.get('email')
    address = pin.get('address')
    category = pin.get('category')
    regularity = pin.get('regularity')
    links = []
    tags = []
    
    if pin.get('date'): date = pin.get('date')
    if pin.get('time'): time = pin.get('time')

    tagList = pin.items()
    for tag_raw in tagList:
        if (tag_raw[0].startswith("tags")):
            tags.append(tag_raw[1])

    links_raw = pin.get('links', '')
    if links_raw is not None:
        links = [t.strip() for t in links_raw.split(',') if t.strip()]
        print(tags)

    (db, cursor) = get_db_connection()
    cursor.execute("""UPDATE pins 
                    SET title = ?,
                        category = ?,
                        date = ?,
                        time = ?,
                        regularity = ?,
                        description = ?,
                        address = ?,
                        email = ?
                    WHERE id = ?
                   """, (title, category, date, time, regularity, description, address, email, id))

    cursor.execute("DELETE FROM pinHasLink WHERE pinId = ?", (id, ))
    for link in links:
        cursor.execute("INSERT INTO pinHasLink VALUES(?,?)", (id, link))

    cursor.execute("DELETE FROM pinHasTag WHERE pinId = ?", (id, ))
    for tag in tags:
        cursor.execute("INSERT INTO pinHasTag VALUES(?,?)", (id, tag))


    db.commit()


def get_password_hash(user_name):
    (db, cursor) = get_db_connection(False)
    password_hash = cursor.execute("""
        SELECT DISTINCT password FROM admins
        WHERE username = ?
    """, (user_name, )).fetchone()
    db.close()
    if password_hash is not None:
        return password_hash[0]
    else:
        return None


def register(user_name, password):
    (db, cursor) = get_db_connection(False)
    print(user_name, password)
    cursor.execute("INSERT OR REPLACE INTO admins VALUES (?, ?)", (user_name, password))
    db.commit()


def get_admins():
    (db, cursor) = get_db_connection(False)
    rows = cursor.execute("SELECT username FROM admins ORDER BY username").fetchall()
    db.close()
    return [row[0] for row in rows]


def delete_admin(user_name):
    (db, cursor) = get_db_connection(False)
    cursor.execute("DELETE FROM admins WHERE username = ?", (user_name,))
    db.commit()