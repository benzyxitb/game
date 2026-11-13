CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(18) UNIQUE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE player_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0,
  kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0, wins INTEGER DEFAULT 0
);
CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  body_type TEXT, skin_color TEXT, outfit TEXT
);
CREATE TABLE weapons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  category TEXT, damage INTEGER, fire_rate REAL, reload_time REAL,
  magazine_capacity INTEGER, recoil REAL, skin TEXT
);
CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT, mode TEXT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ended_at TIMESTAMP
);
CREATE TABLE match_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER REFERENCES matches(id),
  user_id INTEGER REFERENCES users(id), kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0, assists INTEGER DEFAULT 0, score INTEGER DEFAULT 0
);
CREATE TABLE leaderboard (
  user_id INTEGER PRIMARY KEY REFERENCES users(id), rating INTEGER DEFAULT 1000
);
CREATE TABLE friends (
  user_id INTEGER REFERENCES users(id), friend_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'pending', PRIMARY KEY(user_id,friend_id)
);
CREATE TABLE rooms (
  code TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id),
  mode TEXT, is_private INTEGER DEFAULT 0
);
CREATE TABLE player_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id),
  item_type TEXT, item_id INTEGER, equipped INTEGER DEFAULT 0
);
