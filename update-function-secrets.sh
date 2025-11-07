#!/bin/bash

# Quick script to update Edge Functions secrets

echo "=== Update Supabase Edge Functions Secrets ==="
echo ""

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    exit 1
fi

# Check if project is linked
supabase status > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Linking project..."
    supabase link --project-ref rekkdwpkzkhgnejgzhac
fi

SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"

echo "Setting SUPABASE_URL..."
supabase secrets set SUPABASE_URL="$SUPABASE_URL"

echo ""
echo "✅ SUPABASE_URL set to: $SUPABASE_URL"
echo ""
echo "⚠️  You still need to set:"
echo "  - SUPABASE_SERVICE_ROLE_KEY"
echo "  - SUPABASE_ANON_KEY"
echo ""
echo "Get them from: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/api"
echo ""
echo "Then run:"
echo "  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=\"your-key\""
echo "  supabase secrets set SUPABASE_ANON_KEY=\"your-key\""

