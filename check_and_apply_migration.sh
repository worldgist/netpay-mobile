#!/bin/bash

# Check if migration was applied and apply if needed

set -e

PROJECT_REF="rekkdwpkzkhgnejgzhac"
MIGRATION_FILE="supabase/migrations/20251202000000_create_vendors_system.sql"

echo "=== Checking Migration Status ==="
echo ""

# Check if we can query the vendors table (which means migration was applied)
echo "Checking if migration was already applied..."
echo ""

if supabase db execute "SELECT 1 FROM vendors LIMIT 1;" 2>/dev/null; then
    echo "✅ Migration already applied! Vendors table exists."
    echo ""
    echo "Verifying tables..."
    supabase db execute "SELECT COUNT(*) as vendor_count FROM vendors;" 2>/dev/null || echo "Could not query vendors"
    supabase db execute "SELECT COUNT(*) as priority_count FROM vendor_priority;" 2>/dev/null || echo "Could not query vendor_priority"
    exit 0
else
    echo "⚠️  Migration not applied yet. Tables don't exist."
    echo ""
    echo "Since supabase db push isn't working due to migration history mismatch,"
    echo "please apply manually via Supabase Dashboard:"
    echo ""
    echo "1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
    echo "2. Copy contents of $MIGRATION_FILE (already in clipboard)"
    echo "3. Paste and run"
    echo ""
    echo "Or if you have the database password, run:"
    echo "  export SUPABASE_DB_PASSWORD='your-password'"
    echo "  ./apply_migration_psql.sh"
    exit 1
fi

