---
name: vibeflow-setup
description: >
  Set up VibeFlow connection for Claude Code. Guides through configuring server URL
  and API key. Use when first installing VibeFlow skills, when connection fails with
  401 errors, or when user asks to configure VibeFlow.
version: 1.0.0
user-invocable: true
argument-hint: ""
---

# VibeFlow Setup

## Step 1: Check Current Configuration

Check if environment variables are set:

```bash
echo "VIBEFLOW_SERVER_URL: ${VIBEFLOW_SERVER_URL:-NOT SET}"
echo "VIBEFLOW_API_KEY: ${VIBEFLOW_API_KEY:+SET (hidden)}"
```

If both are set, skip to Step 4 (Verify Connection).

## Step 2: Get Server URL

Ask the user for their VibeFlow server URL:
- Local development: `http://localhost:3000`
- Production: their deployment URL

The user should set this in their shell profile:
```bash
export VIBEFLOW_SERVER_URL="http://localhost:3000"
```

## Step 3: Get API Key

Guide the user to create an API Key:

1. Open VibeFlow in their browser
2. Go to **Settings** (gear icon or `/settings`)
3. Find the **API Keys** section
4. Click **Create New Key**
5. Name: "Claude Code" (or similar)
6. Scopes: select **read** and **write** (admin not needed for normal use)
7. Click Create → **copy the key immediately** (it's only shown once!)

The user should set this in their shell profile:
```bash
export VIBEFLOW_API_KEY="vf_..."
```

IMPORTANT: NEVER display or echo the API key value. If the user shares it, remind them it should be kept secret.

## Step 4: Verify Connection

```bash
curl -s -H "Authorization: Bearer $VIBEFLOW_API_KEY" \
     "$VIBEFLOW_SERVER_URL/api/skill/state"
```

Expected: `{ "success": true, "data": { "systemState": "..." } }`

If you get:
- **Connection refused**: Server URL is wrong or server is not running
- **401 Unauthorized**: API key is invalid, expired, or revoked — create a new one
- **403 Forbidden**: API key lacks required scopes — create a new key with read+write

## Step 5: Done!

Tell the user they can now use:
- `/vibeflow-tasks` — manage tasks
- `/vibeflow-focus` — manage pomodoro sessions
- `/vibeflow-projects` — manage projects
- `/vibeflow-analytics` — view productivity data
