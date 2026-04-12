#!/bin/bash
# VibeFlow MCP Server launcher
# Works in non-login shells (e.g. Claude Code spawns without loading shell profile)

# Find node/npx: check common version managers (real bin dirs, not shims), then system paths
for dir in \
  "$HOME/.asdf/installs/nodejs/"*/bin \
  "$HOME/.nvm/versions/node/"*/bin \
  "$HOME/.volta/bin" \
  "$HOME/.fnm/aliases/default/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin"; do
  if [ -x "$dir/npx" ] 2>/dev/null; then
    export PATH="$dir:$PATH"
    break
  fi
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
exec npx tsx src/mcp/run.ts
