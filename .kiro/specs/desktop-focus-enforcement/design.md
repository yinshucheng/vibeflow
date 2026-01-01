# Design Document: Desktop Focus Enforcement

## Overview

本设计文档描述了 VibeFlow 桌面端专注强制执行功能的技术架构和实现方案。该功能将现有的 Web 应用打包为 macOS 桌面应用，并提供系统级的专注干预能力，包括空闲检测、分心应用管理、浏览器插件增强等。

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VibeFlow Server (Cloud)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Next.js    │  │  Socket.io  │  │  PostgreSQL │  │   REST     │ │
│  │  App Router │  │  Server     │  │  Database   │  │   API      │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘  └─────┬──────┘ │
└─────────┼────────────────┼──────────────────────────────────┼───────┘
          │                │                                  │
          │ HTTP/WSS       │ WebSocket                        │ HTTP
          │                │                                  │
┌─────────┼────────────────┼──────────────────────────────────┼───────┐
│         │                │                                  │       │
│  ┌──────▼──────┐  ┌──────▼──────┐                   ┌──────▼──────┐│
│  │  Electron   │  │  WebSocket  │                   │  Browser    ││
│  │  Main       │◄─┤  Client     │                   │  Sentinel   ││
│  │  Process    │  └─────────────┘                   │  Extension  ││
│  └──────┬──────┘                                    └──────┬──────┘│
│         │                                                  │       │
│  ┌──────▼──────┐  ┌─────────────┐  ┌─────────────┐        │       │
│  │  Renderer   │  │  Focus      │  │  App        │        │       │
│  │  Process    │  │  Enforcer   │  │  Controller │        │       │
│  │  (Web App)  │  │  Module     │  │  Module     │        │       │
│  └─────────────┘  └─────────────┘  └─────────────┘        │       │
│                                                            │       │
│                        macOS Desktop                       │       │
└────────────────────────────────────────────────────────────┼───────┘
                                                             │
                                                      Chrome Browser
```

### 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 桌面框架 | Electron 28+ | TypeScript 全栈，成熟生态，系统 API 访问便捷 |
| 前端 | 现有 Next.js App | 代码复用，统一体验 |
| 进程通信 | Electron IPC | 主进程与渲染进程通信 |
| 系统控制 | AppleScript via osascript | macOS 应用控制 |
| 通知 | Electron Notification API | 原生系统通知 |
| 自动更新 | electron-updater | 应用自动更新 |

## Components and Interfaces

### 1. Electron Main Process

```typescript
// electron/main.ts

interface ElectronMainConfig {
  serverUrl: string;           // VibeFlow API 服务器地址
  isDevelopment: boolean;      // 开发模式标志
  autoLaunch: boolean;         // 开机自启动
}

interface WindowState {
  isVisible: boolean;
  isFocused: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

// Main Process API
interface MainProcessAPI {
  // 窗口控制
  showWindow(): void;
  hideWindow(): void;
  bringToFront(): void;
  
  // 系统托盘
  updateTrayMenu(state: TrayMenuState): void;
  showTrayNotification(title: string, body: string): void;
  
  // 应用控制
  closeApp(bundleId: string): Promise<boolean>;
  hideApp(bundleId: string): Promise<boolean>;
  getRunningApps(): Promise<RunningApp[]>;
  
  // 权限管理
  checkAccessibilityPermission(): Promise<boolean>;
  requestAccessibilityPermission(): void;
  
