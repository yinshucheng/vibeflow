# iOS 离线屏蔽自动化 — 技术设计

## 核心约束

### DeviceActivitySchedule 的行为
- `intervalDidStart` 在 **schedule 的 start 时间点** 触发，不是注册时立即触发
- `intervalDidEnd` 在 **schedule 的 end 时间点** 触发
- **最短间隔约 15 分钟**，太短会报错 "schedule is too short"
- Extension 运行在**独立进程**，无法访问主 App 内存

### 设计决策
基于以上约束，采用 **主 App 启动屏蔽 + Extension 定时解除** 的模式：
1. 主 App 直接操作 `ManagedSettingsStore` 启动屏蔽
2. 同时注册 schedule，在指定时间点由 Extension 解除屏蔽
3. Extension 通过 App Group 读取上下文，决定解除后是否需要切换到其他屏蔽原因

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          iOS App (前台)                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ BlockingService│←──│   AppStore   │←──│ WebSocket (推送)      │   │
│  │ evaluateState()│    │ activePomodoro│    │ SYNC_STATE/POLICY   │   │
│  └───────┬──────┘    │ policy        │    └──────────────────────┘   │
│          │           └──────────────┘                                │
│          ▼                                                           │
│  ┌──────────────────┐                                               │
│  │ScreenTimeService │                                               │
│  │ registerSchedule │──────────────────────────────────────────┐    │
│  │ enableBlocking   │                                          │    │
│  └──────────────────┘                                          │    │
└─────────────────────────────────────────────────────────────────│────┘
                                                                  │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    iOS System (DeviceActivity Framework)             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ DeviceActivityCenter                                          │   │
│  │ - pomodoroSchedule (番茄钟结束时间)                            │   │
│  │ - tempUnblockSchedule (临时解锁到期时间)                       │   │
│  │ - sleepSchedule (睡眠时间，repeats: true)                     │   │
│  └───────────────────────────────┬──────────────────────────────┘   │
└──────────────────────────────────│──────────────────────────────────┘
                                   │ 时间到达时系统调用
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DeviceActivityMonitorExtension (独立进程)               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ intervalDidStart(activity)                                    │   │
│  │   - sleepSchedule → 启动屏蔽                                  │   │
│  │   - tempUnblockSchedule → 恢复屏蔽                            │   │
│  │                                                               │   │
│  │ intervalDidEnd(activity)                                      │   │
│  │   - pomodoroSchedule → 解除屏蔽                               │   │
│  │   - sleepSchedule → 解除屏蔽                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  数据共享: App Group UserDefaults                                    │
│  - familyActivitySelection (分心 app 列表)                          │
│  - workAppsSelection (工作 app 列表)                                │
│  - blockingReason (当前屏蔽原因)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## 设计方案

### D1: Schedule 命名约定

使用 `DeviceActivityName` 区分不同类型的 schedule：

```swift
extension DeviceActivityName {
    static let pomodoroEnd = DeviceActivityName("pomodoroEnd")
    static let tempUnblockEnd = DeviceActivityName("tempUnblockEnd")
    static let sleepSchedule = DeviceActivityName("sleepSchedule")
}
```

### D2: 番茄钟结束 Schedule (R1)

**注册时机**：`activePomodoro` 从 null 变为非 null 时

**Schedule 参数**：
```swift
let endTime = pomodoro.startTime + pomodoro.duration
let schedule = DeviceActivitySchedule(
    intervalStart: DateComponents(from: Date()),  // 立即开始
    intervalEnd: DateComponents(from: endTime),   // 番茄钟结束时间
    repeats: false
)
center.startMonitoring(.pomodoroEnd, during: schedule)
```

**Extension 处理**：
```swift
override func intervalDidEnd(for activity: DeviceActivityName) {
    switch activity.rawValue {
    case "pomodoroEnd":
        // 清除屏蔽（番茄钟自然结束）
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        clearBlockingReason()
    // ...
    }
}
```

**取消时机**：
- 用户手动中止番茄钟
- App 前台收到 SYNC_STATE 显示番茄钟已结束

### D3: 临时解锁到期 Schedule (R2)

**注册时机**：`policy.temporaryUnblock.active` 从 false 变为 true 时

**Schedule 参数**：
```swift
let endTime = Date(timeIntervalSince1970: tempUnblock.endTime / 1000)
let schedule = DeviceActivitySchedule(
    intervalStart: DateComponents(from: Date()),  // 立即开始（解锁生效）
    intervalEnd: DateComponents(from: endTime),   // 解锁到期时间
    repeats: false
)
center.startMonitoring(.tempUnblockEnd, during: schedule)
```

