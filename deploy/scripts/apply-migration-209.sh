#!/bin/bash
set -e

cd /home/deploy/orbo

echo "=== Applying migration 209: Fix spam score bio ==="

# Source environment variables
if [ -f .env ]; then
    source .env
else
    echo "ERROR: .env file not found"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL not set in .env"
    exit 1
fi

# Apply migration
echo "Running migration..."
psql "$DATABASE_URL" -f app/db/migrations/209_fix_spam_score_bio.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration 209 applied successfully"
else
    echo "❌ Migration 209 failed"
    exit 1
fi