  // 配置
  getConfig(): ElectronMainConfig;
  updateConfig(config: Partial<ElectronMainConfig>): void;
}
```

### 2. Focus Enforcer Module

```typescript
// electron/modules/focus-enforcer.ts

interface FocusEnforcerConfig {
  workTimeSlots: WorkTimeSlot[];
  maxIdleMinutes: number;
  enforcementMode: 'strict' | 'gentle';
  repeatIntervalMinutes: number;
  distractionApps: DistractionApp[];
  skipTokens: SkipTokenConfig;
}

interface DistractionApp {
  bundleId: string;           // e.g., "com.tencent.xinWeChat"
  name: string;               // e.g., "WeChat"
  action: 'force_quit' | 'hide_window';
  isPreset: boolean;          // 是否为预设应用
}

interface SkipTokenConfig {
  dailyLimit: number;         // 每日跳过次数限制
  maxDelayMinutes: number;    // 最大延迟时间
  usedToday: number;          // 今日已使用次数
  lastResetDate: string;      // 上次重置日期
}

interface InterventionEvent {
  type: 'idle_alert' | 'distraction_detected';
  timestamp: number;
  idleSeconds?: number;
  distractionApp?: string;
}

// Focus Enforcer API
interface FocusEnforcerAPI {
  // 状态查询
  getState(): FocusEnforcerState;
  isWithinWorkHours(): boolean;
  getIdleSeconds(): number;
  
  // 干预控制
  triggerIntervention(event: InterventionEvent): void;
  skipIntervention(): boolean;  // 返回是否成功（可能 token 用完）
  delayIntervention(minutes: number): boolean;
  
  // 配置
  updateConfig(config: Partial<FocusEnforcerConfig>): void;
  
  // 事件订阅
  onIntervention(callback: (event: InterventionEvent) => void): () => void;
}
```

### 3. App Controller Module

```typescript
// electron/modules/app-controller.ts

interface RunningApp {
  bundleId: string;
  name: string;
  pid: number;
  isActive: boolean;
}

interface AppControlResult {
  success: boolean;
  error?: string;
}

// App Controller API (macOS specific)
interface AppControllerAPI {
  // 应用查询
  getRunningApps(): Promise<RunningApp[]>;
  isAppRunning(bundleId: string): Promise<boolean>;
  
  // 应用控制
  quitApp(bundleId: string): Promise<AppControlResult>;
  hideApp(bundleId: string): Promise<AppControlResult>;
  activateApp(bundleId: string): Promise<AppControlResult>;
  
  // 批量操作
  closeDistractionApps(apps: DistractionApp[]): Promise<Map<string, AppControlResult>>;
}

// AppleScript 命令模板
const APPLESCRIPT_TEMPLATES = {
  quitApp: (bundleId: string) => `
    tell application id "${bundleId}"
      quit
    end tell
  `,
  hideApp: (bundleId: string) => `
    tell application "System Events"
      set visible of process "${bundleId}" to false
    end tell
  `,
  getRunningApps: `
    tell application "System Events"
      get name of every process whose background only is false
    end tell
  `,
};
```

### 4. Settings Lock Service

```typescript
// src/services/settings-lock.service.ts

interface LockedSetting {
  key: string;
  lockedUntil: Date | null;  // null = 永久锁定直到非工作时间
  reason: string;
}

interface SettingsLockConfig {
  isDevelopmentMode: boolean;
  lockedSettings: string[];   // 需要锁定的设置项 key 列表
}

// Settings Lock API
interface SettingsLockAPI {
  // 锁定状态查询
  isSettingLocked(key: string): boolean;
  getLockedSettings(): LockedSetting[];
  canModifySetting(key: string): { allowed: boolean; reason?: string };
  
  // 锁定控制
  lockSetting(key: string, reason: string): void;
  unlockSetting(key: string): void;
  
  // 工作时间检查
  isWithinWorkHours(): boolean;
  getNextUnlockTime(): Date | null;
}

// 需要锁定的设置项
const LOCKABLE_SETTINGS = [
  'distractionApps',
  'enforcementMode', 
  'skipTokenLimits',
  'workTimeSlots',
];
```

### 5. Browser Sentinel Enhancement

```typescript
// browser-sentinel/src/lib/focus-redirect.ts

interface RedirectConfig {
  dashboardUrl: string;
  replaceTab: boolean;        // true = 替换当前标签，false = 新开标签
  showWarningFirst: boolean;  // 温和模式下先显示警告
  warningDurationMs: number;  // 警告显示时长
}

interface BlockedSiteEvent {
  url: string;
  timestamp: number;
  action: 'blocked' | 'warned' | 'proceeded';
  skipTokenUsed: boolean;
}

// Enhanced Browser Sentinel API
interface BrowserSentinelEnhancedAPI {
  // 拦截控制
  blockAndRedirect(url: string): Promise<void>;
  showWarningOverlay(url: string, countdown: number): Promise<'proceed' | 'return'>;
  
