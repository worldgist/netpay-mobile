#!/bin/bash

# Set Edge Functions secrets

set -e

echo "=== Setting Supabase Edge Functions Secrets ==="
echo ""

# Check if SUPABASE_ACCESS_TOKEN is set
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

# Set secrets
SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQzMTQ1MiwiZXhwIjoyMDc4MDA3NDUyfQ.tV2XsL_Rl1o-r7OUvFbObehGmQqhsz9NeSm2vIVub7o"

echo "Setting SUPABASE_URL..."
supabase secrets set SUPABASE_URL="$SUPABASE_URL" 2>&1 | grep -v "Warning" || true
echo "✅ SUPABASE_URL set"

echo "Setting SUPABASE_ANON_KEY..."
supabase secrets set SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" 2>&1 | grep -v "Warning" || true
echo "✅ SUPABASE_ANON_KEY set"

echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" 2>&1 | grep -v "Warning" || true
echo "✅ SUPABASE_SERVICE_ROLE_KEY set"

echo ""
echo "🎉 All secrets have been set successfully!"
echo ""
echo "You can now deploy your Edge Functions with:"
echo "  ./deploy-all-functions.sh"
echo ""
echo "Or deploy individually:"
echo "  supabase functions deploy <function-name>"

