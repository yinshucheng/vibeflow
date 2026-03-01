# Implementation Tasks: iOS Screen Time API 集成

## 分阶段策略

按照 design.md 的渐进迁移策略，分为 4 个子阶段：
- **Phase 2a**: App Group + FamilyActivityPicker + 选择持久化 + Service 链路改造
- **Phase 2b**: Token-based 精细阻断（Native 层切换）
- **Phase 2c**: App Extensions (Shield + DeviceActivityMonitor)
- **Phase 2d**: 集成测试 + 完善

每个阶段完成后在真机验证，确认 happy path 通过后再进入下一阶段。

### 标记说明
- `[HUMAN]` — 需要你手动操作（Xcode GUI、Apple Developer Portal、真机测试）
- `[AI]` — Claude Code 可自主完成（写代码、改配置）
- 无标记 — 默认 `[AI]`

---

## Phase 0: 前置准备（一次性）

### Task 0: Apple Developer Portal + Xcode 配置
- [ ] 0.1 `[HUMAN]` 在 Apple Developer Portal → Identifiers → App Groups 中注册 `group.app.vibeflow.shared`
- [ ] 0.2 `[HUMAN]` 确认主 App 的 Provisioning Profile 包含 Family Controls + App Groups capability
- [ ] 0.3 `[HUMAN]` 在 Xcode 中打开项目，确认 Signing & Capabilities 页面能正常选择 Team
- [ ] 0.4 `[HUMAN]` 确认有物理 iOS 设备（模拟器不支持 FamilyControls）且设备已在"设置 → 屏幕使用时间"中开启

> **为什么需要 Phase 0：** FamilyControls 是受限 capability，需要 Apple 批准。如果 Provisioning Profile 没配好，后续所有真机验证都跑不通。先确认这些外部依赖就绪。

---

## Phase 2a: App Group + FamilyActivityPicker + Service 链路

### Task 1: App Group 基础设施 `[AI]`
- [x] 1.1 创建 `modules/screen-time/ios/AppGroupManager.swift` — 封装 App Group UserDefaults 读写 `d128d5d`
  - `static let shared` 单例，appGroupId = `"group.app.vibeflow.shared"`
  - `saveDistractionSelection(_ selection: FamilyActivitySelection)`
  - `loadDistractionSelection() -> FamilyActivitySelection?`
  - `saveWorkAppsSelection(_ selection: FamilyActivitySelection)`
  - `loadWorkAppsSelection() -> FamilyActivitySelection?`
  - `saveBlockingReason(_ reason: String, extra: [String: Any]?)`
  - `readBlockingReason() -> String?`
  - `saveSleepSchedule(startHour: Int, startMinute: Int, endHour: Int, endMinute: Int)`
  - `readSleepSchedule() -> (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int)?`
- [x] 1.2 修改 `plugins/withFamilyControls.js` — 添加 App Group entitlement (`group.app.vibeflow.shared`) `d128d5d`
- [x] 1.3 修改 `ios/vibeflowios/vibeflowios.entitlements` — 添加 `com.apple.security.application-groups` `d128d5d`
- [x] 1.4 修改 `ScreenTime.podspec` — 添加 `DeviceActivity` framework 依赖 `d128d5d`
- [ ] 1.5 `[HUMAN]` 真机验证：App Group UserDefaults 读写正常

### Task 2: FamilyActivityPicker 模态弹出 `[AI]`
- [x] 2.1 创建 `modules/screen-time/ios/ActivityPickerSheet.swift`: `a8eaa8f`
  - `ActivitySelectionModel: ObservableObject` — 持有 `@Published var selection: FamilyActivitySelection`
  - `ActivityPickerSheet: View` — 包裹 FamilyActivityPicker + NavigationView + "完成"按钮
  - 注意：必须用 ObservableObject 而非局部变量，否则 SwiftUI Binding 闭包捕获后 selection 不更新
- [x] 2.2 在 `ScreenTimeModule.swift` 中实现 `presentActivityPicker(type)` AsyncFunction: `a8eaa8f`
  - 获取当前 rootViewController
  - 用 ActivitySelectionModel 加载已有 selection
  - 创建 UIHostingController(rootView: ActivityPickerSheet(...))
  - `.present(animated: true)` 模态弹出
  - 用户"完成"后保存到 AppGroupManager，dismiss，resolve SelectionSummary
