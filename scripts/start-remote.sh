#!/bin/bash
# =============================================================================
# Start VibeFlow clients connected to the remote (production) server
#
# Usage:
#   ./scripts/start-remote.sh desktop            # Desktop dev mode (→ remote server)
#   ./scripts/start-remote.sh desktop --release  # Desktop release build (.app)
#   ./scripts/start-remote.sh ios                # iOS dev server (needs same network)
#   ./scripts/start-remote.sh ios --build        # iOS debug native build + deploy
#   ./scripts/start-remote.sh ios --release      # iOS release build (standalone)
#   ./scripts/start-remote.sh all                # Desktop + iOS dev mode
# =============================================================================

SERVER_IP="39.105.213.147"
SERVER_PORT="4000"
SERVER_URL="http://${SERVER_IP}:${SERVER_PORT}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# =============================================================================
# DESKTOP
# =============================================================================

start_desktop() {
    local flag="${1:-}"
    echo -e "Starting Desktop → ${GREEN}$SERVER_URL${NC}"
    cd "$ROOT_DIR/vibeflow-desktop"

    case "$flag" in
        --release)
            echo "  Building RELEASE .app..."
            echo "  Server URL will be hardcoded to: $SERVER_URL"
            npm run build:mac
            echo ""
            echo -e "  ${GREEN}✓${NC} Built: release/mac-arm64/VibeFlow.app"
            echo "  Opening..."
            open release/mac-arm64/VibeFlow.app
            ;;
        *)
            VIBEFLOW_SERVER_URL="$SERVER_URL" npm run dev
            ;;
    esac
}

# =============================================================================
# iOS
# =============================================================================

start_ios() {
    local flag="${1:-}"
    echo -e "Starting iOS → ${GREEN}$SERVER_URL${NC}"
    cd "$ROOT_DIR/vibeflow-ios"

    # Kill stale expo processes on port 8081
    lsof -i :8081 -t 2>/dev/null | xargs kill -9 2>/dev/null

    # Common env vars (baked into JS bundle at build time)
    export EXPO_PUBLIC_SERVER_HOST="$SERVER_IP"
    export EXPO_PUBLIC_SERVER_PORT="$SERVER_PORT"

    # Auto-detect available iOS device name
    local device_name
    device_name=$(xcrun devicectl list devices 2>/dev/null | grep -E 'connected|available' | grep -v 'unavailable' | grep -i 'iphone' | head -1 | awk -F'  +' '{print $1}' | xargs)
    local device_flag="--device"
    if [ -n "$device_name" ]; then
        device_flag="--device \"$device_name\""
        echo "  Device: $device_name"
    fi

    case "$flag" in
        --release)
            # Release build: clean prebuild to ensure latest JS + native config
            echo "  Building RELEASE → device (standalone, no Metro needed)"
            echo -e "  ${YELLOW}Running clean prebuild to ensure latest code...${NC}"
            npx expo prebuild --platform ios --clean
            echo "  Building... (this takes a few minutes)"
            eval npx expo run:ios $device_flag --configuration Release
            ;;
        --build)
            # Debug build: clean prebuild + debug config
            echo "  Building DEBUG → device (needs Metro on same network)"
            echo -e "  ${YELLOW}Running clean prebuild to ensure latest code...${NC}"
            npx expo prebuild --platform ios --clean
            eval npx expo run:ios $device_flag --port 8081
            ;;
        *)
            # Dev server only: fastest, Dev Client already on device
            echo "  Starting dev server (Dev Client connects from same network)"
            echo "  Flags: --build (debug native build), --release (standalone build)"
            npx expo start --port 8081 --ios
            ;;
    esac
}

# =============================================================================
# MAIN
# =============================================================================

case "${1:-}" in
    desktop|d)
        start_desktop "${2:-}"
        ;;
    ios|i)
        start_ios "${2:-}"
        ;;
    all|a)
        echo -e "Starting Desktop + iOS → ${GREEN}$SERVER_URL${NC}"
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
        echo "Usage: $0 <client> [flags]"
        echo ""
        echo "Clients:"
        echo "  desktop, d     Desktop (Electron)"
        echo "  ios, i         iOS (Expo)"
        echo "  all, a         Both"
        echo ""
        echo "Desktop flags:"
        echo "  (none)         Dev mode with hot reload"
        echo "  --release      Build .app and open"
        echo ""
        echo "iOS flags:"
        echo "  (none)         Dev server only (fast, needs Dev Client installed)"
        echo "  --build        Clean prebuild + debug build + deploy to device"
        echo "  --release      Clean prebuild + release build (standalone)"
        echo ""
        echo "Server: $SERVER_URL"
        exit 1
        ;;
esac