**Extension 处理**：
```swift
override func intervalDidEnd(for activity: DeviceActivityName) {
    switch activity.rawValue {
    case "tempUnblockEnd":
        // 恢复屏蔽（临时解锁到期）
        // 读取 App Group 中保存的"解锁前的屏蔽原因"
        let previousReason = loadPreviousBlockingReason()
        if previousReason != nil {
            applyBlocking(reason: previousReason)
        }
    // ...
    }
}
```

### D4: 睡眠时间 Schedule 修复 (R3)

**当前问题**：
1. 只在 policy 变化时注册，app 重启不重新注册
2. `!curSleepActive` 条件阻止睡眠时间内注册

**修复方案**：

```typescript
// blocking.service.ts - initialize() 中添加
async initialize(): Promise<void> {
  await screenTimeService.initialize();

  // 恢复已持久化的屏蔽状态
  const blockingState = await screenTimeService.getBlockingState();
  // ...existing code...

  // 初始化时注册睡眠时间 schedule（如果启用）
  const { policy } = useAppStore.getState();
  if (policy?.sleepTime?.enabled && policy.sleepTime.startTime && policy.sleepTime.endTime) {
    await screenTimeService.registerSleepSchedule(
      policy.sleepTime.startTime,
      policy.sleepTime.endTime
    );
    console.log('[BlockingService] Sleep schedule registered on init');
  }
}
```

**移除限制条件**：
```typescript
// 修改前
if (curSleepEnabled && curSleepStart && curSleepEnd && !curSleepActive) {

// 修改后（移除 !curSleepActive）
if (curSleepEnabled && curSleepStart && curSleepEnd) {
```

### D5: AI Chat 临时解锁 (R5)

**MCP Tool 定义**：

已有 `flow_request_temp_unblock` tool，需要确认其在 iOS 上的可用性。

```typescript
// src/mcp/tools/flow-tools.ts
{
  name: 'flow_request_temp_unblock',
  description: '请求临时解除屏蔽，用于紧急查阅资料等场景',
  inputSchema: {
    type: 'object',
    properties: {
      durationMinutes: {
        type: 'number',
        description: '解锁时长（分钟），默认 15，最大 60'
      },
      reason: {
        type: 'string',
        description: '解锁原因（可选，用于记录）'
      }
    }
  }
}
```

**调用链路**：
```
用户: "解锁 15 分钟让我查个资料"
   ↓
AI Chat 识别意图
   ↓
调用 MCP tool flow_request_temp_unblock({ durationMinutes: 15, reason: "查资料" })
   ↓
服务器 tRPC mutation policy.requestTempUnblock
   ↓
Socket 广播 UPDATE_POLICY (temporaryUnblock.active = true, endTime = now + 15min)
   ↓
iOS 收到 → 解除屏蔽 + 注册 tempUnblockEnd schedule (D3)
```

### D6: App Group 数据结构扩展

Extension 需要知道更多上下文来做出正确决策：

```swift
// AppGroupManager keys
let blockingReasonKey = "blockingReason"           // 当前屏蔽原因
let previousBlockingReasonKey = "previousReason"  // 临时解锁前的原因
let pomodoroEndTimeKey = "pomodoroEndTime"         // 番茄钟结束时间 (Unix ms)
let tempUnblockEndTimeKey = "tempUnblockEndTime"  // 临时解锁到期时间 (Unix ms)
```

### D7: ScreenTimeModule.swift 扩展

新增两个 Native 方法：

```swift
// 注册番茄钟结束 schedule
AsyncFunction("registerPomodoroSchedule") { (endTimeMs: Double, promise: Promise) in
    let endDate = Date(timeIntervalSince1970: endTimeMs / 1000)
    // 保存到 App Group
    AppGroupManager.shared.savePomodoroEndTime(endTimeMs)

    let schedule = DeviceActivitySchedule(
        intervalStart: DateComponents(from: Date()),
        intervalEnd: Calendar.current.dateComponents([.hour, .minute, .second], from: endDate),
        repeats: false
    )

    let center = DeviceActivityCenter()
    center.stopMonitoring([.pomodoroEnd])
    do {
        try center.startMonitoring(.pomodoroEnd, during: schedule)
        promise.resolve(nil)
    } catch {
        promise.reject("SCHEDULE_ERROR", error.localizedDescription)
    }
}

// 注册临时解锁到期 schedule
AsyncFunction("registerTempUnblockSchedule") { (endTimeMs: Double, promise: Promise) in
    // 类似实现...
}

// 取消指定 schedule
AsyncFunction("cancelSchedule") { (scheduleName: String, promise: Promise) in
    let center = DeviceActivityCenter()
    center.stopMonitoring([DeviceActivityName(scheduleName)])
    promise.resolve(nil)
}
```

