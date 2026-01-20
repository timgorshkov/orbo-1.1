#!/bin/bash

# Script to check and set DB_PROVIDER for PostgreSQL migration
# Run this on your production server

set -e

echo "================================================"
echo "Checking Supabase → PostgreSQL Migration Status"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please run this script from the app directory (where .env is located)"
    exit 1
fi

echo "📁 Found .env file"
echo ""

# Check current DB_PROVIDER value
if grep -q "^DB_PROVIDER=" .env; then
    CURRENT_VALUE=$(grep "^DB_PROVIDER=" .env | cut -d '=' -f2)
    echo -e "✅ DB_PROVIDER is set to: ${GREEN}${CURRENT_VALUE}${NC}"
    
    if [ "$CURRENT_VALUE" = "postgres" ]; then
        echo -e "${GREEN}✅ CORRECT: All database queries go to local PostgreSQL${NC}"
        echo ""
        echo "You can safely delete your Supabase project after testing!"
        exit 0
    else
        echo -e "${YELLOW}⚠️  WARNING: DB_PROVIDER is set to '${CURRENT_VALUE}'${NC}"
        echo "Expected value: postgres"
        echo ""
    fi
else
    echo -e "${RED}❌ DB_PROVIDER not found in .env${NC}"
    echo -e "${RED}⚠️  CRITICAL: Database queries are going to Supabase by default!${NC}"
    echo ""
fi

# Ask if user wants to set it now
echo "Would you like to set DB_PROVIDER=postgres now? (y/n)"
read -r response

if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    # Check if line exists (commented or active)
    if grep -q "DB_PROVIDER" .env; then
        # Update existing line
        sed -i.bak 's/^#\?DB_PROVIDER=.*/DB_PROVIDER=postgres/' .env
        echo -e "${GREEN}✅ Updated DB_PROVIDER=postgres in .env${NC}"
    else
        # Add new line
        echo "DB_PROVIDER=postgres" >> .env
        echo -e "${GREEN}✅ Added DB_PROVIDER=postgres to .env${NC}"
    fi
    
    echo ""
    echo "================================================"
    echo "⚠️  IMPORTANT: Restart your application now!"
    echo "================================================"
    echo ""
    echo "Run one of:"
    echo "  docker-compose restart app"
    echo "  pm2 restart orbo"
    echo "  systemctl restart orbo"
    echo ""
    echo "After restart, all database queries will go to PostgreSQL ✅"
    
else
    echo "Skipped. To set manually, add this line to .env:"
    echo ""
    echo "  DB_PROVIDER=postgres"
    echo ""
    echo "Then restart your application."
fi

echo ""
echo "================================================"
echo "Next Steps:"
echo "================================================"
echo "1. Restart application"
echo "2. Test that everything works (login, dashboard, events, etc)"
echo "3. Monitor for 7 days"
echo "4. If no issues → delete Supabase project"
echo ""
echo "See: docs/SUPABASE_MIGRATION_STATUS.md for full checklist"
