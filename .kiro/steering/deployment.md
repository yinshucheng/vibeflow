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

## Client Connection

### Local development (default)
All clients connect to `localhost:3000`, using local PostgreSQL. No special config needed.

### Remote server

```bash
# Desktop
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
| Desktop | electron-store + env var | `VIBEFLOW_SERVER_URL` |
| Extension | chrome.storage.local | Popup UI "Server URL" field |
| iOS | Expo env vars (baked at build) | `EXPO_PUBLIC_SERVER_HOST`, `EXPO_PUBLIC_SERVER_PORT` |

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
