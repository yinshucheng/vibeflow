# Deployment Guide

## Infrastructure

| Component | Detail |
|-----------|--------|
| Server | Alibaba Cloud ECS (2C/3.5G, Alibaba Cloud Linux 3) |
| Database | Alibaba Cloud RDS PostgreSQL (separate instance, internal network) |
| Container | Docker CE + Docker Compose |
| Reverse Proxy | Nginx on host (port 4000 → container port 3001 → app port 3000) |
| Public URL | `http://39.105.213.147:4000` |

## File Layout

```
Dockerfile                    # Multi-stage build (deps → build → production)
docker-compose.yml            # Container orchestration, maps 3001:3000
.dockerignore                 # Excludes sub-projects, tests, IDE files
.npmrc                        # legacy-peer-deps=true (@trpc/next peer conflict)
.env.production.example       # Production env template
deploy/
  deploy.sh                   # One-command deploy: tar → scp → build → db push → restart
  nginx-vibeflow.conf         # Nginx config with WebSocket/Socket.io support
scripts/
  start-remote.sh             # Launch desktop/iOS clients connected to remote server
```

## Deploy Workflow

```bash
# One-command deploy (from local Mac)
./deploy/deploy.sh
```

Steps performed by deploy.sh:
1. `tar` project (excluding node_modules, .next, sub-projects, tests, IDE files)
2. `scp` to server `~/vibeflow/`
3. `docker compose build` on server (uses China mirrors for Docker Hub + npm)
4. `prisma db push` to sync schema
5. `docker compose restart`
6. Nginx config update + reload
7. Health check

## China Mirror Configuration

Docker Hub is blocked in mainland China. The Dockerfile uses a build ARG:

```dockerfile
ARG REGISTRY=docker.1ms.run/library/
FROM ${REGISTRY}node:20-alpine AS deps
```

npm uses npmmirror:
```dockerfile
RUN npm config set registry https://registry.npmmirror.com && npm ci
```

When deploying from overseas (e.g., after migrating to Fly.io), override the registry:
```bash
docker compose build --build-arg REGISTRY=""
```

## Clients Overview

All clients share the same backend (Next.js + Socket.io + PostgreSQL). The server is the single deployment unit; clients are distributed separately.

### When to use which client

| Client | Scope | Unique capabilities | When to use |
|--------|-------|-------------------|-------------|
| **Web** | Primary UI | Full task/project/goal CRUD, statistics, settings, pomodoro control | All management operations — this is where you do everything |
| **Desktop** (macOS) | OS-level enforcement | Quit/hide distraction apps (AppleScript), sleep enforcement, quit prevention, system tray with live countdown, offline policy cache (24h), idle detection | You want the system to **force you to focus** — auto-close distracting apps, prevent quitting VibeFlow, enforce sleep time |
| **Extension** (Chrome) | Browser-level enforcement | URL blocking (declarativeNetRequest), entertainment mode with daily quota, page overlay warnings, browser activity tracking (scroll/clicks/search), screensaver redirect | You want to **block distracting websites** and track browsing behavior during work |

**In short**: Web = the brain (manage everything). Desktop = app-level enforcement (close WeChat, games). Extension = browser-level enforcement (block Twitter, YouTube). All three together = full-spectrum focus protection.

### Architecture

```
                    ┌─────────────────────────┐
                    │   Server (port 4000)     │
                    │   Next.js + Socket.io    │
                    │   tRPC API + Web UI      │
                    └────┬──────┬──────┬───────┘
                         │      │      │
              ┌──────────┘      │      └──────────┐
              ▼                 ▼                  ▼
     ┌────────────────┐ ┌─────────────┐ ┌─────────────────┐
     │ Desktop (.app) │ │  Browser    │ │ Extension       │
     │ Loads web UI   │ │  (direct)   │ │ (Chrome popup)  │
     │ + OS enforce   │ │             │ │ + URL blocking  │
     └────────────────┘ └─────────────┘ └─────────────────┘
```

- Desktop loads the web UI via `mainWindow.loadURL(serverUrl)` — no separate UI
- Extension has its own minimal popup; management is done in the web UI
- All clients communicate via Socket.io (Octopus protocol)

## Client Connection

### Local development (default)
All clients connect to `localhost:3000`, using local PostgreSQL. No special config needed.

### Remote server (current production)