  // 登录状态
  isLoggedIn(): boolean;
  showLoginReminder(): void;
  
  // 配置
  getRedirectConfig(): RedirectConfig;
  updateRedirectConfig(config: Partial<RedirectConfig>): void;
}
```

### 6. Pomodoro Auto-Start Settings

```typescript
// src/services/user.service.ts (扩展)

interface PomodoroAutoStartConfig {
  autoStartBreak: boolean;           // 番茄完成后自动开始休息
  autoStartNextPomodoro: boolean;    // 休息完成后自动开始下一个番茄
  autoStartCountdownSeconds: number; // 自动开始前的倒计时秒数
}

// 扩展 UserSettings
interface UserSettings {
  // ... 现有字段
  pomodoroAutoStart: PomodoroAutoStartConfig;
}
```

## Data Models

### Prisma Schema 扩展

```prisma
// prisma/schema.prisma (扩展)

model UserSettings {
  // ... 现有字段
  
  // 专注强制执行设置
  enforcementMode       String   @default("gentle") // "strict" | "gentle"
  distractionApps       Json     @default("[]")     // DistractionApp[]
  skipTokenDailyLimit   Int      @default(3)
  skipTokenMaxDelay     Int      @default(15)       // minutes
  
  // 番茄自动开始设置
  autoStartBreak        Boolean  @default(false)
  autoStartNextPomodoro Boolean  @default(false)
  autoStartCountdown    Int      @default(5)        // seconds
  
  // 浏览器插件设置
  browserRedirectReplace Boolean @default(true)
}

model SkipTokenUsage {
  id        String   @id @default(uuid())
  userId    String
  date      DateTime @db.Date
  usedCount Int      @default(0)
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, date])
  @@index([userId])
}

model SettingsModificationLog {
  id         String   @id @default(uuid())
  userId     String
  settingKey String
  oldValue   Json?
  newValue   Json?
  success    Boolean
  reason     String?  // 如果失败，记录原因
  timestamp  DateTime @default(now())
  
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, timestamp])
}
```

### 预设分心应用列表

```typescript
// electron/config/preset-distraction-apps.ts

export const PRESET_DISTRACTION_APPS: DistractionApp[] = [
  // 社交通讯
  { bundleId: 'com.tencent.xinWeChat', name: 'WeChat', action: 'hide_window', isPreset: true },
  { bundleId: 'com.apple.MobileSMS', name: 'Messages', action: 'hide_window', isPreset: true },
  { bundleId: 'com.slack.Slack', name: 'Slack', action: 'hide_window', isPreset: true },
  { bundleId: 'com.hnc.Discord', name: 'Discord', action: 'hide_window', isPreset: true },
  { bundleId: 'ru.keepcoder.Telegram', name: 'Telegram', action: 'hide_window', isPreset: true },
  
  // 娱乐
  { bundleId: 'com.spotify.client', name: 'Spotify', action: 'hide_window', isPreset: true },
  { bundleId: 'com.apple.Music', name: 'Music', action: 'hide_window', isPreset: true },
  { bundleId: 'com.valvesoftware.steam', name: 'Steam', action: 'force_quit', isPreset: true },
  
  // 视频
  { bundleId: 'com.bilibili.app.mac', name: 'Bilibili', action: 'force_quit', isPreset: true },
  { bundleId: 'com.netflix.Netflix', name: 'Netflix', action: 'force_quit', isPreset: true },
];
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*



### Property 1: Idle Detection State Machine

*For any* combination of work time status, pomodoro state, and idle duration, the Focus_Enforcer SHALL trigger intervention if and only if: (1) current time is within configured work hours, AND (2) no pomodoro is active, AND (3) idle time exceeds the configured threshold.

**Validates: Requirements 2.1, 2.7, 7.7**

### Property 2: Enforcement Mode Determines App Control Action

*For any* intervention trigger with a list of distraction apps:
- If enforcement mode is "strict", all apps SHALL receive "force_quit" commands
- If enforcement mode is "gentle", all apps SHALL receive "hide_window" commands (unless individually configured otherwise)

