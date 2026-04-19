---
name: vibeflow-tasks
description: >
  VibeFlow task management. Create, update, complete, delete tasks. View today's tasks,
  backlog, overdue items. Quick inbox creation. Set Top 3 priorities. Use when user wants
  to manage tasks, plan their day, check what needs doing, or organize work items.
version: 1.0.0
user-invocable: true
argument-hint: "[list|create|complete|update|delete|top3|inbox] [args]"
---

# VibeFlow Tasks

## Setup

Requires `VIBEFLOW_API_KEY` and `VIBEFLOW_SERVER_URL` environment variables.
If not set, run `/vibeflow-setup` first.

NEVER display the API key in output. Refer to it only as `$VIBEFLOW_API_KEY`.

## Operations

### List Today's Tasks

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks"
```

Returns `{ success: true, data: [{ id, title, status, priority, planDate, projectId, ... }] }`

### Get Task Details

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/<task-id>"
```

### Quick Create Inbox Task

Creates a task in the default project with no plan date (inbox):

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Buy groceries"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/inbox"
```

### Create Task (Full)

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Implement login page",
       "projectId": "<project-id>",
       "priority": "P1",
       "planDate": "2026-04-15",
       "estimatedMinutes": 60,
       "description": "Optional description"
     }' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks"
```

Required: `title`, `projectId`. Optional: `priority` (P1/P2/P3, default P2), `planDate`, `estimatedMinutes`, `description`.

### Complete Task

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"task_id":"<task-id>","summary":"Completed the implementation"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/complete"
```

### Update Task

```bash
curl -s -X PUT -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"New title","priority":"P1","planDate":"2026-04-16"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/<task-id>"
```

Any field can be omitted to leave it unchanged.

### Delete Task

```bash
curl -s -X DELETE -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/<task-id>"
```

### Add Subtask

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Subtask name","priority":"P2"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/<parent-task-id>/subtasks"
```

### Batch Update

Update multiple tasks at once (max 50):

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"updates":[
       {"id":"<id1>","status":"DONE"},
       {"id":"<id2>","priority":"P1","planDate":"2026-04-15"}
     ]}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/batch"
```

### Get Backlog (Unplanned Tasks)

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/backlog"
```

### Get Overdue Tasks

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/overdue"
```

### Get/Set Top 3

```bash
# Get
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/top3"

# Set (1-3 task IDs)
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"taskIds":["<id1>","<id2>","<id3>"]}' \
     "$VIBEFLOW_SERVER_URL/api/skill/top3"
```

## Error Handling

On 401: API key invalid → suggest `/vibeflow-setup`.
On 403: Insufficient scope → need `write` scope for mutations.
On 404: Task not found or belongs to another user.
