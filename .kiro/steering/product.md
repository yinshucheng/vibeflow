---
inclusion: always
---

# VibeFlow Product Context

Productivity app for developers using structured task management and Pomodoro technique to achieve flow state.

## Domain Hierarchy

```
Goals (1 week - 5 years)
  └── Projects (task containers)
        └── Tasks (P1/P2/P3 priority, hierarchical with subtasks)
              └── Pomodoros (10-120 min focus sessions)
```

- Tasks require a `planDate` for scheduling
- Pomodoros must always be tied to a task
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