### D8: DeviceActivityMonitorExtension 扩展

```swift
override func intervalDidEnd(for activity: DeviceActivityName) {
    switch activity.rawValue {
    case "pomodoroEnd":
        // 番茄钟自然结束 → 解除屏蔽
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        clearBlockingReason()

    case "tempUnblockEnd":
        // 临时解锁到期 → 恢复之前的屏蔽
        if let previousReason = loadPreviousBlockingReason() {
            applyBlocking(reason: previousReason)
        }

    case "sleepSchedule":
        // 睡眠时间结束 → 解除屏蔽
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        clearBlockingReason()

    default:
        break
    }
}

override func intervalDidStart(for activity: DeviceActivityName) {
    switch activity.rawValue {
    case "sleepSchedule":
        // 睡眠时间开始 → 启动屏蔽
        applyBlocking(reason: "sleep")

    case "tempUnblockEnd":
        // 临时解锁开始（intervalStart）→ 记录当前屏蔽原因，然后解除
        savePreviousBlockingReason()
        store.shield.applications = nil
        store.shield.applicationCategories = nil

    default:
        break
    }
}
```

## 数据流

### 番茄钟生命周期

```
[用户点击开始番茄钟]
    ↓
[tRPC: pomodoro.start]
    ↓
[服务器广播 SYNC_STATE: activePomodoro = {...}]
    ↓
[iOS store 更新 → BlockingService.evaluateBlockingState()]
    ↓
[启动屏蔽 + 注册 pomodoroEnd schedule]
    ↓
    ├── [用户在前台] → 定时器 UI 显示倒计时
    │
    └── [App 进入后台] → schedule 在系统层面计时
                              ↓
                        [时间到达]
                              ↓
                        [Extension.intervalDidEnd("pomodoroEnd")]
                              ↓
                        [解除屏蔽]
```

### 临时解锁生命周期

```
[用户/AI 请求临时解锁]
    ↓
[tRPC: policy.requestTempUnblock]
    ↓
[服务器广播 UPDATE_POLICY: temporaryUnblock = { active: true, endTime: X }]
    ↓
[iOS store 更新 → BlockingService.evaluateBlockingState()]
    ↓
[解除屏蔽 + 保存之前的 reason + 注册 tempUnblockEnd schedule]
    ↓
    ├── [用户在前台] → UI 显示"临时解锁中，剩余 XX 分钟"
    │
    └── [App 进入后台] → schedule 在系统层面计时
                              ↓
                        [时间到达]
                              ↓
                        [Extension.intervalDidEnd("tempUnblockEnd")]
                              ↓
                        [恢复之前的屏蔽]
```

## 边界情况

### E1: Schedule 冲突

如果同时有 pomodoroEnd 和 sleepSchedule 的 intervalDidEnd 被触发：
- 两者都会尝试清除屏蔽，效果相同，无冲突

### E2: 主 App 和 Extension 状态不一致

Extension 无法访问主 app 内存，通过 App Group UserDefaults 共享状态。
- 主 app 在更新屏蔽状态时，同时写入 App Group
- Extension 读取 App Group 来决定行为

### E3: 用户在后台手动杀死 App

- 已注册的 schedule 仍然有效（系统级）
- Extension 仍然会被触发
- 下次打开 app 时，从 App Group 恢复状态

### E4: 多个番茄钟快速启动/取消

- 每次启动新番茄钟时，先 `stopMonitoring(.pomodoroEnd)` 取消旧的
- 然后注册新的 schedule

## 测试计划

### 单元测试
- `evaluateBlockingReason` 纯函数覆盖所有分支
- Schedule 注册/取消逻辑的 mock 测试

### 集成测试
- 真机测试番茄钟后台自动解锁
- 真机测试临时解锁后台自动恢复
- 真机测试睡眠时间跨越

