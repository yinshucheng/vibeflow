#!/bin/bash
#
# VibeFlow Service Management Script
# 
# Usage: vibeflow {start|stop|restart|status|logs}
#
# This script manages the VibeFlow backend server and desktop application.
# Requirements: PM2 must be installed globally (npm install -g pm2)
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PM2_NAME="vibeflow-backend"
DESKTOP_APP_NAME="VibeFlow"
BACKEND_PORT="${VIBEFLOW_PORT:-3000}"
HEALTH_CHECK_URL="http://localhost:${BACKEND_PORT}/api/health"
VIBEFLOW_DIR="$HOME/.vibeflow"
PAUSE_FILE="$VIBEFLOW_DIR/guardian.pause"
GUARDIAN_PLIST="com.vibeflow.guardian"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$GUARDIAN_PLIST.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_info() {
    echo -e "${BLUE}→${NC} $1"
}

# Check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Please install it with: npm install -g pm2"
        exit 1
    fi
}

# Check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Get process using port
get_port_process() {
    local port=$1
    lsof -Pi :$port -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $1 " (PID: " $2 ")"}'
}

# Check backend health
check_backend_health() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((attempt++))
    done
    return 1
}

# Check if desktop app is running
is_desktop_running() {
    pgrep -x "$DESKTOP_APP_NAME" > /dev/null 2>&1 || pgrep -f "vibeflow-desktop" > /dev/null 2>&1
}

# Stop dev server if running
stop_dev_if_running() {
    if check_port $BACKEND_PORT; then
        local process_info=$(get_port_process $BACKEND_PORT)
        if echo "$process_info" | grep -q "node"; then
            print_warning "检测到开发服务正在运行，正在停止..."
            # Kill node processes on the port
            lsof -ti :$BACKEND_PORT | xargs kill -9 2>/dev/null || true
            sleep 2
            print_success "开发服务已停止"
        fi
    fi
}

# Start command
cmd_start() {
    print_info "Starting VibeFlow services..."
    echo ""

    check_pm2

    # Stop dev server if running
    stop_dev_if_running

    # Stop and rebuild if production already running
    if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
        print_warning "检测到生产服务已运行，正在停止并重新构建..."
        pm2 stop "$PM2_NAME" 2>/dev/null || true
        pm2 delete "$PM2_NAME" 2>/dev/null || true
    fi

    # 确保从 main 分支构建稳定版
    cd "$PROJECT_DIR"
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --short HEAD)
    SWITCHED_FROM=""
    if [ "$CURRENT_BRANCH" != "main" ]; then
        print_info "当前分支: $CURRENT_BRANCH，切换到 main 分支构建稳定版..."
        # 保存当前工作状态
        git stash --include-untracked -m "vibeflow-build-$(date +%s)" 2>/dev/null || true
        git checkout main
        SWITCHED_FROM="$CURRENT_BRANCH"
    fi

    # Build backend
    print_info "Building backend..."
    cd "$PROJECT_DIR"
    rm -rf .next
    npm run build
    print_success "Backend built successfully"

    # Build custom server (server.ts -> dist/server.js)
    print_info "Building custom server with Socket.io..."
    npm run build:server

    # 标记这个 main commit 为已验证的稳定版
    local tag_name="stable/$(date +%Y%m%d-%H%M%S)"
    git tag -f "$tag_name" HEAD 2>/dev/null || true
    # 只保留最近 5 个 stable tag
    git tag -l 'stable/*' | sort -r | tail -n +6 | xargs git tag -d 2>/dev/null || true
    print_info "已标记为 $tag_name"

    # 恢复到原分支
    if [ -n "${SWITCHED_FROM}" ]; then
        cd "$PROJECT_DIR"
        git checkout "$SWITCHED_FROM"
        # 恢复 stash（如果有）
        if git stash list | head -1 | grep -q "vibeflow-build-"; then
            git stash pop 2>/dev/null || true
        fi
        print_info "已恢复到分支: $SWITCHED_FROM"
    fi

    # Check for port conflicts
    if check_port $BACKEND_PORT; then
        local process_info=$(get_port_process $BACKEND_PORT)
        print_error "Port $BACKEND_PORT is already in use by: $process_info"
        print_warning "Please stop the conflicting process or use a different port (VIBEFLOW_PORT=xxxx)"
        exit 1
    fi

    # Start backend with PM2
    print_info "Starting backend server on port $BACKEND_PORT..."

    # Check if ecosystem.config.js exists
    if [ -f "ecosystem.config.js" ]; then
        # Only start vibeflow-backend (the custom server with Socket.io)
        pm2 start ecosystem.config.js --only vibeflow-backend --env production
    else
        # Fallback: start the dist/server.js directly
        pm2 start dist/server.js --name "$PM2_NAME" --cwd "$PROJECT_DIR"
    fi

    # Wait for backend to be healthy
    print_info "Waiting for backend to be ready..."
    if check_backend_health; then
        print_success "Backend server started successfully"
    else
        print_warning "Backend started but health check failed. Check logs with: vibeflow logs"
    fi

    # Stop desktop app if running
    if is_desktop_running; then
        print_warning "检测到桌面应用已运行，正在停止并重新构建..."
        osascript -e "quit app \"$DESKTOP_APP_NAME\"" 2>/dev/null || pkill -f "vibeflow-desktop" 2>/dev/null || true
        sleep 2
    fi

    # Build and start desktop app
    print_info "Building desktop application..."
    cd "$PROJECT_DIR/vibeflow-desktop"
    rm -rf release
    npm run build:mac
    print_success "Desktop built successfully"

    print_info "Starting desktop application..."
    if [ -d "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app" ]; then
        open "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app"
        sleep 2
        if is_desktop_running; then
            print_success "Desktop application started successfully"
        else
            print_warning "Desktop application may not have started. Check manually."
        fi
    elif [ -d "/Applications/$DESKTOP_APP_NAME.app" ]; then
        open -a "$DESKTOP_APP_NAME"
        sleep 2
        if is_desktop_running; then
            print_success "Desktop application started successfully"
        else
            print_warning "Desktop application may not have started. Check manually."
        fi
    else
        print_error "Desktop build failed"
    fi

    echo ""
    print_success "VibeFlow services started"
}

