---
inclusion: always
---

# VibeFlow Product Context

## Core Philosophy: 心想事成 (Make Wishes Come True)

VibeFlow 的核心理念：**用户有预期状态，现实往往偏离，系统持续帮助用户回归预期。**

### 预期 vs 现实的持续校正

用户在不同维度有预期：

| 维度 | 预期状态 | 偏离现实 | 系统如何校正 |
|------|---------|---------|-------------|
| **行为节奏** | 工作时专注、该休息时休息、该睡觉时睡觉 | 加班停不下来、休息过长、熬夜 | 状态机 + OVER_REST + 睡眠保护 + 健康提醒 |
| **长期目标** | Goals 按计划推进 | 目标停滞、缺乏行动 | 进度追踪、压力指标、主动提醒调整 |
| **任务完成** | Tasks 被高效完成 | 任务积压、长期搁置 | AI 拆解、优先级建议、快速启动引导 |
| **习惯养成** | 建立持续的工作习惯 | 三天打鱼两天晒网 | 数据可视化、streak 追踪、正向激励 |

### 对长期未完成任务的主动干预

当一个 Task 长期未被执行时，系统应主动介入：
1. **提醒调整预期** — 这个任务还重要吗？是否需要降级或关闭？
2. **协助任务拆解** — 可能太大了，AI 帮拆成可执行的小步骤
3. **鼓励快速启动** — "先做 10 分钟试试"，降低启动摩擦
4. **识别阻塞** — 是否依赖其他任务/人？帮助找到解法

**所有功能最终服务于一个目标：让用户心想事成。** 目标管理、任务拆解、番茄钟、休息保护、睡眠管理、AI 建议——都是手段，不是目的。

## Domain Hierarchy

```
Goals (1 week - 5 years)       ← 用户的长期愿望
  └── Projects (task containers)   ← 实现愿望的载体
        └── Tasks (P1/P2/P3, hierarchical with subtasks)  ← 具体行动
              └── Pomodoros (10-120 min focus sessions)     ← 执行单元
```

- Tasks require a `planDate` for scheduling
- Pomodoros must always be tied to a task (or be taskless for quick starts)
- Daily State tracks per-user workflow with Top 3 task selection

## Daily State Machine (3-state model)

```
IDLE ──START_POMODORO──→ FOCUS ──COMPLETE/ABORT──→ IDLE
  ↑                                                  │
  └──RETURN_TO_IDLE/START_POMODORO── OVER_REST ←─────┘
```

| State | User Can Do |
|-------|-------------|
| `idle` | Start pomodoro, manage tasks, plan day |
| `focus` | Complete/abort active pomodoro, switch tasks |
| `over_rest` | Start pomodoro (forced return) or acknowledge |

REST is a sub-phase of IDLE (determined by `lastPomodoroEndTime`). OVER_REST only triggers when within work hours OR in an active Focus Session (overtime mode).

Rules:
- Machine: `src/machines/vibeflow.machine.ts`
- StateEngine: `src/services/state-engine.service.ts` (all transitions go through `stateEngine.send()`)
- Daily reset: 04:00 AM
- Daily cap: default 8 pomodoros
- OVER_REST delay: `shortRestDuration + overRestGracePeriod` (default 10 min)

## Platform Locations

| Platform | Path | Purpose |
|----------|------|---------|
| Web | `src/` | Next.js primary UI |
| Desktop | `vibeflow-desktop/` | Electron focus enforcement, tray status |
| Extension | `vibeflow-extension/` | Chrome URL blocking |
| iOS | `vibeflow-ios/` | Expo mobile client, Screen Time, notifications |
| MCP | `src/mcp/` | AI assistant integration |

## Service Result Pattern

All services return:
```typescript
{ success: boolean; data?: T; error?: { code: string; message: string } }
```

Error codes: `VALIDATION_ERROR` | `NOT_FOUND` | `CONFLICT` | `INTERNAL_ERROR` | `AUTH_ERROR`

## Time Windows

| Window | OVER_REST? | Enforcement |
|--------|-----------|-------------|
| Work time | ✅ triggers | Distraction apps blocked during FOCUS |
| Non-work, no Focus Session | ❌ | None |
| Non-work + Focus Session (overtime) | ✅ triggers | Full enforcement |
| Sleep time, no Focus Session | ❌ | Sleep enforcement active |
| Sleep time + Focus Session | ✅ triggers | Sleep enforcement overridden |

Focus Session = overtime mode outside work hours. Enables OVER_REST protection + overrides sleep enforcement.

## Critical Implementation Rules

1. All state changes go through `stateEngineService.send()` — never update DB directly
2. After state mutations, engine auto-broadcasts full state + policy to all clients
3. Verify `userId` ownership in services before data access
4. Use skip tokens for bypassing focus restrictions (limited quantity)
5. Settings can be locked during active sessions

## Dev Auth Bypass

```bash
curl -H "X-Dev-User-Email: test@example.com" http://localhost:3000/api/...
```

Only works when `NODE_ENV !== 'production'`.
