# Design Document: iOS Screen Time API 集成

## Overview

将 iOS 端从 Phase 1（`.all()` 全品类阻断）升级为 Phase 2（FamilyActivityPicker token-based 精细阻断），新增自定义 Shield 页面和离线睡眠调度。核心原则：**用户只需首次选择分心应用，之后一切自动。**

## Architecture

### 系统架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                      VibeFlow Server                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Socket.io   │  │  Policy      │  │  Sleep Time / Over-Rest  │   │
│  │  Server      │  │  Distribution│  │  Services                │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
└─────────┼─────────────────┼───────────────────────┼─────────────────┘
          │ WebSocket        │ policy push           │
          │                  │                       │
┌─────────┼─────────────────┼───────────────────────┼─────────────────┐
│         │                  │                       │                 │
│  ┌──────▼──────────────────▼───────────────────────▼──────┐         │
│  │                  React Native App                       │         │
│  │  ┌────────────┐  ┌────────────────┐  ┌──────────────┐  │         │
│  │  │ AppStore   │  │ BlockingService│  │ ScreenTime   │  │         │
│  │  │ (Zustand)  │◄─┤ (orchestrator) ├──► Service      │  │         │
│  │  └─────┬──────┘  └────────────────┘  └──────┬───────┘  │         │
│  │        │                                     │          │         │
│  │  ┌─────▼──────┐                      ┌───────▼───────┐ │         │
│  │  │  Settings  │                      │  Expo Native  │ │         │
│  │  │  Screen    │                      │  Module       │ │         │
│  │  └────────────┘                      │  (Swift)      │ │         │
│  └──────────────────────────────────────┤               ├──┘         │
│                                         └───────┬───────┘           │
│                                                 │                   │
│  ┌──────────────────────────────────────────────┼─────────────────┐ │
│  │              App Group (shared data)         │                 │ │
│  │  ┌──────────────────┐  ┌─────────────────┐   │                 │ │
│  │  │ FamilyActivity   │  │ BlockingReason  │   │                 │ │
│  │  │ Selection (JSON) │  │ + SleepSchedule │   │                 │ │
│  │  └────────┬─────────┘  └────────┬────────┘   │                 │ │
│  └───────────┼─────────────────────┼─────────────────────────────┘ │
│              │                     │                               │
│  ┌───────────▼─────────┐  ┌───────▼─────────────┐                 │
│  │ ShieldConfiguration │  │ DeviceActivity       │                 │
│  │ Extension           │  │ Monitor Extension    │                 │
│  │ (custom shield UI)  │  │ (offline sleep)      │                 │
│  └─────────────────────┘  └──────────────────────┘                 │
│                                                                     │
│                          iOS Device                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
── 阻断激活 ──

Server policy push
  → AppStore.policy updated
  → BlockingService.evaluateBlockingState()
  → reason = focus | over_rest | sleep
  → ScreenTimeService.enableBlocking(reason)
  → ScreenTimeModule.swift:
      1. Read distraction FamilyActivitySelection from App Group
      2. Read work FamilyActivitySelection from App Group
      3. store.shield.applications = distractionApps.subtracting(workApps)
      4. store.shield.applicationCategories = .specific(distractionCategories, except: workApps)
      5. Write blockingReason to App Group (for Shield extension)

── Shield 展示 ──

User taps blocked app
  → iOS shows ShieldConfigurationExtension
  → Extension reads blockingReason from App Group
  → Returns localized title/subtitle/icon/button

── 离线睡眠 ──

Server pushes sleepTime policy
  → ScreenTimeModule.registerSleepSchedule(start, end)
  → DeviceActivityCenter.startMonitoring(schedule)
  → At start time (app not running!):
      DeviceActivityMonitor.intervalDidStart()
      → Read selection from App Group
      → ManagedSettingsStore.shield.applications = selection
  → At end time:
      DeviceActivityMonitor.intervalDidEnd()
      → ManagedSettingsStore.shield = nil
```

## Components and Interfaces

### 1. Native Module — ScreenTimeModule.swift (扩展)

当前 Phase 1 有 5 个函数，Phase 2 扩展到 11 个。

```swift
// modules/screen-time/ios/ScreenTimeModule.swift

public class ScreenTimeModule: Module {
  private let store = ManagedSettingsStore()
  private let appGroupId = "group.app.vibeflow.shared"

