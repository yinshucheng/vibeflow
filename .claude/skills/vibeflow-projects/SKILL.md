---
name: vibeflow-projects
description: >
  VibeFlow project management. Create, update, and view projects. Projects are
  containers for tasks. Use when user wants to organize work into projects, create
  a new project, or view project details and progress.
version: 1.0.0
user-invocable: true
argument-hint: "[list|create|update|get] [project_id]"
---

# VibeFlow Projects

## Setup

Requires `VIBEFLOW_API_KEY` and `VIBEFLOW_SERVER_URL` environment variables.
If not set, run `/vibeflow-setup` first.

NEVER display the API key in output.

## Operations

### List Projects

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/projects"
```

Returns all projects with task counts.

### Get Project Details

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/projects/<project-id>"
```

Returns project info with task list.

### Create Project

```bash
curl -s -X POST -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"Project Name","deliverable":"What this project delivers"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/projects"
```

Required: `title`, `deliverable`.

### Update Project

```bash
curl -s -X PUT -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"title":"New Name","status":"COMPLETED"}' \
     "$VIBEFLOW_SERVER_URL/api/skill/projects/<project-id>"
```

Status options: `ACTIVE`, `COMPLETED`, `ARCHIVED`.

## Error Handling

On 401: API key invalid → `/vibeflow-setup`.
On 403: Need `write` scope for mutations.
On 404: Project not found.
