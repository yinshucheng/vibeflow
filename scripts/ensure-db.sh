#!/usr/bin/env bash
# ensure-db.sh — Create database if not exists + sync Prisma schema
# Usage: scripts/ensure-db.sh <db_name>
#
# The DATABASE_URL is constructed automatically using the current system user.
# Examples:
#   scripts/ensure-db.sh vibeflow_test
#   scripts/ensure-db.sh vibeflow_e2e

set -euo pipefail

DB_NAME="${1:?Usage: ensure-db.sh <db_name>}"
DB_USER="${USER:-$(whoami)}"
DATABASE_URL="postgresql://${DB_USER}@localhost:5432/${DB_NAME}?schema=public"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[ensure-db]${NC} $*"; }
warn() { echo -e "${YELLOW}[ensure-db]${NC} $*"; }
err() { echo -e "${RED}[ensure-db]${NC} $*" >&2; }

# Check if PostgreSQL is accessible
if ! command -v psql &>/dev/null; then
  err "psql not found. Please install PostgreSQL client."
  exit 1
fi

# Check if database exists
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  log "Database '$DB_NAME' already exists"
else
  log "Creating database '$DB_NAME'..."
  createdb "$DB_NAME" 2>/dev/null || {
    err "Failed to create database '$DB_NAME'"
    exit 1
  }
  log "Database '$DB_NAME' created"
fi

# Sync Prisma schema
log "Syncing Prisma schema to '$DB_NAME'..."
DATABASE_URL="$DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss 2>&1 | \
  grep -E '(applying|applied|already in sync|Your database is now in sync)' || true
log "Schema sync complete for '$DB_NAME'"

# Output the DATABASE_URL for consumers
echo "$DATABASE_URL"
