# Design Document: Desktop Production Resilience

## Overview

本设计文档描述 VibeFlow 桌面端生产环境稳定性和防绕过机制的技术实现方案。系统采用多层防护策略，确保专注强制功能在各种场景下持续有效运行。

### 核心设计原则

1. **分层防护** - 进程守护、心跳监控、绕过检测三层防护
2. **开发友好** - 开发模式完全无限制，生产模式严格执行
3. **优雅降级** - 离线时继续本地强制执行
4. **可审计** - 所有关键事件都有日志记录

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        macOS System                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │ Process Guardian │◄──►│        Desktop App (Electron)     │  │
│  │   (launchd)      │    │  ┌────────────────────────────┐  │  │
│  │                  │    │  │     Heartbeat Manager      │  │  │
│  │  - Monitor PID   │    │  │  - 30s interval            │  │  │
│  │  - Auto restart  │    │  │  - Connection status       │  │  │
│  │  - Health check  │    │  └────────────────────────────┘  │  │
│  └──────────────────┘    │  ┌────────────────────────────┐  │  │
│                          │  │     Quit Prevention        │  │  │
│                          │  │  - Mode check              │  │  │
│                          │  │  - Work hours check        │  │  │
│                          │  │  - Confirmation dialog     │  │  │
│                          │  └────────────────────────────┘  │  │
│                          │  ┌────────────────────────────┐  │  │
│                          │  │     Demo Mode Manager      │  │  │
│                          │  │  - Token management        │  │  │
│                          │  │  - Duration tracking       │  │  │
│                          │  └────────────────────────────┘  │  │
│                          └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket + HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend Server (Next.js)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Heartbeat Service│  │ Bypass Detection │  │ Demo Token    │ │
│  │                  │  │    Service       │  │   Service     │ │
│  │ - Track clients  │  │ - Grace period   │  │ - Monthly     │ │
│  │ - Offline detect │  │ - Score calc     │  │   allocation  │ │
│  │ - Event logging  │  │ - Warning level  │  │ - Usage log   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces


### 1. Process Guardian (vibeflow-desktop/guardian/)

进程守护器作为独立的轻量级进程运行，负责监控和重启桌面应用。

```typescript
// guardian/index.ts
interface GuardianConfig {
  targetAppPath: string;
  checkIntervalMs: number;      // 默认: 5000
  restartDelayMs: number;       // 默认: 5000
  maxRestartAttempts: number;   // 默认: 5
  healthCheckPort: number;      // 默认: 9999
}

interface GuardianState {
  isRunning: boolean;
  targetPid: number | null;
  lastHealthCheck: Date | null;
  restartCount: number;
  lastRestartReason: string | null;
}

// IPC 通信接口
interface GuardianIPC {
  // Desktop App -> Guardian
  'guardian:heartbeat': () => void;
  'guardian:status': () => GuardianState;
  
  // Guardian -> Desktop App
  'app:health-check': () => { healthy: boolean; timestamp: Date };
}
```

### 2. Heartbeat Manager (vibeflow-desktop/electron/modules/)

心跳管理器负责与服务器保持连接并发送定期心跳。

```typescript
// heartbeat-manager.ts
interface HeartbeatConfig {
  intervalMs: number;           // 默认: 30000 (30秒)
  timeoutMs: number;            // 默认: 10000 (10秒)
  maxRetries: number;           // 默认: 3
}

interface HeartbeatPayload {
  clientId: string;
  userId: string;
  timestamp: Date;
  appVersion: string;
  mode: 'development' | 'staging' | 'production';
  isInDemoMode: boolean;
  activePomodoroId: string | null;
}

interface HeartbeatManager {
  start(): void;
  stop(): void;
  sendHeartbeat(): Promise<boolean>;
  getLastHeartbeat(): Date | null;
  isConnected(): boolean;
}
```

### 3. Quit Prevention Module (vibeflow-desktop/electron/modules/)