- [x] 2.3 在 `modules/screen-time/index.ts` 中添加 `presentActivityPicker` 函数声明 + mock 实现 `a8eaa8f`
  - Mock 返回 `{ appCount: 0, categoryCount: 0, hasSelection: false }`
- [ ] 2.4 `[HUMAN]` 真机验证：Picker 弹出、选择后 summary 正确返回、App 重启后 selection 仍在

### Task 3: Native Module 接口扩展 + Service 链路一起改 `[AI]`

> **关键**：`enableBlocking` 签名从无参改为 `(useSelection: Bool)`，必须同时改 Native → index.ts → ScreenTimeService → BlockingService 整条链路，否则编译失败。所以把原 Phase 2b 的 Task 5/6 的接口部分提前到这里。

- [x] 3.1 修改 `ScreenTimeModule.swift`: `c7704bc`
  - 新增 `getSelectionSummary(type)` 函数
  - 新增 `setBlockingReason(reason)` 函数
  - 修改 `enableBlocking(useSelection: Bool)` 签名（Phase 2a 阶段 `useSelection=true` 时暂时仍走 `.all()`，Phase 2b 再切换为 token-based）
- [x] 3.2 修改 `modules/screen-time/index.ts` — 更新全部 TypeScript 接口，**每个新函数必须有 mock** `c7704bc`
  - `enableBlocking(useSelection)` — mock 直接 `console.log` + return
  - `presentActivityPicker` → `{ appCount: 0, categoryCount: 0, hasSelection: false }`
  - `getSelectionSummary` → `{ appCount: 0, categoryCount: 0, hasSelection: false }`
  - `setBlockingReason` → `void`
  - `registerSleepSchedule` / `clearSleepSchedule` → `void`
- [x] 3.3 修改 `src/types/index.ts` — 添加 `SelectionSummary`, `SleepScheduleConfig` 类型；`BlockingState.blockedApps` → `selectionSummary` `c7704bc`
- [x] 3.4 修改 `src/services/screen-time.service.ts`: `c7704bc`
  - `enableBlocking(reason: BlockingReason)` — 新签名
  - 内部：`getSelectionSummary` → `enableBlocking(hasSelection)` + `setBlockingReason(reason)`
  - `MockScreenTimeBridge` 同步更新全部新方法
  - `loadBlockingState`/`persistBlockingState` 兼容新旧 BlockingState 格式
- [x] 3.5 修改 `src/services/blocking.service.ts`: `c7704bc`
  - `evaluateBlockingState()` → 调用 `screenTimeService.enableBlocking(reason)` 不传 apps
  - 移除 `getBlockedApps()` 中的 bundleId 逻辑
  - Store 更新使用 `selectionSummary` 替代 `blockedApps`
- [x] 3.6 修改 `src/store/app.store.ts` — `blockedApps` → `selectionSummary`，相关 actions 和 selectors 同步更新 `c7704bc`
- [ ] 3.7 `[HUMAN]` 真机验证：所有新 native 函数调用正常，阻断流程不 break（仍为 `.all()`）

### Task 4: Settings 页面交互 `[AI]`
- [x] 4.1 改造 `src/screens/SettingsScreen.tsx`: `01c15d7`
  - 添加"分心应用"行：显示 summary（如"5 个应用, 1 个品类"），点击调用 `presentActivityPicker('distraction')`
  - 添加"工作应用（始终允许）"行：显示 summary，点击调用 `presentActivityPicker('work')`
  - 阻断中时两行 disabled（灰色 + "阻断期间不可修改"提示）
  - 未授权时其他选项灰色，突出显示授权按钮
  - 移除底部"所有设置均为只读"的提示（不再只读）
- [x] 4.2 添加首次设置引导卡片（onboarding card）— 授权状态为 `notDetermined` 时显示 `01c15d7`
- [x] 4.3 App 启动时（AppProvider）调用 `getSelectionSummary` 初始化 store 中的 summary `01c15d7`
- [ ] 4.4 `[HUMAN]` 真机验证：完整设置流程 — 授权 → 选择分心应用 → 查看 summary → 重启 App → summary 仍在

