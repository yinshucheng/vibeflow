#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# run-device.sh — Idempotent build & deploy to iOS real device
#
# Every invocation: install deps → pod install → clean build → run
# Safe to re-execute at any time.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$IOS_ROOT"

# ── 1. Detect Mac LAN IP ────────────────────────────────────────
LAN_IP="${EXPO_PUBLIC_SERVER_HOST:-$(ipconfig getifaddr en0 2>/dev/null || echo '')}"
if [ -z "$LAN_IP" ]; then
  echo "❌ Cannot detect LAN IP. Set EXPO_PUBLIC_SERVER_HOST manually."
  exit 1
fi
export EXPO_PUBLIC_SERVER_HOST="$LAN_IP"
export EXPO_PUBLIC_SERVER_PORT="${EXPO_PUBLIC_SERVER_PORT:-3000}"

echo "═══════════════════════════════════════════"
echo "📱 VibeFlow iOS — Build & Deploy to Device"
echo "═══════════════════════════════════════════"
echo "  Server: http://${LAN_IP}:${EXPO_PUBLIC_SERVER_PORT}"
echo ""

# ── 2. Install JS dependencies (idempotent) ─────────────────────
echo "📦 Installing npm dependencies..."
npm install --prefer-offline --no-audit --no-fund 2>&1 | tail -1

# ── 3. Install CocoaPods (idempotent) ───────────────────────────
echo "🍫 Installing CocoaPods..."
cd ios
pod install 2>&1 | tail -3
cd ..

# ── 4. Clean previous build artifacts ───────────────────────────
echo "🧹 Cleaning previous build..."
DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
# Only clean vibeflowios builds, not everything
find "$DERIVED" -maxdepth 1 -name 'vibeflowios-*' -type d -exec rm -rf {} + 2>/dev/null || true

# ── 5. Build & run on device ────────────────────────────────────
echo "🔨 Building and deploying to device..."
echo ""
npx expo run:ios --device --no-install
