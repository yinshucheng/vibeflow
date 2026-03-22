# VibeFlow 公网部署运维手册

## 架构概览

```
本机 Mac (开发机)                          云服务器 39.105.213.147
┌─────────────────────┐                   ┌─────────────────────┐
│ VibeFlow :3000      │                   │ frps :443 (隧道管理)│
│ frpc ────── frp tunnel ──────────────→  │ :7080 (HTTP 入口)   │
└─────────────────────┘                   │ nginx :80 (其他服务) │
                                          └─────────────────────┘
                                                   ↑
                                         iOS / 外网浏览器访问
                                         http://39.105.213.147:7080
```

### 请求链路

```
用户手机(4G/WiFi)
  → http://39.105.213.147:7080/api/...
    → 阿里云收到请求，frps 将 7080 端口流量通过隧道转发
      → frp 隧道（Mac frpc ↔ 阿里云 frps:443）
        → Mac localhost:3000 (VibeFlow 后端处理请求)
          → 响应原路返回
```

| 组件 | 位置 | 进程管理 | 配置文件 |
|------|------|---------|---------|
| VibeFlow 后端 | 本机 :3000 | PM2 或 `npm run dev` | `.env` |
| frpc | 本机 | 手动 / launchd | `deploy/frpc.toml` |
| frps | 云服务器 | systemd | `/etc/frp/frps.toml` |
| nginx | 云服务器 | systemd | `/etc/nginx/conf.d/` |

---

## 端口说明

### 云服务器端口

| 端口 | 协议 | 进程 | 用途 | 谁连接它 |
|------|------|------|------|---------|
| **22** | TCP | sshd | SSH 远程管理 | 开发者电脑 |
| **80** | TCP | nginx | 其他 Web 服务（duanju、linkcourse） | 浏览器 |
| **443** | TCP | **frps** | frp 隧道管理通信（frpc ↔ frps 保持长连接） | 本机 frpc |
| **7080** | TCP | **frps** | VibeFlow 对外 HTTP 入口（frps 监听，转发到隧道） | iOS app / 浏览器 |

**为什么 443 端口给 frp 用而不是 HTTPS？**

443 是 HTTPS 标准端口，全球所有网络（包括手机 4G/5G）都不会屏蔽它。frps 占用 443 是因为：
- 之前用 7000 端口，手机蜂窝网络的运营商会屏蔽非标准端口，导致 frpc 连不上
- 443 虽然通常给 HTTPS 用，但服务器上目前没有 HTTPS 服务，所以不冲突
- 运营商只看端口号不做深包检测，443 上跑 frp 协议完全没问题
- 以后如果要启用 HTTPS，需要把 frps 迁到其他端口（见「升级路径」）

**7080 端口没有被屏蔽吗？**

7080 是"被动端口"——只有 frp 隧道通了，7080 上的请求才能被转发。之前 7080 不通的根因是 frpc 连不上 frps:7000（管理端口被屏蔽），隧道断开，7080 请求无人应答。管理端口改 443 后隧道恢复，7080 自然通了。

### 本机端口

| 端口 | 进程 | 用途 |
|------|------|------|
| **3000** | VibeFlow (Next.js + Socket.io) | 后端服务，frp 将公网请求转发到这里 |
| **8081** | Metro Bundler | React Native 开发服务器（仅开发模式需要） |

### 运营商端口屏蔽实测（中国移动蜂窝网络）

| 端口 | 状态 | 说明 |
|------|------|------|
| 22 | 通 | SSH 标准端口 |
| 80 | 通 | HTTP 标准端口 |
| 443 | 通 | HTTPS 标准端口 |
| 7000 | **屏蔽** | 非标准端口 |
| 7080 | 通* | *需要 frp 隧道先建立 |
| 8080 | **屏蔽** | 非标准端口 |
| 8443 | **屏蔽** | 非标准端口 |
| 8888 | **屏蔽** | 非标准端口 |

> 不同运营商/地区的屏蔽策略不同。如果换了网络环境出现连接问题，优先检查端口可达性。

---

## 日常运维

### frpc（本机）

