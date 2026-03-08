# iOS Screen Time API 集成方案 Review 意见

整体来看，这份设计文档（Requirements, Design, Tasks）非常详实，对 Apple Screen Time API 的限制（如 Opaque Tokens）理解准确，分阶段（2a-2d）的实施策略也非常稳妥。

结合当前 `vibeflow-ios` 的代码库和 Expo/React Native 的技术栈，我有以下几个关键的技术建议和补充：

## 1. 核心技术修正：工作应用白名单的实现 (Crucial)

在 `design.md` 和 `tasks.md` 中提到：
> "从 distraction set 中移除 work tokens"

**问题**：由于 Apple 的 `ApplicationToken` 和 `ActivityCategoryToken` 是不透明的（Opaque），如果用户在“分心应用”中选择了一个**品类**（例如“社交”），而在“工作应用”中选择了一个**具体 App**（例如“微信”），你无法在代码中直接做集合的减法（因为你不知道“社交”品类里包不包含“微信”）。

**解决方案**：Apple 的 `ManagedSettings` 框架原生支持了这种“排除”逻辑。在设置 shield 时，必须使用 `except` 参数：

```swift
// 正确的实现方式
let distractionApps = distractionSelection.applicationTokens
let distractionCategories = distractionSelection.categoryTokens
let workApps = workSelection.applicationTokens

// 1. 处理单独选择的 Apps（可以做集合减法，因为类型相同）
store.shield.applications = distractionApps.subtracting(workApps)

// 2. 处理品类，并使用 except 排除工作 Apps
store.shield.applicationCategories = .specific(
    distractionCategories,
    except: workApps
)
```
*建议在 `design.md` 和 `tasks.md` (Task 7.1) 中明确使用 `.specific(_, except:)` API。*

## 2. Expo 架构建议：FamilyActivityPicker 的展示方式

在 `design.md` 中，方案 A 计划将 `FamilyActivityPicker` 封装为 `ExpoView` 并在 React Native 组件树中渲染。

**风险**：`FamilyActivityPicker` 在 SwiftUI 中通常是通过 `.sheet` 或 `.popover` 模态弹出的。如果强行将其嵌入到 React Native 的普通 View 层级中，可能会遇到高度自适应、滚动冲突或 Apple 审核时的 UI 规范问题。

**建议**：采用**方案 B**（通过 Native 函数直接弹出）。在 `ScreenTimeModule.swift` 中提供一个 `presentPicker(type: String)` 的异步函数，获取当前的 `UIViewController`，然后通过 `UIHostingController` 以模态（Modal）的形式 `present` 出来。这样不仅实现更简单（不需要写 ExpoView 桥接），而且完全符合 iOS 原生的交互规范。

## 3. 工程化风险：Expo Prebuild 与 Extension Targets

`design.md` 中提到：
> "App Extension target 无法通过 Expo Config Plugin 自动创建... 需要在 Xcode 中手动操作"

**风险**：这会破坏 Expo 的 Continuous Native Generation (CNG) 理念。如果团队中有其他成员运行了 `npx expo prebuild --clean`，或者在 CI/CD (如 EAS Build) 上构建，手动创建的 Extension Targets 会全部丢失。

**建议**：
1. **短期**：在 `README.md` 和 `CLAUDE.md` 中用醒目的警告标出：**绝对不能删除 `ios/` 目录**，且必须将 `ios/` 目录提交到 Git 仓库中。
2. **长期**：考虑编写一个自定义的 Expo Config Plugin（使用 `@expo/config-plugins` 的 `withXcodeProject`），通过脚本自动向 `.pbxproj` 注入 Shield 和 DeviceActivityMonitor targets。

## 4. 边缘场景确认：离线时的番茄钟结束

**场景**：用户开启了一个 25 分钟的番茄钟，手机进入阻断状态。随后用户杀死了 iOS App 或手机断网。25 分钟后，服务器端的番茄钟结束。
**当前逻辑**：由于手机断网/App未运行，收不到 WebSocket 的状态变更，手机会**一直保持阻断状态**，直到用户重新打开 App 并连上网络。
**评估**：作为一款“严格模式”的专注软件，这种“惩罚性”的无限期阻断在逻辑上是说得通的（强迫用户打开 App 面对结果）。但建议在产品层面确认这是否是预期行为。如果不是，可以考虑在开启番茄钟阻断时，也像睡眠模式一样，注册一个 25 分钟的 `DeviceActivitySchedule` 作为兜底解锁机制。

## 5. 代码库对齐：Mock 实现

在当前的 `vibeflow-ios/modules/screen-time/index.ts` 中，有针对模拟器的 Mock 实现：
```typescript
export async function enableBlocking(): Promise<void> {
  if (!nativeModule) {
    console.log('[ScreenTime] Mock: enableBlocking called');
    return;
  }
  // ...
}
```
在 Phase 2 扩展接口（如 `getSelectionSummary`, `setBlockingReason`, `registerSleepSchedule`）时，请务必在 `index.ts` 中同步添加完善的 Mock 返回值（例如 `getSelectionSummary` 返回 `{ appCount: 0, categoryCount: 0, hasSelection: false }`），以保证在 iOS 模拟器上开发其他 UI 功能时不会崩溃。

---
**总结**：整体方案非常优秀，只需微调 `except` API 的使用和 Picker 的弹出方式即可进入开发阶段。