**Validates: Requirements 2.4, 2.5, 4.2, 4.5**

### Property 3: Settings Lock Based on Mode and Work Time

*For any* attempt to modify a locked setting (distractionApps, enforcementMode, skipTokenLimits, workTimeSlots):
- If development mode is true, modification SHALL succeed regardless of time
- If production mode AND within work hours, modification SHALL be rejected
- If production mode AND outside work hours, modification SHALL succeed

**Validates: Requirements 3.5, 3.6, 4.8, 5.8, 8.4, 8.5, 8.6**

### Property 4: Distraction App List Management

*For any* valid distraction app configuration:
- Adding an app SHALL increase the list size by exactly 1
- Removing an app SHALL decrease the list size by exactly 1
- Modifying an app's action SHALL preserve the list size
- The app's action SHALL be either "force_quit" or "hide_window"

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 5: Skip Token Management

*For any* sequence of skip/delay actions within a day:
- Each skip action SHALL decrease remaining tokens by 1
- Each delay action SHALL decrease remaining tokens by 1
- When remaining tokens equals 0, skip/delay actions SHALL fail
- At midnight (local time), remaining tokens SHALL reset to daily limit
- Remaining tokens SHALL never exceed daily limit
- Remaining tokens SHALL never be negative

**Validates: Requirements 4.4, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6**

### Property 6: Browser Blocking Behavior by Mode

*For any* navigation to a blacklisted URL during work hours without active pomodoro:
- If enforcement mode is "strict", the tab SHALL be closed immediately and dashboard opened
- If enforcement mode is "gentle", a warning overlay SHALL be shown first; if user proceeds (consuming skip token), navigation continues; otherwise tab is closed and dashboard opened

**Validates: Requirements 4.3, 4.6, 6.1, 6.2, 6.7**

### Property 7: Unauthenticated User Handling

*For any* blocked URL access when user is not logged in:
- First N attempts SHALL show in-extension reminder overlay
- After N attempts, the extension SHALL require login to continue browsing
- N SHALL be configurable (default: 3)

**Validates: Requirements 6.4, 6.5**

### Property 8: Settings Modification Logging

*For any* settings modification attempt (successful or failed), a log entry SHALL be created containing: userId, settingKey, oldValue, newValue, success status, and timestamp.

**Validates: Requirements 8.7**

### Property 9: Permission-Based Feature Availability

*For any* app control operation (quit/hide distraction apps):
- If Accessibility permission is granted, operation SHALL be attempted
- If Accessibility permission is not granted, operation SHALL be skipped and user notified

**Validates: Requirements 9.3**

### Property 10: Pomodoro Auto-Start Transition

*For any* pomodoro or break completion with auto-start enabled:
- A countdown of N seconds SHALL begin (N is configurable, default 5)
- After countdown completes, the next phase SHALL start automatically
- If user manually starts before countdown, countdown SHALL be cancelled

**Validates: Requirements 7.5**

## Error Handling

### Connection Errors

```typescript
interface ConnectionErrorHandler {
  // 连接失败时的处理
  onConnectionFailed(error: Error): void;
  
  // 重试策略
  retryStrategy: {
    maxAttempts: number;      // 最大重试次数 (default: 5)
    initialDelayMs: number;   // 初始延迟 (default: 1000)
    maxDelayMs: number;       // 最大延迟 (default: 30000)
    backoffMultiplier: number; // 退避乘数 (default: 2)
  };
  
  // 离线模式
  enableOfflineMode(): void;
  disableOfflineMode(): void;
}
```

### Permission Errors

```typescript
interface PermissionErrorHandler {
  // 权限被拒绝
  onPermissionDenied(permission: 'accessibility' | 'notifications'): void;
  
  // 权限被撤销
  onPermissionRevoked(permission: string): void;
  
  // 引导用户授权
  showPermissionGuide(permission: string): void;
}
```

### App Control Errors

