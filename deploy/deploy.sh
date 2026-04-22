#!/bin/bash
# =============================================================================
# VibeFlow Deploy Script
#
# Usage:
#   ./deploy/deploy.sh              # Full deploy (no-cache build)
#   ./deploy/deploy.sh --cached     # Use Docker layer cache (faster, but risky)
#   ./deploy/deploy.sh --skip-build # Skip Docker build (only sync + restart)
#
# What it does:
#   1. Pre-flight checks (sankuai npm source, uncommitted changes)
#   2. tar + scp project to server
#   3. Docker build (--no-cache by default)
#   4. Prisma db push + restart container
#   5. Nginx config update
#   6. Health check with retry
# =============================================================================
set -e

# ===== Config =====
REMOTE="cloud"
REMOTE_DIR="~/vibeflow"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HEALTH_URL="http://localhost:4000/api/health"
HEALTH_RETRIES=6
HEALTH_INTERVAL=5

# ===== Parse args =====
USE_CACHE=false
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --cached)    USE_CACHE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--cached] [--skip-build]"
      echo "  --cached      Use Docker layer cache (faster, risky after tsc changes)"
      echo "  --skip-build  Skip Docker build, only sync files + restart"
      exit 0
      ;;
  esac
done

# ===== Colors =====
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }

echo ""
echo "=========================================="
echo "  VibeFlow Deploy"
echo "=========================================="
echo "  Local:  $LOCAL_DIR"
echo "  Remote: $REMOTE:$REMOTE_DIR"
echo "  Cache:  $([ "$USE_CACHE" = true ] && echo 'enabled (--cached)' || echo 'disabled (--no-cache)')"
echo "  Build:  $([ "$SKIP_BUILD" = true ] && echo 'skipped (--skip-build)' || echo 'enabled')"
echo ""

# =============================================================================
# Pre-flight checks
# =============================================================================
log "[0/6] Pre-flight checks..."

# Check for sankuai npm sources in lockfile (will fail on Alibaba Cloud ECS)
if grep -q "sankuai.com" "$LOCAL_DIR/package-lock.json" 2>/dev/null; then
  fail "package-lock.json contains sankuai.com URLs!"
  echo "       Run: sed -i '' 's|http://r.npm.sankuai.com|https://registry.npmmirror.com|g' package-lock.json"
  exit 1
fi
ok "No sankuai.com in lockfile"

# Check for uncommitted changes (warning only)
if [ -n "$(cd "$LOCAL_DIR" && git status --porcelain -- src/ server.ts packages/ prisma/ Dockerfile docker-compose.yml 2>/dev/null)" ]; then
  warn "Uncommitted changes in src/server/packages/prisma — deploying working tree"
fi

# Verify packages/octopus-protocol exists (workspace package)
if [ ! -f "$LOCAL_DIR/packages/octopus-protocol/src/index.ts" ]; then
  fail "packages/octopus-protocol/src/index.ts not found!"
  echo "       The shared protocol package is required for build."
  exit 1
fi
ok "Workspace package exists"

# =============================================================================
# 1. Sync files to server
# =============================================================================
log "[1/6] Syncing files to server..."
TMPFILE=$(mktemp /tmp/vibeflow-deploy-XXXXXX.tar.gz)

# Common exclude list
TAR_EXCLUDES=(
    --exclude='node_modules'
    --exclude='.next'
    --exclude='./dist'
    --exclude='.env' --exclude='.env.local' --exclude='.env.dev' --exclude='.env.test' --exclude='.env.e2e' --exclude='.envs'
    --exclude='.git'
    --exclude='vibeflow-desktop' --exclude='vibeflow-extension' --exclude='vibeflow-ios' --exclude='vibeflow-app'
    --exclude='e2e' --exclude='tests' --exclude='coverage' --exclude='playwright-report' --exclude='test-results'
    --exclude='.DS_Store' --exclude='.debug'
    --exclude='.kiro' --exclude='.claude' --exclude='.claude-trace' --exclude='.serena' --exclude='.impeccable.md'
    --exclude='logs' --exclude='scripts/logs'
    --exclude='.idea' --exclude='.vscode'
    --exclude='docs' --exclude='image' --exclude='temp-next'
)

# Try with --no-mac-metadata (suppresses xattr warnings), fallback without it
tar czf "$TMPFILE" -C "$LOCAL_DIR" --no-mac-metadata "${TAR_EXCLUDES[@]}" . 2>/dev/null || \
tar czf "$TMPFILE" -C "$LOCAL_DIR" "${TAR_EXCLUDES[@]}" .

