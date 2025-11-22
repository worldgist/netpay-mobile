#!/bin/bash

# Apply migration automatically using Supabase Management API

set -e

MIGRATION_FILE="supabase/migrations/20251202000000_create_vendors_system.sql"
PROJECT_REF="rekkdwpkzkhgnejgzhac"

echo "=== Applying Migration Automatically ==="
echo ""

# Check for access token
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo ""
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    echo ""
    echo "Get your token from: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Reading migration file..."
SQL_CONTENT=$(cat "$MIGRATION_FILE")

echo "Applying migration via Supabase Management API..."
echo ""

# Use Supabase Management API to execute SQL
# Note: This requires using the database SQL endpoint
RESPONSE=$(curl -s -X POST \
    "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$SQL_CONTENT" | jq -Rs .)}" 2>&1)

if echo "$RESPONSE" | grep -q "error\|Error"; then
    echo "❌ Error applying migration:"
    echo "$RESPONSE"
    echo ""
    echo "Alternative: Try applying manually via Supabase Dashboard"
    echo "  https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
    exit 1
else
    echo "✅ Migration applied successfully!"
    echo "$RESPONSE"
fi

