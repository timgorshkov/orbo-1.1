#!/bin/bash
# ============================================
# Orbo PostgreSQL Backup Script
# ============================================
#
# Creates daily backups of the PostgreSQL database
# and sends alerts on failure.
#
# Usage:
#   ./backup.sh           # Local backup only
#   ./backup.sh --upload  # Local + S3 upload
#
# Add to crontab:
#   0 3 * * * /home/deploy/orbo/scripts/backup.sh >> /home/deploy/orbo/scripts/backup.log 2>&1
#

# Configuration
BACKUP_DIR="/home/deploy/orbo/backups"
DOCKER_CONTAINER="orbo_postgres"
DB_USER="orbo"
DB_NAME="orbo"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/orbo_$DATE.sql.gz"
LOG_FILE="/home/deploy/orbo/scripts/backup.log"

# Alert Configuration
ALERT_API_URL="https://my.orbo.ru/api/cron/backup-alert"
# Load environment for CRON_SECRET
source /home/deploy/orbo/.env 2>/dev/null || true

# S3 Configuration (for upload)
S3_BUCKET="orbo-backups"
S3_ENDPOINT="https://s3.storage.selcloud.ru"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ============================================
# Alert Function
# ============================================
send_alert() {
    local status="$1"
    local message="$2"
    local backup_size="$3"
    
    # Log alert
    echo "[$(date)] ALERT: $status - $message" >> $LOG_FILE
    
    # Send to API if CRON_SECRET is set
    if [ -n "$CRON_SECRET" ]; then
        curl -s -X POST "$ALERT_API_URL" \
            -H "Content-Type: application/json" \
            -H "x-cron-secret: $CRON_SECRET" \
            -d "{\"status\": \"$status\", \"message\": \"$message\", \"backup_size\": \"$backup_size\", \"timestamp\": \"$(date -Iseconds)\"}" \
            > /dev/null 2>&1 || true
    fi
}

# ============================================
# Error Handler
# ============================================
handle_error() {
    local error_message="$1"
    echo -e "${RED}Error: $error_message${NC}"
    send_alert "error" "$error_message" ""
    exit 1
}

# Trap errors
trap 'handle_error "Backup script failed at line $LINENO"' ERR

echo "============================================"
echo "  Orbo Database Backup - $(date)"
echo "============================================"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Check if PostgreSQL container is running
if ! docker ps | grep -q $DOCKER_CONTAINER; then
    handle_error "PostgreSQL container is not running"
fi

# ============================================
# Create Backup
# ============================================
echo -e "${YELLOW}Creating backup...${NC}"

docker exec $DOCKER_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_FILE

# Check backup file
if [ ! -f "$BACKUP_FILE" ]; then
    handle_error "Backup file not created"
fi

# Verify backup is not empty (minimum 1KB)
BACKUP_SIZE_BYTES=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [ "$BACKUP_SIZE_BYTES" -lt 1024 ]; then
    handle_error "Backup file is too small ($BACKUP_SIZE_BYTES bytes)"
fi

BACKUP_SIZE=$(du -h $BACKUP_FILE | cut -f1)
echo -e "${GREEN}Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"

# ============================================
# Verify Backup Integrity
# ============================================
echo -e "${YELLOW}Verifying backup integrity...${NC}"

if ! gunzip -t $BACKUP_FILE 2>/dev/null; then
    handle_error "Backup file is corrupted (gzip check failed)"
fi

echo -e "${GREEN}Backup integrity verified${NC}"

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
        echo -e "${YELLOW}Warning: S3 not configured (~/.s3cfg not found)${NC}"
        echo "Skipping S3 upload. Configure s3cmd first."
    else
        if s3cmd put $BACKUP_FILE s3://$S3_BUCKET/ --host=$S3_ENDPOINT --host-bucket="%(bucket)s.$S3_ENDPOINT"; then
            echo -e "${GREEN}Uploaded to S3: s3://$S3_BUCKET/$(basename $BACKUP_FILE)${NC}"
        else
            echo -e "${YELLOW}Warning: S3 upload failed${NC}"
        fi
    fi
fi

# ============================================
# List Current Backups
# ============================================
echo ""
echo "Current local backups:"
ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || echo "No backups found"

# ============================================
# Send Success Alert
# ============================================
send_alert "success" "Backup completed successfully" "$BACKUP_SIZE"

echo ""
echo -e "${GREEN}Backup completed successfully!${NC}"