  // App Group UserDefaults keys
  private let selectionKey = "familyActivitySelection"
  private let workAppsKey = "workAppsSelection"
  private let blockingReasonKey = "blockingReason"
  private let sleepScheduleKey = "sleepSchedule"

  public func definition() -> ModuleDefinition {
    Name("ScreenTime")

    // --- 保留 Phase 1 ---
    AsyncFunction("requestAuthorization")  // 不变
    AsyncFunction("getAuthorizationStatus") // 不变
    AsyncFunction("isBlockingEnabled")      // 不变

    // --- Phase 2 新增/修改 ---

    // 带参数的阻断控制
    AsyncFunction("enableBlocking") { (useSelection: Bool, promise: Promise) in
      // useSelection=true  → 从 App Group 读取 token，精细阻断
      // useSelection=false → .all() 全品类阻断（兜底）
    }

    AsyncFunction("disableBlocking") { (promise: Promise) in
      // 清除 shield.applications + shield.applicationCategories
    }

    // FamilyActivityPicker 模态弹出
    // 通过 UIHostingController present，不需要 ExpoView 桥接
    AsyncFunction("presentActivityPicker") { (type: String, promise: Promise) in
      // type = "distraction" | "work"
      // 获取 rootVC → UIHostingController(FamilyActivityPicker) → present
      // 用户确认后保存到 App Group，返回 SelectionSummary
    }

    // 选择摘要
    AsyncFunction("getSelectionSummary") { (type: String, promise: Promise) in
      // type = "distraction" | "work"
      // 返回 { appCount: Int, categoryCount: Int }
    }

    // 阻断原因（写入 App Group，供 Shield Extension 读取）
    AsyncFunction("setBlockingReason") { (reason: String, promise: Promise) in
      // 写入 App Group: { reason, timestamp, extraInfo }
    }

    // 睡眠调度
    AsyncFunction("registerSleepSchedule") {
      (startHour: Int, startMinute: Int, endHour: Int, endMinute: Int, promise: Promise) in
      // DeviceActivityCenter.startMonitoring(schedule)
    }

    AsyncFunction("clearSleepSchedule") { (promise: Promise) in
      // DeviceActivityCenter.stopMonitoring()
    }
  }
}
```

### 2. FamilyActivityPicker — 模态弹出方式

FamilyActivityPicker 是 SwiftUI View。通过 `AsyncFunction("presentActivityPicker")` 获取当前 ViewController，以 `UIHostingController` 模态弹出，完全符合 iOS 原生交互规范。

```swift
// modules/screen-time/ios/ScreenTimeModule.swift (presentActivityPicker 部分)

AsyncFunction("presentActivityPicker") { (type: String, promise: Promise) in
  DispatchQueue.main.async {
    guard let rootVC = UIApplication.shared
      .connectedScenes.compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?
      .rootViewController else {
      promise.reject("NO_VIEW_CONTROLLER", "Cannot find root view controller")
      return
    }

    let appGroup = AppGroupManager.shared
    let initial = (type == "work")
      ? appGroup.loadWorkAppsSelection()
      : appGroup.loadDistractionSelection()

    // 用 ObservableObject 持有 selection，避免 SwiftUI @State 闭包捕获问题
    let model = ActivitySelectionModel(selection: initial ?? FamilyActivitySelection())

    let pickerView = ActivityPickerSheet(
      model: model,
      title: type == "work" ? "工作应用" : "分心应用",
      onDone: { finalSelection in
        if type == "work" {
          appGroup.saveWorkAppsSelection(finalSelection)
        } else {
          appGroup.saveDistractionSelection(finalSelection)
        }
        rootVC.dismiss(animated: true) {
          let summary: [String: Any] = [
            "appCount": finalSelection.applicationTokens.count,
            "categoryCount": finalSelection.categoryTokens.count,
            "hasSelection": !finalSelection.applicationTokens.isEmpty
              || !finalSelection.categoryTokens.isEmpty,
          ]
          promise.resolve(summary)
        }
      }
    )

    let hostingController = UIHostingController(rootView: pickerView)
    rootVC.present(hostingController, animated: true)
  }
}

// --- 辅助类型 ---

// ObservableObject 持有 selection 状态（解决 SwiftUI 闭包捕获问题）
class ActivitySelectionModel: ObservableObject {
  @Published var selection: FamilyActivitySelection
  init(selection: FamilyActivitySelection) { self.selection = selection }
}

