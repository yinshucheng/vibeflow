# VibeFlow Skill REST API Reference

Base URL: `$VIBEFLOW_SERVER_URL/api/skill`

All endpoints require `Authorization: Bearer $VIBEFLOW_API_KEY` header.
All responses: `{ "success": true/false, "data": ..., "error": { "code": "...", "message": "..." } }`

## Endpoints

### State & Summary

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/state` | read | Current system state, active pomodoro, daily progress |
| GET | `/summary` | read | Daily work summary (pomodoros, tasks, efficiency) |
| GET | `/summary?date=YYYY-MM-DD` | read | Summary for a specific date |
| GET | `/analytics` | read | Productivity analytics and scoring |
| GET | `/timeline` | read | Today's chronological event timeline |

### Tasks

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/tasks` | read | Today's tasks |
| GET | `/tasks?includeDone=true` | read | Today's tasks including completed |
| POST | `/tasks` | write | Create task (requires `title`, `projectId`) |
| GET | `/tasks/{id}` | read | Task details |
| PUT | `/tasks/{id}` | write | Update task fields |
| DELETE | `/tasks/{id}` | write | Delete task |
| POST | `/tasks/{id}/subtasks` | write | Add subtask |
| POST | `/tasks/inbox` | write | Quick create inbox task (just `title`) |
| POST | `/tasks/complete` | write | Complete task (`task_id`, optional `summary`) |
| POST | `/tasks/batch` | write | Batch update (array of `updates`, max 50) |
| GET | `/tasks/backlog` | read | Tasks without plan date |
| GET | `/tasks/overdue` | read | Overdue tasks |

### Pomodoro

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/pomodoro` | read | Current active pomodoro |
| POST | `/pomodoro` | write | Start pomodoro (`taskId`, optional `duration`) |
| POST | `/pomodoro/complete` | write | Complete active pomodoro |
| POST | `/pomodoro/abort` | write | Abort active pomodoro |

### Projects

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/projects` | read | List all projects |
| POST | `/projects` | write | Create project (`title`, `deliverable`) |
| GET | `/projects/{id}` | read | Project details with tasks |
| PUT | `/projects/{id}` | write | Update project |

### Top 3

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/top3` | read | Today's Top 3 priority tasks |
| POST | `/top3` | write | Set Top 3 (`taskIds`: array of 1-3 IDs) |
