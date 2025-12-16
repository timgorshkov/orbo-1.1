#!/bin/bash
# ============================================
# Orbo PostgreSQL Restore Script
# ============================================
#
# Restores PostgreSQL database from a backup file.
#
# Usage:
#   ./restore.sh                    # Restore latest backup
#   ./restore.sh backup_file.sql.gz # Restore specific backup
#

set -e

# Configuration
BACKUP_DIR="/home/deploy/orbo/backups"
DOCKER_CONTAINER="orbo_postgres"
DB_USER="orbo"
DB_NAME="orbo"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "  Orbo Database Restore"
echo "============================================"

# Determine backup file
if [ -n "$1" ]; then
    if [ -f "$1" ]; then
        BACKUP_FILE="$1"
    elif [ -f "$BACKUP_DIR/$1" ]; then
        BACKUP_FILE="$BACKUP_DIR/$1"
    else
        echo -e "${RED}Error: Backup file not found: $1${NC}"
        exit 1
    fi
else
    # Find latest backup
    BACKUP_FILE=$(ls -t $BACKUP_DIR/*.sql.gz 2>/dev/null | head -1)
    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}Error: No backup files found in $BACKUP_DIR${NC}"
        exit 1
    fi
fi

echo "Backup file: $BACKUP_FILE"
echo ""

# Confirm restore
echo -e "${RED}WARNING: This will OVERWRITE the current database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Check if PostgreSQL container is running
if ! docker ps | grep -q $DOCKER_CONTAINER; then
    echo -e "${RED}Error: PostgreSQL container is not running${NC}"
    exit 1
fi

# ============================================
# Stop Application
# ============================================
echo -e "${YELLOW}Stopping application...${NC}"
cd /home/deploy/orbo
docker compose stop app 2>/dev/null || true

# ============================================
# Restore Database
# ============================================
echo -e "${YELLOW}Restoring database...${NC}"

# Drop and recreate database
docker exec -i $DOCKER_CONTAINER psql -U $DB_USER -c "DROP DATABASE IF EXISTS ${DB_NAME}_backup;" 2>/dev/null || true
docker exec -i $DOCKER_CONTAINER psql -U $DB_USER -c "ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_backup;" 2>/dev/null || true
docker exec -i $DOCKER_CONTAINER psql -U $DB_USER -c "CREATE DATABASE $DB_NAME;"

# Restore from backup
gunzip -c $BACKUP_FILE | docker exec -i $DOCKER_CONTAINER psql -U $DB_USER $DB_NAME

# ============================================
# Verify Restore
# ============================================
echo -e "${YELLOW}Verifying restore...${NC}"

TABLE_COUNT=$(docker exec $DOCKER_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Tables in restored database: $TABLE_COUNT"

# ============================================
# Restart Application
# ============================================
echo -e "${YELLOW}Restarting application...${NC}"
docker compose start app

# ============================================
# Cleanup
# ============================================
echo ""
echo -e "${YELLOW}Note: Old database saved as '${DB_NAME}_backup'${NC}"
echo "To remove it, run:"
echo "  docker exec $DOCKER_CONTAINER psql -U $DB_USER -c 'DROP DATABASE ${DB_NAME}_backup;'"

echo ""
echo -e "${GREEN}Restore completed successfully!${NC}"