**Phase 2a 验收标准：**
- 用户能在 Settings 中选择分心应用和工作应用
- Selection 持久化到 App Group（App 重启后仍在）
- Settings 页面正确显示 summary（"5 个应用, 1 个品类"）
- 整条 Service 链路已改造为新签名（`enableBlocking(reason)`）
- 阻断仍然是 `.all()`（Phase 2b 在 Native 层切换为 token-based）

---

## Phase 2b: Token-based 精细阻断

> Service 层已在 Phase 2a Task 3 中改造完毕。Phase 2b 只需修改 Native 层的 `enableBlocking(useSelection: true)` 实现——从 `.all()` 切换为读取 App Group 中的 token。

### Task 5: Native 精细阻断实现 `[AI]`
- [x] 5.1 修改 `ScreenTimeModule.swift` — `enableBlocking(useSelection: true)` 实现：`4d88e33`
  - 从 AppGroupManager 读取 distraction selection
  - 从 AppGroupManager 读取 work selection
  - **App 集合：** `store.shield.applications = distractionApps.subtracting(workApps)`
  - **品类集合（关键）：** `store.shield.applicationCategories = .specific(distractionCategories, except: workApps)` — 必须用 `except` 参数，因为 opaque token 无法判断品类是否包含特定 App
- [ ] 5.2 `[HUMAN]` 真机验证：选择 3 个 App → 启动番茄钟 → 只有选中的被 Shield，其他正常
- [ ] 5.3 `[HUMAN]` 真机验证：选择"社交"品类 + 设置"微信"为工作 App → 阻断 → 微信可用、其他社交 App 被阻断

**Phase 2b 验收标准：**
- 阻断只影响用户选择的分心应用
- 工作白名单中的应用始终可用
- 未配置选择时回退到 `.all()`
- 阻断状态跨 App 重启保持

---

## Phase 2c: App Extensions

### Task 6: ShieldConfiguration Extension
- [ ] 6.1 `[HUMAN]` 在 Xcode 中创建 ShieldConfiguration Extension target:
  1. File → New → Target → Shield Configuration Extension
  2. Product Name: `ShieldConfigurationExtension`
  3. Bundle ID: `com.anonymous.vibeflow-ios.ShieldConfigurationExtension`
  4. Language: Swift, Deployment Target: iOS 16.0
  5. Signing & Capabilities → + Capability → App Groups → 添加 `group.app.vibeflow.shared`
  6. Signing & Capabilities → + Capability → Family Controls
  7. 确认 Extension 与主 App 使用同一 Team
- [x] 6.2 `[AI]` 实现 `VibeFlowShieldConfigurationDataSource.swift`（覆盖 Xcode 模板生成的文件）: `f23d60d`
  - 从 App Group 读取 blockingReason
  - focus: "专注中" / "番茄钟进行中" / "打开 VibeFlow"
  - over_rest: "休息超时" / "请返回工作" / "打开 VibeFlow"
  - sleep: "睡眠时间" / "明天 {endTime} 解锁" / "我知道了"
  - default fallback: "VibeFlow" / "应用已阻断"
- [x] 6.3 `[AI]` 配置 Shield 视觉样式（深色背景、白色文字、VibeFlow 品牌色按钮） `f23d60d`
- [ ] 6.4 `[HUMAN]` 真机验证：不同 reason 下 Shield 显示正确内容

### Task 7: DeviceActivityMonitor Extension
- [ ] 7.1 `[HUMAN]` 在 Xcode 中创建 DeviceActivityMonitor Extension target:
  1. File → New → Target → Device Activity Monitor Extension
  2. Product Name: `DeviceActivityMonitorExtension`
  3. Bundle ID: `com.anonymous.vibeflow-ios.DeviceActivityMonitorExtension`
  4. Language: Swift, Deployment Target: iOS 16.0
  5. Signing & Capabilities → App Groups → `group.app.vibeflow.shared`
  6. Signing & Capabilities → Family Controls
- [x] 7.2 `[AI]` 实现 `DeviceActivityMonitorExtension.swift`: `007ec88`
  - `intervalDidStart()` — 读取 AppGroupManager distraction + work selection → `.specific(_, except:)` 激活 shield
  - `intervalDidEnd()` — 清除 shield + 清除 blockingReason
  - 读取失败时回退 `.all()`
  - 注意：Extension 无法使用 AppGroupManager.swift（不在同一 target），需要在 Extension 内部直接读 UserDefaults，或将 AppGroupManager 加到 Extension 的 Compile Sources 中
