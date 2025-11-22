#!/bin/bash

# Automatically apply the vendor system migration

set -e

PROJECT_REF="rekkdwpkzkhgnejgzhac"
MIGRATION_FILE="supabase/migrations/20251202000000_create_vendors_system.sql"
DB_HOST="aws-1-eu-north-1.pooler.supabase.com"
DB_PORT="6543"
DB_NAME="postgres"
DB_USER="postgres.$PROJECT_REF"

echo "=== Auto-apply Vendor System Migration ==="
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client:"
    echo "   brew install postgresql"
    exit 1
fi

# Get password
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "Enter your Supabase database password:"
    echo "(Get it from: https://supabase.com/dashboard/project/$PROJECT_REF/settings/database)"
    read -sp "Password: " DB_PASSWORD
    echo ""
    echo ""
    
    if [ -z "$DB_PASSWORD" ]; then
        echo "❌ No password provided. Exiting."
        exit 1
    fi
else
    DB_PASSWORD="$SUPABASE_DB_PASSWORD"
fi

# Build connection string
CONNECTION_STRING="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

echo "Connecting to database..."
echo "Applying migration..."
echo ""

# Apply migration
if psql "$CONNECTION_STRING" -f "$MIGRATION_FILE" 2>&1; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "Verifying tables..."
    psql "$CONNECTION_STRING" -c "SELECT COUNT(*) as vendor_count FROM vendors;" 2>/dev/null || echo "⚠️  Could not verify vendors table"
    psql "$CONNECTION_STRING" -c "SELECT COUNT(*) as priority_count FROM vendor_priority;" 2>/dev/null || echo "⚠️  Could not verify vendor_priority table"
    echo ""
    echo "✅ Done! Migration applied successfully."
else
    echo ""
    echo "❌ Error applying migration. Please check the error above."
    echo ""
    echo "You can also apply manually via Supabase Dashboard:"
    echo "  https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
    exit 1
fi