# Stop command
cmd_stop() {
    print_info "Stopping VibeFlow services..."
    echo ""
    
    check_pm2
    
    # Stop backend
    print_info "Stopping backend server..."
    if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
        pm2 stop "$PM2_NAME"
        print_success "Backend server stopped"
    else
        print_warning "Backend server was not running"
    fi
    
    # Stop desktop app
    print_info "Stopping desktop application..."
    if is_desktop_running; then
        osascript -e "quit app \"$DESKTOP_APP_NAME\"" 2>/dev/null || pkill -f "vibeflow-desktop" 2>/dev/null || true
        sleep 1
        if ! is_desktop_running; then
            print_success "Desktop application stopped"
        else
            print_warning "Desktop application may still be running"
        fi
    else
        print_warning "Desktop application was not running"
    fi
    
    echo ""
    print_success "VibeFlow services stopped"
}

# Restart command
cmd_restart() {
    print_info "Restarting VibeFlow services..."
    echo ""
    
    cmd_stop
    echo ""
    sleep 2
    cmd_start
}

# Status command
cmd_status() {
    echo ""
    echo "=== VibeFlow Service Status ==="
    echo ""
    
    check_pm2
    
    # Backend status
    echo -e "${BLUE}Backend Server:${NC}"
    if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
        local status=$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"$PM2_NAME\"[^}]*\"status\":\"[^\"]*\"" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [ "$status" = "online" ]; then
            print_success "Running (PM2: $PM2_NAME)"
            
            # Health check
            if curl -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
                print_success "Health check: OK"
            else
                print_warning "Health check: Failed"
            fi
        else
            print_warning "Status: $status"
        fi
    else
        print_error "Not running"
    fi
    
    # Port status
    if check_port $BACKEND_PORT; then
        print_info "Port $BACKEND_PORT: In use"
    else
        print_info "Port $BACKEND_PORT: Free"
    fi
    
    echo ""
    
    # Desktop app status
    echo -e "${BLUE}Desktop Application:${NC}"
    if is_desktop_running; then
        print_success "Running"
        local pid=$(pgrep -x "$DESKTOP_APP_NAME" 2>/dev/null || pgrep -f "vibeflow-desktop" 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
            print_info "PID: $pid"
        fi
    else
        print_error "Not running"
    fi
    
    echo ""
    
    # Guardian status
    echo -e "${BLUE}Process Guardian:${NC}"
    if launchctl list 2>/dev/null | grep -q "com.vibeflow.guardian"; then
        print_success "Registered with launchd"
    else
        print_warning "Not registered with launchd"
    fi
    
    echo ""
}

# Logs command
cmd_logs() {
    check_pm2
    
    local lines="${2:-100}"
    
    echo "=== VibeFlow Backend Logs (last $lines lines) ==="
    echo ""
    
    if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
        pm2 logs "$PM2_NAME" --lines "$lines" --nostream
    else
        print_error "Backend server is not running. Start it first with: vibeflow start"
        exit 1
    fi
}

# Pause command - 暂停 Guardian 自动恢复
cmd_pause() {
    mkdir -p "$VIBEFLOW_DIR"
    local minutes="${2:-60}"

    # 最多 60 分钟
    if [ "$minutes" -gt 60 ]; then
        print_warning "最多暂停 60 分钟，已自动调整"
        minutes=60
    fi

    local expire_time=$(($(date +%s) + minutes * 60))
    echo "$expire_time" > "$PAUSE_FILE"

    print_success "Guardian 已暂停 $minutes 分钟"
    print_info "到期时间: $(date -r $expire_time '+%H:%M:%S')"
    print_info "使用 'vibeflow resume' 可提前恢复"
}

# Resume command - 恢复 Guardian
cmd_resume() {
    if [ -f "$PAUSE_FILE" ]; then
        rm -f "$PAUSE_FILE"
        print_success "Guardian 已恢复"
    else
        print_warning "Guardian 未处于暂停状态"
    fi
}

# Rollback command - 回滚到指定的稳定版本
cmd_rollback() {
    local target="${2:-}"
    cd "$PROJECT_DIR"

    check_pm2

    if [ -z "$target" ]; then
        target=$(git tag -l 'stable/*' --sort=-creatordate | head -1)
        if [ -z "$target" ]; then
            print_error "没有找到稳定版本 tag，请先运行 vibeflow start"
            exit 1
        fi
    fi
    print_info "回滚到 $target ..."

    # 保存当前分支
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --short HEAD)
    git stash --include-untracked -m "vibeflow-rollback-$(date +%s)" 2>/dev/null || true
    git checkout "$target"

    # 重新构建并启动
    cmd_stop
    sleep 2

    print_info "Building backend from $target ..."
    rm -rf .next
    npm run build
    npm run build:server

    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --only vibeflow-backend --env production
    else
        pm2 start dist/server.js --name "$PM2_NAME" --cwd "$PROJECT_DIR"
    fi

    if check_backend_health; then
        print_success "回滚成功，稳定版已恢复到 $target"
    else
        print_error "回滚后健康检查失败，请检查日志"
    fi

    # 恢复到原分支（不影响已编译的 dist/）
    git checkout "$CURRENT_BRANCH" 2>/dev/null || true
    if git stash list | head -1 | grep -q "vibeflow-rollback-"; then
        git stash pop 2>/dev/null || true
    fi
}