// SwiftUI Picker 包装 View
struct ActivityPickerSheet: View {
  @ObservedObject var model: ActivitySelectionModel
  let title: String
  let onDone: (FamilyActivitySelection) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $model.selection)
        .navigationTitle(title)
        .navigationBarItems(trailing: Button("完成") { onDone(model.selection) })
    }
  }
}
```

**React Native 侧调用：**

```typescript
// 在 SettingsScreen 中
const handleSelectDistractionApps = async () => {
  const summary = await ScreenTimeNative.presentActivityPicker('distraction');
  setDistractionSummary(summary);
};

const handleSelectWorkApps = async () => {
  const summary = await ScreenTimeNative.presentActivityPicker('work');
  setWorkAppsSummary(summary);
};
```

不需要额外的 ExpoView 组件，实现更简单、交互更原生。

### 3. TypeScript Bridge — index.ts (扩展)

```typescript
// modules/screen-time/index.ts

interface ScreenTimeNativeModule {
  // Phase 1 (保留)
  requestAuthorization(): Promise<string>;
  getAuthorizationStatus(): Promise<string>;
  isBlockingEnabled(): Promise<boolean>;

  // Phase 2 (新增)
  enableBlocking(useSelection: boolean): Promise<void>;
  disableBlocking(): Promise<void>;
  presentActivityPicker(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  setBlockingReason(reason: string): Promise<void>;
  registerSleepSchedule(
    startHour: number, startMinute: number,
    endHour: number, endMinute: number
  ): Promise<void>;
  clearSleepSchedule(): Promise<void>;
}

interface SelectionSummary {
  appCount: number;
  categoryCount: number;
  hasSelection: boolean;
}
```

### 4. ScreenTimeService (改造)

```typescript
// src/services/screen-time.service.ts

export interface ScreenTimeService {
  // Phase 1 保留
  initialize(): Promise<void>;
  requestAuthorization(): Promise<AuthorizationStatus>;
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  isBlockingActive(): Promise<boolean>;
  getBlockingState(): Promise<BlockingState | null>;

  // Phase 2 新增
  enableBlocking(reason: BlockingReason): Promise<void>;
    // 内部逻辑：
    // 1. getSelectionSummary('distraction')
    // 2. hasSelection? → enableBlocking(useSelection=true) : enableBlocking(useSelection=false)
    // 3. setBlockingReason(reason)
    // 4. persistBlockingState(...)

  disableBlocking(): Promise<void>;
    // 内部逻辑：
    // 1. native.disableBlocking()
    // 2. clearBlockingState()

  getSelectionSummary(type: 'distraction' | 'work'): Promise<SelectionSummary>;
  registerSleepSchedule(startTime: string, endTime: string): Promise<void>;
  clearSleepSchedule(): Promise<void>;
}
```

**接口变更说明：**

Phase 1 的 `enableBlocking(apps, pomodoroId, reason)` 改为 `enableBlocking(reason)`。原因：
- `apps: BlockedApp[]` 是 bundleId 方式，iOS 上不适用（opaque token）
- `pomodoroId` 移入 BlockingState 内部管理
- 只需传 `reason`，具体用哪些 token 由 native 层从 App Group 读取

### 5. BlockingService (小改)

```typescript
// src/services/blocking.service.ts

// evaluateBlockingState() 改动：
async function evaluateBlockingState(): Promise<void> {
  const reason = evaluateBlockingReason();

  if (reason !== null) {
    if (!isBlockingActive || blockingReason !== reason) {
      // Phase 2: 不再传 apps 列表，由 native 层读取 token
      await screenTimeService.enableBlocking(reason);
      useAppStore.getState().setBlockingActive(true);
      useAppStore.getState().setBlockingReason(reason);
    }
  } else {
    if (isBlockingActive) {
      await screenTimeService.disableBlocking();
      useAppStore.getState().setBlockingActive(false);
      useAppStore.getState().setBlockingReason(null);
    }
  }
}

// startListening() 新增：监听 sleepTime 变化注册/清除离线调度
// 当 policy.sleepTime 变化时：
//   enabled && !isCurrentlyActive → registerSleepSchedule(startTime, endTime)
//   !enabled → clearSleepSchedule()
```

### 6. App Extensions

#### ShieldConfigurationExtension

```swift
// ios/ShieldConfigurationExtension/ShieldConfigurationDataSource.swift

import ManagedSettingsUI
import UIKit

class VibeFlowShieldConfigurationDataSource: ShieldConfigurationDataSource {
  let appGroupId = "group.app.vibeflow.shared"

