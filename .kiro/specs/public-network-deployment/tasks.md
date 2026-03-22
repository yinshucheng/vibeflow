# Implementation Tasks: 公网部署

## 分阶段策略

**Phase A（本轮）**：当前开发机直接通过 frp 穿透到云服务器，公网可访问。
- **P1**: 云服务器配置（frps）
- **P2**: 本机 frpc 穿透 + 公网验证
- **P3**: 客户端适配（iOS 连公网）
- **P4**: 运维脚本与监控

**Phase B（后续）**：迁移到另一台常开 Mac。云服务器零改动，只需在服务机上跑 frpc。

每个阶段完成后验证 happy path，确认通过后再进入下一阶段。

### 标记说明
- `[HUMAN]` — 需要你手动操作（SSH 到云服务器、DNS 配置、安装软件等）
- `[AI]` — Claude Code 可自主完成（写脚本、改配置、写代码）
- 无标记 — 默认 `[AI]`

---

## P1: 云服务器配置

> **目标**：云服务器上 frps 就绪，端口开放。

### Task 1: 创建部署配置文件 `[AI]`
- [x] 1.1 创建 `deploy/` 目录结构
- [x] 1.2 创建 `deploy/frps.toml` — frp server 配置
- [x] 1.3 创建 `deploy/frpc.toml` — frp client 配置（含 loginFailExit=false + 日志输出）
- [x] 1.4 创建 `deploy/frps.service` — systemd service 文件
- [x] 1.5 创建 `deploy/frpc.plist` — macOS launchd 文件
- [x] 1.6 创建 `deploy/README.md` — 运维手册（故障排查、日常命令、安全要点）

### Task 2: 云服务器环境搭建 `[AI + HUMAN]`
- [x] 2.1 SSH 免密登录配置（`~/.ssh/id_ed25519_cloud` + `~/.ssh/config` Host cloud）
- [x] 2.2 云服务器安装 frps 0.61.1（via GitHub mirror → `/usr/local/bin/frps`）
- [x] 2.3 配置 `/etc/frp/frps.toml` + systemd service → `systemctl enable --now frps`
- [x] 2.4 `[HUMAN]` 阿里云安全组开放端口 7000、7080
- [ ] 2.5 （跳过）域名 + Caddy/HTTPS — 暂不配置，后续加

> **P1 验收**：✅ frps 运行中，端口开放。

---

## P2: 本机 frpc 穿透

> **目标**：本机后端通过 frp 隧道暴露到公网，外网可访问。

### Task 3: 本机 frpc 安装与配置 `[AI]`
- [x] 3.1 下载安装 frpc 0.61.1 到 `~/bin/frpc`
- [x] 3.2 配置 `deploy/frpc.toml`（实际 IP + token + loginFailExit=false + 日志）
- [x] 3.3 启动 frpc 并验证隧道连通

### Task 4: 公网全链路验证
- [x] 4.1 HTTP：`curl http://39.105.213.147:7080/api/health` → 200 ✅
- [x] 4.2 Web 页面：`http://39.105.213.147:7080/` → 200, 22KB ✅
- [x] 4.3 Socket.io polling → 200 ✅
- [ ] 4.4 `[HUMAN]` 手机 4G 访问验证
- [ ] 4.5 frpc launchd 开机自启安装

> **P2 验收**：✅ 公网 HTTP 全通。frpc 手动启动，launchd 自启待安装。

---

## P3: iOS 客户端连公网

> **目标**：iOS App 通过公网地址连接后端。

### Task 5: iOS 连接配置 `[AI]`
- [x] 5.1 `vibeflow-ios/src/config/index.ts` — 默认地址改为 `39.105.213.147:7080`
- [x] 5.2 新增 `EXPO_PUBLIC_SERVER_URL` 完整 URL 覆盖支持
- [x] 5.3 创建 `server-config.service.ts` — AsyncStorage 持久化服务器 URL
- [x] 5.4 `websocket.service.ts` — connect() 时从 serverConfigService 读取 URL
- [x] 5.5 `AppProvider.tsx` — 启动时预加载 AsyncStorage 中的 URL
- [x] 5.6 `SettingsScreen.tsx` — 「服务器连接」section，可查看/编辑地址，保存后自动重连

### Task 6: iOS 真机公网验证 `[HUMAN]`
- [ ] 6.1 WiFi 下验证：App 连接状态显示已连接
- [ ] 6.2 切到 4G/5G 验证：App 自动重连
- [ ] 6.3 验证阻断：启动番茄钟 → 分心 App 被阻断 → 结束后解除
- [ ] 6.4 设置页面修改服务器地址 → 保存 → 自动重连
- [ ] 6.5 App 杀掉重启 → 地址持久化，自动连接正确服务器

> **P3 验收**：iOS 代码改动完成，待真机验证。

---

## P4: 运维文档与完善

> **目标**：运维文档齐全，方便日常维护。

### Task 7: 运维文档 `[AI]`
- [x] 7.1 创建 `deploy/README.md` — 架构图、日常命令、故障排查、配置说明、安全要点

### Task 8: 增强 health check `[AI]`
- [ ] 8.1 更新 `src/app/api/health/route.ts` — 添加 uptime、内存、数据库、Socket.io 连接数
- [ ] 8.2 添加 `?deep=true` 参数支持详细检查

### Task 9: 配置完善 `[AI]`
- [ ] 9.1 更新 `.env.example` — 添加 `CORS_ORIGIN` 说明
- [ ] 9.2 `ecosystem.config.js` — env_production 添加 `HOSTNAME: '0.0.0.0'`

> **P4 验收**：✅ 运维文档完成。health check 增强和配置完善待后续。

---

## Phase B: 迁移到服务机（后续实施）

> 以下任务在你准备好另一台 Mac 后再执行。云服务器配置完全不变。

### Task B1: 服务机初始化脚本 `[AI]`
- [ ] B1.1 创建 `scripts/setup-host.sh` — 一键初始化新服务机
- [ ] B1.2 创建 `scripts/deploy.sh` — 代码更新部署
- [ ] B1.3 创建 `scripts/remote-deploy.sh` — 开发机 SSH 触发远程部署

### Task B2: 数据迁移 `[AI]`
- [ ] B2.1 创建 `scripts/migrate-data.sh` — pg_dump 导出/导入/verify

### Task B3: 服务机部署 `[HUMAN]`
- [ ] B3.1 服务机运行 `setup-host.sh`
- [ ] B3.2 导入数据
- [ ] B3.3 在服务机上启动 frpc（配置不变，只是换了机器）
- [ ] B3.4 本机停止 frpc
- [ ] B3.5 验证公网仍然可达

---

## 长期待办（不在本轮）

- [ ] 域名 + HTTPS（nginx 反代 + Let's Encrypt）
- [ ] NextAuth 生产认证集成（关闭 DEV_MODE）
- [ ] frpc launchd 开机自启
- [ ] GitHub Actions CI/CD
- [ ] 数据库自动备份
