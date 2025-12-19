#!/bin/bash

# Apply migration to add admin policies for user_push_tokens table
# This script applies the migration using Supabase CLI or provides instructions

set -e

MIGRATION_FILE="supabase/migrations/20251220000000_add_admin_policies_user_push_tokens.sql"
PROJECT_ID="rekkdwpkzkhgnejgzhac"

echo "Applying migration: Add admin policies for user_push_tokens"
echo "============================================================"
echo ""

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo "Please install it: https://supabase.com/docs/guides/cli"
    echo ""
    echo "Alternatively, run this SQL in the Supabase SQL Editor:"
    echo "https://supabase.com/dashboard/project/${PROJECT_ID}/sql"
    echo ""
    cat "$MIGRATION_FILE"
    exit 1
fi

# Try to link and push migration
echo "Attempting to apply migration via Supabase CLI..."
echo ""

# Check if project is linked
if supabase projects list 2>/dev/null | grep -q "$PROJECT_ID"; then
    echo "✅ Project found"
    echo "Applying migration..."
    supabase db push --db-url "postgresql://postgres:[YOUR-PASSWORD]@db.${PROJECT_ID}.supabase.co:5432/postgres" 2>/dev/null || {
        echo ""
        echo "⚠️  Could not apply automatically via CLI"
        echo ""
        echo "Please apply this migration manually:"
        echo "1. Go to: https://supabase.com/dashboard/project/${PROJECT_ID}/sql"
        echo "2. Copy and paste the following SQL:"
        echo ""
        echo "─────────────────────────────────────────────────────────"
        cat "$MIGRATION_FILE"
        echo "─────────────────────────────────────────────────────────"
        exit 1
    }
else
    echo "⚠️  Project not linked locally"
    echo ""
    echo "Please apply this migration manually:"
    echo "1. Go to: https://supabase.com/dashboard/project/${PROJECT_ID}/sql"
    echo "2. Copy and paste the following SQL:"
    echo ""
    echo "─────────────────────────────────────────────────────────"
    cat "$MIGRATION_FILE"
    echo "─────────────────────────────────────────────────────────"
    exit 1
fi

echo ""
echo "✅ Migration applied successfully!"