退出防护模块在生产模式下阻止意外退出。

```typescript
// quit-prevention.ts
interface QuitPreventionConfig {
  enabled: boolean;
  requirePasswordInWorkHours: boolean;
  consumeSkipTokenOnQuit: boolean;
}

interface QuitAttempt {
  timestamp: Date;
  wasBlocked: boolean;
  reason: 'work_hours' | 'active_pomodoro' | 'user_confirmed';
  skipTokenConsumed: boolean;
}

interface QuitPreventionModule {
  canQuit(): { allowed: boolean; reason?: string };
  showQuitConfirmation(): Promise<boolean>;
  forceQuit(password: string): Promise<boolean>;
  recordQuitAttempt(attempt: QuitAttempt): void;
}
```

### 4. Demo Mode Manager (src/services/)

演示模式管理器处理演示令牌和模式切换。

```typescript
// demo-mode.service.ts
interface DemoModeConfig {
  tokensPerMonth: number;       // 默认: 3, 范围: 1-10
  maxDurationMinutes: number;   // 默认: 90, 范围: 30-180
  confirmationPhrase: string;   // 默认: "I am presenting"
}

interface DemoToken {
  id: string;
  userId: string;
  allocatedAt: Date;
  usedAt: Date | null;
  duration: number | null;      // 实际使用时长（分钟）
  expiresAt: Date;              // 月末过期
}

interface DemoModeState {
  isActive: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
  remainingMinutes: number | null;
  remainingTokensThisMonth: number;
}

// Dashboard 演示模式显示组件
interface DemoModeBanner {
  isVisible: boolean;           // 仅在演示模式激活时显示
  remainingMinutes: number;
  onExit: () => void;           // 手动退出按钮
}

interface DemoModeService {
  getRemainingTokens(userId: string): Promise<number>;
  activateDemoMode(userId: string, confirmPhrase: string): Promise<ServiceResult<DemoModeState>>;
  deactivateDemoMode(userId: string): Promise<ServiceResult<void>>;
  getDemoModeState(userId: string): Promise<DemoModeState>;
  getDemoModeHistory(userId: string): Promise<DemoToken[]>;
}
```

### 5. Bypass Detection Service (src/services/)

绕过检测服务监控客户端行为并计算绕过分数。

```typescript
// bypass-detection.service.ts
interface BypassEvent {
  id: string;
  userId: string;
  clientId: string;
  eventType: 'force_quit' | 'offline_timeout' | 'guardian_killed';
  timestamp: Date;
  duration: number | null;      // 离线时长（秒）
  wasInWorkHours: boolean;
  wasInPomodoro: boolean;
  gracePeriodExpired: boolean;
}

interface BypassScore {
  userId: string;
  score: number;                // 0-100
  warningLevel: 'none' | 'low' | 'medium' | 'high';
  lastCalculated: Date;
  factors: {
    frequencyScore: number;
    durationScore: number;
    pomodoroInterruptScore: number;
  };
}

interface BypassDetectionService {
  recordBypassEvent(event: Omit<BypassEvent, 'id'>): Promise<void>;
  calculateBypassScore(userId: string): Promise<BypassScore>;
  getBypassHistory(userId: string, days: number): Promise<BypassEvent[]>;
  shouldShowWarning(userId: string): Promise<boolean>;
}
```

### 6. Grace Period Manager (src/services/)

宽限期管理器处理客户端断开后的宽限期逻辑。

```typescript
// grace-period.service.ts
interface GracePeriodConfig {
  defaultMinutes: number;       // 默认: 5
  pomodoroMinutes: number;      // 默认: 2
  minMinutes: number;           // 最小: 1
  maxMinutes: number;           // 最大: 15
}

interface GracePeriodState {
  clientId: string;
  startedAt: Date;
  expiresAt: Date;
  isInPomodoro: boolean;
  hasExpired: boolean;
}

interface GracePeriodService {
  startGracePeriod(clientId: string, isInPomodoro: boolean): GracePeriodState;
  cancelGracePeriod(clientId: string): void;
  isInGracePeriod(clientId: string): boolean;
  getGracePeriodState(clientId: string): GracePeriodState | null;
}
```

