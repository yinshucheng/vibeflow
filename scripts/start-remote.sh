#!/bin/bash
# =============================================================================
# Start VibeFlow clients connected to the remote (production) server
# Usage:
#   ./scripts/start-remote.sh desktop          # Start desktop client
#   ./scripts/start-remote.sh ios              # Start iOS (dev server, needs same network)
#   ./scripts/start-remote.sh ios --build      # Build debug + deploy to device
#   ./scripts/start-remote.sh ios --release    # Build release (standalone, no Metro needed)
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
    local flag="${2:-}"
    echo "Starting iOS → $SERVER_URL"
    cd "$ROOT_DIR/vibeflow-ios"

    # Kill stale expo processes on port 8081
    lsof -i :8081 -t 2>/dev/null | xargs kill -9 2>/dev/null

    # Common env vars (baked into JS bundle at build time)
    export EXPO_PUBLIC_SERVER_HOST="$SERVER_IP"
    export EXPO_PUBLIC_SERVER_PORT="$SERVER_PORT"

    # Auto-detect available iOS device name for non-interactive mode
    # Matches "connected" (USB) or "available (paired)" (WiFi) — excludes "unavailable"
    local device_name
    device_name=$(xcrun devicectl list devices 2>/dev/null | grep -E 'connected|available' | grep -v 'unavailable' | grep -i 'iphone' | head -1 | awk -F'  +' '{print $1}' | xargs)
    local device_flag="--device"
    if [ -n "$device_name" ]; then
        device_flag="--device \"$device_name\""
        echo "  Device: $device_name"
    fi

    case "$flag" in
        --release)
            # Release build: JS bundle embedded, works without Metro/computer
            echo "  Building RELEASE → device (standalone, no Metro needed)"
            echo "  This takes a few minutes..."
            eval npx expo run:ios $device_flag --configuration Release
            ;;
        --build)
            # Debug build: needs Metro but native code is fresh
            echo "  Building DEBUG → device (needs Metro on same network)"
            eval npx expo run:ios $device_flag --port 8081
            ;;
        *)
            # Dev server only: fastest, Dev Client already on device
            echo "  Starting dev server (Dev Client connects from same network)"
            echo "  Flags: --build (debug native build), --release (standalone build)"
            npx expo start --port 8081
            ;;
    esac
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
        echo ""
        echo "iOS flags:"
        echo "  (none)      Dev server only (fast, needs same network)"
        echo "  --build     Debug native build + deploy to device"
        echo "  --release   Release build (standalone, works anywhere)"
        exit 1
        ;;
esac
