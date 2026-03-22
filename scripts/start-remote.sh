#!/bin/bash
# =============================================================================
# Start VibeFlow clients connected to the remote (production) server
# Usage:
#   ./scripts/start-remote.sh desktop          # Start desktop client
#   ./scripts/start-remote.sh ios              # Start iOS (dev server only)
#   ./scripts/start-remote.sh ios --build      # Start iOS (native build + deploy)
#   ./scripts/start-remote.sh all              # Start both
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
    echo "Starting iOS Dev Client → $SERVER_URL"
    cd "$ROOT_DIR/vibeflow-ios"

    # Kill stale expo processes on port 8081
    lsof -i :8081 -t 2>/dev/null | xargs kill -9 2>/dev/null

    if [ "${2:-}" = "--build" ]; then
        # Full native build + deploy to device (slow, use when native code changed)
        echo "  Building native + deploying to device..."
        EXPO_PUBLIC_SERVER_HOST="$SERVER_IP" EXPO_PUBLIC_SERVER_PORT="$SERVER_PORT" npx expo run:ios --device --port 8081
    else
        # Start dev server only (fast, Dev Client already installed on device)
        echo "  Starting dev server (connect from Dev Client on device)"
        echo "  Use --build flag if native code changed"
        EXPO_PUBLIC_SERVER_HOST="$SERVER_IP" EXPO_PUBLIC_SERVER_PORT="$SERVER_PORT" npx expo start --port 8081
    fi
}

case "${1:-all}" in
    desktop|d)
        start_desktop
        ;;
    ios|i)
        start_ios "" "$2"
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
