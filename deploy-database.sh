#!/bin/bash

# Deploy database migrations to Supabase

set -e

echo "=== Deploying Database Migrations ==="
echo ""

# Check authentication
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo ""
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    echo ""
    echo "Get your token from: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

# Link project if not already linked
echo "Checking project link..."
if ! supabase status > /dev/null 2>&1; then
    echo "Linking project..."
    supabase link --project-ref rekkdwpkzkhgnejgzhac
    if [ $? -ne 0 ]; then
        echo "❌ Failed to link project"
        exit 1
    fi
fi
echo "✅ Project linked"
echo ""

# Count migrations
MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "Found $MIGRATION_COUNT migration files"
echo ""

# Push migrations
echo "Pushing migrations to remote database..."
echo ""

if supabase db push; then
    echo ""
    echo "✅ Database migrations deployed successfully!"
    echo ""
    echo "All tables, functions, and policies have been created."
else
    echo ""
    echo "❌ Failed to deploy migrations"
    echo ""
    echo "You can also try:"
    echo "  supabase migration up"
    exit 1
fi

echo ""
echo "To verify, check your Supabase dashboard:"
echo "  https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/editor"

