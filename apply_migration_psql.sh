#!/bin/bash

# Apply migration using psql if connection string is available

set -e

MIGRATION_FILE="supabase/migrations/20251202000000_create_vendors_system.sql"
PROJECT_REF="rekkdwpkzkhgnejgzhac"

echo "=== Applying Migration via psql ==="
echo ""

# Try to get database password from user
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "To apply the migration automatically, we need your database password."
    echo ""
    echo "Option 1: Set SUPABASE_DB_PASSWORD environment variable:"
    echo "  export SUPABASE_DB_PASSWORD='your-password'"
    echo ""
    echo "Option 2: Get it from Supabase Dashboard:"
    echo "  https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
    echo ""
    read -sp "Enter database password (or press Enter to skip): " DB_PASSWORD
    echo ""
    
    if [ -z "$DB_PASSWORD" ]; then
        echo "⚠️  No password provided. Cannot apply migration automatically."
        echo ""
        echo "Please apply manually via Supabase Dashboard:"
        echo "  1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
        echo "  2. Copy contents of $MIGRATION_FILE"
        echo "  3. Paste and run"
        exit 0
    fi
    
    export SUPABASE_DB_PASSWORD="$DB_PASSWORD"
fi

# Connection details
DB_HOST="aws-1-eu-north-1.pooler.supabase.com"
DB_PORT="6543"
DB_NAME="postgres"
DB_USER="postgres.$PROJECT_REF"

# Build connection string
CONNECTION_STRING="postgresql://$DB_USER:$SUPABASE_DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

echo "Connecting to database..."
echo ""

# Apply migration using psql
if command -v psql &> /dev/null; then
    echo "Applying migration..."
    if psql "$CONNECTION_STRING" -f "$MIGRATION_FILE"; then
        echo ""
        echo "✅ Migration applied successfully!"
    else
        echo ""
        echo "❌ Error applying migration. Please check the error above."
        exit 1
    fi
else
    echo "❌ psql not found. Please install PostgreSQL client."
    echo ""
    echo "On macOS: brew install postgresql"
    echo "Or apply manually via Supabase Dashboard"
    exit 1
fi

