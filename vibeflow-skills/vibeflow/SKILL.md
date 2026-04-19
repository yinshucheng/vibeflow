---
name: vibeflow
description: >
  VibeFlow AI-Native Focus Engine — hub skill for managing tasks, pomodoros, projects,
  and productivity analytics. Routes to specialized sub-skills. Use when user mentions
  VibeFlow, focus sessions, pomodoro timer, task management, or daily planning.
version: 1.0.0
user-invocable: true
argument-hint: "[command] [args]"
---

# VibeFlow Hub

VibeFlow is an AI-Native Output Engine that helps users stay in their desired state through task management, pomodoro focus sessions, and productivity analytics.

## Setup

Requires environment variables:
- `VIBEFLOW_API_KEY` — Bearer token (format: `vf_...`), obtain from Settings > API Keys
- `VIBEFLOW_SERVER_URL` — Server URL (e.g., `http://localhost:3000` or production URL)

If not configured, run `/vibeflow-setup` to get started.

NEVER display the API key value in output. Always refer to it as `$VIBEFLOW_API_KEY`.

## Available Sub-Skills

| Skill | Use When |
|-------|----------|
| `/vibeflow-setup` | First-time configuration or connection issues |
| `/vibeflow-tasks` | Creating, updating, completing, or viewing tasks |
| `/vibeflow-focus` | Starting, stopping, or checking pomodoro sessions |
| `/vibeflow-projects` | Managing projects |
| `/vibeflow-analytics` | Viewing productivity stats, daily summaries, timelines |

## Quick Reference

All API calls use Bearer token auth and return standard JSON:

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/<endpoint>"
```

### Most Common Operations

**Check status:**
```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" "$VIBEFLOW_SERVER_URL/api/skill/state"
```

**List today's tasks:**
```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" "$VIBEFLOW_SERVER_URL/api/skill/tasks"
```

**Quick create a task:**
```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Task name here"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/tasks/inbox"
```

**Start a pomodoro:**
```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"taskId":"<task-id>"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/pomodoro"
```

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Parse `data` field |
| 401 | Unauthorized | API key invalid/expired — tell user to check Settings > API Keys |
| 403 | Forbidden | Token lacks required scope — tell user to create a key with appropriate scopes |
| 404 | Not Found | Resource doesn't exist or belongs to another user |
| 429 | Rate Limited | Wait and retry — include `Retry-After` header |

All responses follow: `{ "success": true/false, "data": ..., "error": { "code": "...", "message": "..." } }`