```bash
# 查看 frpc 是否在运行
pgrep -fl frpc

# 查看日志
tail -f /tmp/frpc.log

# 启动 frpc
~/bin/frpc -c ~/code/creo/vibeflow/deploy/frpc.toml &

# 停止 frpc
pkill -f frpc

# 重启 frpc
pkill -f frpc && sleep 1 && ~/bin/frpc -c ~/code/creo/vibeflow/deploy/frpc.toml &

# 测试隧道连通性
curl -s http://39.105.213.147:7080/api/health
```

**注意**：frpc 配置了 `loginFailExit = false`，网络断开后会自动重试。但如果手动 kill 了需要手动重启。

### frps（云服务器）

```bash
# SSH 登录云服务器
ssh cloud

# 查看 frps 状态
systemctl status frps

# 查看 frps 日志
journalctl -u frps -f

# 重启 frps
systemctl restart frps

# 停止 frps
systemctl stop frps
```

frps 由 systemd 托管，开机自动启动，崩溃自动重启。

### VibeFlow 后端（本机）

```bash
# 开发模式
npm run dev

# PM2 生产模式
pm2 start ecosystem.config.js --env production
pm2 status
pm2 logs vibeflow-backend
pm2 restart vibeflow-backend
```

---

## iOS 开发与部署

### 两种安装方式：Expo Go vs Dev Client

| | Expo Go | Dev Client (`expo run:ios`) |
|---|---|---|
| **本质** | App Store 通用沙盒，动态加载 JS | 独立 app，包含自定义原生模块 |
| **安装** | App Store 下载 | Xcode 编译安装到真机（需 USB） |
| **原生模块** | 不支持自定义原生模块 | 支持（Screen Time / FamilyControls） |
| **Screen Time 屏蔽** | Mock（模拟，不真实屏蔽） | 真实生效 |
| **Bundle ID** | `host.exp.Exponent` | `com.anonymous.vibeflow-ios` |
| **手机上共存** | **可以**，两个独立 app，互不影响 | |
| **图标** | Expo 官方紫色图标（不可改） | 蓝色渐变 V（自定义） |
| **Hot Reload** | 支持 | 支持（Debug build） |
| **适用场景** | 快速 UI 调试、不需要原生功能时 | 测试真实 Screen Time 屏蔽功能 |

**选择建议**：
- 日常 UI 开发 → Expo Go（改代码后摇一摇即刷新，无需编译）
- 测试 Screen Time 屏蔽 → Dev Client（必须用，Expo Go 只走 mock）
- 给别人演示 → Dev Client Release build（JS 内嵌，脱离 Mac 独立运行）

### Expo Go 连接方式

手机和 Mac 需在同一网络（同一 WiFi 或手机热点）。

```bash
cd vibeflow-ios

# 启动 Metro（自动检测 Mac IP）
EXPO_PUBLIC_SERVER_HOST=$(ipconfig getifaddr en0) npx expo start --port 8081
```

手机上打开 Expo Go → "Enter URL manually" → 输入 `exp://<Mac-IP>:8081`

> **注意**：手机热点下 Expo 可能显示 "Networking has been disabled"，这不影响使用，手动输入地址即可。

### Dev Client — Debug build

需要手机通过 USB 连接 Mac，**且 Mac 和手机在同一网络**（手机热点或同一 WiFi）。

```bash
cd vibeflow-ios
bash scripts/run-device.sh          # Debug build，JS 从 Metro 加载
```

特点：支持 Hot Reload、console.log、红色错误提示。每次冷启动需要从 Metro (Mac:8081) 下载 JS bundle。

### Dev Client — Release build

JS bundle 内嵌到 app 中，不需要 Metro，手机可以完全脱离 Mac 独立运行。

```bash
cd vibeflow-ios
bash scripts/run-device.sh --release  # Release build，JS 内嵌
```

特点：启动快、无需 Metro、可在任意网络下运行。没有 dev tools。**给别人展示时用这个。**

### 账号信息

| 账号 | 密码 | 说明 |
|------|------|------|
| `dev@vibeflow.local` | 用户自设（通过 `migrate-dev-account.ts`） | DEV_MODE 下无需密码；生产模式需运行迁移脚本设密码 |

