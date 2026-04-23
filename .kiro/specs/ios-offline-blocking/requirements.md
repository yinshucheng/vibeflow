# iOS 离线屏蔽自动化 — 需求文档

## 背景

当前 iOS 端的屏幕屏蔽状态变化完全依赖服务器 WebSocket 推送（`SYNC_STATE` / `UPDATE_POLICY`）。但 iOS 系统限制了后台 socket 连接，导致以下场景无法自动响应：

1. 番茄钟自然结束 — 25 分钟到了但屏蔽不解除
2. 进入 OVER_REST — 休息超时但屏蔽没启动
3. 临时解锁到期 — 15 分钟解锁到期但屏蔽没恢复
4. 睡眠时间进入/退出 — 理论上有离线调度但存在 bug

用户体验：预期屏蔽应该自动启动/解除，但实际需要打开 app 才会生效。

## 屏蔽场景全景图

### 启动屏蔽的场景

| # | 场景 | 触发源 | 当前实现 | 状态 |
|---|------|--------|---------|------|
| 1 | 番茄钟开始 | 用户操作 (前台) | Socket SYNC_STATE | ✅ 正常 |
| 2 | 进入睡眠时间 | 时钟到点 | DeviceActivitySchedule | ⚠️ 有 bug |
| 3 | 进入 OVER_REST | 服务器定时 | Socket UPDATE_POLICY | ❌ 后台收不到 |
| 4 | 临时解锁到期 | 本地定时器 | setTimeout | ⚠️ 后台失效 |
| 5 | AI Chat 临时解锁到期 | 本地定时器 | 同上 | ⚠️ 后台失效 |

### 解除屏蔽的场景

| # | 场景 | 触发源 | 当前实现 | 状态 |
|---|------|--------|---------|------|
| 6 | 番茄钟自然结束 | 服务器定时 | Socket SYNC_STATE | ❌ 后台收不到 |
| 7 | 番茄钟手动中止 | 用户操作 (前台) | Socket SYNC_STATE | ✅ 正常 |
| 8 | 退出睡眠时间 | 时钟到点 | DeviceActivitySchedule | ⚠️ 有 bug |
| 9 | 退出 OVER_REST | 用户操作 (前台) | Socket UPDATE_POLICY | ✅ 正常 |
| 10 | 临时解锁开始 | 用户操作 (前台) | Socket UPDATE_POLICY | ✅ 正常 |
| 11 | AI Chat 临时解锁 | AI 操作 (前台) | MCP tool 调用 | ✅ 正常 |

## 需求

### R1: 番茄钟结束自动解除屏蔽 (P0)

**用户故事**：作为用户，当我的番茄钟自然结束时（如 25 分钟到），即使 app 在后台，屏蔽也应该自动解除。

**验收标准**：
- AC1.1: 启动番茄钟时，向系统注册一个 DeviceActivitySchedule，end time = pomodoro.startTime + pomodoro.duration
- AC1.2: 番茄钟结束时，DeviceActivityMonitorExtension.intervalDidEnd 被系统调用，清除屏蔽
- AC1.3: 如果用户手动中止番茄钟，取消已注册的 schedule
- AC1.4: 支持番茄钟时长变化（用户中途调整 duration）

### R2: 临时解锁到期自动恢复屏蔽 (P0)

**用户故事**：作为用户，当我请求 15 分钟临时解锁后，即使 app 在后台，到期时屏蔽也应该自动恢复。

**验收标准**：
- AC2.1: 临时解锁开始时，向系统注册一个 DeviceActivitySchedule，end time = tempUnblock.endTime
- AC2.2: 临时解锁到期时，DeviceActivityMonitorExtension.intervalDidEnd 被系统调用，恢复屏蔽
- AC2.3: 如果用户提前结束解锁，取消已注册的 schedule
- AC2.4: 与 AI Chat 触发的临时解锁兼容（同一机制）

### R3: 睡眠时间离线调度修复 (P1)

**用户故事**：作为用户，当时钟到达我设置的睡眠时间开始/结束点时，屏蔽应该自动启动/解除，即使 app 未运行。

**验收标准**：
- AC3.1: App 启动时（`blockingService.initialize`）检查 policy，如果 sleepTime.enabled 则主动注册 schedule
- AC3.2: 移除 `!curSleepActive` 条件限制，允许在睡眠时间内也注册 schedule
- AC3.3: DeviceActivitySchedule 使用 `repeats: true` 确保每天重复

### R4: OVER_REST 自动启动屏蔽 (P2)

**用户故事**：作为用户，当我休息超时进入 OVER_REST 状态时，屏蔽应该自动启动。

**验收标准**：
- AC4.1: 服务器在状态变为 OVER_REST 时发送 APNs silent push
- AC4.2: iOS 收到 silent push 后唤醒 app（后台最多 30 秒执行时间）
- AC4.3: App 调用 `evaluateBlockingState()` 更新屏蔽状态
- AC4.4: 备选方案：接受"必须打开 app 才生效"的限制，在 app 首页显示明显提示

### R5: AI Chat 临时解锁功能 (P1)

**用户故事**：作为用户，我可以通过 AI Chat 请求临时解锁，例如说"解锁 15 分钟让我查个资料"。

**验收标准**：
- AC5.1: AI Chat 可以调用 MCP tool `flow_request_temp_unblock` 触发临时解锁
- AC5.2: 解锁时长支持自然语言指定（如"15 分钟"、"半小时"）
- AC5.3: AI 可以询问解锁原因并记录
- AC5.4: 解锁到期后自动恢复屏蔽（复用 R2 的机制）

## 技术约束

### iOS 系统限制
- 普通 app 在后台无法长时间保持 socket 连接
- setTimeout/setInterval 在后台会被系统挂起
- DeviceActivitySchedule 是唯一的离线调度机制（最多 ~20 个 schedule）
- Silent push 需要 APNs 证书配置

### DeviceActivitySchedule 限制
- 单个 extension 最多注册约 20 个活跃 schedule
- Schedule 是按时间点触发，不是精确计时器
- `intervalDidStart` / `intervalDidEnd` 在独立进程执行，无法访问主 app 内存

## 优先级

| 优先级 | 需求 | 理由 |
|--------|------|------|
| P0 | R1 番茄钟结束 | 最常见场景，每天多次 |
| P0 | R2 临时解锁到期 | 用户明确预期的行为 |
| P1 | R3 睡眠时间修复 | 已有代码只需修 bug |
| P1 | R5 AI Chat 临时解锁 | 提升 AI 交互能力 |
| P2 | R4 OVER_REST | 需要 APNs 基础设施 |

## 非目标

- 本 spec 不涉及服务器端 APNs 推送基础设施搭建（R4 可降级为接受限制）
- 本 spec 不涉及 Android 版本
- 本 spec 不涉及桌面端（桌面端没有后台限制问题）
