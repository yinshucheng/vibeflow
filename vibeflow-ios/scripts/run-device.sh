#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# run-device.sh — One-command build & deploy to iOS real device
#
# Handles: IP detection → prebuild (if needed) → pod install → build → Metro
#
# Usage:
#   bash scripts/run-device.sh              # Debug build
#   bash scripts/run-device.sh --release    # Release build (JS bundled, no Metro needed)
#   bash scripts/run-device.sh --skip-build # Skip build, just start Metro (for JS-only changes)
#
# "No script URL provided" prevention:
#   This script ensures Metro is running BEFORE the app launches on device.
#   It writes the Metro host to RCTBundleURLProvider via expo run:ios,
#   which automatically sets jsLocation for the dev client.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$IOS_ROOT"

RELEASE=false
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --release) RELEASE=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

# ── 1. Detect Mac LAN IP ────────────────────────────────────────
LAN_IP="${EXPO_PUBLIC_SERVER_HOST:-$(ipconfig getifaddr en0 2>/dev/null || echo '')}"
if [ -z "$LAN_IP" ]; then
  echo "Cannot detect LAN IP. Set EXPO_PUBLIC_SERVER_HOST manually."
  exit 1
fi
export EXPO_PUBLIC_SERVER_HOST="$LAN_IP"
export EXPO_PUBLIC_SERVER_PORT="${EXPO_PUBLIC_SERVER_PORT:-3000}"
export RCT_METRO_HOST="$LAN_IP"

echo "======================================="
echo " VibeFlow iOS — Build & Deploy"
echo "======================================="
echo "  Mac IP:   $LAN_IP"
echo "  Server:   http://${LAN_IP}:${EXPO_PUBLIC_SERVER_PORT}"
echo "  Metro:    http://${LAN_IP}:8081"
echo "  Mode:     $([ "$RELEASE" = true ] && echo 'Release' || echo 'Debug')"
echo ""

if [ "$SKIP_BUILD" = true ]; then
  echo "-- Skipping build, starting Metro only --"
  echo ""
  exec npx expo start --dev-client --port 8081
fi

# ── 2. Ensure ios/ directory exists (prebuild) ──────────────────
if [ ! -d "ios" ] || [ ! -f "ios/Podfile" ]; then
  echo "[1/5] Running prebuild (generating ios/ directory)..."
  npx expo prebuild --clean --platform ios 2>&1 | tail -5
else
  echo "[1/5] ios/ directory exists, skipping prebuild"
fi

# ── 3. Install CocoaPods ────────────────────────────────────────
echo "[2/5] Installing CocoaPods..."
cd ios
if [ -f "Podfile.lock" ]; then
  pod install 2>&1 | tail -3
else
  pod install 2>&1 | tail -5
fi
cd ..

# ── 4. Clean stale DerivedData (optional, only vibeflowios) ────
echo "[3/5] Cleaning stale build artifacts..."
DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
find "$DERIVED" -maxdepth 1 -name 'vibeflowios-*' -type d -exec rm -rf {} + 2>/dev/null || true

# ── 5. Build & install to device ────────────────────────────────
# expo run:ios will:
#   - Compile the native project via xcodebuild
#   - Install the .app on the connected device
#   - Start Metro bundler automatically
#   - Configure RCTBundleURLProvider with the correct Metro host
#
# This is why we DON'T use --no-install or start Metro separately.
echo "[4/5] Building and installing to device..."
echo ""

if [ "$RELEASE" = true ]; then
  npx expo run:ios --device --configuration Release
else
  npx expo run:ios --device
fi

# expo run:ios starts Metro automatically after build.
# If it exits, Metro keeps running for Hot Reload.
echo ""
echo "======================================="
echo " Done! App installed and Metro running."
echo "======================================="