```bash
# 设置/重置 dev 账号密码
npx tsx scripts/migrate-dev-account.ts --password <新密码>
```

---

## 故障排查

### 公网访问不通

按以下顺序排查：

```
1. 本机后端是否在跑？
   → curl http://localhost:3000/api/health

2. frpc 是否在运行？
   → pgrep -fl frpc
   → tail /tmp/frpc.log  (看是否有 "start proxy success")

3. frpc 能否连上 frps？
   → tail /tmp/frpc.log  (看是否有 "i/o timeout" 或 "login to server success")
   → 如果 timeout：当前网络可能屏蔽了 443 端口，换网络试试

4. 云服务器 frps 是否在跑？
   → ssh cloud "systemctl status frps"

5. 端到端验证
   → curl http://39.105.213.147:7080/api/health
```

### frpc 持续报 "i/o timeout"

- 当前网络屏蔽了出站 443 端口（罕见但可能）
- VPN/代理拦截了流量
- 云服务器 frps 没在运行
- frpc 会持续重试，网络恢复后自动连上

### iOS App 无法登录（公网）

1. 先确认 frp 隧道通：`curl http://39.105.213.147:7080/api/health`
2. 如果通但 App 不通：可能是 Debug build 需要 Metro（换 Release build）
3. 检查 App 登录页底部的服务器地址是否正确

### iOS App 显示"离线"

1. 检查 App 设置页 → 服务器地址是否正确
2. 在设置页切换服务器预设触发重连
3. 杀掉 App 重启

---

## 配置文件说明

### deploy/frpc.toml（本机）

```toml
serverAddr = "39.105.213.147"   # 云服务器 IP
serverPort = 443                # frps 监听端口（用 443 避免运营商屏蔽）
auth.token = "..."              # 预共享密钥（需与 frps 一致）
loginFailExit = false           # 断线自动重试
log.to = "/tmp/frpc.log"
log.level = "info"
log.maxDays = 3

[[proxies]]
name = "vibeflow-http"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3000                # 本机 VibeFlow 端口
remotePort = 7080               # 云服务器对外暴露端口
```

### deploy/frps.toml（云服务器 /etc/frp/frps.toml）

```toml
bindPort = 443                  # frpc 连接端口（443 = 不被运营商屏蔽）
auth.token = "..."              # 预共享密钥
```

### deploy/frps.service（云服务器 systemd）

安装位置：`/etc/systemd/system/frps.service`

### deploy/frpc.plist（本机 launchd，可选）

安装位置：`~/Library/LaunchAgents/com.vibeflow.frpc.plist`
需要修改其中的 `FRPC_PATH`、`FRPC_TOML_PATH`、`LOG_DIR` 占位符。

---

## 安全要点

1. **frp token** — 隧道通信需预共享 token，防止未授权接入
2. **DEV_MODE** — 当前使用 DEV_MODE=true，单用户场景可接受
3. **数据库** — PostgreSQL 仅绑定 localhost，不暴露网络
4. **无 HTTPS** — 当前是 HTTP 明文，后续加域名 + Caddy/nginx 后启用 HTTPS

---

## 云服务器安全组配置

需要在阿里云 ECS 控制台开放的端口：

| 端口 | 协议 | 来源 | 用途 |
|------|------|------|------|
| 22 | TCP | 0.0.0.0/0 | SSH 管理 |
| 443 | TCP | 0.0.0.0/0 | frp 隧道管理（frpc ↔ frps） |
| 7080 | TCP | 0.0.0.0/0 | VibeFlow HTTP 对外端口 |

> 原来的 7000 端口可以从安全组移除。

---

## 后续升级路径

1. **加域名 + HTTPS**：需要先把 frps 从 443 迁走（改成其他端口如 7443），然后 nginx 监听 443 做 HTTPS 反代到 7080
2. **frpc 开机自启**：安装 `deploy/frpc.plist` 到 launchd
3. **迁移到服务机**：在另一台 Mac 上跑 frpc，云服务器零改动
4. **后端直接部署到云服务器**：不再需要 frp 隧道，nginx 直接代理到 localhost:3000
5. **NextAuth 生产认证**：关闭 DEV_MODE，启用真实登录
