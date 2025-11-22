#!/bin/bash

# Apply the vendor system migration directly to Supabase database

echo "=== Applying Vendor System Migration ==="
echo ""

# Read SQL file
SQL_FILE="supabase/migrations/20251202000000_create_vendors_system.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Migration file not found: $SQL_FILE"
    exit 1
fi

echo "Migration file found: $SQL_FILE"
echo ""
echo "You have two options to apply this migration:"
echo ""
echo "OPTION 1: Via Supabase Dashboard (Recommended)"
echo "  1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/sql/new"
echo "  2. Copy the contents of $SQL_FILE"
echo "  3. Paste into SQL editor and click 'Run'"
echo ""
echo "OPTION 2: Via psql (if you have database connection string)"
echo "  Run: psql <your-connection-string> -f $SQL_FILE"
echo ""
echo "OPTION 3: Copy SQL to clipboard (macOS)"
echo "  Running: pbcopy < $SQL_FILE"
pbcopy < "$SQL_FILE" 2>/dev/null && echo "✅ SQL copied to clipboard! Paste into Supabase Dashboard SQL editor." || echo "⚠️  Could not copy to clipboard (pbcopy not available)"
echo ""

