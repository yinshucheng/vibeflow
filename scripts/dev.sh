#!/bin/bash
# =============================================================================
# VibeFlow 开发环境控制脚本
#
# 用法:
#   ./scripts/dev.sh [客户端...] [选项]
#
# 客户端 (可组合):
#   web, w       Web + API (默认)
#   desktop, d   桌面端 Electron
#   ios, i       iOS Expo
#   ext, e       浏览器扩展 (仅编译，需手动加载到 Chrome)
#   all, a       全部客户端
#
# 选项:
#   --remote, -r    连接远程服务器 (默认本地)
#   --build, -b     iOS: 重新编译原生代码 (Debug)
#   --release       iOS: 编译 Release 包 (独立运行，不需要 Metro)
#   --only          单独启动指定客户端，不启动 Web 后端
#
# 其他命令:
#   status, s       查看当前配置
#   logs [name]     查看日志 (web/desktop/ios)
#   stop            停止所有开发进程
#
# 示例:
#   ./scripts/dev.sh                     # Web 本地开发 (最常用)
#   ./scripts/dev.sh ios                 # Web + iOS 本地
#   ./scripts/dev.sh ios --build         # Web + iOS 本地，重新编译原生代码
#   ./scripts/dev.sh ios --remote        # iOS 连远程服务器
#   ./scripts/dev.sh ios --only          # 只启动 iOS Metro，不启动 Web
#   ./scripts/dev.sh desktop --remote    # 桌面端连远程
#   ./scripts/dev.sh desktop ios         # Web + Desktop + iOS
#   ./scripts/dev.sh ext                 # 编译扩展 (然后在 Chrome 加载 vibeflow-extension/)
#   ./scripts/dev.sh all                 # 全部本地
#   ./scripts/dev.sh all --remote        # Desktop + iOS 连远程
# =============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# =============================================================================
# 配置
# =============================================================================

LOCAL_HOST="localhost"
LOCAL_PORT="3000"
REMOTE_HOST="39.105.213.147"
REMOTE_PORT="4000"

LOG_DIR="/tmp/vibeflow-dev"
mkdir -p "$LOG_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# 工具函数
# =============================================================================

update_ios_env() {
    local host="$1"
    local port="$2"
    cat > "$ROOT_DIR/vibeflow-ios/.env" << EOF
EXPO_PUBLIC_SERVER_HOST=$host
EXPO_PUBLIC_SERVER_PORT=$port
EOF
}

get_ios_config() {
    grep "^EXPO_PUBLIC_SERVER_HOST" "$ROOT_DIR/vibeflow-ios/.env" 2>/dev/null | cut -d'=' -f2
}

kill_port() {
    local port="$1"
    lsof -i ":$port" -t 2>/dev/null | xargs kill -9 2>/dev/null || true
}

get_mac_ip() {
    ipconfig getifaddr en0 2>/dev/null || echo "localhost"
}

get_ios_device() {
    xcrun devicectl list devices 2>/dev/null | grep -E 'connected|available' | grep -v 'unavailable' | grep -i 'iphone' | head -1 | awk -F'  +' '{print $1}' | xargs
}

# iOS 智能 prebuild
# - ios/ 不存在或损坏: 执行 prebuild --clean
# - ios/ 完整存在: 跳过（增量模式，快 10 倍）
# - 强制 clean: 传第二个参数 "--clean"
ios_smart_prebuild() {
    local log_file="$1"
    local force_clean="${2:-}"
    local ios_dir="$ROOT_DIR/vibeflow-ios/ios"

    if [ "$force_clean" = "--clean" ]; then
        echo -e "  ${YELLOW}正在 prebuild --clean (强制重建)...${NC}"
        npx expo prebuild --platform ios --clean >> "$log_file" 2>&1
    elif [ ! -d "$ios_dir" ] || [ ! -f "$ios_dir/Podfile" ] || [ ! -f "$ios_dir/vibeflowios.xcworkspace/contents.xcworkspacedata" ]; then
        echo -e "  ${YELLOW}正在 prebuild (首次生成 ios/ 目录)...${NC}"
        echo "  首次构建需要 2-5 分钟，后续增量构建 30-60 秒"
        npx expo prebuild --platform ios --clean >> "$log_file" 2>&1
    else
        echo -e "  ${GREEN}ios/ 目录已存在，跳过 prebuild (增量模式)${NC}"
        echo "  (如需强制重建: ./scripts/dev.sh ios --build --clean)"
    fi

    # 执行 pod install
    if [ -d "$ios_dir" ]; then
        echo -e "  ${YELLOW}正在 pod install...${NC}"
        cd "$ios_dir"
        pod install >> "$log_file" 2>&1
        cd "$ROOT_DIR/vibeflow-ios"
    fi
}

