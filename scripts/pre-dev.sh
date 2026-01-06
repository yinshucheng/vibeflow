#!/bin/bash
# 开发环境启动前检测：停止生产服务或已有的开发服务

PM2_NAME="vibeflow-backend"
PORT="${PORT:-3000}"

# 停止 PM2 生产服务
if command -v pm2 &> /dev/null && pm2 describe "$PM2_NAME" &> /dev/null; then
    status=$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"$PM2_NAME\"[^}]*\"status\":\"[^\"]*\"" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$status" = "online" ]; then
        echo "检测到生产服务正在运行，正在停止..."
        pm2 stop "$PM2_NAME"
        echo "生产服务已停止"
    fi
fi

# 停止已有的开发服务（幂等操作）
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "检测到端口 $PORT 被占用，正在停止..."
    lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "已停止"
fi