### 手动测试场景
1. 启动 25 分钟番茄钟 → App 退到后台 → 25 分钟后检查屏蔽是否解除
2. 请求 5 分钟临时解锁 → App 退到后台 → 5 分钟后检查屏蔽是否恢复
3. 设置睡眠时间 23:00-07:00 → App 未运行 → 23:00 检查屏蔽是否启动

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| DeviceActivitySchedule 数量限制 (~20) | 无法同时注册太多 schedule | 只注册必要的 3 个 |
| Extension 执行时间有限 | 复杂逻辑可能超时 | 保持 Extension 代码简单 |
| App Group 读写竞争 | 状态不一致 | 使用原子操作 |
| iOS 系统版本差异 | 低版本不支持 | 最低要求 iOS 16.0 |

---

## 完整方案：Extension 智能状态切换

### 问题

Extension 触发时应该 **重新评估状态**，而不是简单地开/关屏蔽。例如：
- 番茄钟结束时，如果在睡眠时间内 → 应该继续屏蔽（reason: sleep）
- 临时解锁到期时，如果还在番茄钟中 → 应该恢复屏蔽（reason: focus）
- 睡眠时间结束时，如果有活跃番茄钟 → 应该继续屏蔽（reason: focus）

### 约束

Extension 无法访问主 App 内存，只能通过 App Group 读取预存的上下文。

### 解决方案：App Group 状态快照

主 App 在状态变化时，将**完整的屏蔽决策上下文**写入 App Group：

```swift
// AppGroupManager - 新增字段
struct BlockingContext: Codable {
    // 当前活跃的屏蔽原因（如果有）
    var activeReason: String?  // "focus" | "sleep" | "over_rest" | nil
    
    // 番茄钟状态
    var pomodoroActive: Bool
    var pomodoroEndTime: Date?
    
    // 睡眠时间配置
    var sleepEnabled: Bool
    var sleepStartTime: String?  // "HH:mm"
    var sleepEndTime: String?    // "HH:mm"
    
    // 临时解锁状态
    var tempUnblockActive: Bool
    var tempUnblockEndTime: Date?
    var reasonBeforeTempUnblock: String?  // 解锁前的原因
    
    // OVER_REST 状态
    var isOverRest: Bool
    
    // 最后更新时间
    var updatedAt: Date
}
```

### Extension 决策逻辑

```swift
func evaluateBlockingState() -> (shouldBlock: Bool, reason: String?) {
    guard let ctx = loadBlockingContext() else {
        // 无上下文，保守处理：不改变当前状态
        return (false, nil)
    }
    
    // 检查上下文是否过期（超过 1 小时认为不可靠）
    if Date().timeIntervalSince(ctx.updatedAt) > 3600 {
        return (false, nil)
    }
    
    // 优先级：focus > over_rest > sleep
    
    // 1. 检查番茄钟（需要本地判断是否过期）
    if ctx.pomodoroActive, let endTime = ctx.pomodoroEndTime, Date() < endTime {
        return (true, "focus")
    }
    
    // 2. 检查 OVER_REST
    if ctx.isOverRest {
        return (true, "over_rest")
    }
    
    // 3. 检查睡眠时间（需要本地计算当前是否在时段内）
    if ctx.sleepEnabled, isCurrentlyInSleepTime(start: ctx.sleepStartTime, end: ctx.sleepEndTime) {
        return (true, "sleep")
    }
    
    // 4. 检查临时解锁（如果 active 且未过期，则不屏蔽）
    if ctx.tempUnblockActive, let endTime = ctx.tempUnblockEndTime, Date() < endTime {
        return (false, nil)
    }
    
    return (false, nil)
}
```

### 各 Schedule 的 Extension 处理

```swift
override func intervalDidEnd(for activity: DeviceActivityName) {
    let (shouldBlock, reason) = evaluateBlockingState()
    
    switch activity.rawValue {
    case "pomodoroEnd":
        // 番茄钟结束 → 重新评估
        if shouldBlock, let r = reason {
            applyBlocking(reason: r)
        } else {
            disableBlocking()
        }
        
    case "tempUnblockEnd":
        // 临时解锁到期 → 重新评估
        if shouldBlock, let r = reason {
            applyBlocking(reason: r)
        } else {
            disableBlocking()
        }
        
    case "sleepSchedule":
        // 睡眠时间结束 → 重新评估
        if shouldBlock, let r = reason {
            applyBlocking(reason: r)
        } else {
            disableBlocking()
        }
        
    default:
        break
    }
}

override func intervalDidStart(for activity: DeviceActivityName) {
    switch activity.rawValue {
    case "sleepSchedule":
        // 睡眠时间开始 → 重新评估（可能已有更高优先级的 reason）
        let (shouldBlock, reason) = evaluateBlockingState()
        if shouldBlock, let r = reason {
            applyBlocking(reason: r)
        }
        
    default:
        break
    }
}
```

