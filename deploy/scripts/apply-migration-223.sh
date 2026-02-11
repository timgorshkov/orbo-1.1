#!/bin/bash
# Apply migration 223 on server (use Docker Postgres container; .env DATABASE_URL may have special chars in password)
set -e

cd /home/deploy/orbo

echo "=== Applying migration 223: Add image_url to announcements ==="

MIGRATION_FILE="app/db/migrations/223_add_image_url_to_announcements.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "ERROR: $MIGRATION_FILE not found"
    exit 1
fi

# Prefer Docker Postgres container (avoids DATABASE_URL parsing issues)
if docker ps --format '{{.Names}}' | grep -q orbo_postgres; then
    echo "Running migration via orbo_postgres container..."
    cat "$MIGRATION_FILE" | docker exec -i orbo_postgres psql -U orbo -d orbo
else
    echo "Running migration via psql and .env..."
    [ -f .env ] || { echo "ERROR: .env not found"; exit 1; }
    set -a
    source .env
    set +a
    [ -n "$DATABASE_URL" ] || { echo "ERROR: DATABASE_URL not set"; exit 1; }
    psql "$DATABASE_URL" -f "$MIGRATION_FILE"
fi

echo "✅ Migration 223 applied successfully"
