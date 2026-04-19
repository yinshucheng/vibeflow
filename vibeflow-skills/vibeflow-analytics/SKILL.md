---
name: vibeflow-analytics
description: >
  VibeFlow productivity analytics and daily summaries. View focus time stats,
  pomodoro history, efficiency scores, and daily timelines. Use when user asks
  about their productivity, wants a daily summary, or needs stats on their work.
version: 1.0.0
user-invocable: true
argument-hint: "[summary|stats|timeline] [date]"
---

# VibeFlow Analytics

## Setup

Requires `VIBEFLOW_API_KEY` and `VIBEFLOW_SERVER_URL` environment variables.
If not set, run `/vibeflow-setup` first.

NEVER display the API key in output.

## Operations

### Daily Summary

Best for getting an overview of the day's work:

```bash
# Today
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/summary"

# Specific date
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/summary?date=2026-04-14"
```

Returns: total pomodoros, focus minutes, efficiency score, completed tasks, task breakdown, highlights, weekly trend.

### Productivity Analytics

Detailed stats with scoring:

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/analytics"
```

Returns daily progress, pomodoro count, and goal tracking.

### Today's Timeline

Chronological view of today's pomodoro sessions:

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/timeline"
```

Returns ordered list of events with timestamps.

### Current State

Quick snapshot of the system:

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/state"
```

Returns: system state (idle/focus/over_rest), active pomodoro, daily pomodoro count, Top 3 task IDs.

## Tips for Presenting Data

When showing analytics to the user:
- Highlight the efficiency score (out of 100) and whether they met their daily goal
- Show focus time in hours rather than minutes when > 60
- Mention highlights (e.g., "completed 5 tasks", "3 hours of focused work")
- Compare to weekly average if available

## Error Handling

On 401: API key invalid → `/vibeflow-setup`.
On 403: Need `read` scope.
