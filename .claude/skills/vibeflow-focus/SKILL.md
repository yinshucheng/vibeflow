---
name: vibeflow-focus
description: >
  VibeFlow pomodoro focus session management. Start, complete, or abort pomodoro
  sessions. Check current focus status. Use when user wants to start focusing,
  begin a pomodoro, stop a timer, check focus progress, or manage work sessions.
version: 1.0.0
user-invocable: true
argument-hint: "[start|stop|complete|abort|status] [task_id]"
---

# VibeFlow Focus

## Setup

Requires `VIBEFLOW_API_KEY` and `VIBEFLOW_SERVER_URL` environment variables.
If not set, run `/vibeflow-setup` first.

NEVER display the API key in output.

## Operations

### Check Current Status

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/state"
```

Returns system state (`idle`/`focus`/`over_rest`), active pomodoro info, daily progress.

### Check Current Pomodoro

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/pomodoro"
```

Returns active pomodoro details (task, duration, start time) or null if idle.

### Start Pomodoro

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"taskId":"<task-id>"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/pomodoro"
```

Optional: `"duration": 25` (minutes, default from user settings, range 10-120).

If user doesn't specify a task, first list tasks with `GET /api/skill/tasks` and let them choose, or use `GET /api/skill/top3` to suggest from their Top 3.

### Complete Pomodoro

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/pomodoro/complete"
```

Completes the active pomodoro normally. Only works when in `focus` state.

### Abort Pomodoro

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/pomodoro/abort"
```

Cancels the active pomodoro. The time is not counted.

## Workflow Guide

Typical focus workflow:

1. `GET /state` — check current state
2. If `idle`: `GET /tasks` or `GET /top3` → pick a task → `POST /pomodoro` with taskId
3. If `focus`: show remaining time, or `POST /pomodoro/complete` when done
4. If `over_rest`: suggest starting a new pomodoro to return to work

## Error Handling

On 401: API key invalid → `/vibeflow-setup`.
On 403: Need `write` scope.
On state conflict (e.g., starting pomodoro while already in focus): returns error with current state info.