## Data Models


### Prisma Schema Extensions

```prisma
// 客户端连接记录
model ClientConnection {
  id              String    @id @default(cuid())
  userId          String
  clientId        String    @unique
  deviceName      String?
  appVersion      String
  mode            String    // development | staging | production
  lastHeartbeat   DateTime
  isOnline        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  user            User      @relation(fields: [userId], references: [id])
  offlineEvents   ClientOfflineEvent[]
  
  @@index([userId])
  @@index([lastHeartbeat])
}

// 客户端离线事件
model ClientOfflineEvent {
  id              String    @id @default(cuid())
  clientId        String
  userId          String
  startedAt       DateTime
  endedAt         DateTime?
  durationSeconds Int?
  wasInWorkHours  Boolean
  wasInPomodoro   Boolean
  gracePeriodUsed Boolean   @default(false)
  isBypassAttempt Boolean   @default(false)
  
  client          ClientConnection @relation(fields: [clientId], references: [clientId])
  user            User      @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([startedAt])
}

// 绕过尝试记录
model BypassAttempt {
  id              String    @id @default(cuid())
  userId          String
  clientId        String
  eventType       String    // force_quit | offline_timeout | guardian_killed
  timestamp       DateTime  @default(now())
  durationSeconds Int?
  wasInWorkHours  Boolean
  wasInPomodoro   Boolean
  warningLevel    String    // none | low | medium | high
  
  user            User      @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([timestamp])
}

// 演示令牌
model DemoToken {
  id              String    @id @default(cuid())
  userId          String
  allocatedAt     DateTime  @default(now())
  expiresAt       DateTime  // 月末过期
  usedAt          DateTime?
  endedAt         DateTime?
  durationMinutes Int?
  confirmPhrase   String?
  
  user            User      @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([expiresAt])
}

// 演示模式事件（用于时间线展示）
model DemoModeEvent {
  id              String    @id @default(cuid())
  userId          String
  tokenId         String
  eventType       String    // started | ended | expired
  timestamp       DateTime  @default(now())
  durationMinutes Int?      // 仅在 ended/expired 时有值
  reason          String?   // manual_exit | duration_expired | token_exhausted
  
  user            User      @relation(fields: [userId], references: [id])
  token           DemoToken @relation(fields: [tokenId], references: [id])
  
  @@index([userId])
  @@index([timestamp])
}

// 用户设置扩展
model UserSettings {
  // ... 现有字段 ...
  
  // 宽限期设置
  gracePeriodMinutes        Int     @default(5)
  gracePeriodPomodoroMinutes Int    @default(2)
  
  // 演示模式设置
  demoTokensPerMonth        Int     @default(3)   // 范围: 1-10
  demoMaxDurationMinutes    Int     @default(90)  // 范围: 30-180
  
  // 绕过检测设置
  bypassWarningThreshold    Int     @default(50)  // 分数阈值
  
  // 进程守护设置
  enableProcessGuardian     Boolean @default(true)
  autoStartOnLogin          Boolean @default(true)
}
```

### Mode Detection Logic

