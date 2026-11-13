# NEXUS STRIKE — playable multiplayer foundation

A browser FPS prototype built with Three.js + Flask-SocketIO. This is a real networked prototype, not a static mockup.

## Included in this first playable milestone
- Three.js first-person arena with low-poly cover, lighting, fog and neon accents.
- WASD movement, mouse-look (click the game to lock pointer), jump, sprint and fire.
- Flask-SocketIO rooms and live player position replication.
- Server-side fire-rate limit and basic server-side hit validation / elimination.
- Guest mode, register/login with Werkzeug password hashing.
- SQLite account database and a leaderboard API.
- Multiplayer, duel room, FFA and training mode entry points. Training has local target dummies.

## Requirements
- Python 3.10+
- Modern desktop browser with WebGL
- Internet connection for CDN-hosted Three.js, Socket.IO client and Google Fonts

## Run locally
From the project root:

```bash
python -m venv .venv
# Windows:
.venv\\Scripts\\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r backend/requirements.txt
python backend/app.py
```

Open http://127.0.0.1:5000 in two browser tabs or on two computers on the same network (use the host computer's LAN IP).

## Controls
- WASD: move
- Mouse: aim / look (click game to capture pointer)
- Left click: fire
- Space: jump
- Shift: sprint
- Esc: scoreboard / pause

## Multiplayer test
1. Run the server once.
2. Open the game in two browser windows.
3. Join as Guest in both using different player names.
4. Deploy to Multiplayer. Players should appear and move in both windows.
5. Aim toward the other player and fire. Eliminations are validated by the server.

## Register/login
Register uses username (3–18 chars) and password (minimum 6 chars). Passwords are stored as hashes. Guest mode does not create a persistent account.

## API
- `GET /api/health`
- `POST /api/register` JSON `{ "username": "...", "password": "..." }`
- `POST /api/login` JSON `{ "username": "...", "password": "..." }`
- `GET /api/leaderboard`

## Deployment notes
- Set `SECRET_KEY` to a long random secret.
- Serve behind HTTPS / WSS using a reverse proxy.
- Configure `cors_allowed_origins` to your actual game domain rather than `*`.
- Use PostgreSQL for persistent production data and Redis as Socket.IO message queue when running multiple workers.
- Add rate limiting, CSRF protections, access tokens, moderation, anti-cheat telemetry and server-authoritative physics before public competitive release.

## Current milestone limitations
This is the first playable foundation, not a finished AAA-scale product. The initial version uses simple capsule player meshes, one arena layout, hitscan shooting, and SQLite. Character cosmetics, animated rigged models, full weapon inventory, friend/chat/shop, mobile controls, ranked matchmaking, persistence of match stats and production anti-cheat are later milestones. Duel mode currently creates a private generated room code; sharing/inviting by code is the next iteration.