# Guardian install command
cmd_guardian_install() {
    print_info "安装 Guardian 守护进程..."

    mkdir -p "$HOME/Library/LaunchAgents"
    mkdir -p "$VIBEFLOW_DIR"

    # 生成 plist 文件
    local guardian_path="$SCRIPT_DIR/guardian.sh"
    sed -e "s|GUARDIAN_PATH|$guardian_path|g" \
        -e "s|LOG_PATH|$VIBEFLOW_DIR|g" \
        "$SCRIPT_DIR/com.vibeflow.guardian.plist" > "$LAUNCHD_PLIST"

    # 加载到 launchd
    launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
    launchctl load "$LAUNCHD_PLIST"

    print_success "Guardian 已安装并启动"
    print_info "服务将在系统重启后自动运行"
    print_info "每 30 秒检测一次服务状态"
}

# Guardian uninstall command
cmd_guardian_uninstall() {
    print_info "卸载 Guardian 守护进程..."

    if [ -f "$LAUNCHD_PLIST" ]; then
        launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
        rm -f "$LAUNCHD_PLIST"
        print_success "Guardian 已卸载"
    else
        print_warning "Guardian 未安装"
    fi
}

# Help command
cmd_help() {
    echo ""
    echo "VibeFlow Service Management"
    echo ""
    echo "Usage: vibeflow <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start     Start all VibeFlow services (backend + desktop)"
    echo "              Always builds from main branch regardless of current checkout"
    echo "  stop      Stop all VibeFlow services"
    echo "  restart   Restart all VibeFlow services"
    echo "  rollback [tag]  Rollback to a stable version (default: latest stable tag)"
    echo "  status    Show status of all services"
    echo "  logs      Show backend server logs (default: last 100 lines)"
    echo "  pause [m] Pause Guardian for m minutes (default/max: 60)"
    echo "  resume    Resume Guardian immediately"
    echo "  guardian-install    Install Guardian auto-recovery daemon"
    echo "  guardian-uninstall  Uninstall Guardian daemon"
    echo "  help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  VIBEFLOW_PORT    Backend server port (default: 3000)"
    echo ""
    echo "Examples:"
    echo "  vibeflow start              # Build from main + start all services"
    echo "  vibeflow rollback           # Rollback to latest stable tag"
    echo "  vibeflow rollback stable/20260227-143000  # Rollback to specific tag"
    echo "  vibeflow status             # Check service status"
    echo "  vibeflow logs 50            # Show last 50 log lines"
    echo "  vibeflow pause 30           # Pause Guardian for 30 minutes"
    echo ""
}

# Main command dispatcher
case "${1:-help}" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    logs)
        cmd_logs "$@"
        ;;
    pause)
        cmd_pause "$@"
        ;;
    resume)
        cmd_resume
        ;;
    guardian-install)
        cmd_guardian_install
        ;;
    guardian-uninstall)
        cmd_guardian_uninstall
        ;;
    rollback)
        cmd_rollback "$@"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        print_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