```typescript
// mode-detector.ts
type AppMode = 'development' | 'staging' | 'production';

function detectAppMode(): AppMode {
  // 1. 环境变量优先
  const envMode = process.env.VIBEFLOW_MODE;
  if (envMode && isValidMode(envMode)) {
    return envMode as AppMode;
  }
  
  // 2. NODE_ENV 检测
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // 3. 命令行参数
  if (process.argv.includes('--dev')) {
    return 'development';
  }
  if (process.argv.includes('--staging')) {
    return 'staging';
  }
  
  // 4. 打包检测 - 从 .app 运行则为生产模式
  if (app.isPackaged) {
    return 'production';
  }
  
  // 5. 默认开发模式
  return 'development';
}

function isValidMode(mode: string): mode is AppMode {
  return ['development', 'staging', 'production'].includes(mode);
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified:

### Property 1: Mode-Based Quit Behavior
*For any* quit attempt, if the app is in development mode, the quit SHALL be allowed regardless of work hours or pomodoro state. If the app is in production mode AND within work hours, the quit SHALL be blocked unless explicitly confirmed.
**Validates: Requirements 1.6, 2.1**

### Property 2: Heartbeat Interval Consistency
*For any* connected client, heartbeat signals SHALL be sent at intervals not exceeding 30 seconds (with tolerance for network latency).
**Validates: Requirements 3.1**

### Property 3: Offline Detection Timing
*For any* client that stops sending heartbeats, the server SHALL mark it as offline within 2 minutes (120 seconds) of the last heartbeat.
**Validates: Requirements 3.3**

### Property 4: Grace Period Bypass Prevention
*For any* client that reconnects within the grace period, no bypass attempt SHALL be recorded. For any client that remains offline beyond the grace period during work hours, a bypass attempt SHALL be recorded.
**Validates: Requirements 5.3, 5.4**

### Property 5: Grace Period Duration by Context
*For any* grace period, the duration SHALL be the configured default (5 minutes) when no pomodoro is active, and the shorter pomodoro duration (2 minutes) when a pomodoro is active.
**Validates: Requirements 5.1, 5.5**

### Property 6: Demo Token Monthly Limit
*For any* user, the number of available demo tokens SHALL not exceed the configured monthly limit (default: 3). Tokens SHALL reset at the start of each month.
**Validates: Requirements 6.3**

### Property 7: Demo Mode Duration Limit
*For any* active demo mode session, the duration SHALL not exceed the configured maximum (default: 90 minutes). The system SHALL automatically exit demo mode when the duration expires.
**Validates: Requirements 6.4, 6.6**

### Property 8: Demo Mode Enforcement Suspension
*For any* period when demo mode is active, no bypass attempts or offline events SHALL be recorded for that user.
**Validates: Requirements 6.9**

### Property 9: Demo Mode Activation Restriction
*For any* demo mode activation attempt during an active pomodoro session, the activation SHALL be rejected.
**Validates: Requirements 7.5**

### Property 10: Bypass Score Calculation
*For any* user, the bypass score SHALL be calculated based on the frequency and duration of offline periods during work hours, with higher scores for more frequent and longer offline periods.
**Validates: Requirements 4.3**

### Property 11: Process Guardian Restart Timing
*For any* unexpected termination of the Desktop App, the Process Guardian SHALL restart it within 5 seconds.
**Validates: Requirements 1.3, 8.3**

### Property 12: Offline Mode Policy Caching
*For any* period when the client is offline, the enforcement policy SHALL be retrieved from local cache and enforcement SHALL continue.
**Validates: Requirements 9.1, 9.2**

### Property 13: Skip Token Consumption on Quit
*For any* confirmed quit during work hours in production mode, if skip tokens are available, one token SHALL be consumed.
**Validates: Requirements 4.7**

## Error Handling


### Error Scenarios and Handling

| Scenario | Detection | Response |
|----------|-----------|----------|
| Backend server unreachable | Connection timeout | Switch to offline mode, use cached policy |
| Process Guardian crash | Desktop App health check fails | Show warning, continue running |
| Desktop App crash | Guardian detects PID gone | Auto-restart within 5 seconds |
| Network disconnection | WebSocket close event | Start grace period, attempt reconnect |
| Database connection lost | Prisma error | Queue events locally, sync on reconnect |
| Demo token exhausted | Token count check | Show message with reset date |
| Invalid confirmation phrase | String comparison | Reject activation, show error |
| Port conflict on startup | EADDRINUSE error | Show error with instructions |

### Graceful Degradation

1. **Offline Mode**: When backend is unreachable:
   - Continue enforcing distraction app blocking using cached policy
   - Queue all events (heartbeats, bypass attempts) for later sync
   - Show "Offline Mode" indicator
   - Limit functionality that requires server (e.g., demo mode activation)

2. **Guardian Failure**: When Process Guardian is not running:
   - Desktop App continues running normally
   - Show warning about reduced protection
   - Log the guardian absence

3. **Partial Connectivity**: When connection is unstable:
   - Use exponential backoff for reconnection
   - Extend grace period during reconnection attempts
   - Batch events for efficient sync

## Testing Strategy

### Unit Tests

Unit tests will cover:
- Mode detection logic
- Bypass score calculation
- Grace period timing
- Demo token allocation and expiration
- Quit prevention decision logic

### Property-Based Tests

Property-based tests using fast-check will validate:
- Mode-based quit behavior (Property 1)
- Heartbeat interval consistency (Property 2)
- Offline detection timing (Property 3)
- Grace period bypass prevention (Property 4)
- Grace period duration by context (Property 5)
- Demo token monthly limit (Property 6)
- Demo mode duration limit (Property 7)
- Demo mode enforcement suspension (Property 8)
- Demo mode activation restriction (Property 9)
- Bypass score calculation (Property 10)
- Process guardian restart timing (Property 11)
- Offline mode policy caching (Property 12)
- Skip token consumption on quit (Property 13)

Each property test will run minimum 100 iterations with randomly generated inputs.

### Integration Tests

Integration tests will cover:
- Full heartbeat flow (client -> server -> database)
- Demo mode activation and deactivation flow
- Bypass detection and warning escalation
- Offline mode transition and recovery
- Process Guardian restart behavior

### E2E Tests

E2E tests using Playwright will cover:
- Demo mode activation UI flow
- Quit confirmation dialog
- Bypass warning display
- Offline mode indicator
- Service management commands

## VSCode Launch Configurations

```json
// .vscode/launch.json additions
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend: Next.js",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "name": "Desktop: Electron",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/vibeflow-desktop",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development",
        "VIBEFLOW_MODE": "development"
      }
    },
    {
      "name": "Desktop: Electron (Staging)",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/vibeflow-desktop",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development",
        "VIBEFLOW_MODE": "staging"
      }
    },
    {
      "name": "Attach to Desktop",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true
    }
  ],
  "compounds": [
    {
      "name": "Full Stack: Backend + Desktop",
      "configurations": ["Backend: Next.js", "Desktop: Electron"],
      "stopAll": true
    }
  ]
}
```

## Service Management Scripts

```bash
# scripts/vibeflow.sh - 服务管理脚本

#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PM2_NAME="vibeflow-backend"
DESKTOP_APP_NAME="VibeFlow"

case "$1" in
  start)
    echo "Starting VibeFlow services..."
    # Start backend with PM2
    cd "$PROJECT_DIR"
    pm2 start npm --name "$PM2_NAME" -- run start
    # Start desktop app
    open -a "$DESKTOP_APP_NAME"
    echo "VibeFlow services started."
    ;;
  stop)
    echo "Stopping VibeFlow services..."
    pm2 stop "$PM2_NAME"
    osascript -e "quit app \"$DESKTOP_APP_NAME\""
    echo "VibeFlow services stopped."
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  status)
    echo "=== Backend Status ==="
    pm2 status "$PM2_NAME"
    echo ""
    echo "=== Desktop App Status ==="
    pgrep -x "$DESKTOP_APP_NAME" > /dev/null && echo "Running" || echo "Not running"
    ;;
  logs)
    pm2 logs "$PM2_NAME"
    ;;
  *)
    echo "Usage: vibeflow {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
```
