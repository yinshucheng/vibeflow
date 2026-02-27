#!/bin/bash
# 开发环境启动前检测：只停止开发端口上的进程，不影响稳定版 (port 3000)

# 开发版使用独立端口 (默认 3100)，不再杀稳定版的 PM2 进程
DEV_PORT="${PORT:-3100}"

# 只检查开发端口，不影响稳定版 (3000)
if lsof -Pi :$DEV_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "检测到端口 $DEV_PORT 被占用，正在停止..."
    lsof -ti :$DEV_PORT | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "已停止"
fi