# =============================================================================
# 状态和日志
# =============================================================================

show_status() {
    echo -e "${BLUE}=== 当前环境配置 ===${NC}"
    echo ""

    # Web
    local web_url=$(grep "^NEXTAUTH_URL" "$ROOT_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"')
    echo -e "Web:       ${GREEN}${web_url:-未配置}${NC}"

    # Desktop
    echo -e "Desktop:   ${YELLOW}dev→本地, release→远程${NC} (VIBEFLOW_SERVER_URL 可覆盖)"

    # iOS
    local ios_host=$(get_ios_config)
    local ios_port=$(grep "^EXPO_PUBLIC_SERVER_PORT" "$ROOT_DIR/vibeflow-ios/.env" 2>/dev/null | cut -d'=' -f2)
    if [ "$ios_host" = "localhost" ] || [ "$ios_host" = "127.0.0.1" ] || [[ "$ios_host" == 192.168.* ]]; then
        echo -e "iOS:       ${GREEN}$ios_host:$ios_port${NC} (本地)"
    else
        echo -e "iOS:       ${YELLOW}$ios_host:$ios_port${NC} (远程)"
    fi

    # Extension
    echo -e "Extension: ${GREEN}localhost:3000${NC} (默认，可在 popup 修改)"

    echo ""
    echo -e "${BLUE}=== 日志文件 ===${NC}"
    echo "  目录: $LOG_DIR/"
    ls -la "$LOG_DIR"/*.log 2>/dev/null | awk '{print "    " $NF " (" $5 " bytes)"}' || echo "    (暂无日志)"

    echo ""
    echo -e "${BLUE}=== 常用命令 ===${NC}"
    echo "  ./scripts/dev.sh                # Web 本地"
    echo "  ./scripts/dev.sh ios            # Web + iOS 本地"
    echo "  ./scripts/dev.sh ios --build    # Web + iOS，重新编译原生"
    echo "  ./scripts/dev.sh ios --remote   # iOS 连远程"
    echo "  ./scripts/dev.sh all            # 全部本地"
    echo "  ./scripts/dev.sh logs           # 查看日志"
}

show_logs() {
    local component="${1:-}"
    if [ -z "$component" ]; then
        echo -e "${BLUE}实时查看所有日志 ($LOG_DIR/)${NC}"
        echo "Ctrl+C 退出"
        echo ""
        tail -f "$LOG_DIR"/*.log 2>/dev/null || echo "暂无日志"
    else
        local log_file="$LOG_DIR/${component}.log"
        if [ -f "$log_file" ]; then
            echo -e "${BLUE}$log_file${NC}"
            tail -f "$log_file"
        else
            echo -e "${RED}未找到: $log_file${NC}"
            echo "可用日志:"
            ls "$LOG_DIR"/*.log 2>/dev/null || echo "  (无)"
        fi
    fi
}

stop_all() {
    echo -e "${YELLOW}停止所有开发进程...${NC}"
    kill_port 3000
    kill_port 8081
    # Kill Electron dev processes
    pkill -f "vibeflow-desktop.*electron" 2>/dev/null || true
    pkill -f "expo start" 2>/dev/null || true
    echo -e "${GREEN}✓ 已停止${NC}"
}

# =============================================================================
# 启动函数
# =============================================================================

start_web() {
    local log_file="$LOG_DIR/web.log"
    local bg="${1:-}"

    echo -e "${BLUE}[Web]${NC} localhost:3000 → $log_file"

    if lsof -i :3000 -t &>/dev/null; then
        echo -e "${YELLOW}  端口 3000 占用，正在释放...${NC}"
        kill_port 3000
        sleep 1
    fi

    echo "=== Web started at $(date) ===" > "$log_file"

    if [ "$bg" = "bg" ]; then
        npm run dev >> "$log_file" 2>&1 &
        echo $!
    else
        npm run dev 2>&1 | tee -a "$log_file"
    fi
}

start_desktop() {
    local server_url="$1"
    local bg="${2:-}"
    local mode="${3:-dev}"  # dev | release
    local log_file="$LOG_DIR/desktop.log"

    cd "$ROOT_DIR/vibeflow-desktop"

    if [ "$mode" = "release" ]; then
        local release_app="release/mac-arm64/VibeFlow.app"
        local app_dir="$release_app/Contents/Resources/app"

        if [ ! -d "$release_app" ]; then
            echo -e "${RED}[Desktop] Release app not found: $release_app${NC}"
            echo -e "${YELLOW}  Run 'cd vibeflow-desktop && npm run build' first${NC}"
            return 1
        fi

        echo -e "${BLUE}[Desktop Release]${NC} 编译 + 同步到 release app → $log_file"
        echo "=== Desktop Release started at $(date) ===" > "$log_file"

        # Compile TypeScript
        echo -e "${BLUE}[Desktop]${NC} tsc 编译中..."
        npx tsc 2>&1 | tee -a "$log_file"

        # tsc output path depends on tsconfig paths — may be dist/electron/ or
        # dist/vibeflow-desktop/electron/ (when paths maps outside the project).
        # Normalize: ensure dist/electron/ exists for package.json "main" field.
        if [ -d "dist/vibeflow-desktop/electron" ] && [ ! -f "dist/electron/main.js" ]; then
            echo -e "${BLUE}[Desktop]${NC} 修正输出路径: dist/vibeflow-desktop/ → dist/"
            rsync -a dist/vibeflow-desktop/ dist/ 2>&1 | tee -a "$log_file"
        fi

        # Sync compiled JS to release app
        echo -e "${BLUE}[Desktop]${NC} 同步 dist/ → release app..."
        rsync -a --delete dist/ "$app_dir/dist/" 2>&1 | tee -a "$log_file"
        echo -e "${GREEN}✓ 同步完成${NC}"

        # Launch release app via its binary directly (so env vars are passed)
        local electron_bin="$ROOT_DIR/vibeflow-desktop/$release_app/Contents/MacOS/VibeFlow"
        echo -e "${BLUE}[Desktop]${NC} 启动 Release app: $electron_bin"
        if [ "$bg" = "bg" ]; then
            VIBEFLOW_SERVER_URL="$server_url" "$electron_bin" >> "$log_file" 2>&1 &
            echo $!
        else
            VIBEFLOW_SERVER_URL="$server_url" "$electron_bin" 2>&1 | tee -a "$log_file"
        fi
    else
        echo -e "${BLUE}[Desktop Dev]${NC} → $server_url → $log_file"
        echo "=== Desktop Dev started at $(date) ===" > "$log_file"

        if [ "$bg" = "bg" ]; then
            VIBEFLOW_SERVER_URL="$server_url" npm run dev >> "$log_file" 2>&1 &
            echo $!
        else
            VIBEFLOW_SERVER_URL="$server_url" npm run dev 2>&1 | tee -a "$log_file"
        fi
    fi
}

start_ext() {
    local log_file="$LOG_DIR/ext.log"

    echo -e "${BLUE}[Extension]${NC} 编译中... → $log_file"
    echo "=== Extension build at $(date) ===" > "$log_file"

    cd "$ROOT_DIR/vibeflow-extension"
    npm run build >> "$log_file" 2>&1

    echo -e "${GREEN}✓ 编译完成${NC}"
    echo ""
    echo -e "加载扩展到 Chrome:"
    echo -e "  1. 打开 ${CYAN}chrome://extensions${NC}"
    echo -e "  2. 开启「开发者模式」"
    echo -e "  3. 点击「加载已解压的扩展程序」"
    echo -e "  4. 选择 ${CYAN}$ROOT_DIR/vibeflow-extension${NC}"
    echo ""
    echo -e "如已加载，点击扩展卡片上的 ${CYAN}刷新按钮${NC} 即可更新"
}

start_ext_watch() {
    local log_file="$LOG_DIR/ext.log"

    echo -e "${BLUE}[Extension]${NC} Watch 模式 → $log_file"
    echo "=== Extension watch at $(date) ===" > "$log_file"

    cd "$ROOT_DIR/vibeflow-extension"

    # 先编译一次
    npm run build >> "$log_file" 2>&1
    echo -e "${GREEN}✓ 初始编译完成${NC}"

    # 然后 watch
    npm run watch 2>&1 | tee -a "$log_file"
}

start_ios() {
    local server_host="$1"
    local server_port="$2"
    local mode="${3:-dev}"  # dev | build | release
    local bg="${4:-}"
    local clean="${5:-}"  # "--clean" 或空
    local target="${6:-device}"  # device | simulator
    local log_file="$LOG_DIR/ios.log"

    # Update iOS env
    update_ios_env "$server_host" "$server_port"

    local target_label="真机"
    [ "$target" = "simulator" ] && target_label="模拟器"

    echo -e "${BLUE}[iOS]${NC} → $server_host:$server_port (mode: $mode, target: $target_label) → $log_file"

    kill_port 8081
    echo "=== iOS started at $(date) (mode: $mode, target: $target) ===" > "$log_file"

    cd "$ROOT_DIR/vibeflow-ios"

    # 确定设备参数
    local device_flag=""
    if [ "$target" = "simulator" ]; then
        # 模拟器：不加 --device 参数，expo 默认启动模拟器
        device_flag=""
        echo -e "  目标: ${CYAN}iOS 模拟器${NC}"
    else
        # 真机：检测连接的设备
        local device_name=$(get_ios_device)
        if [ -n "$device_name" ]; then
            device_flag="--device \"$device_name\""
            echo -e "  目标: ${CYAN}$device_name${NC} (真机)"
        else
            device_flag="--device"
            echo -e "  目标: ${YELLOW}真机 (未检测到设备名，将提示选择)${NC}"
        fi
    fi

    case "$mode" in
        release)
            echo -e "  ${YELLOW}编译 Release 包 (独立运行，不需要 Metro)${NC}"
            ios_smart_prebuild "$log_file" "$clean"  # 智能增量，除非指定 --clean
            echo "  编译中..."
            eval npx expo run:ios $device_flag --configuration Release 2>&1 | tee -a "$log_file"
            ;;
        build)
            echo -e "  ${YELLOW}编译 Debug 包 (需要 Metro)${NC}"
            ios_smart_prebuild "$log_file" "$clean"
            echo "  编译中..."
            if [ "$bg" = "bg" ]; then
                eval npx expo run:ios $device_flag --port 8081 >> "$log_file" 2>&1 &
                echo $!
            else
                eval npx expo run:ios $device_flag --port 8081 2>&1 | tee -a "$log_file"
            fi
            ;;
        dev|*)
            echo -e "  Dev Server 模式 (需要设备上已安装 Dev Client)"
            if [ "$bg" = "bg" ]; then
                npx expo start --port 8081 --ios >> "$log_file" 2>&1 &
                echo $!
            else
                npx expo start --port 8081 --ios 2>&1 | tee -a "$log_file"
            fi
            ;;
    esac
}

# =============================================================================
# 解析参数
# =============================================================================

CLIENTS=()
REMOTE_FLAG=""
BUILD_FLAG=""
RELEASE_FLAG=""
ONLY_FLAG=""
WATCH_FLAG=""
CLEAN_FLAG=""
SIMULATOR_FLAG=""

show_help() {
    cat << 'EOF'
VibeFlow 开发环境控制脚本

用法: ./scripts/dev.sh [客户端...] [选项]

客户端 (可组合):
  web, w       Web + API (默认)
  desktop, d   桌面端 Electron
  ios, i       iOS Expo
  ext, e       浏览器扩展 (编译后需手动加载到 Chrome)
  all, a       全部客户端

选项:
  --remote, -r    连接远程服务器 (默认本地)
  --build, -b     iOS: 重新编译原生代码 (Debug)
  --release       iOS: Release 编译 / Desktop: 编译并同步到 release app
  --clean, -c     iOS: 强制 prebuild --clean (删除 ios/ 目录重建)
  --simulator, --sim, -s  iOS: 部署到模拟器 (默认真机)
  --only, -o      单独启动指定客户端，不启动 Web 后端
  --watch         Extension: 持续监听文件变化

其他命令:
  status, s       查看当前配置
  logs [name]     查看日志 (web/desktop/ios/ext)
  stop            停止所有开发进程

场景示例:

  # Web 后端 (Next.js + Socket.io + tRPC)
  ./scripts/dev.sh                     # → npm run dev (端口 3000)
  ./scripts/dev.sh web                 # 同上

  # iOS 开发 (默认部署到 USB 连接的真机)
  ./scripts/dev.sh ios                 # → npm run dev + npx expo start --ios (最快)
  ./scripts/dev.sh ios --build         # → npm run dev + npx expo run:ios (编译原生，智能增量)
  ./scripts/dev.sh ios --build --clean # → 同上，但强制 prebuild --clean (慢，仅首次或改 native 用)
  ./scripts/dev.sh ios --build --sim   # → 部署到模拟器而非真机
  ./scripts/dev.sh ios --release       # → npx expo run:ios --configuration Release (独立包)
  ./scripts/dev.sh ios --remote        # → npx expo start --ios (连 39.105.213.147:4000)
  ./scripts/dev.sh ios --only          # → npx expo start --ios (不启动本地后端)

  # Desktop 开发
  ./scripts/dev.sh desktop             # → npm run dev + cd vibeflow-desktop && npm run dev
  ./scripts/dev.sh desktop --remote    # → cd vibeflow-desktop && VIBEFLOW_SERVER_URL=http://远程 npm run dev
  ./scripts/dev.sh desktop --remote --release  # → tsc + rsync → 启动 release app 连远程
  ./scripts/dev.sh desktop --only      # → cd vibeflow-desktop && npm run dev (不启动本地后端)

  # Extension 开发
  ./scripts/dev.sh ext                 # → cd vibeflow-extension && npm run build (单次编译)
  ./scripts/dev.sh ext --watch         # → cd vibeflow-extension && npm run watch (持续监听)

  # 组合启动
  ./scripts/dev.sh desktop ios         # → npm run dev + Desktop + iOS 全部本地
  ./scripts/dev.sh all                 # → 全部本地 (Web + Desktop + iOS + Extension 编译)
  ./scripts/dev.sh all --remote        # → Desktop + iOS 连远程 + Extension 编译

iOS 构建模式:
  (无参数)    Dev Server   最快，需要设备已安装 Dev Client，JS 热更新
  --build     Debug 编译   修改原生代码后需要，智能增量 (30-60s)
  --build -c  Debug 编译   强制 prebuild --clean (2-5min)，用于:
                           添加/删除 native module、改 bundle ID、升级 SDK、诡异错误
  --release   Release 编译 独立运行，不需要 Metro，智能增量
  --release -c             Release + 强制 prebuild --clean

Extension 说明:
  编译后在 Chrome 扩展页面 (chrome://extensions) 点击「刷新」按钮即可生效
  扩展默认连接 localhost:3000，可在 popup 中修改服务器地址

日志位置: /tmp/vibeflow-dev/{web,desktop,ios,ext}.log

实际运行的底层命令:
  Web:      npm run dev (tsx watch server.ts)
  Desktop:  cd vibeflow-desktop && npm run dev (electron + vite)
  iOS:      cd vibeflow-ios && npx expo start/run:ios
  Ext:      cd vibeflow-extension && npm run build (esbuild)
EOF
}

for arg in "$@"; do
    case "$arg" in
        --help|-h)
            show_help
            exit 0
            ;;
        --remote|-r)
            REMOTE_FLAG="1"
            ;;
        --build|-b)
            BUILD_FLAG="1"
            ;;
        --release)
            RELEASE_FLAG="1"
            ;;
        --only|-o)
            ONLY_FLAG="1"
            ;;
        --watch)
            WATCH_FLAG="1"
            ;;
        --clean|-c)
            CLEAN_FLAG="1"
            ;;
        --simulator|--sim|-s)
            SIMULATOR_FLAG="1"
            ;;
        status|s)
            show_status
            exit 0
            ;;
        logs|l)
            shift
            show_logs "$@"
            exit 0
            ;;
        stop)
            stop_all
            exit 0
            ;;
        web|w)
            CLIENTS+=("web")
            ;;
        desktop|d)
            CLIENTS+=("desktop")
            ;;
        ios|i)
            CLIENTS+=("ios")
            ;;
        ext|e|extension)
            CLIENTS+=("ext")
            ;;
        all|a)
            CLIENTS=("web" "desktop" "ios" "ext")
            ;;
        -*)
            echo -e "${RED}未知选项: $arg${NC}"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# 默认只启动 Web
if [ ${#CLIENTS[@]} -eq 0 ]; then
    CLIENTS=("web")
fi

# =============================================================================
# 确定服务器地址
# =============================================================================

if [ -n "$REMOTE_FLAG" ]; then
    SERVER_HOST="$REMOTE_HOST"
    SERVER_PORT="$REMOTE_PORT"
    SERVER_URL="http://$REMOTE_HOST:$REMOTE_PORT"
    ENV_LABEL="远程"
else
    MAC_IP=$(get_mac_ip)
    SERVER_HOST="$MAC_IP"  # iOS 需要 Mac 的局域网 IP
    SERVER_PORT="$LOCAL_PORT"
    SERVER_URL="http://localhost:$LOCAL_PORT"
    ENV_LABEL="本地"
fi

# iOS 构建模式
IOS_MODE="dev"
DESKTOP_MODE="dev"
if [ -n "$RELEASE_FLAG" ]; then
    IOS_MODE="release"
    DESKTOP_MODE="release"
elif [ -n "$BUILD_FLAG" ]; then
    IOS_MODE="build"
fi

# iOS clean 模式
IOS_CLEAN=""
if [ -n "$CLEAN_FLAG" ]; then
    IOS_CLEAN="--clean"
fi

# iOS 目标设备
IOS_TARGET="device"  # device | simulator
if [ -n "$SIMULATOR_FLAG" ]; then
    IOS_TARGET="simulator"
fi

# =============================================================================
# 启动
# =============================================================================

# 判断是否需要启动 Web
NEED_WEB=""
if [ -z "$REMOTE_FLAG" ] && [ -z "$ONLY_FLAG" ]; then
    # 本地模式且没有 --only，需要启动 Web
    for client in "${CLIENTS[@]}"; do
        if [ "$client" != "web" ]; then
            NEED_WEB="1"
            break
        fi
    done
fi

# 显示启动信息
echo -e "${GREEN}=== VibeFlow 开发环境 ($ENV_LABEL) ===${NC}"
echo -e "客户端: ${CYAN}${CLIENTS[*]}${NC}"
if [ -n "$REMOTE_FLAG" ]; then
    echo -e "服务器: ${YELLOW}$SERVER_URL${NC}"
else
    echo -e "服务器: ${GREEN}$SERVER_URL${NC}"
fi
echo -e "日志: $LOG_DIR/"
echo ""

PIDS=()
trap 'echo ""; echo "正在停止..."; for pid in "${PIDS[@]}"; do kill $pid 2>/dev/null; done; exit 0' INT TERM

# 启动 Web (如果需要)
if [ -z "$REMOTE_FLAG" ]; then
    # 检查是否只有 web 客户端
    if [ ${#CLIENTS[@]} -eq 1 ] && [ "${CLIENTS[0]}" = "web" ]; then
        start_web
        exit 0
    fi

    # 多客户端模式，Web 后台启动
    if [ -z "$ONLY_FLAG" ]; then
        WEB_PID=$(start_web "bg")
        PIDS+=($WEB_PID)
        sleep 4  # 等待 Web 启动
    fi
fi

# 先处理 Extension
for client in "${CLIENTS[@]}"; do
    if [ "$client" = "ext" ]; then
        if [ -n "$WATCH_FLAG" ]; then
            # watch 模式是前台持续运行
            if [ ${#CLIENTS[@]} -eq 1 ]; then
                start_ext_watch
                exit 0
            else
                echo -e "${YELLOW}--watch 只能单独用于 ext，忽略该选项${NC}"
                start_ext
            fi
        else
            start_ext
            # 如果只有 ext，直接退出
            if [ ${#CLIENTS[@]} -eq 1 ]; then
                exit 0
            fi
        fi
        echo ""
    fi
done

# 启动其他客户端
FOREGROUND_CLIENT=""
for client in "${CLIENTS[@]}"; do
    case "$client" in
        web|ext)
            # 已处理
            ;;
        desktop)
            if [ -z "$FOREGROUND_CLIENT" ]; then
                FOREGROUND_CLIENT="desktop"
            else
                DESKTOP_PID=$(start_desktop "$SERVER_URL" "bg" "$DESKTOP_MODE")
                PIDS+=($DESKTOP_PID)
            fi
            ;;
        ios)
            if [ -z "$FOREGROUND_CLIENT" ]; then
                FOREGROUND_CLIENT="ios"
            else
                IOS_PID=$(start_ios "$SERVER_HOST" "$SERVER_PORT" "$IOS_MODE" "bg" "$IOS_CLEAN" "$IOS_TARGET")
                PIDS+=($IOS_PID)
            fi
            ;;
    esac
done

# 前台启动最后一个客户端 (这样可以看到交互式输出)
case "$FOREGROUND_CLIENT" in
    desktop)
        start_desktop "$SERVER_URL" "" "$DESKTOP_MODE"
        ;;
    ios)
        start_ios "$SERVER_HOST" "$SERVER_PORT" "$IOS_MODE" "" "$IOS_CLEAN" "$IOS_TARGET"
        ;;
esac

# 如果没有前台客户端，等待后台进程
if [ -z "$FOREGROUND_CLIENT" ] && [ ${#PIDS[@]} -gt 0 ]; then
    echo "后台进程: ${PIDS[*]}"
    echo "按 Ctrl+C 停止"
    wait
fi