  override func configuration(
    shielding application: Application
  ) -> ShieldConfiguration {
    let reason = readBlockingReason()  // 从 App Group 读取

    switch reason {
    case "focus":
      return ShieldConfiguration(
        backgroundBlurStyle: .dark,
        backgroundColor: .black.withAlphaComponent(0.9),
        icon: UIImage(named: "vibeflow-icon"),
        title: ShieldConfiguration.Label(text: "专注中", color: .white),
        subtitle: ShieldConfiguration.Label(text: "番茄钟进行中", color: .gray),
        primaryButtonLabel: ShieldConfiguration.Label(text: "打开 VibeFlow", color: .white),
        primaryButtonBackgroundColor: .systemBlue
      )
    case "over_rest":
      return ShieldConfiguration(
        // ... "休息超时" / "请返回工作"
      )
    case "sleep":
      return ShieldConfiguration(
        // ... "睡眠时间" / "明天 {endTime} 解锁"
      )
    default:
      return ShieldConfiguration(
        title: ShieldConfiguration.Label(text: "VibeFlow", color: .white),
        subtitle: ShieldConfiguration.Label(text: "应用已阻断", color: .gray)
      )
    }
  }

  private func readBlockingReason() -> String {
    let defaults = UserDefaults(suiteName: appGroupId)
    return defaults?.string(forKey: "blockingReason") ?? "focus"
  }
}
```

#### DeviceActivityMonitorExtension

```swift
// ios/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift

import DeviceActivity
import ManagedSettings
import FamilyControls

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  let store = ManagedSettingsStore()
  let appGroupId = "group.app.vibeflow.shared"

  override func intervalDidStart(for activity: DeviceActivityName) {
    // 读取分心应用选择和工作应用选择
    guard let distractionSelection = loadSelection(key: "familyActivitySelection") else {
      store.shield.applicationCategories = .all()  // 兜底
      writeBlockingReason("sleep")
      return
    }

    let workSelection = loadSelection(key: "workAppsSelection")
    let workApps = workSelection?.applicationTokens ?? Set()

    // 写入阻断原因
    writeBlockingReason("sleep")

    // 精细阻断 — 使用 .specific(_, except:) 处理品类与白名单的交叉
    store.shield.applications = distractionSelection.applicationTokens.subtracting(workApps)
    store.shield.applicationCategories = .specific(
      distractionSelection.categoryTokens,
      except: workApps
    )
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    store.shield.applications = nil
    store.shield.applicationCategories = nil
    clearBlockingReason()
  }

  private func loadSelection(key: String) -> FamilyActivitySelection? {
    let defaults = UserDefaults(suiteName: appGroupId)
    guard let data = defaults?.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  private func writeBlockingReason(_ reason: String) {
    let defaults = UserDefaults(suiteName: appGroupId)
    defaults?.set(reason, forKey: "blockingReason")
  }

  private func clearBlockingReason() {
    let defaults = UserDefaults(suiteName: appGroupId)
    defaults?.removeObject(forKey: "blockingReason")
  }
}
```

### 7. Expo Config Plugin (扩展)

```javascript
// plugins/withFamilyControls.js

// 当前：只添加 family-controls entitlement
// 扩展：
// 1. 添加 App Group entitlement
// 2. 添加 ShieldConfiguration Extension target
// 3. 添加 DeviceActivityMonitor Extension target
// 4. 添加 DeviceActivity framework 链接

function withFamilyControls(config) {
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.family-controls'] = true;
    mod.modResults['com.apple.security.application-groups'] = [
      'group.app.vibeflow.shared'
    ];
    return mod;
  });

  // Extension targets 需要手动在 Xcode 中创建
  // 或使用 @anthropic/expo-plugin-app-extension（如果可用）
  // 目前通过 Xcode 手动配置更可靠

  return config;
}
```

## Data Models

### App Group Shared Data

所有数据通过 `UserDefaults(suiteName: "group.app.vibeflow.shared")` 存储。

| Key | Type | 说明 |
|-----|------|------|
| `familyActivitySelection` | Data (Codable) | 分心应用 FamilyActivitySelection |
| `workAppsSelection` | Data (Codable) | 工作应用 FamilyActivitySelection |
| `blockingReason` | String | 当前阻断原因: "focus" / "over_rest" / "sleep" |
| `blockingReasonExtra` | Data (JSON) | 额外信息: `{ endTime?, remainingMinutes? }` |
| `sleepSchedule` | Data (JSON) | `{ startHour, startMinute, endHour, endMinute }` |

### TypeScript Types (扩展)

```typescript
// src/types/index.ts 新增