### 主 App 同步上下文的时机

| 事件 | 操作 |
|------|------|
| 番茄钟开始 | 更新 `pomodoroActive=true, pomodoroEndTime=X` |
| 番茄钟结束/取消 | 更新 `pomodoroActive=false, pomodoroEndTime=nil` |
| Policy 更新 | 更新 `sleepEnabled, sleepStartTime, sleepEndTime, isOverRest` |
| 临时解锁开始 | 更新 `tempUnblockActive=true, endTime=X, reasonBeforeTempUnblock=Y` |
| 临时解锁结束 | 更新 `tempUnblockActive=false` |
| App 启动 | 全量同步一次 |
| App 进入后台 | 全量同步一次（确保后台状态最新）|

### 实现优先级

1. **Phase 1**: 简单的开/关模式，验证 schedule 基础能力 ✅
2. **Phase 2**: 添加 `BlockingContext` 结构，主 App 写入 ✅
3. **Phase 3**: Extension 实现智能决策（读 BlockingContext + reasonBeforeTempUnblock）✅
4. **Phase 4**: 完整测试各种状态切换场景 ✅ (51 个单测)

---

## 已知局限：BlockingContext 是"杀 App 时的快照"

### 问题本质

Extension 触发时读取的 BlockingContext 是**主 App 最后一次 syncBlockingContext() 时的快照**，不是实时服务端状态。

当前实现已经做到了**"水平触发"**（Extension 不盲目开/关，而是读上下文判断），但上下文数据有时效性问题。

### 安全的场景（BlockingContext 在注册 schedule 时已正确反映状态）

| 场景 | 为什么安全 |
|------|-----------|
| 睡眠时间内番茄钟结束 | sleep 信息在注册 pomodoroEnd schedule 时已写入 BlockingContext（sleepScheduleActive=true） |
| 已处于 over_rest 时注册 schedule | overRestActive=true 已写入 |
| App 活着时中止番茄钟 | subscribe 回调触发 cancelPomodoroEndSchedule()，schedule 被取消 |
| App 活着时临时解锁取消 | subscribe 回调触发 cancelTempUnblockExpirySchedule() |

### 存在漏洞的场景（App 被杀后服务端状态变化）

| 场景 | 具体时间线 | 后果 |
|------|-----------|------|
| 番茄钟进行中杀 App → 服务端超时中止 → 进入 OVER_REST | 0:00 注册 schedule (overRestActive=false) → 0:30 杀 App → 3:00 服务端中止 → OVER_REST → 25:00 schedule 触发 → 读到 overRestActive=false → **错误解除屏蔽** | 🟡 应屏蔽但解除了 |
| 番茄钟进行中杀 App → 服务端超时中止 → 进入睡眠时间 | 类似上面，但 sleepScheduleActive 取决于杀 App 时的状态 | 🟡 如果杀 App 时不在睡眠时间，触发时已进入睡眠时间，会错误解除 |

### 为什么这些漏洞可接受

1. **概率低**：需要"正在番茄钟 + 杀 App + 服务端状态变化"三个条件同时满足
2. **后果有限**：用户重新打开 App 后，WebSocket 推送会立即触发正确的 evaluateBlockingState()，屏蔽恢复
3. **保守方向正确**：漏洞方向是"偶尔漏屏蔽"而非"误屏蔽"，用户体验上更可接受

### 未来改进方案：APNs Silent Push

通过 Apple Push Notification Service 的 silent push（`content-available: 1`），服务端状态变化时推送到设备，触发 App 后台唤醒 → 更新 BlockingContext。

**实现成本**：
- **服务端**：集成 APNs 推送（需 Apple Developer 证书、`apn` 或 `@parse/node-apn` SDK）
- **客户端**：注册 remote notification、后台模式配置、处理 silent push 事件
- **运维**：证书续期、推送环境(sandbox/production)管理
- **可靠性限制**：iOS 会限流 silent push（每小时几次），低电量/省电模式下可能不送达

**结论**：当前快照模式足够用。等核心功能稳定后，如果用户反馈"杀 App 后偶尔漏屏蔽"成为实际问题，再投入 APNs。
