#!/bin/bash
# ============================================
# Database Migration Script (Supabase → Local PostgreSQL)
# ============================================
#
# Migrates data from Supabase to local PostgreSQL in Docker.
#
# Prerequisites:
#   - PostgreSQL container running
#   - Supabase CLI installed
#   - Connection to Supabase DB
#
# Usage:
#   ./migrate-database.sh
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "  Database Migration: Supabase → Local"
echo "============================================"

# Configuration
DOCKER_CONTAINER="orbo_postgres"
LOCAL_DB_USER="orbo"
LOCAL_DB_NAME="orbo"
BACKUP_DIR="/home/deploy/orbo/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# ============================================
# Step 1: Export from Supabase
# ============================================
echo ""
echo -e "${YELLOW}[1/4] Exporting from Supabase...${NC}"
echo "You'll need to provide Supabase connection details."
echo ""

# Check if Supabase CLI is available
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."
    
    # Export using supabase CLI
    read -p "Enter Supabase project ref (from dashboard): " SUPABASE_REF
    
    echo "Exporting database..."
    supabase db dump -p $SUPABASE_REF > $BACKUP_DIR/supabase_export_$DATE.sql
    
    DUMP_FILE="$BACKUP_DIR/supabase_export_$DATE.sql"
else
    echo "Supabase CLI not found. Using pg_dump directly..."
    echo ""
    echo "You can find connection string in Supabase Dashboard:"
    echo "Settings → Database → Connection string → URI"
    echo ""
    
    read -p "Enter Supabase DB connection string: " SUPABASE_CONN
    
    echo "Exporting database..."
    pg_dump "$SUPABASE_CONN" > $BACKUP_DIR/supabase_export_$DATE.sql
    
    DUMP_FILE="$BACKUP_DIR/supabase_export_$DATE.sql"
fi

# Check if export was successful
if [ ! -f "$DUMP_FILE" ] || [ ! -s "$DUMP_FILE" ]; then
    echo -e "${RED}Error: Export failed or empty file${NC}"
    exit 1
fi

DUMP_SIZE=$(du -h $DUMP_FILE | cut -f1)
echo -e "${GREEN}Export successful: $DUMP_FILE ($DUMP_SIZE)${NC}"

# ============================================
# Step 2: Clean up dump file
# ============================================
echo ""
echo -e "${YELLOW}[2/4] Cleaning up dump file...${NC}"

# Remove Supabase-specific statements
CLEAN_DUMP="$BACKUP_DIR/supabase_export_${DATE}_clean.sql"

# Remove auth schema references, extensions that might not exist, etc.
sed \
    -e '/^CREATE SCHEMA IF NOT EXISTS auth;/d' \
    -e '/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/d' \
    -e '/^GRANT.*supabase_admin/d' \
    -e '/^GRANT.*authenticated/d' \
    -e '/^GRANT.*anon/d' \
    -e '/^CREATE ROLE supabase_admin/d' \
    -e '/^CREATE ROLE authenticated/d' \
    -e '/^CREATE ROLE anon/d' \
    -e '/^ALTER.*supabase_admin/d' \
    -e '/^SET default_tablespace/d' \
    -e 's/OWNER TO supabase_admin/OWNER TO orbo/g' \
    -e 's/OWNER TO postgres/OWNER TO orbo/g' \
    "$DUMP_FILE" > "$CLEAN_DUMP"

echo -e "${GREEN}Cleaned dump: $CLEAN_DUMP${NC}"

# ============================================
# Step 3: Prepare local database
# ============================================
echo ""
echo -e "${YELLOW}[3/4] Preparing local database...${NC}"

# Check if PostgreSQL container is running
if ! docker ps | grep -q $DOCKER_CONTAINER; then
    echo -e "${RED}Error: PostgreSQL container is not running${NC}"
    echo "Start it with: docker compose up -d postgres"
    exit 1
fi

# Create extensions needed by Supabase
docker exec -i $DOCKER_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME << 'SQL'
-- Create extensions commonly used by Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pgjwt";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create functions that Supabase might use
CREATE OR REPLACE FUNCTION public.gen_random_uuid()
RETURNS uuid AS $$
BEGIN
  RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql;
SQL

echo -e "${GREEN}Database prepared${NC}"

# ============================================
# Step 4: Import data
# ============================================
echo ""
echo -e "${YELLOW}[4/4] Importing data...${NC}"

# Import the cleaned dump
cat "$CLEAN_DUMP" | docker exec -i $DOCKER_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME

# Verify import
TABLE_COUNT=$(docker exec $DOCKER_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo -e "${GREEN}Import complete. Tables in database: $TABLE_COUNT${NC}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Migration Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Files created:"
echo "  - Original dump: $DUMP_FILE"
echo "  - Cleaned dump: $CLEAN_DUMP"
echo ""
echo "Next steps:"
echo "1. Verify data integrity"
echo "2. Test application with local database"
echo "3. Update .env to use local DATABASE_URL"
echo "4. Restart application: docker compose restart app"
echo ""
echo "To verify:"
echo "  docker exec -it $DOCKER_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME"
echo "  \\dt  -- List tables"
echo "  SELECT COUNT(*) FROM organizations;  -- Check data"
echo ""