- [x] 7.3 `[AI]` 修改 `ScreenTimeModule.swift` — 实现 `registerSleepSchedule()` / `clearSleepSchedule()` `007ec88`
  - 创建 `DeviceActivitySchedule`（含 DateComponents interval）
  - `DeviceActivityCenter().startMonitoring(.sleepSchedule, during: schedule)`
  - 先 `stopMonitoring(.sleepSchedule)` 再重新注册（避免冲突）
- [x] 7.4 `[AI]` 修改 `modules/screen-time/index.ts` — 添加 sleep schedule 函数（mock 已在 Task 3 中完成） `007ec88`
- [ ] 7.5 `[HUMAN]` 真机验证：注册短时间调度（如 2 分钟后）→ 杀 App → 阻断自动生效

### Task 8: 睡眠调度集成 `[AI]`
- [x] 8.1 修改 `src/services/screen-time.service.ts` — 实现 `registerSleepSchedule(startTime, endTime)` / `clearSleepSchedule()` `c7704bc`
  - 解析 "HH:mm" 格式为 hour/minute
  - 调用 native `registerSleepSchedule(h, m, h, m)` / `clearSleepSchedule()`
- [x] 8.2 修改 `src/services/blocking.service.ts` — `startListening()` 中添加 sleepTime 监听： `c7704bc`
  - `policy.sleepTime` 变化时 → `screenTimeService.registerSleepSchedule(start, end)`
  - sleepTime disabled → `screenTimeService.clearSleepSchedule()`
  - 跟踪 `prevSleepStart` / `prevSleepEnd` 避免重复注册
- [ ] 8.3 `[HUMAN]` 真机验证：Web 端修改睡眠时间 → iOS 收到 policy → 调度更新

**Phase 2c 验收标准：**
- 被阻断 App 显示自定义 Shield 页面（非系统默认）
- Shield 内容与当前阻断原因匹配
- 睡眠时间到达后，即使 App 未运行，阻断自动生效
- 睡眠时间结束后阻断自动解除

---

## Phase 2d: 集成完善

### Task 9: StatusScreen 阻断信息展示 `[AI]`
- [ ] 9.1 修改 `src/screens/StatusScreen.tsx` — Banner 展示增强：
  - "专注模式 — {appCount} 个分心应用已阻断，剩余 {minutes} 分钟"
  - "睡眠时段 — {appCount} 个分心应用已阻断，{endTime} 解锁"
  - "超时休息 — {appCount} 个分心应用已阻断"
- [ ] 9.2 从 store 获取 selectionSummary 用于显示 appCount

### Task 10: 错误处理和边界情况 `[AI]`
- [ ] 10.1 授权被撤销时的处理：`evaluateBlockingState` 中检测 → 更新 UI → 停止阻断
- [ ] 10.2 App Group 读取失败时的 fallback：Native 层 catch 后走 `.all()` 兜底
- [ ] 10.3 DeviceActivity 调度注册失败时的 fallback（记日志，不 crash）
- [ ] 10.4 阻断中修改选择被禁止的逻辑：SettingsScreen 检查 `isBlockingActive` → disable 按钮

### Task 11: 测试 `[AI]` + `[HUMAN]`
- [ ] 11.1 `[AI]` 单元测试：`evaluateBlockingReason()` 各状态组合
- [ ] 11.2 `[AI]` 单元测试：`enableBlocking(reason)` 参数传递正确性（mock native 验证调用参数）
- [ ] 11.3 `[AI]` 单元测试：SelectionSummary 处理逻辑（hasSelection true/false → useSelection 参数）
- [ ] 11.4 `[AI]` 属性测试（fast-check）：阻断原因优先级在任意组合下正确
- [ ] 11.5 `[HUMAN]` 真机集成测试 checklist:
  - 完整流程：授权 → 选择 → 番茄钟 → 阻断 → 结束 → 解除
  - 离线睡眠：注册 → 杀 App → 等时间 → 阻断生效
  - 断网保持：阻断中 → 飞行模式 → 阻断不解除
  - 重启保持：阻断中 → App 重启 → 阻断恢复
  - 白名单：工作 App 始终可用
  - 品类 + 白名单交叉：选"社交"品类 + "微信"工作 App → 微信可用

