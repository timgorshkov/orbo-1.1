#!/bin/bash
# ============================================
# Orbo PostgreSQL Backup Script
# ============================================
#
# Creates daily backups of the PostgreSQL database
# and optionally uploads to Selectel S3.
#
# Usage:
#   ./backup.sh           # Local backup only
#   ./backup.sh --upload  # Local + S3 upload
#
# Add to crontab:
#   crontab -e
#   0 3 * * * /home/deploy/orbo/scripts/backup.sh --upload >> /home/deploy/orbo/scripts/backup.log 2>&1
#

set -e

# Configuration
BACKUP_DIR="/home/deploy/orbo/backups"
DOCKER_CONTAINER="orbo_postgres"
DB_USER="orbo"
DB_NAME="orbo"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/orbo_$DATE.sql.gz"

# S3 Configuration (for upload)
S3_BUCKET="orbo-backups"
S3_ENDPOINT="https://s3.storage.selcloud.ru"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "  Orbo Database Backup - $(date)"
echo "============================================"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Check if PostgreSQL container is running
if ! docker ps | grep -q $DOCKER_CONTAINER; then
    echo -e "${RED}Error: PostgreSQL container is not running${NC}"
    exit 1
fi

# ============================================
# Create Backup
# ============================================
echo -e "${YELLOW}Creating backup...${NC}"

docker exec $DOCKER_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_FILE

# Check backup file
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not created${NC}"
    exit 1
fi

BACKUP_SIZE=$(du -h $BACKUP_FILE | cut -f1)
echo -e "${GREEN}Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"

# ============================================
# Clean Old Backups
# ============================================
echo -e "${YELLOW}Cleaning old backups (older than $RETENTION_DAYS days)...${NC}"

DELETED_COUNT=$(find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "Deleted $DELETED_COUNT old backup(s)"

# ============================================
# Upload to S3 (optional)
# ============================================
if [ "$1" == "--upload" ]; then
    echo -e "${YELLOW}Uploading to S3...${NC}"
    
    # Check if s3cmd is configured
    if [ ! -f ~/.s3cfg ]; then
        echo -e "${RED}Warning: S3 not configured (~/.s3cfg not found)${NC}"
        echo "Skipping S3 upload. Configure s3cmd first."
    else
        s3cmd put $BACKUP_FILE s3://$S3_BUCKET/ --host=$S3_ENDPOINT --host-bucket="%(bucket)s.$S3_ENDPOINT"
        echo -e "${GREEN}Uploaded to S3: s3://$S3_BUCKET/$(basename $BACKUP_FILE)${NC}"
        
        # Clean old S3 backups
        echo "Cleaning old S3 backups..."
        CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        # s3cmd ls s3://$S3_BUCKET/ | while read line; do ... done
    fi
fi

# ============================================
# List Current Backups
# ============================================
echo ""
echo "Current local backups:"
ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo -e "${GREEN}Backup completed successfully!${NC}"

