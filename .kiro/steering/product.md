---
inclusion: always
---

# VibeFlow - Product Context

VibeFlow is a productivity app helping developers achieve flow state through structured task management and the Pomodoro technique.

## Domain Model

- **Goals**: Long-term (1-5 years) or short-term (1 week to 6 months) objectives
- **Projects**: Task containers linked to goals
- **Tasks**: Hierarchical work items with P1/P2/P3 priorities, plan dates, and subtask support
- **Pomodoros**: Timed focus sessions (10-120 min) tied to tasks
- **Daily State**: Per-user daily workflow state with Top 3 task selection

## Daily State Machine

States flow: `LOCKED` → `PLANNING` → `FOCUS` ↔ `REST` → `LOCKED`

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `LOCKED` | Day not started | Complete airlock only |
| `PLANNING` | Ready to work | Start pomodoro, manage tasks |
| `FOCUS` | Pomodoro active | Complete/abort pomodoro |
| `REST` | Break period | Complete rest, override cap |

Key rules:
- State machine defined in `src/machines/vibeflow.machine.ts`
- Daily reset occurs at 04:00 AM
- Top 3 tasks selected during airlock (0-3 tasks allowed)
- Daily cap limits pomodoros per day (default: 8)

## Multi-Platform Architecture

| Platform | Location | Purpose |
|----------|----------|---------|
| Web App | `src/` | Primary Next.js interface |
| Desktop | `vibeflow-desktop/` | Electron app for OS-level focus enforcement |
| Browser Extension | `browser-sentinel/` | Chrome extension for URL blocking |
| MCP Server | `src/mcp/` | AI assistant integration |

## Service Patterns

Services return `ServiceResult<T>`:
```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, string[]> };
}
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `AUTH_ERROR`

## Key Behaviors

- Tasks must be selected before starting a pomodoro
- Pomodoros are always tied to a specific task
- Skip tokens allow bypassing focus restrictions (limited quantity)
- Settings can be locked to prevent mid-session changes
- Real-time sync via Socket.io broadcasts state changes to all clients

## Development Auth

Use `X-Dev-User-Email` header for auth bypass in dev mode:
```bash
curl -H "X-Dev-User-Email: test@example.com" http://localhost:3000/api/...
```

## State Change Broadcasting

When modifying system state, call `broadcastStateChange(userId, state)` from `socket-broadcast.service` to sync connected clients.
