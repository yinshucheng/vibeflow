#!/bin/bash
#
# VibeFlow Guardian - 自动恢复守护进程
#
# 功能：检测 VibeFlow 服务状态，自动恢复崩溃或重启后的服务
# 由 launchd 定期调用
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VIBEFLOW_DIR="$HOME/.vibeflow"
PAUSE_FILE="$VIBEFLOW_DIR/guardian.pause"
LOG_FILE="$VIBEFLOW_DIR/guardian.log"
PM2_NAME="vibeflow-backend"
DESKTOP_APP_NAME="VibeFlow"
BACKEND_PORT="${VIBEFLOW_PORT:-3000}"

# 确保目录存在
mkdir -p "$VIBEFLOW_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 检查是否暂停
is_paused() {
    if [ -f "$PAUSE_FILE" ]; then
        local expire_time=$(cat "$PAUSE_FILE" 2>/dev/null)
        local current_time=$(date +%s)
        if [ -n "$expire_time" ] && [ "$current_time" -lt "$expire_time" ]; then
            return 0  # 暂停中
        else
            rm -f "$PAUSE_FILE"  # 已过期，删除
        fi
    fi
    return 1  # 未暂停
}

# 检查后端是否运行（任意方式：PM2 或开发服务器）
is_backend_running() {
    # 检查端口是否被占用
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# 检查桌面应用是否运行（只检测生产版 .app）
is_desktop_running() {
    pgrep -f "$DESKTOP_APP_NAME.app" > /dev/null 2>&1
}

# 启动后端
start_backend() {
    log "Starting backend..."
    cd "$PROJECT_DIR"
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --env production >> "$LOG_FILE" 2>&1
    else
        pm2 start npm --name "$PM2_NAME" -- run start >> "$LOG_FILE" 2>&1
    fi
}

# 启动桌面应用
start_desktop() {
    log "Starting desktop..."
    if [ -d "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app" ]; then
        open "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app"
    elif [ -d "$PROJECT_DIR/vibeflow-desktop/release/mac-x64/$DESKTOP_APP_NAME.app" ]; then
        open "$PROJECT_DIR/vibeflow-desktop/release/mac-x64/$DESKTOP_APP_NAME.app"
    elif [ -d "/Applications/$DESKTOP_APP_NAME.app" ]; then
        open -a "$DESKTOP_APP_NAME"
    else
        log "Desktop app not found"
        return 1
    fi
}

# 主逻辑
main() {
    # 检查暂停状态
    if is_paused; then
        log "Guardian paused, skipping"
        exit 0
    fi

    # 检查并启动后端（如果端口没被占用）
    if ! is_backend_running; then
        log "Backend not running, starting..."
        start_backend
        sleep 5
    fi

    # 检查并启动桌面
    if ! is_desktop_running; then
        log "Desktop not running, starting..."
        start_desktop
    fi
}

main