ok "Archive: $(du -h "$TMPFILE" | cut -f1)"
scp -q "$TMPFILE" "$REMOTE:/tmp/vibeflow-deploy.tar.gz"
ssh "$REMOTE" "
    mkdir -p $REMOTE_DIR
    cd $REMOTE_DIR
    tar xzf /tmp/vibeflow-deploy.tar.gz 2>/dev/null
    rm /tmp/vibeflow-deploy.tar.gz
"
rm "$TMPFILE"
ok "Files synced"

# =============================================================================
# 2. Check .env.production
# =============================================================================
log "[2/6] Checking .env.production..."
ssh "$REMOTE" "
    if [ ! -f $REMOTE_DIR/.env.production ]; then
        echo '  .env.production not found! Creating from template...'
        cp $REMOTE_DIR/.env.production.example $REMOTE_DIR/.env.production
        echo ''
        echo '  *** IMPORTANT: Edit .env.production on the server ***'
        echo '  ssh $REMOTE \"vi $REMOTE_DIR/.env.production\"'
        exit 1
    fi
"
ok ".env.production exists"

# =============================================================================
# 3. Docker build
# =============================================================================
if [ "$SKIP_BUILD" = true ]; then
  log "[3/6] Skipping Docker build (--skip-build)"
else
  log "[3/6] Building Docker image..."
  BUILD_FLAGS=""
  if [ "$USE_CACHE" = false ]; then
    BUILD_FLAGS="--no-cache"
  fi

  # Capture build time
  BUILD_START=$(date +%s)
  ssh "$REMOTE" "
      cd $REMOTE_DIR
      DOCKER_BUILDKIT=1 docker compose build $BUILD_FLAGS 2>&1 | tail -5
  "
  BUILD_END=$(date +%s)
  ok "Built in $((BUILD_END - BUILD_START))s"
fi

# =============================================================================
# 4. DB migration + restart
# =============================================================================
log "[4/6] Deploying container..."
ssh "$REMOTE" "
    cd $REMOTE_DIR
    docker compose up -d

    # Wait for container to be running
    sleep 3

    # Run Prisma db push
    echo '  Running prisma db push...'
    docker exec vibeflow npx prisma db push --skip-generate 2>&1 | tail -3

    # Restart to pick up any schema changes
    echo '  Restarting container...'
    docker compose restart
"
ok "Container deployed"

# =============================================================================
# 5. Nginx config
# =============================================================================
log "[5/6] Updating Nginx..."
ssh "$REMOTE" "
    if diff -q $REMOTE_DIR/deploy/nginx-vibeflow.conf /etc/nginx/conf.d/vibeflow.conf >/dev/null 2>&1; then
        echo '  Nginx config unchanged, skip reload'
    else
        cp $REMOTE_DIR/deploy/nginx-vibeflow.conf /etc/nginx/conf.d/vibeflow.conf
        nginx -t 2>&1 && systemctl reload nginx
        echo '  Nginx reloaded'
    fi
"
ok "Nginx OK"

# =============================================================================
# 6. Health check with retry
# =============================================================================
log "[6/6] Health check..."
HEALTHY=false
for i in $(seq 1 $HEALTH_RETRIES); do
  sleep $HEALTH_INTERVAL
  if ssh "$REMOTE" "curl -sf $HEALTH_URL > /dev/null 2>&1"; then
    HEALTHY=true
    break
  fi
  echo "  Attempt $i/$HEALTH_RETRIES — waiting ${HEALTH_INTERVAL}s..."
done

if [ "$HEALTHY" = true ]; then
  ok "Server is healthy"
else
  fail "Health check failed after $((HEALTH_RETRIES * HEALTH_INTERVAL))s"
  echo "  Check logs: ssh $REMOTE \"cd $REMOTE_DIR && docker compose logs --tail=50\""
  exit 1
fi

# =============================================================================
# Done
# =============================================================================
ECS_IP=$(ssh "$REMOTE" "curl -s ifconfig.me 2>/dev/null || echo '<server-ip>'")
echo ""
echo "=========================================="
echo -e "  ${GREEN}Deploy complete!${NC}"
echo "=========================================="
echo "  Web:    http://$ECS_IP:4000"
echo "  Logs:   ssh $REMOTE \"cd $REMOTE_DIR && docker compose logs -f\""
echo "  Stop:   ssh $REMOTE \"cd $REMOTE_DIR && docker compose down\""
echo "=========================================="
