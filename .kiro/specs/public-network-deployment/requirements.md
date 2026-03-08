# Requirements Document

## Introduction

本文档定义了 VibeFlow 公网部署的需求。主要目标是：
1. 将 VibeFlow 后端从本地 macOS 部署迁移到另一台电脑（长期运行）
2. 通过内网穿透使后端服务在公网可访问
3. 确保 iOS 客户端能在任意网络环境下连接后端
4. 保证数据安全性和服务稳定性

## Background

当前部署：
- 后端：PM2 运行在开发机 localhost:3000（Next.js + tRPC + Socket.io）
- 数据库：本地 PostgreSQL
- iOS 客户端：仅在同 WiFi 局域网下可用
- 桌面端：直连 localhost
- 浏览器插件：直连 localhost

核心问题：**iOS 客户端离开家就无法使用**，防沉迷系统在外出时完全失效。

## Glossary

- **Host_Machine**: 部署 VibeFlow 后端的另一台电脑（非开发机）
- **Tunnel_Service**: 内网穿透服务（如 Cloudflare Tunnel、ngrok、frp 等）
- **Public_URL**: 通过内网穿透暴露的公网可访问地址
- **Backend_Service**: VibeFlow 后端服务（Next.js + tRPC + Socket.io，端口 3000）
- **WS_Connection**: WebSocket 长连接，用于实时通信（心跳、状态同步、推送）

## Requirements

### Requirement 1: 后端服务迁移到 Host_Machine

**User Story:** As a user, I want the VibeFlow backend to run on a separate always-on machine, so that the service is available 24/7 regardless of whether my development machine is running.

#### Acceptance Criteria

1. THE Backend_Service SHALL run on Host_Machine via PM2 with the existing `ecosystem.config.js` configuration
2. THE Host_Machine SHALL run PostgreSQL with the full database schema (via `prisma migrate deploy`)
3. THE Backend_Service SHALL auto-restart on Host_Machine reboot (PM2 startup)
4. THE Backend_Service SHALL be accessible on Host_Machine's local network at port 3000
5. THE Host_Machine SHALL have Node.js 18+ and npm installed
6. THE deployment process SHALL include a script or documented steps to set up a fresh Host_Machine from scratch

### Requirement 2: 内网穿透公网暴露

**User Story:** As a user, I want the backend to be accessible from the public internet via a stable URL, so that my iOS app works anywhere (home, office, commute).

#### Acceptance Criteria

1. THE Tunnel_Service SHALL expose Host_Machine port 3000 to a Public_URL
2. THE Public_URL SHALL support both HTTPS (for tRPC/HTTP requests) and WSS (for Socket.io WebSocket connections)
3. THE Tunnel_Service SHALL auto-start on Host_Machine reboot
4. THE Public_URL SHALL remain stable across Tunnel_Service restarts (fixed subdomain, not random)
5. WHEN the Tunnel_Service connection drops, IT SHALL auto-reconnect within 30 seconds
6. THE Tunnel_Service SHALL support WebSocket upgrade and long-lived connections (Socket.io requires this)

### Requirement 3: iOS 客户端公网连接

**User Story:** As a user, I want my iOS app to connect to the backend via the public URL, so that anti-addiction enforcement works even when I'm not on my home WiFi.

#### Acceptance Criteria

1. THE iOS app config SHALL support configuring a Public_URL as the server address
2. THE iOS app SHALL connect to the Backend_Service via HTTPS/WSS through the Public_URL
3. WHEN the iOS app loses connection, IT SHALL auto-reconnect with exponential backoff
4. THE iOS app SHALL display connection status (connected/disconnected/reconnecting) to the user
5. THE heartbeat mechanism SHALL work correctly over the public network (accounting for higher latency)
6. THE Screen Time blocking SHALL activate/deactivate correctly when controlled via public network

### Requirement 4: 桌面端和浏览器插件兼容

**User Story:** As a user, I want existing desktop app and browser extension to continue working, either via local network or public URL.

#### Acceptance Criteria

1. THE Desktop_App SHALL support connecting to Backend_Service via either localhost, LAN IP, or Public_URL
2. THE Browser_Extension SHALL support connecting to Backend_Service via either localhost or Public_URL
3. THE server address configuration SHALL be changeable without rebuilding the clients
4. ALL existing features (focus enforcement, bypass detection, sleep enforcement) SHALL work identically over public network

### Requirement 5: 安全性

**User Story:** As a user, I want the public-facing service to be secure, so that my personal data and focus enforcement system cannot be accessed by unauthorized users.

#### Acceptance Criteria

1. THE Public_URL SHALL use HTTPS/WSS (TLS encryption) — no plain HTTP
2. THE Backend_Service SHALL require authentication for all API endpoints (existing NextAuth mechanism)
3. THE Tunnel_Service SHALL NOT expose any other ports or services on Host_Machine
4. THE database (PostgreSQL) SHALL NOT be directly accessible from the public network
5. THE Backend_Service SHALL rate-limit unauthenticated requests to prevent abuse
6. WHEN DEV_MODE is enabled, THE system SHALL still require the `X-Dev-User-Email` header (not open access)

### Requirement 6: 数据迁移

**User Story:** As a user, I want all my existing data (tasks, pomodoros, settings, bypass history) to be preserved when migrating to Host_Machine.

#### Acceptance Criteria

1. THE migration process SHALL include a PostgreSQL data export from the development machine
2. THE migration process SHALL include a PostgreSQL data import to Host_Machine
3. ALL existing records (tasks, projects, pomodoros, settings, bypass attempts, etc.) SHALL be preserved
4. THE migration SHALL be documented as a repeatable process (for future re-migrations)

### Requirement 7: 运维与监控

**User Story:** As a user, I want basic monitoring so that I know if the service goes down and can recover quickly.

#### Acceptance Criteria

1. THE PM2 process SHALL be configured with memory limits and auto-restart on crash
2. THE Tunnel_Service SHALL log connection status to a file
3. WHEN the Backend_Service crashes and restarts, IT SHALL log the event
4. THE Host_Machine SHALL have a simple health check endpoint (e.g., `GET /api/health`) accessible via Public_URL
5. (Optional) THE system MAY send a notification (via existing notification mechanism) when the backend goes offline for more than 5 minutes
