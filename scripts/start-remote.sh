#!/bin/bash
# =============================================================================
# Start VibeFlow clients connected to the remote (production) server
# Usage:
#   ./scripts/start-remote.sh desktop   # Start desktop client
#   ./scripts/start-remote.sh ios       # Start iOS client
#   ./scripts/start-remote.sh all       # Start both
# =============================================================================

SERVER_IP="39.105.213.147"
SERVER_PORT="4000"
SERVER_URL="http://${SERVER_IP}:${SERVER_PORT}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

start_desktop() {
    echo "Starting Desktop client → $SERVER_URL"
    cd "$ROOT_DIR/vibeflow-desktop"
    VIBEFLOW_SERVER_URL="$SERVER_URL" npm run dev
}

start_ios() {
    echo "Starting iOS client → $SERVER_URL"
    cd "$ROOT_DIR/vibeflow-ios"
    EXPO_PUBLIC_SERVER_HOST="$SERVER_IP" EXPO_PUBLIC_SERVER_PORT="$SERVER_PORT" npx expo start --port 8081
}

case "${1:-all}" in
    desktop|d)
        start_desktop
        ;;
    ios|i)
        start_ios
        ;;
    all|a)
        echo "Starting Desktop + iOS → $SERVER_URL"
        echo ""
        start_desktop &
        DESKTOP_PID=$!
        sleep 3
        start_ios &
        IOS_PID=$!
        echo ""
        echo "Desktop PID: $DESKTOP_PID, iOS PID: $IOS_PID"
        echo "Press Ctrl+C to stop both"
        trap "kill $DESKTOP_PID $IOS_PID 2>/dev/null" EXIT
        wait
        ;;
    *)
        echo "Usage: $0 [desktop|ios|all]"
        exit 1
        ;;
esac
