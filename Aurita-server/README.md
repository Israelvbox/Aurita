# aurita-server

Caching intermediary server for [Aurita](https://github.com/israelvara/aurita-android). Sits between the Jellyfin server and clients, providing a REST API with FTS5 search, image caching, and token encryption.

## Features

- **Proxy API** — wraps Jellyfin endpoints for genres, artists, albums, tracks, playlists, instant mix, search
- **FTS5 full-text search** — fast, hyphen-tolerant search across tracks, albums, artists
- **Image proxy + disk cache** — caches album/artist art locally to avoid hammering Jellyfin
- **Token encryption** — AES-256-GCM for stored Jellyfin session tokens
- **Rate limiting** — 120 requests/min per IP
- **Sync** — periodic sync of genres/albums/artists/tracks with orphan cleanup
- **Gzip compression** — all JSON responses compressed

## Requirements

- Node.js 18+
- Jellyfin server (10.9+)

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your Jellyfin URLs

node server.js
```

Or use the install script for a systemd service:

```bash
sudo bash install.sh
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JELLYFIN_URL` | Yes | — | Internal LAN URL of your Jellyfin server |
| `JELLYFIN_EXTERNAL_URL` | Yes | — | Public-facing URL clients connect to (for CORS) |
| `PORT` | No | `3000` | Server port |
| `SYNC_INTERVAL_MINUTES` | No | `5` | Sync interval |
| `NODE_ENV` | No | `production` | Environment |

## API Endpoints

All endpoints require `Authorization: Bearer <token>` (token obtained from `/api/auth/login`).

| Endpoint | Description |
|---|---|
| `POST /api/auth/login` | Login with username/password |
| `GET /api/startup` | Check if server is reachable |
| `GET /api/items/search?q=` | FTS5 search |
| `GET /api/genres` | List all genres |
| `GET /api/artists` | List all artists |
| `GET /api/playlists` | List all playlists |
| `GET /api/items/:type/:id` | Get item by type and ID |
| `GET /api/images/:id/:type` | Cached image proxy |
| `GET /api/instantmix/:id` | Instant mix for a track |
| `GET /api/favorites` | Get favorited items |
| `GET /api/localindex` | Local search index |
| `GET /api/syncstatus` | Sync status |
| `GET /api/setup` | Initial setup check |

## Project Structure

```
aurita-server/
├── server.js              # Fastify server entry point
├── config.js              # Environment config
├── crypto.js              # AES-256-GCM encryption/decryption
├── db.js                  # SQLite database (FTS5, sync, settings)
├── jellyfin-api.js        # Jellyfin HTTP client
├── sync.js                # Periodic sync engine
├── routes/                # Route handlers
│   ├── auth.js
│   ├── items.js
│   ├── genres.js
│   ├── artists.js
│   ├── playlists.js
│   ├── images.js
│   ├── instantmix.js
│   ├── search.js
│   ├── favorites.js
│   ├── localindex.js
│   ├── syncstatus.js
│   ├── startup.js
│   └── setup.js
├── middleware/
│   └── rateLimit.js
├── Caddyfile.example      # Example reverse proxy config
├── install.sh             # System installation script
└── aurita-server.service  # Systemd unit template
```

## License

MIT
