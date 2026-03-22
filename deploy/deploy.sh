#!/bin/bash
# =============================================================================
# VibeFlow Manual Deploy Script
# Usage: ./deploy/deploy.sh
# =============================================================================
set -e

# Config
REMOTE="cloud"
REMOTE_DIR="~/vibeflow"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "  VibeFlow Deploy"
echo "=========================================="
echo "  Local:  $LOCAL_DIR"
echo "  Remote: $REMOTE:$REMOTE_DIR"
echo ""

# 1. Sync files to server (use tar + scp, server has no rsync)
echo "[1/5] Syncing files to server..."
TMPFILE=$(mktemp /tmp/vibeflow-deploy-XXXXXX.tar.gz)
tar czf "$TMPFILE" -C "$LOCAL_DIR" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.dev' \
    --exclude='.env.test' \
    --exclude='.env.e2e' \
    --exclude='.envs' \
    --exclude='.git' \
    --exclude='vibeflow-desktop' \
    --exclude='vibeflow-extension' \
    --exclude='vibeflow-ios' \
    --exclude='vibeflow-app' \
    --exclude='e2e' \
    --exclude='tests' \
    --exclude='coverage' \
    --exclude='playwright-report' \
    --exclude='test-results' \
    --exclude='.DS_Store' \
    --exclude='.debug' \
    --exclude='.kiro' \
    --exclude='.claude' \
    --exclude='.claude-trace' \
    --exclude='.serena' \
    --exclude='logs' \
    --exclude='.idea' \
    --exclude='.vscode' \
    --exclude='docs' \
    --exclude='image' \
    --exclude='temp-next' \
    .

echo "  Archive: $(du -h "$TMPFILE" | cut -f1)"
scp "$TMPFILE" "$REMOTE:/tmp/vibeflow-deploy.tar.gz"
ssh "$REMOTE" "
    mkdir -p $REMOTE_DIR
    cd $REMOTE_DIR
    # Preserve .env.production
    tar xzf /tmp/vibeflow-deploy.tar.gz
    rm /tmp/vibeflow-deploy.tar.gz
"
rm "$TMPFILE"
echo "  Done."

# 2. Check .env.production exists on server
echo ""
echo "[2/5] Checking .env.production on server..."
ssh "$REMOTE" "
    if [ ! -f $REMOTE_DIR/.env.production ]; then
        echo '  .env.production not found!'
        echo '  Creating from template...'
        cp $REMOTE_DIR/.env.production.example $REMOTE_DIR/.env.production
        echo ''
        echo '  *** IMPORTANT: Edit .env.production on the server ***'
        echo '  Run: ssh $REMOTE \"vi $REMOTE_DIR/.env.production\"'
        exit 1
    fi
    echo '  .env.production exists.'
"

# 3. Build Docker image on server
echo ""
echo "[3/5] Building Docker image on server..."
ssh "$REMOTE" "
    cd $REMOTE_DIR
    DOCKER_BUILDKIT=1 docker compose build
"
echo "  Done."

# 4. Run DB migrations + restart container
echo ""
echo "[4/5] Deploying..."
ssh "$REMOTE" "
    cd $REMOTE_DIR
    docker compose up -d
    echo '  Running prisma db push...'
    docker exec vibeflow npx prisma db push --skip-generate 2>&1 | tail -3
    echo '  Restarting container...'
    docker compose restart
"
echo "  Done."

# 5. Update Nginx config
echo ""
echo "[5/5] Updating Nginx config..."
ssh "$REMOTE" "
    cp $REMOTE_DIR/deploy/nginx-vibeflow.conf /etc/nginx/conf.d/vibeflow.conf
    nginx -t && systemctl reload nginx
    echo '  Nginx reloaded.'
"

# Wait and health check
echo ""
echo "Waiting for container to start..."
sleep 15

echo "Health check..."
ssh "$REMOTE" "
    if curl -sf http://localhost:4000/ > /dev/null 2>&1; then
        echo '  VibeFlow is running!'
    else
        echo '  Container may still be starting. Check logs:'
        echo '  ssh $REMOTE \"cd $REMOTE_DIR && docker compose logs -f\"'
    fi
"

ECS_IP=$(ssh "$REMOTE" "curl -s ifconfig.me 2>/dev/null || echo '<server-ip>'")
echo ""
echo "=========================================="
echo "  Deploy complete!"
echo "=========================================="
echo "  Web:    http://$ECS_IP:4000"
echo "  Logs:   ssh $REMOTE \"cd $REMOTE_DIR && docker compose logs -f\""
echo "  Stop:   ssh $REMOTE \"cd $REMOTE_DIR && docker compose down\""
echo "=========================================="