```typescript
interface AppControlErrorHandler {
  // 应用不存在
  onAppNotFound(bundleId: string): void;
  
  // 应用拒绝退出
  onAppRefusedToQuit(bundleId: string): void;
  
  // AppleScript 执行失败
  onScriptExecutionFailed(error: Error): void;
}
```

## Testing Strategy

### Unit Tests

1. **Idle Detection Logic**
   - Test `shouldTriggerIntervention()` with various combinations of inputs
   - Test work time slot parsing and validation
   - Test idle timer reset on activity

2. **Settings Lock Logic**
   - Test `canModifySetting()` in different modes and times
   - Test locked settings list

3. **Skip Token Management**
   - Test token consumption
   - Test daily reset
   - Test limit enforcement

4. **Browser Blocking Logic**
   - Test URL matching against blacklist
   - Test mode-specific behavior

### Property-Based Tests

使用 fast-check 进行属性测试，每个属性测试至少运行 100 次迭代。

```typescript
// tests/property/focus-enforcer.property.ts

import { fc } from 'fast-check';

// Property 1: Idle Detection State Machine
describe('Property 1: Idle Detection State Machine', () => {
  it('should trigger intervention only when all conditions are met', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // isWithinWorkHours
        fc.boolean(), // isPomodoroActive
        fc.nat(),     // idleSeconds
        fc.nat(),     // thresholdSeconds
        (isWithinWorkHours, isPomodoroActive, idleSeconds, thresholdSeconds) => {
          const shouldTrigger = shouldTriggerIntervention(
            isWithinWorkHours,
            isPomodoroActive,
            idleSeconds,
            thresholdSeconds
          );
          
          const expectedTrigger = 
            isWithinWorkHours && 
            !isPomodoroActive && 
            idleSeconds >= thresholdSeconds;
          
          return shouldTrigger === expectedTrigger;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 3: Settings Lock
describe('Property 3: Settings Lock', () => {
  it('should enforce settings lock based on mode and work time', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // isDevelopmentMode
        fc.boolean(), // isWithinWorkHours
        fc.constantFrom(...LOCKABLE_SETTINGS), // settingKey
        (isDevelopmentMode, isWithinWorkHours, settingKey) => {
          const canModify = canModifySetting(
            settingKey,
            isDevelopmentMode,
            isWithinWorkHours
          );
          
          if (isDevelopmentMode) {
            return canModify === true;
          }
          if (isWithinWorkHours) {
            return canModify === false;
          }
          return canModify === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 5: Skip Token Management
describe('Property 5: Skip Token Management', () => {
  it('should correctly manage skip tokens', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 }),  // dailyLimit
        fc.array(fc.constantFrom('skip', 'delay'), { maxLength: 20 }), // actions
        (dailyLimit, actions) => {
          let remaining = dailyLimit;
          
          for (const action of actions) {
            const result = consumeSkipToken(remaining);
            if (remaining > 0) {
              remaining--;
              if (!result.success) return false;
            } else {
              if (result.success) return false;
            }
          }
          
          return remaining >= 0 && remaining <= dailyLimit;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Tests

1. **Electron Main Process**
   - Test IPC communication between main and renderer
   - Test system tray functionality
   - Test window management

2. **Browser Sentinel Integration**
   - Test WebSocket communication with server
   - Test tab blocking and redirection
   - Test overlay display

### E2E Tests

1. **Full Flow Tests**
   - Test idle detection → intervention → start pomodoro flow
   - Test blocked site → redirect → start pomodoro flow
   - Test settings modification during/outside work hours

## Implementation Notes

### Electron 项目结构

```
vibeflow-desktop/
├── electron/
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # Preload script for IPC
│   ├── modules/
│   │   ├── focus-enforcer.ts
│   │   ├── app-controller.ts
│   │   └── tray-manager.ts
│   └── config/
│       └── preset-distraction-apps.ts
├── src/                     # 复用现有 Next.js 代码
├── package.json
└── electron-builder.yml
```

### 关键依赖

```json
{
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0",
    "@electron/notarize": "^2.0.0"
  },
  "dependencies": {
    "electron-store": "^8.0.0",
    "auto-launch": "^5.0.0"
  }
}
```

### macOS 权限配置

```xml
<!-- electron-builder entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```
