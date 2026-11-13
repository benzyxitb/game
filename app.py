import os, sqlite3, time, uuid, math
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "nexus.db")
FRONTEND = os.path.abspath(os.path.join(BASE, "..", "frontend"))

app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-secret-before-deploy")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

players = {}       # sid -> authoritative transient player state
rooms = {"public": {"name": "Public Arena", "mode": "MULTIPLAYER", "players": set(), "scores": {}}}
last_shot = {}

def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS player_profiles (
          user_id INTEGER PRIMARY KEY REFERENCES users(id),
          level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0,
          kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0, wins INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT,
          mode TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP,
          ended_at TEXT
        );
        CREATE TABLE IF NOT EXISTS match_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER,
          user_id INTEGER, kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0,
          score INTEGER DEFAULT 0
        );
        """)
init_db()

def public_player(p):
    return {"id": p["sid"], "username": p["username"], "x": p["x"], "y": p["y"],
            "z": p["z"], "yaw": p["yaw"], "pitch": p["pitch"],
            "kills": p["kills"], "deaths": p["deaths"], "score": p["score"],
            "health": p["health"], "team": p.get("team", 0)}

@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")

@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    username, password = data.get("username", "").strip(), data.get("password", "")
    if len(username) < 3 or len(username) > 18 or len(password) < 6:
        return jsonify(error="Username 3-18 karakter dan password minimal 6 karakter."), 400
    try:
        with db() as c:
            cur = c.execute("INSERT INTO users(username,password_hash) VALUES(?,?)",
                            (username, generate_password_hash(password)))
            c.execute("INSERT INTO player_profiles(user_id) VALUES(?)", (cur.lastrowid,))
        return jsonify(ok=True, username=username)
    except sqlite3.IntegrityError:
        return jsonify(error="Username sudah digunakan."), 409

@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    with db() as c:
        user = c.execute("SELECT * FROM users WHERE username=?", (data.get("username","").strip(),)).fetchone()
    if not user or not user["password_hash"] or not check_password_hash(user["password_hash"], data.get("password","")):
        return jsonify(error="Username atau password salah."), 401
    return jsonify(ok=True, username=user["username"])

@app.get("/api/leaderboard")
def leaderboard():
    with db() as c:
        rows = c.execute("""SELECT u.username,p.level,p.kills,p.deaths,p.wins
          FROM users u JOIN player_profiles p ON p.user_id=u.id
          ORDER BY p.kills DESC,p.wins DESC LIMIT 20""").fetchall()
    return jsonify([dict(r) for r in rows])

@app.get("/api/health")
def health():
    return jsonify(ok=True, service="NEXUS STRIKE", online=len(players))

@socketio.on("connect")
def on_connect():
    emit("connected", {"sid": request.sid})

@socketio.on("join_game")
def on_join(data):
    data = data or {}
    username = str(data.get("username") or "Guest").strip()[:18] or "Guest"
    mode = str(data.get("mode") or "MULTIPLAYER").upper()
    code = str(data.get("room") or "public").lower()[:12]
    if mode == "1 VS 1" and code == "public":
        code = "duel-" + uuid.uuid4().hex[:5]
    if code not in rooms:
        rooms[code] = {"name": code, "mode": mode, "players": set(), "scores": {}}
    room = rooms[code]
    if mode == "1 VS 1" and len(room["players"]) >= 2:
        emit("join_error", {"message": "Room duel sudah penuh."})
        return
    join_room(code)
    p = {"sid": request.sid, "username": username, "room": code,
         "x": (len(room["players"]) % 2) * 5 - 2.5, "y": 1.7, "z": 0,
         "yaw": 0, "pitch": 0, "health": 100, "kills": 0, "deaths": 0,
         "score": 0, "last_move": time.time()}
    players[request.sid] = p
    room["players"].add(request.sid)
    room["scores"][request.sid] = 0
    emit("joined", {"room": code, "mode": room["mode"], "self": public_player(p),
                    "players": [public_player(players[s]) for s in room["players"] if s in players]},
         to=code)
    emit("player_joined", public_player(p), to=code, include_self=False)

@socketio.on("move")
def on_move(data):
    p = players.get(request.sid)
    if not p: return
    data = data or {}
    # Clamp movement and ignore implausibly large client-side teleports.
    nx, nz = float(data.get("x", p["x"])), float(data.get("z", p["z"]))
    if abs(nx-p["x"]) < 2.0 and abs(nz-p["z"]) < 2.0:
        p["x"], p["z"] = max(-48,min(48,nx)), max(-48,min(48,nz))
    p["yaw"] = float(data.get("yaw", p["yaw"]))
    p["pitch"] = max(-1.4,min(1.4,float(data.get("pitch",p["pitch"]))))
    p["last_move"] = time.time()
    emit("player_moved", public_player(p), to=p["room"], include_self=False)

@socketio.on("shoot")
def on_shoot(data):
    shooter = players.get(request.sid)
    if not shooter: return
    now = time.time()
    if now - last_shot.get(request.sid, 0) < 0.16: return
    last_shot[request.sid] = now
    data = data or {}
    # Server checks ray direction against target proximity; client cannot award its own score.
    ox, oz = shooter["x"], shooter["z"]
    yaw = shooter["yaw"]
    dx, dz = -math.sin(yaw), -math.cos(yaw)
    hit = None
    for sid in list(rooms[shooter["room"]]["players"]):
        target = players.get(sid)
        if not target or sid == request.sid or target["health"] <= 0: continue
        vx, vz = target["x"]-ox, target["z"]-oz
        along = vx*dx + vz*dz
        perp = abs(vx*dz - vz*dx)
        if 0.5 < along < 32 and perp < 1.15:
            if hit is None or along < hit[0]: hit = (along, target)
    emit("shot_fx", {"from": request.sid, "x": ox, "z": oz, "yaw": yaw}, to=shooter["room"])
    if hit:
        target = hit[1]
        target["health"] -= 34
        emit("hit_confirm", {"target": target["sid"], "health": target["health"]}, to=request.sid)
        emit("player_health", {"id": target["sid"], "health": target["health"]}, to=shooter["room"])
        if target["health"] <= 0:
            shooter["kills"] += 1
            shooter["score"] += 100
            target["deaths"] += 1
            target["health"] = 100
            target["x"], target["z"] = (4 if target["x"] < 0 else -4), 0
            emit("elimination", {"killer": shooter["sid"], "victim": target["sid"],
                                 "killer_name": shooter["username"], "victim_name": target["username"]},
                 to=shooter["room"])
            emit("player_moved", public_player(target), to=shooter["room"])
    emit("scoreboard", [public_player(players[s]) for s in rooms[shooter["room"]]["players"] if s in players],
         to=shooter["room"])

@socketio.on("disconnect")
def on_disconnect():
    p = players.pop(request.sid, None)
    last_shot.pop(request.sid, None)
    if not p: return
    room = rooms.get(p["room"])
    if room:
        room["players"].discard(request.sid)
        room["scores"].pop(request.sid, None)
        leave_room(p["room"])
        emit("player_left", {"id": request.sid}, to=p["room"])
        if not room["players"] and p["room"] != "public":
            rooms.pop(p["room"], None)

if __name__ == "__main__":
    print("NEXUS STRIKE running at http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False, allow_unsafe_werkzeug=True)