export interface SelectionSummary {
  appCount: number;
  categoryCount: number;
  hasSelection: boolean;
}

export interface SleepScheduleConfig {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}
```

### BlockingState (改造)

```typescript
// 当前
export interface BlockingState {
  isActive: boolean;
  blockedApps: BlockedApp[];     // bundleId 列表 — Phase 2 中不再有意义
  pomodoroId: string | null;
  activatedAt: number | null;
  reason: BlockingReason | null;
}

// Phase 2
export interface BlockingState {
  isActive: boolean;
  selectionSummary: SelectionSummary | null;  // 替代 blockedApps
  pomodoroId: string | null;
  activatedAt: number | null;
  reason: BlockingReason | null;
}
```

## Xcode Project Structure

```
vibeflow-ios/
├── ios/
│   ├── vibeflowios/
│   │   ├── vibeflowios.entitlements      # 修改：添加 App Group
│   │   └── Info.plist                     # 修改：添加 NSFamilyControlsUsageDescription
│   │
│   ├── ShieldConfigurationExtension/      # 新建 Extension target
│   │   ├── ShieldConfigurationExtension.entitlements
│   │   ├── ShieldConfigurationDataSource.swift
│   │   └── Info.plist
│   │
│   └── DeviceActivityMonitorExtension/    # 新建 Extension target
│       ├── DeviceActivityMonitorExtension.entitlements
│       ├── DeviceActivityMonitorExtension.swift
│       └── Info.plist
│
├── modules/screen-time/
│   ├── ios/
│   │   ├── ScreenTimeModule.swift         # 修改：扩展函数 + presentActivityPicker
│   │   ├── AppGroupManager.swift          # 新建：App Group 读写封装
│   │   └── ScreenTime.podspec             # 修改：添加 DeviceActivity framework
│   ├── index.ts                           # 修改：扩展接口
│   └── expo-module.config.json            # 可能需要修改
│
├── src/
│   ├── services/
│   │   ├── screen-time.service.ts         # 修改：新接口
│   │   └── blocking.service.ts            # 修改：简化 + 睡眠调度
│   ├── screens/
│   │   └── SettingsScreen.tsx             # 修改：完整的设置交互
│   └── types/
│       └── index.ts                       # 修改：新类型
│
└── plugins/
    └── withFamilyControls.js              # 修改：App Group entitlement