### Task 12: Extension 自动化构建（Config Plugin） `[AI]`

> **目标**：通过 Config Plugin 在 `npx expo prebuild` 时自动注入 Extension targets，消除手动 Xcode 操作和 `ios/` 目录锁定。
>
> **前提**：Phase 2c Task 6.1/7.1 中已在 Xcode 手动创建好 Extension 并验证功能正常。本 Task 是把手动步骤自动化。

- [ ] 12.1 `[AI]` 将 Extension 源码抽离到模板目录：
  ```
  vibeflow-ios/extensions/
  ├── ShieldConfigurationExtension/
  │   ├── VibeFlowShieldConfigurationDataSource.swift
  │   ├── Info.plist
  │   └── ShieldConfigurationExtension.entitlements
  └── DeviceActivityMonitorExtension/
      ├── DeviceActivityMonitorExtension.swift
      ├── Info.plist
      └── DeviceActivityMonitorExtension.entitlements
  ```
- [ ] 12.2 `[AI]` 调研 `@bacons/apple-targets`（或同类插件）是否支持 `shield-configuration` 和 `device-activity-monitor` extension types
  - 如果支持 → 12.3a
  - 如果不支持 → 12.3b
- [ ] 12.3a `[AI]`（插件支持时）在 `app.json` 中配置 `@bacons/apple-targets`，指向 `extensions/` 模板目录
- [ ] 12.3b `[AI]`（插件不支持时）编写自定义 Config Plugin `plugins/withScreenTimeExtensions.js`：
  - 使用 `@expo/config-plugins` 的 `withXcodeProject` hook
  - 自动向 `.pbxproj` 注入两个 Extension targets（PBXNativeTarget, PBXBuildPhase, PBXFileReference）
  - 复制 `extensions/` 中的源码到 `ios/` 对应位置
  - 为每个 target 配置 App Group + Family Controls entitlements
  - 设置 Deployment Target = 16.0, Swift 5.9
- [ ] 12.4 `[AI]` 验证 `npx expo prebuild --clean && xcodebuild` 能成功编译（含 Extension targets）
- [ ] 12.5 `[AI]` 从 `.gitignore` 中确认 `ios/` 目录被忽略（回归 CNG 标准流程）
- [ ] 12.6 `[AI]` 更新 CLAUDE.md — 说明 Extension 通过 Config Plugin 自动生成，不需要手动 Xcode 操作

> **回退方案**：如果 12.3a/12.3b 在合理时间内无法完成，回退到手动方案：提交 `ios/` 到 Git + CLAUDE.md 警告禁止 `prebuild --clean`。功能不受影响，只是构建流程需要额外注意。

> **不采纳的建议**：App Group ID 动态化（从 Info.plist 读取而非硬编码）。当前只有一个环境的 Bundle ID，没有 Dev/Prod 分离需求，属于 YAGNI。如未来需要多环境 Bundle ID，再做此改动。

**Phase 2d 验收标准：**
- StatusScreen 正确显示阻断信息和 app count
- 所有错误场景有合理 fallback
- 单元测试和属性测试通过
- 真机集成测试 checklist 全部通过
- `npx expo prebuild --clean` 后 Extension targets 自动生成（如 Task 12 成功）

---

## 人工介入汇总

| Task | 操作 | 预估耗时 |
|------|------|----------|
| 0.1-0.4 | Apple Developer Portal 配置 + 真机准备 | 15-30 min（一次性） |
| 1.5, 2.4, 3.7, 4.4 | Phase 2a 各步真机验证 | 每次 5 min |
| 5.2, 5.3 | Phase 2b 精细阻断真机验证 | 10 min |
| 6.1, 7.1 | Xcode 创建 Extension targets（首次，后续由 Config Plugin 替代） | 20-30 min |
| 6.4, 7.5, 8.3 | Phase 2c 真机验证 | 每次 5-10 min |
| 11.5 | 最终集成测试 | 30 min |

**你需要介入约 6-8 次，全部是真机验证或一次性配置。如果 Task 12 的 Config Plugin 方案成功，Phase 2c 的 Task 6.1/7.1（手动创建 Extension）在后续构建中也不再需要。**
