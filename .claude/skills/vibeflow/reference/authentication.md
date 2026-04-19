# VibeFlow Authentication

## API Key

All Skill REST API endpoints require a Bearer token:

```
Authorization: Bearer vf_<64-hex-characters>
```

### Obtaining a Key

1. Log into VibeFlow Web UI
2. Go to Settings > API Keys
3. Click "Create New Key"
4. Choose scopes: `read` (view data), `write` (modify data), `admin` (manage settings/keys)
5. Copy the token immediately — it's only shown once

### Scopes

| Scope | Allows |
|-------|--------|
| `read` | All GET endpoints (tasks, projects, state, analytics) |
| `write` | All POST/PUT/DELETE endpoints (create, update, delete tasks/projects/pomodoros) |
| `admin` | Settings modification, API key management |

For normal Agent use, `read` + `write` is sufficient.

### Environment Variables

```bash
export VIBEFLOW_API_KEY="vf_..."
export VIBEFLOW_SERVER_URL="http://localhost:3000"
```

### Error Responses

| Status | Code | Meaning |
|--------|------|---------|
| 401 | AUTH_ERROR | Token missing, invalid, expired, or revoked |
| 403 | FORBIDDEN | Token valid but lacks required scope |

### Security

- NEVER commit API keys to version control
- NEVER display key values in Agent output
- Keys expire after 90 days by default
- Revoke compromised keys immediately in Settings > API Keys
- Create separate keys for each tool/environment