```bash
# Desktop (release build — double-click .app, auto-connects to remote)
open vibeflow-desktop/release/mac-arm64/VibeFlow.app
# Desktop (rebuild first if code changed)
cd vibeflow-desktop && npm run build:mac && open release/mac-arm64/VibeFlow.app
# Desktop (dev mode with remote server — for debugging)
./scripts/start-remote.sh desktop
# or: VIBEFLOW_SERVER_URL=http://39.105.213.147:4000 npm run dev (in vibeflow-desktop/)

# iOS (dev server only — Dev Client must already be installed on device)
./scripts/start-remote.sh ios
# iOS (full native build + deploy — use when native code changed)
./scripts/start-remote.sh ios --build

# Browser Extension
# Open popup → Server URL input → enter http://39.105.213.147:4000 → Connect

# Both desktop + iOS
./scripts/start-remote.sh all
```

### Client server URL configuration summary

| Client | Config mechanism | Env var / setting |
|--------|-----------------|-------------------|
| Web | `.env` `NEXTAUTH_URL` | N/A (runs on same server) |
| Desktop | `app.isPackaged` + env var | Packaged `.app` → remote; dev → localhost; `VIBEFLOW_SERVER_URL` overrides both |
| Extension | chrome.storage.local | Popup UI "Server URL" field |
| iOS | Expo env vars (baked at build) | `EXPO_PUBLIC_SERVER_HOST`, `EXPO_PUBLIC_SERVER_PORT` |

### Custom deployment (deploy to your own server)

**Step 1: Deploy the server** (required — all clients depend on it)

Prerequisites: Linux server with Docker + Docker Compose + Nginx.

```bash
# 1. Clone repo to server, or use deploy.sh to push from local
# 2. Create .env.production (copy from .env.production.example)
#    Required: DATABASE_URL, NEXTAUTH_URL=http://YOUR_IP:4000, NEXTAUTH_SECRET
#    For dev/testing: DEV_MODE=true, DEV_USER_EMAIL=your@email.com
# 3. Deploy
./deploy/deploy.sh
# Or manually on server:
docker compose build && docker compose up -d
npx prisma db push
```

After deployment, `http://YOUR_IP:4000` serves the web UI + API + WebSocket — all on one port.

**Step 2: Connect Desktop** (optional — for macOS app enforcement)

```bash
# Option A: Modify the hardcoded remote IP and build a release .app
# Edit vibeflow-desktop/electron/main.ts line ~106: change 39.105.213.147 to YOUR_IP
cd vibeflow-desktop && npm run build:mac
open release/mac-arm64/VibeFlow.app

# Option B: Use env var (no code change needed)
cd vibeflow-desktop
VIBEFLOW_SERVER_URL=http://YOUR_IP:4000 npm run dev
```

**Step 3: Connect Extension** (optional — for browser enforcement)

1. Load extension in Chrome (Developer Mode → Load Unpacked → select `vibeflow-extension/`)
2. Click popup → Server URL → enter `http://YOUR_IP:4000` → Connect

**Important notes**:
- Server must open port 4000 (or your configured port) and support WebSocket long connections
- Nginx config: see `deploy/nginx-vibeflow.conf` for WebSocket/Socket.io proxy settings
- **No production auth yet** (`DEV_MODE=true` = passwordless login) — do not expose to public internet without completing `production-auth` spec

## Server Operations

```bash
# View logs
ssh cloud "cd ~/vibeflow && docker compose logs -f"

# Restart
ssh cloud "cd ~/vibeflow && docker compose restart"

# Stop
ssh cloud "cd ~/vibeflow && docker compose down"

# DB shell
ssh cloud 'docker run --rm -it --env-file ~/vibeflow/.env.production docker.1ms.run/library/postgres:15-alpine psql "$DATABASE_URL"'

# Rebuild without cache
ssh cloud "cd ~/vibeflow && docker compose build --no-cache && docker compose up -d"
```

## Data Backup

RDS data should be periodically backed up. Quick manual dump:

```bash
ssh cloud '
  DB_URL=$(grep "^DATABASE_URL" ~/vibeflow/.env.production | sed "s/^DATABASE_URL=//" | tr -d "\"" | sed "s/?schema=public//")
  docker run --rm docker.1ms.run/library/postgres:15-alpine pg_dump "$DB_URL" > ~/vibeflow-backup-$(date +%Y%m%d).sql
'
scp cloud:~/vibeflow-backup-*.sql /path/to/local/backups/
```

## Future: Migration to Fly.io

Target market is overseas App Store. When ready to migrate:
1. Remove `ARG REGISTRY` from Dockerfile (no China mirror needed)
2. Create `fly.toml` with region `sjc` or `nrt`
3. Create Fly Postgres
4. `fly deploy`
5. Update all client URLs to the new domain

Prerequisites before public launch: `production-auth`, `data-isolation-audit`, `pre-launch-polish` specs.
