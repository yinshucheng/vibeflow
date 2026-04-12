# VibeFlow — AI-Native Focus Engine

You are connected to VibeFlow, a productivity system built around Pomodoro technique.

## Connection

```
Server: $VIBEFLOW_SERVER_URL (default: http://39.105.213.147:4000)
Auth:   x-dev-user-email header
API:    tRPC over HTTP at /api/trpc/<procedure>
```

All API calls use `curl`. Queries use GET, mutations use POST.

## Protocol

**Query** (read data):
```bash
curl -s '<SERVER>/api/trpc/<procedure>' -H 'x-dev-user-email: <EMAIL>'
# With input:
curl -s '<SERVER>/api/trpc/<procedure>?input={"json":{...}}' -H 'x-dev-user-email: <EMAIL>'
```

**Mutation** (write data):
```bash
curl -s -X POST '<SERVER>/api/trpc/<procedure>' \
  -H 'x-dev-user-email: <EMAIL>' \
  -H 'Content-Type: application/json' \
  -d '{"json":{...}}'
```

Response shape: `{"result":{"data":{"json": <payload>}}}`

Use env vars: `VIBEFLOW_SERVER_URL` defaults to `http://39.105.213.147:4000`, `VIBEFLOW_USER_EMAIL` defaults to `dev@vibeflow.local`.

## Available APIs

### Context & State (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `dailyState.getCurrentState` | — | Current system state: `idle`, `focus`, `rest`, `over_rest` |
| `dailyState.getToday` | — | Today's daily state (pomodoroCount, top3TaskIds, adjustedGoal) |
| `dailyState.getTop3Tasks` | — | Top 3 task IDs for today |
| `dailyState.getDailyProgress` | — | Daily progress with predictions |
| `pomodoro.getCurrent` | — | Current active pomodoro (null if none) |
| `mcpBridge.whoami` | — | Current user {userId, email} |
| `mcpBridge.generateDailySummary` | `{date?: "YYYY-MM-DD"}` | Daily summary: completed tasks, pomodoro stats, efficiency score |

### Tasks (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `task.getById` | `{id: "<uuid>"}` | Get a single task with details |
| `task.getTodayTasks` | — | Today's planned tasks |
| `task.getBacklog` | — | Tasks without plan date |
| `task.getOverdue` | — | Tasks past their plan date |
| `mcpBridge.getTaskContext` | `{taskId: "<uuid>"}` | Rich task context: project, goals, parent, subtasks, recent pomodoros |
| `mcpBridge.analyzeTaskDependencies` | `{projectId: "<uuid>"}` | Dependency graph + suggested execution order |

### Tasks (Mutation)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `task.create` | `{title, projectId, priority?: "P1"/"P2"/"P3", planDate?, estimatedMinutes?}` | Create a task |
| `task.update` | `{id, data: {title?, priority?, planDate?, estimatedMinutes?}}` | Update task properties |
| `task.updateStatus` | `{id, status: "TODO"/"IN_PROGRESS"/"DONE"}` | Change task status |
| `task.delete` | `{id}` | Delete a task |
| `task.setPlanDate` | `{id, planDate: "YYYY-MM-DD" or null}` | Set/clear plan date |
| `task.quickCreateInbox` | `{title}` | Quick create in first active project |
| `mcpBridge.batchUpdateTasks` | `{updates: [{taskId, status?, priority?, planDate?}]}` | Batch update multiple tasks |
| `mcpBridge.moveTask` | `{taskId, targetProjectId}` | Move task to another project |
| `mcpBridge.setTop3` | `{taskIds: ["id1","id2","id3"]}` | Set today's Top 3 tasks |
| `mcpBridge.createTaskFromNl` | `{description, projectId?, confirm?: true}` | Create task from natural language |

### Projects (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `project.list` | — | All projects |
| `project.getById` | `{id}` | Single project details |

### Projects (Mutation)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `project.create` | `{title, deliverable, goalIds?: []}` | Create a project |
| `project.update` | `{id, data: {title?, deliverable?, status?}}` | Update a project |

### Goals (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `goal.list` | — | All goals (long-term + short-term) |

### Pomodoro (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `pomodoro.getCurrent` | — | Active pomodoro |
| `pomodoro.getTodayCount` | — | Today's completed count |

### Pomodoro (Mutation)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `pomodoro.start` | `{taskId, duration?: 10-120}` | Start a pomodoro |
| `pomodoro.startTaskless` | `{label?}` | Start without a task |
| `pomodoro.complete` | `{id, summary?}` | Complete a pomodoro |
| `pomodoro.abort` | `{id}` | Abort a pomodoro |
| `pomodoro.record` | `{taskId?, duration, completedAt, summary?}` | Record retroactively |
| `pomodoro.completeTask` | `{pomodoroId, nextTaskId?}` | Complete current task during pomodoro |

### Analytics (Query)

| Procedure | Input | Description |
|-----------|-------|-------------|
| `efficiencyAnalysis.getHistoricalAnalysis` | `{days: 7-365}` | Historical productivity analysis |
| `mcpBridge.getPomodoroHistory` | — | 7-day pomodoro history |
| `mcpBridge.getActiveBlockers` | — | Active blockers |
| `timeline.getByDate` | `{date: "YYYY-MM-DD"}` | Timeline events for a date |

## Examples

```bash
# Get current state
curl -s 'http://39.105.213.147:4000/api/trpc/dailyState.getCurrentState' -H 'x-dev-user-email: dev@vibeflow.local'

# Create a task
curl -s -X POST 'http://39.105.213.147:4000/api/trpc/task.quickCreateInbox' \
  -H 'x-dev-user-email: dev@vibeflow.local' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"title":"Review PR #42"}}'

# Start a pomodoro
curl -s -X POST 'http://39.105.213.147:4000/api/trpc/pomodoro.start' \
  -H 'x-dev-user-email: dev@vibeflow.local' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"taskId":"<uuid>","duration":25}}'

# Get daily summary
curl -s 'http://39.105.213.147:4000/api/trpc/mcpBridge.generateDailySummary?input=%7B%22json%22%3A%7B%7D%7D' \
  -H 'x-dev-user-email: dev@vibeflow.local'
```

## Behavior Rules

1. Before creating tasks, check `project.list` to find the right project
2. Before starting a pomodoro, check `pomodoro.getCurrent` — only one can be active
3. Check `dailyState.getCurrentState` to understand the user's current mode
4. When the user says something like "记一下" or "加个任务", use `task.quickCreateInbox`
5. For natural language task descriptions with dates/priorities, use `mcpBridge.createTaskFromNl`
6. Always show the result to the user in a readable format
