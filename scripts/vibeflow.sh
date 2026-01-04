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

# Start command
cmd_start() {
    print_info "Starting VibeFlow services..."
    echo ""
    
    check_pm2
    
    # Check for port conflicts
    if check_port $BACKEND_PORT; then
        local process_info=$(get_port_process $BACKEND_PORT)
        print_error "Port $BACKEND_PORT is already in use by: $process_info"
        print_warning "Please stop the conflicting process or use a different port (VIBEFLOW_PORT=xxxx)"
        exit 1
    fi
    
    # Start backend with PM2
    print_info "Starting backend server on port $BACKEND_PORT..."
    cd "$PROJECT_DIR"
    
    # Check if ecosystem.config.js exists
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --env production
    else
        pm2 start npm --name "$PM2_NAME" -- run start
    fi
    
    # Wait for backend to be healthy
    print_info "Waiting for backend to be ready..."
    if check_backend_health; then
        print_success "Backend server started successfully"
    else
        print_warning "Backend started but health check failed. Check logs with: vibeflow logs"
    fi
    
    # Start desktop app
    print_info "Starting desktop application..."
    if [ -d "/Applications/$DESKTOP_APP_NAME.app" ]; then
        open -a "$DESKTOP_APP_NAME"
        sleep 2
        if is_desktop_running; then
            print_success "Desktop application started successfully"
        else
            print_warning "Desktop application may not have started. Check manually."
        fi
    elif [ -d "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app" ]; then
        open "$PROJECT_DIR/vibeflow-desktop/release/mac-arm64/$DESKTOP_APP_NAME.app"
        sleep 2
        if is_desktop_running; then
            print_success "Desktop application started successfully"
        else
            print_warning "Desktop application may not have started. Check manually."
        fi
    else
        print_warning "Desktop application not found. Build it first with: cd vibeflow-desktop && npm run build"
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

# Help command
cmd_help() {
    echo ""
    echo "VibeFlow Service Management"
    echo ""
    echo "Usage: vibeflow <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start     Start all VibeFlow services (backend + desktop)"
    echo "  stop      Stop all VibeFlow services"
    echo "  restart   Restart all VibeFlow services"
    echo "  status    Show status of all services"
    echo "  logs      Show backend server logs (default: last 100 lines)"
    echo "  help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  VIBEFLOW_PORT    Backend server port (default: 3000)"
    echo ""
    echo "Examples:"
    echo "  vibeflow start              # Start all services"
    echo "  vibeflow status             # Check service status"
    echo "  vibeflow logs 50            # Show last 50 log lines"
    echo "  VIBEFLOW_PORT=3001 vibeflow start  # Start on custom port"
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
    help|--help|-h)
        cmd_help
        ;;
    *)
        print_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