```

## Correctness Properties

### Property 1: 阻断精度

*For any* blocking activation:
- IF user has configured distraction app selection, THEN only those apps + categories SHALL be shielded
- IF user has NOT configured selection, THEN `.all()` SHALL be used (Phase 1 兜底)
- Work app tokens SHALL NEVER be in the shield set

### Property 2: 阻断原因优先级

*For any* combination of active reasons:
- `focus > over_rest > sleep`
- Shield 页面显示最高优先级原因
- 当最高优先级原因解除时，检查低优先级再决定是否解除阻断

### Property 3: 离线睡眠独立性

*For any* registered sleep schedule:
- DeviceActivityMonitor SHALL activate blocking at start time regardless of app state
- DeviceActivityMonitor SHALL deactivate blocking at end time regardless of app state
- 主 App 崩溃、被杀、无网络均不影响

### Property 4: App Group 数据一致性

*For any* FamilyActivitySelection 更新:
- 主 App 写入的 selection 必须能被两个 Extension 正确读取
- 使用 Codable 序列化确保兼容性
- 读取失败时回退到 `.all()`

### Property 5: Shield 内容正确性

*For any* Shield 展示:
- 显示内容必须匹配当前 blockingReason
- blockingReason 变更后 Shield 内容应更新（下次展示时）
- Extension 读取 App Group 失败时显示默认内容

## Error Handling

### Authorization Errors

| 场景 | 处理 |
|------|------|
| 用户拒绝授权 | 显示说明 + 系统设置深链接，不再自动弹窗 |
| 授权被撤销 | 下次 evaluateBlockingState 时检测到，更新 UI，停止阻断 |
| iOS < 16.0 | `getAuthorizationStatus` 返回 `restricted`，所有功能降级 |

### App Group Errors

| 场景 | 处理 |
|------|------|
| Selection 读取失败 | 回退到 `.all()` 全品类阻断 |
| Reason 读取失败 | Shield 显示默认内容 |
| 写入失败 | 记录错误日志，不影响主流程 |

### DeviceActivity Errors

| 场景 | 处理 |
|------|------|
| 调度注册失败 | 回退到 App 内定时器（需要 App 运行） |
| Extension 被系统终止 | OS 级保证自动重启，无需处理 |
| 时间表冲突 | 先 stopMonitoring 再重新注册 |

## Testing Strategy

### Unit Tests (Vitest)

1. **BlockingService.evaluateBlockingReason()** — 各状态组合 → 正确 reason
2. **优先级逻辑** — focus + sleep 同时存在 → focus 优先
3. **SelectionSummary 处理** — hasSelection true/false → useSelection 参数

### Property Tests (fast-check)

```typescript
// 属性: 阻断激活/解除的对称性
fc.assert(fc.property(
  fc.array(fc.constantFrom('focus', 'over_rest', 'sleep', null)),
  (reasonSequence) => {
    // 模拟一系列 reason 变化
    // 验证最终状态与最后一个 reason 一致
    // 验证 enable/disable 调用次数最小化（不重复）
  }
));
```

### Integration Tests

- Mock native module 验证 TS → Native 调用参数正确性
- 验证 BlockingService + ScreenTimeService 协作流程

### Device Tests (手动，真机)

| 测试 | 步骤 | 预期 |
|------|------|------|
| 精细阻断 | 选择 3 个 App → 启动番茄钟 → 尝试打开 | 选中的被阻断，其他正常 |
| 工作白名单 | 设置钉钉为工作 App → 阻断中打开钉钉 | 钉钉可用 |
| Shield 内容 | 不同 reason 触发 Shield | 显示对应中文标题 |
| 离线睡眠 | 注册睡眠 → 杀 App → 等到时间 | 阻断自动生效 |
| 断网保持 | 阻断中 → 开飞行模式 | 阻断不解除 |

## Implementation Notes

### FamilyActivityPicker 的弹出方式

FamilyActivityPicker 是 SwiftUI View。采用 `UIHostingController` 模态弹出方案：

通过 `AsyncFunction("presentActivityPicker")` 获取当前 rootViewController，创建 `UIHostingController` 包裹 `FamilyActivityPicker`，以 `.present(animated: true)` 模态弹出。用户确认后保存 selection 到 App Group，dismiss 后 resolve promise 返回 `SelectionSummary`。

优点：
- 完全符合 iOS 原生模态交互规范
- 不需要 ExpoView 桥接，实现更简单
- 避免了嵌入式 View 的高度自适应和滚动冲突问题

### 工作白名单的 except API

由于 opaque token 的隐私设计，当用户选择了整个品类（如"社交"）作为分心应用，又选了具体 App（如"微信"）作为工作应用时，无法在代码中判断"社交"品类是否包含"微信"。

必须使用 Apple 的 `.specific(_, except:)` API：

```swift
// 单独选择的 App — 可以直接做集合减法
store.shield.applications = distractionApps.subtracting(workApps)

// 品类 — 使用 except 排除工作 App
store.shield.applicationCategories = .specific(
  distractionCategories,
  except: workApps
)
```

这是唯一正确的实现方式，不能尝试手动从品类中移除 token。

### Extension Target 配置

**两阶段策略：先手动创建验证功能，再自动化构建流程。**

**阶段 1（Phase 2c）：手动创建**

在 Xcode 中创建两个 Extension targets（ShieldConfiguration + DeviceActivityMonitor），手动配置 App Group、Family Controls capability，验证功能正确。

**阶段 2（Phase 2d）：Config Plugin 自动化**

将 Extension 源码抽离到 `vibeflow-ios/extensions/` 模板目录，通过 Config Plugin（优先尝试 `@bacons/apple-targets`，不支持则自定义 `withXcodeProject` 插件）在 `npx expo prebuild` 时自动注入 targets 到 `.pbxproj`。

```
vibeflow-ios/extensions/        ← 模板源码，提交到 Git
├── ShieldConfigurationExtension/
│   ├── VibeFlowShieldConfigurationDataSource.swift
│   ├── Info.plist
│   └── ShieldConfigurationExtension.entitlements
└── DeviceActivityMonitorExtension/
    ├── DeviceActivityMonitorExtension.swift
    ├── Info.plist
    └── DeviceActivityMonitorExtension.entitlements
