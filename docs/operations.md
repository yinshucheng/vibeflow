# VibeFlow 运维指南

本文档提供 VibeFlow 系统的运维指南，包括快速开始、服务管理、故障排除等内容。

## 目录

- [快速开始](#快速开始)
- [架构概览](#架构概览)
- [VSCode 启动配置](#vscode-启动配置)
- [服务管理命令](#服务管理命令)
- [进程守护器](#进程守护器)
- [故障排除](#故障排除)
- [备份与恢复](#备份与恢复)
- [升级与迁移](#升级与迁移)

---

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 复制环境配置
cp .env.example .env

# 编辑 .env 文件，配置数据库连接
# DATABASE_URL="postgresql://username@localhost:5432/vibeflow?schema=public"
```

### 2. 数据库初始化

```bash
# 创建数据库 (如果不存在)
psql -d postgres -c "CREATE DATABASE vibeflow;"

# 同步 Prisma Schema 到数据库
npm run db:push

# 或者使用迁移 (生产环境推荐)
npm run db:migrate
```

### 3. 启动服务

#### 开发模式 (推荐日常开发)

```bash
# 启动完整服务 (Next.js + Socket.io + 热更新)
npm run dev

# 访问 http://localhost:3000
```

#### 持久运行模式 (日常使用)

```bash
# 安装 PM2 (如果尚未安装)
npm install -g pm2

# 启动所有服务
./scripts/vibeflow.sh start

# 检查服务状态
./scripts/vibeflow.sh status
```

### 4. 桌面应用

```bash
# 进入桌面应用目录
cd vibeflow-desktop

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build:mac
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        macOS System                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │ Process Guardian │◄──►│        Desktop App (Electron)     │  │
│  │   (launchd)      │    │  ┌────────────────────────────┐  │  │
│  │                  │    │  │     Heartbeat Manager      │  │  │
│  │  - Monitor PID   │    │  │  - 30s interval            │  │  │
│  │  - Auto restart  │    │  │  - Connection status       │  │  │
│  │  - Health check  │    │  └────────────────────────────┘  │  │
│  └──────────────────┘    │  ┌────────────────────────────┐  │  │
│                          │  │     Quit Prevention        │  │  │
│                          │  │  - Mode check              │  │  │
│                          │  │  - Work hours check        │  │  │
│                          │  │  - Confirmation dialog     │  │  │
│                          │  └────────────────────────────┘  │  │
│                          │  ┌────────────────────────────┐  │  │
│                          │  │     Policy Cache           │  │  │
│                          │  │  - Offline enforcement     │  │  │
│                          │  │  - Event queue             │  │  │
│                          │  └────────────────────────────┘  │  │
│                          └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket + HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend Server (Next.js)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Heartbeat Service│  │ Bypass Detection │  │ Demo Mode     │ │
│  │                  │  │    Service       │  │   Service     │ │
│  │ - Track clients  │  │ - Grace period   │  │ - Monthly     │ │
│  │ - Offline detect │  │ - Score calc     │  │   allocation  │ │
│  │ - Event logging  │  │ - Warning level  │  │ - Usage log   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                    │   │
│  │  - ClientConnection    - BypassAttempt    - DemoToken    │   │
│  │  - ClientOfflineEvent  - DemoModeEvent    - UserSettings │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 组件说明

| 组件 | 说明 | 位置 |
|------|------|------|
| Backend Server | Next.js 应用，提供 Web UI 和 API | `src/` |
| Desktop App | Electron 桌面应用，专注强制执行 | `vibeflow-desktop/` |
| Process Guardian | 进程守护器，确保桌面应用持续运行 | `vibeflow-desktop/guardian/` |
| Browser Extension | Chrome 扩展，URL 阻止 | `vibeflow-extension/` |
| MCP Server | AI 助手集成 | `src/mcp/` |

### 运行模式

| 模式 | 说明 | 退出限制 |
|------|------|----------|
| `development` | 开发模式，完全无限制 | 无 |
| `staging` | 测试模式，模拟生产行为 | Cmd+Shift+Q 可强制退出 |
| `production` | 生产模式，严格执行 | 工作时间内需确认 |

---

## VSCode 启动配置

在 VSCode 中按 `F5` 或点击 "Run and Debug" 面板，选择以下配置：

### 推荐配置

| 配置名称 | 说明 |
|----------|------|
| 🚀 VibeFlow Server (推荐) | 启动完整后端服务，自动打开浏览器 |
| 🌐 Full Stack (Backend + Desktop) | 同时启动后端和桌面应用 |

### 后端配置

| 配置名称 | 说明 |
|----------|------|
| 📦 Next.js Only | 仅启动 Next.js，不含 Socket.io |
| 🔌 MCP Server | 启动 MCP 服务器 (AI 集成) |
| 🗄️ Prisma Studio | 打开数据库管理界面 |

### 桌面应用配置

| 配置名称 | 说明 |
|----------|------|
| 🖥️ Desktop: Electron | 开发模式启动桌面应用 |
| 🖥️ Desktop: Electron (Staging) | Staging 模式启动桌面应用 |
| 🔧 Debug: Desktop (Attach) | 附加调试器到运行中的桌面应用 |

### 测试配置

| 配置名称 | 说明 |
|----------|------|
| 🧪 Vitest: Run Tests | 运行单元测试 |
| 🧪 Vitest: Watch Mode | 监听模式运行测试 |
| 🎭 Playwright E2E Tests | 运行 E2E 测试 |
| 🎭 Playwright E2E (UI Mode) | E2E 测试 UI 模式 |

### 组合配置

| 配置名称 | 说明 |
|----------|------|
| 🌐 Full Stack (Server + MCP) | 同时启动 Web 服务和 MCP 服务 |
| 🌐 Full Stack (Backend + Desktop) | 同时启动后端和桌面应用 |

### 使用方法

1. 打开 VSCode 的 "Run and Debug" 面板 (`Cmd+Shift+D`)
2. 从下拉菜单选择配置
3. 点击绿色播放按钮或按 `F5`

---

## 服务管理命令

VibeFlow 提供 `vibeflow.sh` 脚本用于管理持久运行的服务。

### 前置要求

```bash
# 安装 PM2 (进程管理器)
npm install -g pm2
```

### 命令参考

| 命令 | 说明 |
|------|------|
| `./scripts/vibeflow.sh start` | 启动所有服务 (后端 + 桌面应用) |
| `./scripts/vibeflow.sh stop` | 停止所有服务 |
| `./scripts/vibeflow.sh restart` | 重启所有服务 |
| `./scripts/vibeflow.sh status` | 查看服务状态 |
| `./scripts/vibeflow.sh logs` | 查看后端日志 (默认最后 100 行) |
| `./scripts/vibeflow.sh logs 50` | 查看最后 50 行日志 |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VIBEFLOW_PORT` | 后端服务端口 | 3000 |
| `VIBEFLOW_MODE` | 运行模式 | 自动检测 |

### 示例

```bash
# 启动服务
./scripts/vibeflow.sh start

# 检查状态
./scripts/vibeflow.sh status

# 查看日志
./scripts/vibeflow.sh logs

# 使用自定义端口
VIBEFLOW_PORT=3001 ./scripts/vibeflow.sh start

# 停止服务
./scripts/vibeflow.sh stop
```

### PM2 直接命令

```bash
# 查看所有进程
pm2 list

# 查看详细状态
pm2 describe vibeflow-backend

# 实时日志
pm2 logs vibeflow-backend

# 监控面板
pm2 monit

# 重启
pm2 restart vibeflow-backend

# 停止
pm2 stop vibeflow-backend

# 删除进程
pm2 delete vibeflow-backend
```

---

## 进程守护器

进程守护器 (Process Guardian) 确保桌面应用在生产模式下持续运行。

### 安装守护器

```bash
cd vibeflow-desktop

# 安装守护器
node scripts/install-guardian.js

# 带详细输出
node scripts/install-guardian.js --verbose

# 强制重新安装
node scripts/install-guardian.js --force
```

### 卸载守护器

```bash
cd vibeflow-desktop

# 卸载守护器
node scripts/uninstall-guardian.js

# 或使用安装脚本
node scripts/install-guardian.js --uninstall
```

### 检查守护器状态

```bash
# 检查是否已注册
launchctl list | grep com.vibeflow.guardian

# 查看守护器日志
tail -f ~/.vibeflow/guardian.stdout.log
tail -f ~/.vibeflow/guardian.stderr.log
```

### 手动控制守护器

```bash
# 加载守护器
launchctl load ~/Library/LaunchAgents/com.vibeflow.guardian.plist

# 卸载守护器
launchctl unload ~/Library/LaunchAgents/com.vibeflow.guardian.plist

# 启动守护器
launchctl start com.vibeflow.guardian

# 停止守护器
launchctl stop com.vibeflow.guardian
```

### 守护器配置

守护器配置文件位于 `~/Library/LaunchAgents/com.vibeflow.guardian.plist`：

- **RunAtLoad**: 登录时自动启动
- **KeepAlive**: 异常退出时自动重启
- **ThrottleInterval**: 重启间隔 (10 秒)
- **Nice**: 进程优先级 (-5，较高优先级)

---

## 故障排除

### 1. 后端服务无法启动

**症状**: `vibeflow start` 失败或端口冲突

**解决方案**:

```bash
# 检查端口占用
lsof -i :3000

# 杀死占用进程
kill -9 <PID>

# 或使用其他端口
VIBEFLOW_PORT=3001 ./scripts/vibeflow.sh start
```

### 2. 数据库连接失败

**症状**: `User was denied access on the database`

**解决方案**:

```bash
# 检查 PostgreSQL 状态
pg_isready -h localhost -p 5432

# 启动 PostgreSQL (macOS)
brew services start postgresql

# 创建数据库
psql -d postgres -c "CREATE DATABASE vibeflow;"

# 同步 Schema
npm run db:push
```

### 3. 桌面应用无法连接后端

**症状**: 桌面应用显示 "Offline Mode" 或连接错误

**解决方案**:

1. 确保后端服务正在运行:
   ```bash
   ./scripts/vibeflow.sh status
   ```

2. 检查健康检查端点:
   ```bash
   curl http://localhost:3000/api/health
   ```

3. 检查桌面应用日志:
   ```bash
   # 开发模式下查看控制台输出
   # 或查看 Electron 日志
   ```

### 4. 守护器无法启动桌面应用

**症状**: 守护器运行但桌面应用未启动

**解决方案**:

```bash
# 检查守护器日志
tail -100 ~/.vibeflow/guardian.stdout.log
tail -100 ~/.vibeflow/guardian.stderr.log

# 确保桌面应用已安装
ls -la /Applications/VibeFlow.app

# 重新安装守护器
cd vibeflow-desktop
node scripts/install-guardian.js --force
```

### 5. 心跳超时导致误报绕过

**症状**: 频繁收到绕过警告，但实际未关闭应用

**解决方案**:

1. 检查网络连接稳定性
2. 调整宽限期设置 (Settings → Grace Period)
3. 检查后端服务负载

### 6. 演示模式无法激活

**症状**: 点击激活演示模式无响应或报错

**解决方案**:

1. 检查是否有活跃的番茄钟 (演示模式不能在番茄钟期间激活)
2. 检查本月剩余令牌数
3. 确保输入正确的确认短语 ("I am presenting")

### 7. Socket.io 连接失败

**症状**: 实时更新不工作，控制台显示 WebSocket 错误

**解决方案**:

```bash
# 确保使用完整服务启动
npm run dev  # 而不是 npm run dev:next

# 检查 CORS 配置
# 确保前端和后端在同一端口
```

### 8. 热更新不生效

**症状**: 修改代码后页面未更新

**解决方案**:

1. 确保使用 `npm run dev` 启动
2. 检查文件是否保存
3. 某些配置文件更改需要重启服务
4. 清除浏览器缓存

---

## 备份与恢复

### 数据库备份

```bash
# 创建备份
pg_dump vibeflow > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复备份
psql vibeflow < backup_20240101_120000.sql
```

### 配置备份

需要备份的文件:
- `.env` - 环境配置
- `prisma/schema.prisma` - 数据库 Schema
- `~/.vibeflow/` - 用户配置和日志

### 自动备份脚本

```bash
#!/bin/bash
# backup.sh - 自动备份脚本

BACKUP_DIR="$HOME/vibeflow-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 备份数据库
pg_dump vibeflow > "$BACKUP_DIR/db_$DATE.sql"

# 备份配置
cp .env "$BACKUP_DIR/env_$DATE"

# 保留最近 7 天的备份
find "$BACKUP_DIR" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

---

## 升级与迁移

### 升级步骤

1. **备份数据**
   ```bash
   pg_dump vibeflow > backup_before_upgrade.sql
   ```

2. **拉取最新代码**
   ```bash
   git pull origin main
   ```

3. **安装依赖**
   ```bash
   npm install
   ```

4. **运行数据库迁移**
   ```bash
   npm run db:migrate
   ```

5. **重新构建**
   ```bash
   npm run build
   ```

6. **重启服务**
   ```bash
   ./scripts/vibeflow.sh restart
   ```

7. **更新桌面应用**
   ```bash
   cd vibeflow-desktop
   npm install
   npm run build:mac
   ```

### 回滚步骤

如果升级出现问题:

1. **停止服务**
   ```bash
   ./scripts/vibeflow.sh stop
   ```

2. **回滚代码**
   ```bash
   git checkout <previous-commit>
   ```

3. **恢复数据库**
   ```bash
   psql vibeflow < backup_before_upgrade.sql
   ```

4. **重新安装依赖**
   ```bash
   npm install
   ```

5. **重启服务**
   ```bash
   ./scripts/vibeflow.sh start
   ```

### 版本兼容性

- 数据库迁移是向前兼容的
- 桌面应用和后端版本应保持一致
- 浏览器扩展可独立更新

---

## 日志位置

| 组件 | 日志位置 |
|------|----------|
| 后端服务 | `logs/vibeflow-out.log`, `logs/vibeflow-error.log` |
| 进程守护器 | `~/.vibeflow/guardian.stdout.log`, `~/.vibeflow/guardian.stderr.log` |
| PM2 | `~/.pm2/logs/` |
| 桌面应用 | 开发模式下输出到控制台 |

### 查看日志

```bash
# 后端日志
./scripts/vibeflow.sh logs

# PM2 实时日志
pm2 logs vibeflow-backend

# 守护器日志
tail -f ~/.vibeflow/guardian.stdout.log
```

---

## 健康检查

### 后端健康检查

```bash
curl http://localhost:3000/api/health
```

预期响应:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 服务状态检查

```bash
./scripts/vibeflow.sh status
```

预期输出:
```
=== VibeFlow Service Status ===

Backend Server:
✓ Running (PM2: vibeflow-backend)
✓ Health check: OK
→ Port 3000: In use

Desktop Application:
✓ Running
→ PID: 12345

Process Guardian:
✓ Registered with launchd
```

---

## 联系支持

如果遇到无法解决的问题:

1. 收集相关日志
2. 记录重现步骤
3. 提交 Issue 到项目仓库

