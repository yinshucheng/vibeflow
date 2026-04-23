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
#
# ──────────────────────────────────────────────────────────────────
# iOS 开发基础概念（给非 iOS 开发者）
# ──────────────────────────────────────────────────────────────────
#
# Expo 是 React Native 的上层框架，简化了原生开发流程。
# 核心命令解释：
#
# 1. npx expo prebuild [--clean] --platform ios
#    ├── 作用: 根据 app.config.ts 生成原生 ios/ 目录（Xcode 项目）
#    ├── 首次运行或 native 配置变更时必须执行
#    │
#    ├── 无 --clean（增量模式）
#    │   ├── 只更新变化的配置，复用已有文件
#    │   ├── 耗时: 10-30 秒
#    │   └── 适用: 日常开发、JS 代码变更
#    │
#    └── 有 --clean（完全重建）
#        ├── 删除整个 ios/ 目录，从零重新生成
#        ├── 耗时: 2-5 分钟（需重新 pod install）
#        └── 适用: 添加/删除 native module、改 bundle ID、升级 SDK、诡异构建错误
#
# 2. pod install（在 ios/ 目录执行）
#    ├── 作用: 安装 iOS 原生依赖（类似 npm install）
#    ├── CocoaPods 是 iOS 的包管理器
#    ├── 首次: 下载所有依赖，耗时 1-3 分钟
#    └── 增量: 只更新变化的依赖，耗时 10-30 秒
#
# 3. npx expo run:ios --device
#    ├── 作用: 编译 Xcode 项目 + 安装到真机 + 启动 Metro bundler
#    ├── --device: 部署到 USB 连接的真机（非模拟器）
#    ├── --configuration Release: 发布版本（JS 打包进 app，不需要 Metro）
#    └── 耗时: 首次 3-5 分钟，增量 30-60 秒
#
# 4. Metro bundler
#    ├── 作用: JS/TS 代码的开发服务器（类似 webpack dev server）
#    ├── 监听 8081 端口，提供 Hot Reload
#    └── Debug 模式下 app 从 Metro 加载 JS，Release 模式下 JS 打包进 app
#
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
# prebuild 策略:
#   - ios/ 不存在: 首次生成，必须 --clean（实际上无影响，因为没东西可删）
#   - ios/ 存在但缺少关键文件: 可能被破坏，用 --clean 重建
#   - ios/ 存在但缺少关键文件: 可能被破坏，用 --clean 重建
#   - ios/ 完整存在: 跳过 prebuild（用户可手动 npx expo prebuild 增量更新）
#
# 如果需要强制重建（如改了 native module），手动执行:
#   npx expo prebuild --clean --platform ios
if [ ! -d "ios" ] || [ ! -f "ios/Podfile" ] || [ ! -f "ios/vibeflowios.xcworkspace/contents.xcworkspacedata" ]; then
  echo "[1/5] Running prebuild (generating ios/ directory)..."
  echo "      This takes 2-5 minutes on first run..."
  npx expo prebuild --clean --platform ios 2>&1 | tail -10
else
  echo "[1/5] ios/ directory exists, skipping prebuild"
  echo "      (To force rebuild: npx expo prebuild --clean --platform ios)"
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