```

自动化成功后，`ios/` 目录回归 `.gitignore`（CNG 标准流程），团队可随时安全执行 `prebuild --clean`。

**回退方案**：如果 Config Plugin 方案工程量超预期，回退到提交 `ios/` 到 Git + CLAUDE.md 警告。功能不受影响。

### 离线时番茄钟结束的行为（产品决策）

**场景**：用户开启 25 分钟番茄钟 → 手机进入阻断 → 杀掉 App 或断网 → 25 分钟后服务端番茄钟结束 → 手机因收不到 WebSocket 消息而**持续阻断**。

**决策：保持无限期阻断，不添加 DeviceActivitySchedule 兜底。** 理由：
- 严格模式的核心承诺是"你必须面对后果"
- 如果添加 25 分钟自动解锁，用户会发现"杀 App 等 25 分钟即可绕过"，破坏产品价值
- 用户重新打开 App 后会立即同步状态并解除

如未来添加"温和模式"，可重新评估此决策。

### 渐进迁移策略

为避免 breaking change，采用 feature flag 方式渐进迁移：

1. **Phase 2a**: 新增 FamilyActivityPicker + App Group 存储，`enableBlocking` 保持 `.all()`
2. **Phase 2b**: 当 `hasSelection=true` 时切换为 token-based 阻断
3. **Phase 2c**: 新增 Shield Extension + DeviceActivityMonitor Extension
4. **Phase 2d**: 全功能上线，移除 Phase 1 兜底代码（保留作为最终 fallback）

每个子阶段在真机上验证后再进入下一阶段。

---

## Phase 3: 临时解锁 (via AI Chat)

### 概述

用户在被 Screen Time 阻断时（focus/over_rest/sleep），可通过 AI 对话请求临时解锁。设计上有摩擦但不过度限制：AI 引导说明理由和时长 → 确认卡片二次确认 → 记录入库。通过次数限制（3 次/天）+ 时长限制（15 分钟）防止滥用。

### 数据模型

```
ScreenTimeExemption {
  id, userId, blockingReason, reasonText, duration,
  grantedAt, expiresAt, revokedAt?
}

UserSettings += {
  tempUnblockDailyLimit: Int (default 3, range 1-10)
  tempUnblockMaxDuration: Int (default 15, range 1-30)
}
```

### 数据流

```
iOS Chat → "帮我解锁 5 分钟"
  → AI 确认理由 → flow_request_temporary_unblock (requiresConfirmation=true)
  → 确认卡片 → 用户点确认
  → screenTimeExemptionService.requestTemporaryUnblock()
    → DB: 创建 ScreenTimeExemption
    → setTimeout: N 分钟后重推 policy
    → 立即 broadcastPolicyUpdate()
      → compilePolicy() → temporaryUnblock: { active: true, endTime }
  → iOS 收到 UPDATE_POLICY → store 更新
  → evaluateBlockingReason() 返回 null (临时解锁优先级最高)
  → screenTimeService.disableBlocking() → 应用解锁

... N 分钟后 ...

Server setTimeout fires → broadcastPolicyUpdate()
  → compilePolicy() → exemption 已过期 → 无 temporaryUnblock
  → iOS evaluateBlockingReason() 正常评估 → 重新阻断
```

### Policy 扩展

`Policy.temporaryUnblock?: { active: boolean; endTime: number }` — 仅在有活跃 exemption 时附带。iOS 端 `evaluateBlockingReason()` 在所有阻断检查之前先检查此字段，若 active 且未过期则返回 null（不阻断）。

### 防滥用机制

- 每日次数限制：默认 3 次，可在 UserSettings 调整（1-10）
- 单次时长限制：请求 duration 被 clamp 到 min(requested, tempUnblockMaxDuration)
- 不可叠加：已有活跃 exemption 时拒绝新请求
- 服务重启恢复：`restoreActiveTimers()` 扫描未过期 exemption 重建定时器
- iOS 端双保险：`blocking.service.ts` 设置本地 setTimeout 在 endTime+500ms 时重评估
