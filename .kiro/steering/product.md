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

## Daily State Machine

```
LOCKED → PLANNING → FOCUS ↔ REST → LOCKED
```

| State | User Can Do |
|-------|-------------|
| `LOCKED` | Complete airlock only |
| `PLANNING` | Start pomodoro, manage tasks |
| `FOCUS` | Complete/abort active pomodoro |
| `REST` | Complete rest, override daily cap |

Rules:
- Machine: `src/machines/vibeflow.machine.ts`
- Daily reset: 04:00 AM
- Top 3 tasks: 0-3 allowed during airlock
- Daily cap: default 8 pomodoros

## Platform Locations

| Platform | Path | Purpose |
|----------|------|---------|
| Web | `src/` | Next.js primary UI |
| Desktop | `vibeflow-desktop/` | Electron focus enforcement |
| Extension | `vibeflow-extension/` | Chrome URL blocking |
| MCP | `src/mcp/` | AI assistant integration |

## Service Result Pattern

All services return:
```typescript
{ success: boolean; data?: T; error?: { code: string; message: string } }
```

Error codes: `VALIDATION_ERROR` | `NOT_FOUND` | `CONFLICT` | `INTERNAL_ERROR` | `AUTH_ERROR`

## Critical Implementation Rules

1. Always call `socketBroadcastService.broadcastStateChange(userId, state)` after state mutations
2. Verify `userId` ownership in services before data access
3. Use skip tokens for bypassing focus restrictions (limited quantity)
4. Settings can be locked during active sessions

## Dev Auth Bypass

```bash
curl -H "X-Dev-User-Email: test@example.com" http://localhost:3000/api/...
```

Only works when `NODE_ENV !== 'production'`.
