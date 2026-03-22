# Design Document: 公网部署

## Overview

让 VibeFlow 后端通过公网域名对外可访问，使 iOS 客户端在任意网络环境（4G/5G/外部 WiFi）下均可连接后端。

**分两步走**：
1. **Phase A（本轮）**：当前开发机直接跑后端 + frpc 穿透到云服务器 → 公网可用
2. **Phase B（后续）**：将后端迁移到另一台常开 Mac，开发机只做开发

Phase A 和 Phase B 的云服务器配置完全一样，区别仅在于 frpc 跑在哪台机器上。

## Architecture

### Phase A 网络拓扑（本轮实施）

```
┌──────────────────────────┐
│  当前 Mac (开发机)        │
│                          │
│  VibeFlow 后端 (:3000)   │
│  PostgreSQL (:5432)      │
│  PM2 / npm run dev       │
│  frpc (内网穿透客户端)    │ ─── frp tunnel ──→ ┌──────────────────────┐
│                          │                     │  云服务器              │
└──────────────────────────┘                     │  frps (隧道服务端)    │
                                                 │  Caddy (反代+自动TLS) │
┌──────────────────────────┐                     │                      │
│  iOS / 外网客户端         │ ←── HTTPS/WSS ───→ │  vibe.yourdomain.com │
└──────────────────────────┘                     └──────────────────────┘
```

### Phase B 网络拓扑（后续迁移）

```
┌───────────────┐  git push   ┌──────────────────────┐
│  开发机 Mac    │ ──────────→ │  服务机 Mac (常开)    │
│  (代码开发)    │             │  VibeFlow + PG + frpc │
└───────────────┘             └──────────┬───────────┘
                                         │ frp tunnel
                                         ↓
                              ┌──────────────────────┐
                              │  云服务器 (不变)       │
                              │  frps + Caddy         │
                              └──────────────────────┘
```

迁移时只需：在服务机安装环境 → 导入数据 → 启动 frpc，云服务器零改动。

### 组件分工

| 组件 | 位置 | 职责 |
|------|------|------|
| **VibeFlow 后端** | 本机 :3000 | Next.js + tRPC + Socket.io |
| **PostgreSQL** | 本机 :5432 | 数据库，仅本地访问 |
| **frpc** | 本机 | 建立加密隧道到云服务器 |
| **frps** | 云服务器 | 接受 frpc 连接，在本地暴露端口 |
| **Caddy** | 云服务器 | HTTPS 终端 + 反向代理到 frps 暴露的端口 |

### 为什么选 frp + Caddy

1. **frp**：用户已有云服务器但不想在上面跑应用，frp 是最轻量的纯转发方案（frps ~10MB 内存）
2. **Caddy**（而非 nginx）：4 行配置搞定 HTTPS + WSS + 反向代理 + Let's Encrypt 自动续期
3. **不选 Cloudflare Tunnel**：需要域名 NS 托管在 Cloudflare，灵活性不够
4. **不选 ngrok**：免费版 URL 随机，付费没必要

### 数据流

```
── HTTP / tRPC ──

iOS App → HTTPS://vibe.yourdomain.com/api/trpc/xxx
  → Caddy (TLS termination)
  → reverse_proxy localhost:7080
  → frps → frp tunnel → frpc
  → localhost:3000 (VibeFlow)

── WebSocket / Socket.io ──

iOS App → WSS://vibe.yourdomain.com/socket.io/
  → Caddy (WebSocket upgrade)
  → frps → frp tunnel → frpc
  → localhost:3000 (Socket.io)
```

## 认证策略

当前 `userService.getCurrentUser()` 在 `DEV_MODE=false` 时返回 `AUTH_ERROR`（生产认证未实现）。

**短期方案**：继续 `DEV_MODE=true`，安全通过以下措施保障：
- 所有公网流量 HTTPS 加密（Caddy 管理证书）
- frp 隧道 token 认证
- 单用户场景，`X-Dev-User-Email` header 需要知道才能伪造
- 已有 rate limiting middleware

**中期方案**（独立 spec）：实现 NextAuth 生产集成，关闭 DEV_MODE。

## 配置文件设计

### frps.toml（云服务器）

```toml
bindPort = 7000
auth.token = "your-secure-token"
```

### frpc.toml（本机 / 未来服务机）

```toml
serverAddr = "your-cloud-server-ip"
serverPort = 7000
auth.token = "your-secure-token"

[[proxies]]
name = "vibeflow-http"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3000
remotePort = 7080
```

### Caddyfile（云服务器）

```
vibe.yourdomain.com {
    reverse_proxy localhost:7080 {
        flush_interval -1
    }
}
```

## 客户端适配

### iOS

当前 `vibeflow-ios/src/config/index.ts`：
```typescript
// 现状：__DEV__ 用局域网IP，production hardcode vibeflow.app
export const SERVER_URL = __DEV__
  ? `http://${SERVER_HOST}:${SERVER_PORT}`
  : 'https://vibeflow.app';
```

改为支持公网 URL 环境变量：
```typescript
const SERVER_URL_OVERRIDE = process.env.EXPO_PUBLIC_SERVER_URL;

export const SERVER_URL = SERVER_URL_OVERRIDE
  || (__DEV__
    ? `http://${SERVER_HOST}:${SERVER_PORT}`
    : 'https://vibeflow.app');

export const WEBSOCKET_URL = SERVER_URL;
```

这样 dev build 时设 `EXPO_PUBLIC_SERVER_URL=https://vibe.yourdomain.com` 即可连公网。

### 桌面端

已支持 `VIBEFLOW_SERVER_URL` env var，无需改动。

### 浏览器插件

popup UI 已支持手动配置 URL，无需改动。

## 安全考虑

1. **TLS**：Caddy 自动 Let's Encrypt，公网全程 HTTPS/WSS
2. **frp token**：隧道需预共享 token，防未授权接入
3. **PostgreSQL**：仅 localhost，不暴露网络
4. **DEV_MODE**：短期使用，单用户 + HTTPS 风险可控
5. **Rate limiting**：已有内存版，单实例足够

## 不在本 Spec 范围

- NextAuth 生产认证集成（独立 spec）
- 后端迁移到另一台 Mac（Phase B，作为后续 task 追加）
- CI/CD pipeline
- Docker 容器化
